import Phaser from 'phaser';
import {
  COMBAT,
  FIXED_DT,
  TILE,
  MAX_FRAME_DT,
  PICKUP_AMOUNT,
  SAVE_VERSION,
  VISION,
  VIRTUAL_HEIGHT,
  VIRTUAL_WIDTH,
} from '../core/constants';
import { loadLevel, objectsOfType, requireObject, type LoadedMap, type MapObject } from '../core/MapLoader';
import type { Vec2 } from '../core/Grid';
import { TORSO_OFFSET_Y } from '../core/hitbox';
import { STAGE_TILESETS, TILE_NAMES } from '../art/TilesetRegistry';
import { textureKey, type PropArea } from '../art/AssetRegistry';
import { CHAR_FRAME_HEIGHT } from '../art/CharacterDefinitions';
import { ART_MODE } from '../art/ValcendreV2';
import { ValcendreV2Presentation } from '../art/ValcendreV2Scene';
import {
  PROP_DEPTH,
  PROPS,
  propDrawY,
  propFixedDepth,
  propOrigin,
} from '../art/PropDefinitions';
import { FX_ANIM } from '../art/AnimationRegistry';
import { NEUTRAL_INPUT, Player, type InputState } from '../actors/Player';
import { Enemy, SHOUT_RADIUS, type EnemySpawn, type EnemyWorld } from '../actors/Enemy';
import type { EnemyKind } from '../data/enemies';
import { Hearing } from '../systems/Hearing';
import { Combat } from '../systems/Combat';
import {
  Interaction,
  type InteractTarget,
  type Interactable,
  type PickupItem,
} from '../systems/Interaction';
import { Mission } from '../systems/Mission';
import { EXIT_REQUIRES, FINAL_OBJECTIVE, OPTIONAL_CLUES } from '../data/objectives';
import { DIALOGUE, type DialogueLine } from '../data/dialogue';
import { enemyRosterMatches, readSave, writeSave, type Checkpoint } from '../systems/Save';
import { Audio } from '../systems/Audio';
import { setupCamera } from '../systems/Camera';
import { HUD } from '../ui/HUD';
import { DialogueBox } from '../ui/DialogueBox';
import { PauseMenu } from '../ui/PauseMenu';
import { PixelText } from '../ui/font';
import type { WeaponId } from '../data/weapons';

const LEVEL_ID = 'village';
const CHECKPOINT_RADIUS = 26;
const GLINT_RANGE = 150;

type Keys = Record<string, Phaser.Input.Keyboard.Key>;

export class Village extends Phaser.Scene {
  private level!: LoadedMap;
  private player!: Player;
  private enemies: Enemy[] = [];
  private props: Interactable[] = [];
  private items: PickupItem[] = [];
  private hearing!: Hearing;
  private combat!: Combat;
  private interaction!: Interaction;
  private mission!: Mission;
  private hud!: HUD;
  private dialogue!: DialogueBox;
  private pause!: PauseMenu;
  private audio!: Audio;
  private keys!: Keys;
  private crosshair!: Phaser.GameObjects.Image;
  private glintGfx!: Phaser.GameObjects.Graphics;
  private hitMarkerGfx!: Phaser.GameObjects.Graphics;
  private debugGfx!: Phaser.GameObjects.Graphics;
  /** Separate layer so the translucent vision wedges sit under the hitbox lines. */
  private visionGfx!: Phaser.GameObjects.Graphics;
  private guardLabels: PixelText[] = [];
  private debugStanceLabel: PixelText | null = null;
  /** Phase B.2-04 proof presentation; null in legacy art mode. */
  private artV2: ValcendreV2Presentation | null = null;
  private hitMarkerTimer = 0;
  private debugHitboxes = false;
  /** Props that are y-sorted with characters, re-depthed every frame. */
  private sortedProps: Phaser.GameObjects.Image[] = [];
  private doors: DoorActor[] = [];
  private triggers: TriggerRegion[] = [];
  private storyActors: StoryActor[] = [];
  /** A scene waiting for combat to end before it plays. */
  private pendingScene: StoryActor | null = null;
  /** Supplied FX: concealment readout above the player, prompt marker, muzzle. */
  private concealIcon!: Phaser.GameObjects.Image;
  private promptIcon!: Phaser.GameObjects.Image;
  private muzzle!: Phaser.GameObjects.Sprite;

  private exitZone!: Phaser.Geom.Rectangle;
  private exitRequires = '';
  private tilesetTexture = '';
  private checkpointZones: { id: string; x: number; y: number; taken: boolean }[] = [];
  private lastCheckpoint: Checkpoint | null = null;
  private enemySpawnFacing = new Map<string, number>();

  private accumulator = 0;
  private paused = false;
  private sliceComplete = false;
  private deathTimer = 0;
  private elapsed = 0;

  private takedownTarget: Enemy | null = null;

  constructor() {
    super('Village');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x0b0d12);
    this.level = loadLevel(this, LEVEL_ID);
    this.physics.world.setBounds(0, 0, this.level.widthPx, this.level.heightPx);

    this.tilesetTexture = STAGE_TILESETS[this.level.stage].texture;
    this.hearing = new Hearing(this.level.grid);
    this.mission = new Mission();
    this.audio = new Audio(this);

    // Built before the actors so the prop spawner can swap the fountain
    // texture as it creates it. Purely additive: in legacy mode this stays null
    // and not one display object is created.
    if (ART_MODE === 'valcendre_v2_proof') {
      this.artV2 = new ValcendreV2Presentation(this, this.level.map);
      const report = this.artV2.build();
      console.info(
        `[art] valcendre_v2_proof: ${report.pavingTiles} paving tiles, ` +
          `${report.buildings.map((b) => `${b.name}(${b.tiles})`).join(' ')}, ` +
          `stall=${report.stallDrawn}`
      );
    }

    this.spawnFromMap();

    this.combat = new Combat(this, this.level.grid, this.hearing);
    this.combat.setEnemies(this.enemies);
    this.interaction = new Interaction(this.level.grid, this.props, this.items);

    for (const layer of this.level.solidLayers) {
      this.physics.add.collider(this.player.sprite, layer);
      for (const enemy of this.enemies) this.physics.add.collider(enemy.sprite, layer);
    }

    this.hud = new HUD(this);
    this.dialogue = new DialogueBox(this);
    this.pause = new PauseMenu(this, {
      resume: () => this.setPaused(false),
      restartCheckpoint: () => {
        this.setPaused(false);
        this.reloadCheckpoint();
      },
      quitToTitle: () => {
        this.setPaused(false);
        this.shutdownScene();
        this.scene.start('Title');
      },
    });

    this.mission.objectives.onComplete((def) => {
      if (def.clue) this.hud.showClue(def.clue);
      this.audio.play('pickup');
    });

    this.glintGfx = this.add.graphics().setDepth(19);
    this.crosshair = this.add.image(0, 0, 'crosshair').setDepth(60);
    this.hitMarkerGfx = this.add.graphics().setDepth(61);
    this.visionGfx = this.add.graphics().setDepth(68);
    // One persistent label per guard plus a stance readout, created once and
    // hidden, so the overlay allocates nothing per frame.
    this.guardLabels = this.enemies.map(
      () => new PixelText(this, 0, 0, '', { align: 'center', depth: 71, scrollFactor: 1 })
    );
    for (const label of this.guardLabels) label.setVisible(false);
    this.debugStanceLabel = new PixelText(this, 4, 22, '', { depth: 71, color: 0x8fd0ff });
    this.debugStanceLabel.setVisible(false);
    this.debugGfx = this.add.graphics().setDepth(70);

    // Supplied FX art. The muzzle flash is parented to the weapon position, not
    // the player's feet.
    this.muzzle = this.add
      .sprite(0, 0, textureKey.fx('muzzle'), 0)
      .setDepth(31)
      .setVisible(false);
    this.concealIcon = this.add
      .image(0, 0, textureKey.fx('eye_hidden'))
      .setDepth(42)
      .setVisible(false);
    this.promptIcon = this.add
      .image(0, 0, textureKey.fx('interaction'))
      .setDepth(42)
      .setVisible(false);
    this.input.setDefaultCursor('none');
    this.input.mouse?.disableContextMenu();

    this.bindInput();
    setupCamera(this, this.player.sprite, this.level.widthPx, this.level.heightPx);

    const resumed = this.resumeFromSave();
    if (!resumed) {
      // Fresh level: apply the resupply floor and record the entry checkpoint.
      this.player.applyAmmoFloor();
      this.captureCheckpoint('cp_entry');
      this.dialogue.play(DIALOGUE.village_arrival);
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.shutdownScene());
  }

  // ------------------------------------------------------------------- set-up

  private spawnFromMap(): void {
    const objects = this.level.objects;
    const spawn = requireObject(objects, 'spawn');
    this.player = new Player(this, spawn.x, spawn.y, this.hearing);

    const routes = new Map<string, Vec2[]>();
    for (const wp of objectsOfType(objects, 'waypoint')) {
      const id = String(wp.props.route ?? '');
      const index = Number(wp.props.index ?? 0);
      const list = routes.get(id) ?? [];
      list[index] = { x: wp.x, y: wp.y };
      routes.set(id, list);
    }

    const world = this.makeEnemyWorld();
    for (const obj of objectsOfType(objects, 'enemy')) {
      const kind = String(obj.props.kind ?? 'lookout') as EnemyKind;
      const facing = Phaser.Math.DegToRad(Number(obj.props.facing ?? 0));
      const spawnDef: EnemySpawn = {
        name: obj.name,
        x: obj.x,
        y: obj.y,
        kind,
        facing,
        route: (routes.get(String(obj.props.route ?? '')) ?? []).filter(Boolean),
      };
      this.enemySpawnFacing.set(obj.name, facing);
      const enemy = new Enemy(this, spawnDef, world);
      this.enemies.push(enemy);
      this.hearing.subscribe((event) =>
        enemy.hear(event, this.hearing.audibleRadiusAt(event, { x: enemy.x, y: enemy.y }))
      );
    }

    for (const obj of objectsOfType(objects, 'item')) {
      const kind = String(obj.props.kind ?? 'medkit') as PickupItem['kind'];
      const sprite = this.add
        .image(Math.round(obj.x), Math.round(obj.y), kind === 'medkit' ? 'prop_medkit' : 'prop_ammo')
        .setDepth(3);
      this.items.push({ name: obj.name, kind, x: obj.x, y: obj.y, taken: false, sprite });
    }

    for (const obj of objectsOfType(objects, 'interactable')) {
      const kind = String(obj.props.kind ?? '');
      this.props.push({
        name: obj.name,
        kind,
        x: obj.x,
        y: obj.y,
        prompt: String(obj.props.prompt ?? 'E - INTERACT'),
        objective: obj.props.objective ? String(obj.props.objective) : undefined,
        requires: obj.props.requires ? String(obj.props.requires) : undefined,
        noise: obj.props.noise ? Number(obj.props.noise) : undefined,
        oneShot: Boolean(obj.props.oneShot) || !!obj.props.objective,
        used: false,
        glint: Boolean(obj.props.glint),
        sprite: this.propSprite(kind, obj),
      });
    }

    for (const obj of objectsOfType(objects, 'checkpoint')) {
      this.checkpointZones.push({
        id: String(obj.props.id ?? obj.name),
        x: obj.x,
        y: obj.y,
        taken: false,
      });
    }

    this.spawnProps(objects);
    this.spawnTriggers(objects);
    this.spawnStoryActors(objects);
    this.spawnDoors(objects);

    const exit = requireObject(objects, 'exit');
    this.exitZone = new Phaser.Geom.Rectangle(exit.x, exit.y, exit.width, exit.height);
    // The map authors the gate, but EXIT_REQUIRES is the contract: if the map
    // ever ships without the property the exit still refuses until BELIAL.
    this.exitRequires = String(exit.props.requires ?? EXIT_REQUIRES);
  }

  /**
   * Visible sprite for an interactable, where one exists.
   *
   * The paper evidence reuses the existing document sprite, and the transport
   * is drawn by its own `decor_van` object. The remaining mandatory sites -
   * the tyre tracks, the ransacked stall and the BELIAL inscription - have NO
   * approved artwork yet; they are art requests VP-003 and VP-001, and until
   * those land the glint is their only cue. No placeholder is invented for
   * them here.
   */
  private propSprite(kind: string, obj: MapObject): Phaser.GameObjects.Image | undefined {
    const DOCUMENTS = ['waybill', 'ledger', 'hymn'];
    const texture = kind === 'radio' ? 'prop_radio' : DOCUMENTS.includes(kind) ? 'prop_doc' : null;
    if (!texture) return undefined;
    return this.add.image(Math.round(obj.x), Math.round(obj.y), texture).setDepth(3);
  }

  /**
   * Instantiates authored props and generated-placeholder decor.
   *
   * Collision is NOT created here: the map generator already rasterised each
   * prop's footprint into the invisible `propCollision` layer, which feeds both
   * the gameplay grid and the physics colliders. That keeps one source of truth
   * and means an oversized footprint fails `npm run map` rather than silently
   * walling off a route.
   */
  private spawnProps(objects: MapObject[]): void {
    for (const obj of objectsOfType(objects, 'prop')) {
      const area = String(obj.props.area ?? 'valcendre') as PropArea;
      const name = String(obj.props.prop ?? '');
      const def = PROPS.get(`${area}.${name}`);
      if (!def) {
        console.error(`[props] map references unknown prop ${area}.${name}`);
        continue;
      }
      // Overhead props are lifted clear of head height; the depth sort still
      // uses the anchor y so ordering matches the prop's ground position.
      const sprite = this.addPropSprite(
        def.texture,
        obj.x,
        propDrawY(def, obj.y),
        propOrigin(def),
        propFixedDepth(def),
        obj.y
      );
      // The approved fountain replaces the legacy TEXTURE at the object's
      // existing authored position. The map object, its tile, its prop
      // footprint and its cover are all untouched.
      if (sprite && name === 'fountain') this.artV2?.applyFountain(sprite);
    }

    for (const obj of objectsOfType(objects, 'decor')) {
      const sprite = String(obj.props.sprite ?? '');
      if (!sprite || !this.textures.exists(sprite)) {
        console.error(`[props] map references missing decor texture "${sprite}"`);
        continue;
      }
      const fixed = obj.props.depth === 'sorted' ? null : PROP_DEPTH.ground;
      this.addPropSprite(sprite, obj.x, obj.y, { x: 0.5, y: 1 }, fixed);
    }
  }

  private addPropSprite(
    texture: string,
    x: number,
    y: number,
    origin: { x: number; y: number },
    fixedDepth: number | null,
    sortY = y
  ): Phaser.GameObjects.Image {
    const image = this.add.image(Math.round(x), Math.round(y), texture);
    image.setOrigin(origin.x, origin.y);
    if (fixedDepth === null) {
      // y-sorted: a character south of a tree trunk draws in front of the
      // canopy, one north of it draws behind. Same rule as the actors.
      image.setDepth(10 + sortY / 10000);
      this.sortedProps.push(image);
    } else {
      image.setDepth(fixedDepth);
    }
    return image;
  }

  private makeEnemyWorld(): EnemyWorld {
    return {
      grid: this.level.grid,
      playerGround: () => this.player.groundPoint,
      playerFeet: () => ({ x: this.player.x, y: this.player.y }),
      playerStance: () => this.player.stance,
      playerInShadow: () => this.level.grid.isShadowWorld(this.player.x, this.player.y),
      playerIsTargetable: () => !this.player.dead && !this.sliceComplete && !this.paused,
      fireProjectile: (from, angle, damage, shooter) => {
        this.combat.fireProjectile(from, angle, damage, shooter);
        this.audio.play('pistol', 0.5);
        this.hud.showSubtitle('[gunfire]', 1.2);
      },
      shout: (from, at) => this.shout(from, at),
      bodies: () => this.enemies.filter((e) => e.dead).map((e) => ({ x: e.x, y: e.y })),
    };
  }

  /** Guard shouts rally nearby allies in connected acoustic space only. */
  private shout(from: Vec2, at: Vec2): void {
    this.audio.play('alert', 0.8);
    this.hud.showSubtitle('[a guard shouts]', 1.6);
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      const dist = Phaser.Math.Distance.Between(from.x, from.y, enemy.x, enemy.y);
      const reach = this.level.grid.hasClearReach(from, { x: enemy.x, y: enemy.y })
        ? SHOUT_RADIUS
        : SHOUT_RADIUS * 0.5;
      if (dist <= reach) enemy.rally(at);
    }
  }

  private bindInput(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) return;
    this.keys = keyboard.addKeys(
      'W,A,S,D,R,C,E,K,Q,N,SHIFT,ESC,SPACE,ONE,TWO'
    ) as Keys;
    // Keep F3 out of the browser's own shortcut handling.
    keyboard.addCapture('F3');

    keyboard.on('keydown', (event: KeyboardEvent) => {
      if (event.code === 'F3') {
        this.debugHitboxes = !this.debugHitboxes;
        this.hud.showSubtitle(
          this.debugHitboxes ? 'Hitbox overlay ON' : 'Hitbox overlay OFF',
          1.4
        );
        return;
      }
      if (this.pause.handleKey(event.code)) return;
      if (event.code === 'Escape') {
        this.setPaused(!this.paused);
        return;
      }
      if (this.dialogue.active && (event.code === 'Space' || event.code === 'Enter')) {
        this.dialogue.advance();
      }
    });
  }

  // -------------------------------------------------------------------- update

  // `update` is declared on Phaser.Scene, so it needs `override`;
  // `preload` and `create` are not, so they must not have it.
  override update(_time: number, delta: number): void {
    const frameDt = Math.min(delta / 1000, MAX_FRAME_DT);
    this.elapsed += frameDt;

    this.dialogue.update(frameDt);
    this.updateCrosshair();

    if (this.paused) {
      this.hud.update(frameDt, this.player, this.mission.activeText(), null);
      return;
    }

    // Bounded fixed-step simulation: identical behaviour at any refresh rate.
    this.accumulator = Math.min(this.accumulator + frameDt, FIXED_DT * 5);
    const input = this.sampleInput();
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < 5) {
      this.step(FIXED_DT, steps === 0 ? input : { ...input, ...NEUTRAL_EDGES });
      this.accumulator -= FIXED_DT;
      steps++;
    }

    const target = this.sliceComplete
      ? null
      : this.interaction.resolve(this.player, this.enemies, (id) => this.mission.isComplete(id));
    this.hud.update(
      frameDt,
      this.player,
      this.mission.activeText(),
      target?.prompt ?? null,
      this.awarenessLevel()
    );
    this.updateStealthIcon(target);
    this.drawGlints();
    this.drawHitMarker(frameDt);
    this.drawDebugHitboxes();
    this.drawVisionDebug();
    this.sortDepths();
  }

  /** Edge-triggered inputs must fire on the first substep only. */
  private sampleInput(): InputState {
    if (!this.keys) return { ...NEUTRAL_INPUT };
    const k = this.keys;
    const pointer = this.input.activePointer;
    // Aim is measured from the centre of the player's DRAWN torso to the
    // crosshair, which is the one place screen space is used. Both actors are
    // drawn with the same vertical offset, so this angle equals the ground-plane
    // angle to the target - aiming at a visible torso and cover blocking the
    // shot are then both correct. See core/hitbox.ts.
    const muzzle = this.player.aimOrigin;
    const aim = Math.atan2(pointer.worldY - muzzle.y, pointer.worldX - muzzle.x);

    let weapon: WeaponId | null = null;
    if (Phaser.Input.Keyboard.JustDown(k.ONE)) weapon = 'pistol';
    if (Phaser.Input.Keyboard.JustDown(k.TWO)) weapon = 'shotgun';

    return {
      moveX: (k.D.isDown ? 1 : 0) - (k.A.isDown ? 1 : 0),
      moveY: (k.S.isDown ? 1 : 0) - (k.W.isDown ? 1 : 0),
      aim,
      firing: pointer.leftButtonDown() && !this.sliceComplete,
      reloadPressed: Phaser.Input.Keyboard.JustDown(k.R),
      crouchPressed: Phaser.Input.Keyboard.JustDown(k.C),
      sprintHeld: k.SHIFT.isDown,
      selectWeapon: weapon,
      interactPressed: Phaser.Input.Keyboard.JustDown(k.E),
    };
  }

  private step(dt: number, input: InputState): void {
    if (this.player.dead) {
      this.deathTimer += dt;
      if (this.deathTimer > 1.2) this.reloadCheckpoint();
      return;
    }

    this.player.update(dt, input);
    this.resolveTakedown();

    if (input.interactPressed && !this.sliceComplete) this.tryInteract();
    if (input.firing && this.player.canFire() && !this.sliceComplete) {
      const report = this.combat.playerFire(this.player);
      if (report.fired) {
        this.audio.play(this.player.weapon === 'pistol' ? 'pistol' : 'hit');
        this.playMuzzleFlash();
        if (report.hits.length > 0) {
          // One clear hit cue per enemy struck, plus the on-crosshair marker.
          this.audio.play('flesh', 0.9);
          this.hitMarkerTimer = COMBAT.hitMarkerLifetime;
          this.hud.showSubtitle('[hit]', 0.6);
        } else if (report.impacts.length > 0) {
          this.audio.play('ricochet', 0.5);
        }
        for (const impact of report.impacts) {
          if (impact.flesh) this.playBlood(impact.x, impact.y);
        }
      }
    }

    for (const enemy of this.enemies) enemy.update(dt);
    this.combat.update(dt, this.player);
    this.checkTriggers();
    this.checkStoryActors();
    this.checkCheckpoints();
    this.checkExit();
  }

  private resolveTakedown(): void {
    if (!this.takedownTarget) return;
    if (this.player.takedownInterrupted) {
      this.takedownTarget = null;
      this.player.takedownInterrupted = false;
      return;
    }
    if (this.player.takedownTimer > 0) return;
    const target = this.takedownTarget;
    this.takedownTarget = null;
    if (!target.dead) {
      target.kill();
      this.audio.play('takedown');
      this.hud.showSubtitle('[a body settles]', 1.4);
    }
  }

  private tryInteract(): void {
    if (this.player.busy) return;
    const target = this.interaction.resolve(this.player, this.enemies, (id) =>
      this.mission.isComplete(id)
    );
    if (!target) return;

    switch (target.type) {
      case 'takedown':
        this.player.beginTakedown();
        this.takedownTarget = target.enemy;
        break;
      case 'pickup':
        this.usePickup(target.item);
        break;
      case 'prop':
        this.useProp(target.prop);
        break;
    }
  }

  private usePickup(item: PickupItem): void {
    let consumed = false;
    if (item.kind === 'medkit') consumed = this.player.heal();
    else if (item.kind === 'ammo_pistol')
      consumed = this.player.addAmmo('pistol', PICKUP_AMOUNT.ammo_pistol);
    else consumed = this.player.addAmmo('shotgun', PICKUP_AMOUNT.ammo_shotgun);

    if (!consumed) return;
    item.taken = true;
    item.sprite?.setVisible(false);
    this.audio.play('pickup');
  }

  private useProp(prop: Interactable): void {
    // Idempotent: a one-shot prop or a completed objective can never fire twice.
    if (prop.used && prop.oneShot) return;
    prop.used = true;

    if (prop.noise) {
      this.hearing.emit({
        x: prop.x,
        y: prop.y,
        radius: prop.noise,
        kind: 'distraction',
        fromPlayer: false,
      });
      this.audio.play('radio');
      this.hud.showSubtitle('[a radio blares across the square]', 2.4);
    }

    if (prop.objective) {
      this.grantBeat(prop.objective, EVIDENCE_DIALOGUE[prop.kind]);
    } else if (OPTIONAL_CLUES[prop.kind]) {
      this.hud.showClue(OPTIONAL_CLUES[prop.kind]);
    }
  }

  /**
   * Completes a beat from evidence, a trigger or a scene.
   *
   * Idempotent by construction: Mission.complete reports `granted` only on the
   * transition, so a second evidence source for the same beat plays no clue, no
   * dialogue and no checkpoint. An out-of-order attempt reports the missing
   * prerequisite instead of silently doing nothing.
   */
  private grantBeat(id: string, lines?: DialogueLine[]): boolean {
    const result = this.mission.complete(id);
    if (!result.granted) {
      if (result.blockedBy) this.hud.showSubtitle('Nothing useful here yet.', 1.6);
      return false;
    }
    if (lines && lines.length > 0) this.dialogue.play(lines);

    // V5 grants the garage key, so both garage doors swing open now.
    if (id === 'V5') {
      this.refreshDoors();
      this.hud.showSubtitle('Garage key taken.', 2.2);
      this.captureCheckpoint('cp_office');
    }
    if (id === 'V2') this.captureCheckpoint('cp_market');
    if (id === 'V7') this.captureCheckpoint('cp_belial');
    return true;
  }

  // ------------------------------------------ triggers, actors and doors

  /**
   * Authored region triggers, read straight from the map so the geometry and
   * the progression cannot drift apart.
   */
  private spawnTriggers(objects: MapObject[]): void {
    for (const obj of objectsOfType(objects, 'trigger')) {
      this.triggers.push({
        name: obj.name,
        zone: new Phaser.Geom.Rectangle(obj.x, obj.y, obj.width, obj.height),
        objective: obj.props.objective ? String(obj.props.objective) : undefined,
        requires: obj.props.requires ? String(obj.props.requires) : undefined,
        dialogue: obj.props.dialogue ? String(obj.props.dialogue) : undefined,
        needsLivingGuardWithin: obj.props.needsLivingGuardWithin
          ? Number(obj.props.needsLivingGuardWithin)
          : undefined,
      });
    }
  }

  /**
   * Non-combatant story actors. The wounded cultist uses the approved
   * `prop.shared.body_cultist` sprite - a slumped cultist - with a slow 1px
   * breathing bob while alive. Dedicated wounded-cultist art is requested as
   * VP-002; nothing here is generated programmer art.
   */
  private spawnStoryActors(objects: MapObject[]): void {
    for (const obj of objectsOfType(objects, 'story')) {
      const texture = textureKey.prop('shared', 'body_cultist');
      const sprite = this.add
        .image(Math.round(obj.x), Math.round(obj.y), texture)
        .setOrigin(0.5, 0.94)
        .setDepth(6);
      const actor: StoryActor = {
        name: obj.name,
        x: obj.x,
        y: obj.y,
        radius: Number(obj.props.radius ?? 44),
        objective: obj.props.objective ? String(obj.props.objective) : undefined,
        requires: obj.props.requires ? String(obj.props.requires) : undefined,
        dialogue: String(obj.props.dialogue ?? ''),
        sprite,
        resolved: false,
      };
      this.storyActors.push(actor);
      // Breathing bob, stopped when the scene resolves.
      actor.bob = this.tweens.add({
        targets: sprite,
        y: Math.round(obj.y) - 1,
        duration: 1400,
        yoyo: true,
        repeat: -1,
      });
    }
  }

  /**
   * Doors are real geometry, not an objective check. While locked a door is
   * solid in the gameplay grid (so it blocks movement, bullets, line of sight
   * and A* alike), carries a static physics body, and draws the tileset's
   * closed-door tile. Unlocking clears all three, so what the player sees and
   * what the player can walk through never disagree.
   */
  private spawnDoors(objects: MapObject[]): void {
    for (const obj of objectsOfType(objects, 'door')) {
      const tileX = Number(obj.props.tileX);
      const tileY = Number(obj.props.tileY);
      const tileW = Number(obj.props.tileW);
      const tileH = Number(obj.props.tileH);
      const tiles: Phaser.Physics.Arcade.Image[] = [];
      for (let ty = tileY; ty < tileY + tileH; ty++) {
        for (let tx = tileX; tx < tileX + tileW; tx++) {
          // One static image per tile is both the picture and the collider, so
          // the two cannot be toggled out of step. The door tiles are carved out
          // of the map's collision layer, so without this a closed door would
          // stop bullets and sight but not feet.
          const tile = this.physics.add.staticImage(
            tx * TILE + TILE / 2,
            ty * TILE + TILE / 2,
            this.tilesetTexture,
            DOOR_FRAME.closed
          );
          // Depth 6: above the architecture band that draws the wall it
          // pierces, below characters, so somebody standing in an open doorway
          // is drawn in front of it.
          tile.setDepth(6);
          tiles.push(tile);
        }
      }
      this.doors.push({ name: obj.name, tileX, tileY, tileW, tileH, tiles });
    }

    // Everything that walks collides with a closed door, guards included.
    for (const door of this.doors) {
      for (const tile of door.tiles) {
        this.physics.add.collider(this.player.sprite, tile);
        for (const enemy of this.enemies) this.physics.add.collider(enemy.sprite, tile);
      }
    }
    this.refreshDoors();
  }

  /** Applies the mission's door state to collision, the grid and the sprites. */
  private refreshDoors(): void {
    for (const door of this.doors) {
      const open = this.mission.isDoorOpen(door.name);
      for (let ty = door.tileY; ty < door.tileY + door.tileH; ty++)
        for (let tx = door.tileX; tx < door.tileX + door.tileW; tx++)
          this.level.grid.setDoor(tx, ty, !open);
      for (const tile of door.tiles) {
        tile.setFrame(open ? DOOR_FRAME.open : DOOR_FRAME.closed);
        if (open) this.physics.world.disable(tile);
        else this.physics.world.enable(tile, Phaser.Physics.Arcade.STATIC_BODY);
      }
    }
  }

  // --------------------------------------------------------------- triggers

  /**
   * Authored region triggers. Entering one grants its beat if the prerequisite
   * is met; if it is not, the trigger is NOT consumed, so a player who crossed
   * the depot gate early still completes V3 the moment the prerequisite lands
   * while they stand in the yard - no walking back to a trigger they already
   * crossed.
   */
  private checkTriggers(): void {
    for (const trigger of this.triggers) {
      if (this.mission.hasFired(trigger.name)) continue;
      if (!trigger.zone.contains(this.player.x, this.player.y)) continue;
      if (trigger.requires && !this.mission.isComplete(trigger.requires)) continue;
      if (trigger.objective && this.mission.isComplete(trigger.objective)) {
        this.mission.fireTrigger(trigger.name);
        continue;
      }
      // The overheard conversation needs somebody alive to overhear. It never
      // REQUIRES one: if every guard is dead the waybill still grants V2.
      if (trigger.needsLivingGuardWithin !== undefined) {
        const heard = this.enemies.some(
          (e) =>
            !e.dead &&
            Phaser.Math.Distance.Between(e.x, e.y, this.player.x, this.player.y) <=
              trigger.needsLivingGuardWithin!
        );
        if (!heard) continue;
      }
      if (!trigger.objective) continue;
      if (this.grantBeat(trigger.objective, trigger.dialogue ? DIALOGUE[trigger.dialogue] : undefined)) {
        this.mission.fireTrigger(trigger.name);
      }
    }
  }

  // ----------------------------------------------------------- story actors

  /**
   * Scripted non-combatant scenes. The cultist never attacks and cannot be
   * required to die by the player's hand: approaching him after V4 plays the
   * exchange and he dies on his own.
   *
   * If the player is in a firefight the scene is deferred rather than skipped,
   * and it is one-shot through the mission state, so a checkpoint reload cannot
   * replay it and interrupting it cannot lose it.
   */
  private checkStoryActors(): void {
    if (this.pendingScene) {
      if (this.inCombat() || this.dialogue.active) return;
      const actor = this.pendingScene;
      this.pendingScene = null;
      this.playStoryScene(actor);
      return;
    }
    for (const actor of this.storyActors) {
      if (actor.resolved) continue;
      if (actor.requires && !this.mission.isComplete(actor.requires)) continue;
      const distance = Phaser.Math.Distance.Between(actor.x, actor.y, this.player.x, this.player.y);
      if (distance > actor.radius) continue;
      if (this.inCombat() || this.dialogue.active) {
        this.pendingScene = actor;
        this.hud.showSubtitle('[someone is trying to speak]', 1.6);
        return;
      }
      this.playStoryScene(actor);
      return;
    }
  }

  private playStoryScene(actor: StoryActor): void {
    if (!this.mission.markEvent(`scene_${actor.name}`)) {
      actor.resolved = true;
      return;
    }
    actor.resolved = true;
    this.dialogue.play(DIALOGUE[actor.dialogue], () => {
      this.resolveStoryActor(actor);
      if (actor.objective) this.grantBeat(actor.objective);
    });
  }

  /** The cultist goes still. Same approved sprite, no bob, one blood mark. */
  private resolveStoryActor(actor: StoryActor): void {
    actor.resolved = true;
    actor.sprite?.setTint(0x9c8f8f);
    this.playBlood(actor.x, actor.y - 6);
    this.audio.play('flesh', 0.5);
  }

  private inCombat(): boolean {
    return this.enemies.some((e) => !e.dead && e.alertLevel === 'combat');
  }

  private checkCheckpoints(): void {

    for (const zone of this.checkpointZones) {
      if (zone.taken) continue;
      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, zone.x, zone.y) > CHECKPOINT_RADIUS)
        continue;
      zone.taken = true;
      this.captureCheckpoint(zone.id);
    }
  }

  private checkExit(): void {
    if (this.sliceComplete) return;
    if (!this.exitZone.contains(this.player.x, this.player.y)) return;
    if (this.exitRequires && !this.mission.isComplete(this.exitRequires)) {
      // Helpful, and specific: the player is told what is still outstanding.
      if (this.mission.markEvent('exit_blocked_hint'))
        this.dialogue.play(DIALOGUE.village_exit_blocked);
      else this.hud.showSubtitle(`Not yet. ${this.mission.activeText()}`, 2.4);
      return;
    }
    this.grantBeat(FINAL_OBJECTIVE);
    this.sliceComplete = true;
    this.dialogue.play(DIALOGUE.village_exit, () => this.showSliceCard());
  }

  private showSliceCard(): void {
    this.physics.pause();
    const cam = this.cameras.main;
    cam.fadeOut(600, 0, 0, 0);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      cam.fadeIn(400, 0, 0, 0);
      new PixelText(this, VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT / 2 - 20, 'VALCENDRE CLEARED', {
        align: 'center',
        color: 0xe8c07a,
        depth: 130,
      });
      new PixelText(
        this,
        VIRTUAL_WIDTH / 2,
        VIRTUAL_HEIGHT / 2 + 2,
        `TIME ${Math.floor(this.elapsed / 60)}:${String(Math.floor(this.elapsed % 60)).padStart(2, '0')}\n\n` +
          'SUZANNE SURVIVED THE TRANSPORT\n' +
          'BARNABE IS IMPLICATED\n' +
          'NEXT: THE BARNABE ESTATE\n' +
          'BELIAL: UNEXPLAINED\n\nENTER - TITLE',
        { align: 'center', depth: 130 }
      );
      this.input.keyboard?.once('keydown-ENTER', () => {
        this.shutdownScene();
        this.scene.start('Title');
      });
    });
  }

  // --------------------------------------------------------------- checkpoints

  private captureCheckpoint(id: string): void {
    const checkpoint: Checkpoint = {
      version: SAVE_VERSION,
      level: LEVEL_ID,
      checkpointId: id,
      player: this.player.snapshot(),
      enemies: this.enemies.map((e) => e.snapshot()),
      mission: this.mission.snapshot(),
      consumed: this.items.filter((i) => i.taken).map((i) => i.name),
      used: this.props.filter((p) => p.used).map((p) => p.name),
      clues: [],
    };
    this.lastCheckpoint = checkpoint;
    writeSave(checkpoint);
    this.hud.showSubtitle('Checkpoint', 1.4);
  }

  private resumeFromSave(): boolean {
    const save = readSave();
    if (!save || save.level !== LEVEL_ID) return false;
    this.lastCheckpoint = save;
    this.applyCheckpoint(save);
    this.player.applyAmmoFloor();
    return true;
  }

  private reloadCheckpoint(): void {
    const checkpoint = this.lastCheckpoint;
    this.deathTimer = 0;
    this.takedownTarget = null;
    this.combat.reset();
    this.accumulator = 0;
    this.hitMarkerTimer = 0;

    if (!checkpoint) {
      // No checkpoint recorded: restart the level cleanly from the spawn point.
      this.scene.restart();
      return;
    }
    this.applyCheckpoint(checkpoint);
  }

  /** Restores a consistent snapshot: HP, resources, enemies, objectives, pickups. */
  private applyCheckpoint(checkpoint: Checkpoint): void {
    this.player.restore(checkpoint.player);
    this.mission.restore(checkpoint.mission);

    const consumed = new Set(checkpoint.consumed);
    for (const item of this.items) {
      item.taken = consumed.has(item.name);
      item.sprite?.setVisible(!item.taken);
    }
    const used = new Set(checkpoint.used);
    for (const prop of this.props) prop.used = used.has(prop.name);

    // Physical story state, not just the HUD: doors re-lock or re-open, and a
    // scene that already played stays played.
    this.refreshDoors();
    for (const actor of this.storyActors) {
      const played = this.mission.hasEvent(`scene_${actor.name}`);
      actor.resolved = played;
      if (played) {
        actor.bob?.stop();
        actor.sprite?.setPosition(Math.round(actor.x), Math.round(actor.y));
        actor.sprite?.setTint(0x9c8f8f);
      } else {
        actor.sprite?.clearTint();
        actor.bob?.restart();
      }
    }
    this.pendingScene = null;

    // The roster is checked as a whole: a save from an earlier guard layout
    // resets every guard to its authored spawn rather than restoring any of
    // them to a position that no longer means anything. See
    // Save.enemyRosterMatches for why.
    if (!enemyRosterMatches(checkpoint.enemies, this.enemies.map((e) => e.name))) {
      for (const enemy of this.enemies)
        enemy.resetToSpawn(this.enemySpawnFacing.get(enemy.name) ?? 0);
    } else {
      const byName = new Map(checkpoint.enemies.map((e) => [e.name, e]));
      for (const enemy of this.enemies) {
        const snap = byName.get(enemy.name);
        if (snap) enemy.restore(snap);
        else enemy.resetToSpawn(this.enemySpawnFacing.get(enemy.name) ?? 0);
      }
    }

    for (const zone of this.checkpointZones)
      zone.taken = zone.id === checkpoint.checkpointId || zone.taken;

    this.sliceComplete = false;
    this.deathTimer = 0;
    this.physics.resume();
    this.cameras.main.fadeIn(220, 0, 0, 0);
  }

  // ------------------------------------------------------------------ presentation

  private updateCrosshair(): void {
    const pointer = this.input.activePointer;
    this.crosshair.setPosition(Math.round(pointer.worldX), Math.round(pointer.worldY));
    this.crosshair.setVisible(!this.paused && !this.sliceComplete);
  }

  /** Mandatory evidence glints subtly on first approach, not constantly. */
  private drawGlints(): void {
    const g = this.glintGfx;
    g.clear();
    const pulse = 0.35 + 0.35 * Math.sin(this.elapsed * 3.4);
    for (const prop of this.props) {
      if (!prop.glint || prop.used) continue;
      if (prop.requires && !this.mission.isComplete(prop.requires)) continue;
      if (prop.objective && this.mission.isComplete(prop.objective)) continue;
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, prop.x, prop.y);
      if (dist > GLINT_RANGE) continue;
      g.fillStyle(0xf4e9c0, pulse);
      g.fillRect(Math.round(prop.x), Math.round(prop.y) - 14, 1, 3);
      g.fillRect(Math.round(prop.x) - 1, Math.round(prop.y) - 13, 3, 1);
    }
  }

  /**
   * Muzzle flash at the weapon's visible position. The supplied 4-frame strip
   * runs at 24 fps, so it is finished well inside the 0.36 s pistol interval and
   * never sits on top of a target long enough to hide it.
   */
  private playMuzzleFlash(): void {
    const at = this.player.muzzlePoint;
    this.muzzle.setPosition(at.x, at.y);
    this.muzzle.setVisible(true);
    this.muzzle.play(FX_ANIM.muzzle, true);
  }

  private playBlood(x: number, y: number): void {
    const splat = this.add.sprite(Math.round(x), Math.round(y), textureKey.fx('blood'), 0);
    splat.setDepth(28);
    splat.play(FX_ANIM.blood, true);
    splat.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => splat.destroy());
  }

  /**
   * Concealment readout using the supplied eye icons. This is also the visual
   * cue for crouching, which the character art has no frames for: the mechanic
   * is unchanged, and the player can see whether it is currently working.
   */
  private updateStealthIcon(target: InteractTarget): void {
    const seen = this.enemies.some(
      (e) => !e.dead && (e.alertLevel === 'combat' || e.suspicion > 0)
    );
    const show = !this.sliceComplete && !this.player.dead && (this.player.crouched || seen);
    this.concealIcon.setVisible(show);
    if (show) {
      this.concealIcon.setTexture(textureKey.fx(seen ? 'eye' : 'eye_hidden'));
      this.concealIcon.setPosition(Math.round(this.player.x), Math.round(this.player.y) - 40);
    }

    // Small marker on the thing the prompt refers to, so the player can tell
    // which object the bottom-of-screen prompt belongs to.
    if (target && target.type !== 'takedown') {
      const at = target.type === 'prop' ? target.prop : target.item;
      this.promptIcon.setPosition(Math.round(at.x), Math.round(at.y) - 16);
      this.promptIcon.setVisible(true);
    } else {
      this.promptIcon.setVisible(false);
    }
  }

  /**
   * Highest alert in the level, as a frame index into the supplied awareness
   * strip: 0 '?', 1 '!', 2 '!!', 3 detected. -1 means nothing is looking.
   */
  private awarenessLevel(): number {
    let best = -1;
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      if (enemy.alertLevel === 'combat') return 3;
      if (enemy.suspicion >= 70) best = Math.max(best, 2);
      else if (enemy.suspicion >= 30) best = Math.max(best, 1);
      else if (enemy.suspicion > 0) best = Math.max(best, 0);
    }
    return best;
  }

  /** Brief ticks around the crosshair the moment a shot lands. */
  private drawHitMarker(dt: number): void {
    const g = this.hitMarkerGfx;
    g.clear();
    this.hitMarkerTimer = Math.max(0, this.hitMarkerTimer - dt);
    if (this.hitMarkerTimer <= 0) return;
    const alpha = Phaser.Math.Clamp(this.hitMarkerTimer / COMBAT.hitMarkerLifetime, 0, 1);
    const x = Math.round(this.crosshair.x);
    const y = Math.round(this.crosshair.y);
    g.fillStyle(0xff5a3c, alpha);
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      for (let d = 3; d <= 5; d++) g.fillRect(x + sx * d, y + sy * d, 1, 1);
    }
  }

  /**
   * F3 overlay. Disabled by default and drawn into its own Graphics object, so
   * it cannot affect production rendering: no production sprite's alpha, tint,
   * depth or blend mode is touched by anything in here.
   *
   * Every gameplay shape is drawn separately so a mismatch between them is
   * visible rather than inferred.
   */
  private drawDebugHitboxes(): void {
    const g = this.debugGfx;
    g.clear();
    if (!this.debugHitboxes) return;

    const cross = (x: number, y: number, color: number) => {
      g.fillStyle(color, 1);
      g.fillRect(Math.round(x) - 2, Math.round(y), 5, 1);
      g.fillRect(Math.round(x), Math.round(y) - 2, 1, 5);
    };
    const box = (r: { x: number; y: number; width: number; height: number }, color: number) => {
      g.lineStyle(1, color, 0.95);
      g.strokeRect(Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height));
    };
    // Dashed = a screen-space rectangle, not a collision shape.
    const dashed = (r: { x: number; y: number; width: number; height: number }, color: number) => {
      g.fillStyle(color, 0.8);
      for (let x = 0; x < r.width; x += 2) {
        g.fillRect(Math.round(r.x + x), Math.round(r.y), 1, 1);
        g.fillRect(Math.round(r.x + x), Math.round(r.y + r.height), 1, 1);
      }
      for (let y = 0; y < r.height; y += 2) {
        g.fillRect(Math.round(r.x), Math.round(r.y + y), 1, 1);
        g.fillRect(Math.round(r.x + r.width), Math.round(r.y + y), 1, 1);
      }
    };

    this.drawDebugTiles(g);

    // Player: cyan feet collider, green ground hitbox, pale drawn torso.
    box(this.player.feetBox, 0x3fd0d8);
    box(this.player.hitbox, 0x6ee06e);
    dashed(this.player.drawnTorso, 0xbfe8bf);
    cross(this.player.x, this.player.y, 0xffffff);
    // Feet anchor: where the sprite's ground-contact row is pinned.
    g.fillStyle(0xffffff, 1);
    g.fillRect(Math.round(this.player.x) - 1, Math.round(this.player.y) - 1, 3, 3);

    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      // Enemies: blue feet collider, magenta ground hitbox, pale drawn torso.
      box(enemy.feetBox, 0x4a7cd8);
      box(enemy.hitbox, 0xff5ad0);
      dashed(enemy.drawnTorso, 0xffb8e8);
      cross(enemy.x, enemy.y, 0xffe066);
      g.fillStyle(0xffe066, 1);
      g.fillRect(Math.round(enemy.x) - 1, Math.round(enemy.y) - 1, 3, 3);
      // Vision origin and cone centre line.
      const reach = 24;
      g.lineStyle(1, 0xffe066, 0.5);
      g.lineBetween(
        Math.round(enemy.x),
        Math.round(enemy.y),
        Math.round(enemy.x + Math.cos(enemy.facing) * reach),
        Math.round(enemy.y + Math.sin(enemy.facing) * reach)
      );
    }

    // Shot rays, drawn in the ground plane where they are actually resolved.
    for (const ray of this.combat.debugRays) {
      g.lineStyle(1, ray.hit ? 0xff5a3c : 0x9aa4b2, Phaser.Math.Clamp(ray.life, 0.15, 0.85));
      g.lineBetween(
        Math.round(ray.from.x),
        Math.round(ray.from.y),
        Math.round(ray.to.x),
        Math.round(ray.to.y)
      );
    }

    // The aim origin, to show the TORSO_OFFSET_Y rendering offset explicitly.
    cross(this.player.x, this.player.y - TORSO_OFFSET_Y, 0x8fd0ff);
  }

  /**
   * Cover, occlusion and prop-collision tiles, drawn only for the tiles on
   * screen. Authored cover and prop-derived cover use different colours so an
   * oversized prop footprint is immediately obvious.
   */
  /**
   * F3 vision diagnostics: why a guard can or cannot see Tempest.
   *
   * The wedge is NOT an approximation. Each boundary point comes from
   * `Grid.raycastSight`, which uses the engine's own occlusion predicate - the
   * same `blocksSight` test `canSee` runs - so a wedge clipped by a wall is
   * clipped exactly where sight is actually lost. The arc is sampled at
   * `VISION_RAYS` angles, so only the curvature between adjacent rays is
   * interpolated; the range and the cone half-angle are exact.
   *
   * Low cover is deliberately absent from the wedge: it blocks sight only for a
   * CROUCHING target, so a single wedge cannot be correct for both stances. The
   * wedge is drawn for the player's current stance, and the HUD line states
   * which stance that is.
   *
   * Purely additive rendering on its own graphics layer. It reads state through
   * read-only accessors, writes nothing, and is off unless F3 is toggled.
   */
  private drawVisionDebug(): void {
    const g = this.visionGfx;
    g.clear();
    if (!this.debugHitboxes) {
      for (const label of this.guardLabels) label.setVisible(false);
      return;
    }

    const VISION_RAYS = 24;
    const half = (VISION.coneDegrees / 2) * (Math.PI / 180);
    const crouched = this.player.crouched;

    for (let i = 0; i < this.enemies.length; i++) {
      const enemy = this.enemies[i];
      const label = this.guardLabels[i];
      if (enemy.dead) {
        label?.setVisible(false);
        continue;
      }

      const colour =
        enemy.state === 'combat'
          ? 0xd9472f
          : enemy.state === 'investigate' || enemy.state === 'search'
            ? 0xe0c04a
            : 0x6fb4a0;

      // Wedge boundary, traced with the engine's own sight raycast.
      const origin = enemy.groundPoint;
      const points: Phaser.Geom.Point[] = [new Phaser.Geom.Point(origin.x, origin.y)];
      for (let r = 0; r <= VISION_RAYS; r++) {
        const angle = enemy.facing - half + (2 * half * r) / VISION_RAYS;
        const hit = this.level.grid.raycastSight(origin, angle, VISION.maxDistance, crouched);
        points.push(new Phaser.Geom.Point(hit.x, hit.y));
      }
      g.fillStyle(colour, 0.22);
      g.fillPoints(points, true);
      // The arc itself, drawn as a bright polyline. A translucent fill alone is
      // unreadable over 16px pixel art at 480x270, which is the whole audience
      // for this overlay.
      g.lineStyle(1, colour, 0.95);
      g.strokePoints(points.slice(1), false);
      // And the two cone edges, so the 100 degree limit is unmistakable.
      for (const edge of [points[1], points[points.length - 1]]) {
        g.lineBetween(
          Math.round(origin.x),
          Math.round(origin.y),
          Math.round(edge.x),
          Math.round(edge.y)
        );
      }

      // Facing centre line, full range.
      const centre = this.level.grid.raycastSight(
        origin,
        enemy.facing,
        VISION.maxDistance,
        crouched
      );
      g.lineStyle(1, colour, 0.8);
      g.lineBetween(
        Math.round(origin.x),
        Math.round(origin.y),
        Math.round(centre.x),
        Math.round(centre.y)
      );

      // Suspicion as a 20px bar above the guard.
      const barX = Math.round(enemy.x) - 10;
      const barY = Math.round(enemy.y) - CHAR_FRAME_HEIGHT - 12;
      g.fillStyle(0x15151c, 0.8);
      g.fillRect(barX, barY, 20, 3);
      g.fillStyle(colour, 1);
      g.fillRect(barX, barY, Math.round((enemy.suspicion / VISION.combatThreshold) * 20), 3);

      // Last known player position: hollow square, joined by a dotted line.
      const known = enemy.debugLastKnown;
      if (known) {
        g.lineStyle(1, 0xff8fd0, 0.9);
        g.strokeRect(Math.round(known.x) - 3, Math.round(known.y) - 3, 6, 6);
        for (let t = 0; t < 1; t += 0.12) {
          g.fillStyle(0xff8fd0, 0.5);
          g.fillRect(
            Math.round(origin.x + (known.x - origin.x) * t),
            Math.round(origin.y + (known.y - origin.y) * t),
            1,
            1
          );
        }
      }

      // Current investigation/pursuit destination: an X.
      const dest = enemy.debugDestination;
      if (dest) {
        g.lineStyle(1, 0x8fd0ff, 0.9);
        g.lineBetween(
          Math.round(dest.x) - 3,
          Math.round(dest.y) - 3,
          Math.round(dest.x) + 3,
          Math.round(dest.y) + 3
        );
        g.lineBetween(
          Math.round(dest.x) - 3,
          Math.round(dest.y) + 3,
          Math.round(dest.x) + 3,
          Math.round(dest.y) - 3
        );
      }

      const text =
        `${enemy.name.replace('enemy_', '').toUpperCase()} ${enemy.state.toUpperCase()} ` +
        `${Math.round(enemy.suspicion)}`;
      if (label) {
        label.setText(text);
        label.setPosition(Math.round(enemy.x), barY - 9);
        label.setVisible(true);
      }
    }

    // Player stance and concealment readout, in screen space.
    const inShadow = this.level.grid.isShadowWorld(this.player.x, this.player.y);
    const rate = crouched
      ? inShadow
        ? VISION.ratesCrouchingShadow
        : VISION.ratesCrouching
      : this.player.sprinting
        ? VISION.ratesSprinting
        : VISION.ratesStanding;
    this.debugStanceLabel?.setText(
      `${this.player.stance.toUpperCase()}${inShadow ? ' +SHADOW' : ''}  ${rate}/s  ` +
        `CONE ${VISION.coneDegrees}deg ${VISION.maxDistance}px`
    );
    this.debugStanceLabel?.setVisible(true);
  }

  private drawDebugTiles(g: Phaser.GameObjects.Graphics): void {
    const view = this.cameras.main.worldView;
    const x0 = Math.max(0, Math.floor(view.x / TILE) - 1);
    const y0 = Math.max(0, Math.floor(view.y / TILE) - 1);
    const x1 = Math.min(this.level.grid.width - 1, Math.ceil(view.right / TILE));
    const y1 = Math.min(this.level.grid.height - 1, Math.ceil(view.bottom / TILE));

    const propLayer = this.level.map.getLayer('propCollision')?.data;

    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const flags = this.level.grid.at(tx, ty);
        if (!flags.collides && !flags.shadow) continue;
        const x = tx * TILE;
        const y = ty * TILE;
        const fromProp = !!propLayer?.[ty]?.[tx] && propLayer[ty][tx].index > 0;

        if (flags.shadow && !flags.collides) {
          // Concealment zone.
          g.lineStyle(1, 0x6a5acd, 0.5);
          g.strokeRect(x + 1, y + 1, TILE - 2, TILE - 2);
          continue;
        }
        if (fromProp) {
          // Prop-derived collision: orange.
          g.lineStyle(1, 0xffa23c, 0.85);
        } else if (flags.lowCover) {
          // Low cover: blocks bullets, hides only a crouched player.
          g.lineStyle(1, 0x3cd6a0, 0.8);
        } else if (flags.blocksSight) {
          // Solid and vision-blocking.
          g.lineStyle(1, 0xd94f8f, 0.55);
        } else {
          g.lineStyle(1, 0x8f8fd9, 0.55);
        }
        g.strokeRect(x, y, TILE, TILE);
      }
    }
  }

  /** Simple painter's-algorithm y-sorting between characters. */
  private sortDepths(): void {
    this.player.sprite.setDepth(10 + this.player.y / 10000);
    for (const enemy of this.enemies)
      if (!enemy.dead) enemy.sprite.setDepth(10 + enemy.y / 10000);
  }

  private setPaused(paused: boolean): void {
    if (this.sliceComplete) return;
    this.paused = paused;
    if (paused) {
      this.physics.pause();
      this.pause.open(this.mission.activeText());
    } else {
      this.physics.resume();
      this.pause.close();
    }
  }

  private torndown = false;

  private shutdownScene(): void {
    if (this.torndown) return;
    this.torndown = true;
    this.input.setDefaultCursor('default');
    // PixelText allocates a canvas texture per instance, so the debug labels
    // must be released with the scene.
    this.artV2?.destroy();
    this.artV2 = null;
    for (const label of this.guardLabels) label.destroy();
    this.guardLabels = [];
    this.debugStanceLabel?.destroy();
    this.debugStanceLabel = null;
    this.hud?.destroy();
    this.dialogue?.destroy();
    this.pause?.destroy();
  }
}

/** Applied to substeps after the first so a keypress is never handled twice. */
const NEUTRAL_EDGES = {
  reloadPressed: false,
  crouchPressed: false,
  selectWeapon: null,
  interactPressed: false,
} as const;

/**
 * Frames in the stage tileset used for door state. Derived from TILE_NAMES
 * rather than written as literals, so re-ordering the tileset cannot silently
 * leave a closed door drawing as a window.
 */
const DOOR_FRAME = {
  closed: TILE_NAMES.indexOf('door_closed'),
  open: TILE_NAMES.indexOf('door_open'),
} as const;

/**
 * Which dialogue a piece of evidence plays. Keyed by the interactable's `kind`
 * rather than its objective, because two sources share one beat and each has
 * its own line.
 */
const EVIDENCE_DIALOGUE: Record<string, DialogueLine[] | undefined> = {
  tracks: DIALOGUE.village_tracks,
  stall: DIALOGUE.village_stall,
  waybill: DIALOGUE.village_waybill,
  ledger: DIALOGUE.village_ledger,
  van: DIALOGUE.village_van,
  inscription: DIALOGUE.village_belial,
};

interface DoorActor {
  name: string;
  tileX: number;
  tileY: number;
  tileW: number;
  tileH: number;
  /** One static image per door tile: the picture and the collider in one. */
  tiles: Phaser.Physics.Arcade.Image[];
}

interface TriggerRegion {
  name: string;
  zone: Phaser.Geom.Rectangle;
  objective?: string;
  requires?: string;
  dialogue?: string;
  /** The overheard conversation needs a living guard in earshot. */
  needsLivingGuardWithin?: number;
}

interface StoryActor {
  name: string;
  x: number;
  y: number;
  radius: number;
  objective?: string;
  requires?: string;
  dialogue: string;
  sprite?: Phaser.GameObjects.Image;
  bob?: Phaser.Tweens.Tween;
  resolved: boolean;
}
