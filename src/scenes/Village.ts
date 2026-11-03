import Phaser from 'phaser';
import {
  FIXED_DT,
  MAX_FRAME_DT,
  PICKUP_AMOUNT,
  VIRTUAL_HEIGHT,
  VIRTUAL_WIDTH,
} from '../core/constants';
import { loadLevel, objectsOfType, requireObject, type LoadedMap, type MapObject } from '../core/MapLoader';
import type { Vec2 } from '../core/Grid';
import { NEUTRAL_INPUT, Player, type InputState } from '../actors/Player';
import { Enemy, SHOUT_RADIUS, type EnemySpawn, type EnemyWorld } from '../actors/Enemy';
import type { EnemyKind } from '../data/enemies';
import { Hearing } from '../systems/Hearing';
import { Combat } from '../systems/Combat';
import { Interaction, type Interactable, type PickupItem } from '../systems/Interaction';
import { Objectives } from '../systems/Objectives';
import { OPTIONAL_CLUES } from '../data/objectives';
import { DIALOGUE } from '../data/dialogue';
import { readSave, writeSave, type Checkpoint } from '../systems/Save';
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
  private objectives!: Objectives;
  private hud!: HUD;
  private dialogue!: DialogueBox;
  private pause!: PauseMenu;
  private audio!: Audio;
  private keys!: Keys;
  private crosshair!: Phaser.GameObjects.Image;
  private glintGfx!: Phaser.GameObjects.Graphics;

  private spawnPoint: Vec2 = { x: 0, y: 0 };
  private exitZone!: Phaser.Geom.Rectangle;
  private exitRequires = '';
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

  override create(): void {
    this.cameras.main.setBackgroundColor(0x0b0d12);
    this.level = loadLevel(this, LEVEL_ID);
    this.physics.world.setBounds(0, 0, this.level.widthPx, this.level.heightPx);

    this.hearing = new Hearing(this.level.grid);
    this.objectives = new Objectives();
    this.audio = new Audio(this);

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

    this.objectives.onComplete((def) => {
      if (def.clue) this.hud.showClue(def.clue);
      this.audio.play('pickup');
    });

    this.glintGfx = this.add.graphics().setDepth(19);
    this.crosshair = this.add.image(0, 0, 'crosshair').setDepth(60);
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
    this.spawnPoint = { x: spawn.x, y: spawn.y };
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

    const exit = requireObject(objects, 'exit');
    this.exitZone = new Phaser.Geom.Rectangle(exit.x, exit.y, exit.width, exit.height);
    this.exitRequires = String(exit.props.requires ?? '');
  }

  private propSprite(kind: string, obj: MapObject): Phaser.GameObjects.Image | undefined {
    const texture =
      kind === 'radio' ? 'prop_radio' : kind === 'log' || kind === 'hymn' ? 'prop_doc' : null;
    if (!texture) return undefined;
    return this.add.image(Math.round(obj.x), Math.round(obj.y), texture).setDepth(3);
  }

  private makeEnemyWorld(): EnemyWorld {
    return {
      grid: this.level.grid,
      playerSight: () => this.player.sightPoint,
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

    keyboard.on('keydown', (event: KeyboardEvent) => {
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

  override update(_time: number, delta: number): void {
    const frameDt = Math.min(delta / 1000, MAX_FRAME_DT);
    this.elapsed += frameDt;

    this.dialogue.update(frameDt);
    this.updateCrosshair();

    if (this.paused) {
      this.hud.update(frameDt, this.player, this.objectives.activeText(), null);
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
      : this.interaction.resolve(this.player, this.enemies, (id) => this.objectives.isComplete(id));
    this.hud.update(frameDt, this.player, this.objectives.activeText(), target?.prompt ?? null);
    this.drawGlints();
    this.sortDepths();
  }

  /** Edge-triggered inputs must fire on the first substep only. */
  private sampleInput(): InputState {
    if (!this.keys) return { ...NEUTRAL_INPUT };
    const k = this.keys;
    const pointer = this.input.activePointer;
    const muzzle = this.player.sightPoint;
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
        if (report.hits.length > 0) this.audio.play('hit', 0.6);
      }
    }

    for (const enemy of this.enemies) enemy.update(dt);
    this.combat.update(dt, this.player);
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
      this.objectives.isComplete(id)
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
      const granted = this.objectives.complete(prop.objective);
      if (granted) {
        const lines =
          prop.objective === 'V1'
            ? DIALOGUE.village_van
            : prop.objective === 'V2'
              ? DIALOGUE.village_log
              : prop.objective === 'V3'
                ? DIALOGUE.village_sigil
                : [];
        if (lines.length > 0) this.dialogue.play(lines);
        if (prop.objective === 'V2') this.captureCheckpoint('cp_log');
      }
    } else if (OPTIONAL_CLUES[prop.kind]) {
      this.hud.showClue(OPTIONAL_CLUES[prop.kind]);
    }
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
    if (this.exitRequires && !this.objectives.isComplete(this.exitRequires)) {
      this.hud.showSubtitle('Not yet. Find the transport first.', 2);
      return;
    }
    this.objectives.complete('VX');
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
        `TIME ${Math.floor(this.elapsed / 60)}:${String(Math.floor(this.elapsed % 60)).padStart(2, '0')}\n` +
          `NEXT: THE ESTATE (NOT IN THIS SLICE)\n\nENTER - TITLE`,
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
      version: 1,
      level: LEVEL_ID,
      checkpointId: id,
      player: this.player.snapshot(),
      enemies: this.enemies.map((e) => e.snapshot()),
      objectives: this.objectives.snapshot(),
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
    this.objectives.restore(checkpoint.objectives);

    const consumed = new Set(checkpoint.consumed);
    for (const item of this.items) {
      item.taken = consumed.has(item.name);
      item.sprite?.setVisible(!item.taken);
    }
    const used = new Set(checkpoint.used);
    for (const prop of this.props) prop.used = used.has(prop.name);

    const byName = new Map(checkpoint.enemies.map((e) => [e.name, e]));
    for (const enemy of this.enemies) {
      const snap = byName.get(enemy.name);
      if (snap) enemy.restore(snap);
      else enemy.resetToSpawn(this.enemySpawnFacing.get(enemy.name) ?? 0);
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
      if (prop.requires && !this.objectives.isComplete(prop.requires)) continue;
      if (prop.objective && this.objectives.isComplete(prop.objective)) continue;
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, prop.x, prop.y);
      if (dist > GLINT_RANGE) continue;
      g.fillStyle(0xf4e9c0, pulse);
      g.fillRect(Math.round(prop.x), Math.round(prop.y) - 14, 1, 3);
      g.fillRect(Math.round(prop.x) - 1, Math.round(prop.y) - 13, 3, 1);
    }
  }

  /** Simple painter's-algorithm y-sorting between characters. */
  private sortDepths(): void {
    this.player.sprite.setDepth(10 + this.player.y / 10000);
    this.player.gun.setDepth(10.5 + this.player.y / 10000);
    for (const enemy of this.enemies)
      if (!enemy.dead) enemy.sprite.setDepth(10 + enemy.y / 10000);
  }

  private setPaused(paused: boolean): void {
    if (this.sliceComplete) return;
    this.paused = paused;
    if (paused) {
      this.physics.pause();
      this.pause.open(this.objectives.activeText());
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
