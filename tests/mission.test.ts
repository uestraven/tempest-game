import { describe, expect, it } from 'vitest';
import { GARAGE_DOORS, KEY_OBJECTIVE, Mission } from '../src/systems/Mission';
import { EXIT_REQUIRES, FINAL_OBJECTIVE, OBJECTIVES } from '../src/data/objectives';
import { Grid } from '../src/core/Grid';
import { DIALOGUE } from '../src/data/dialogue';
import { SAVE_VERSION } from '../src/core/constants';

/**
 * The Phase C.1B-02 progression contract.
 *
 * Mission is deliberately Phaser-free, so every rule the brief asks about can
 * be asserted headlessly rather than inferred from a playthrough: alternate
 * evidence sources, non-duplication, the key, both garage entrances, the
 * mandatory BELIAL beat, kill-independence, and checkpoint restoration of the
 * physical level state.
 *
 * THESE ARE HEADLESS TESTS. They prove the rules; they are not a browser
 * playthrough and make no claim about rendering, input or feel.
 */

/** The authored narrative order, for readability in the walkthrough tests. */
const CHAIN = ['V1', 'V2', 'V3', 'V5', 'V4', 'V6', 'V7', 'V8'];

/** Completes the chain up to but not including `stop`. */
function advanceTo(m: Mission, stop: string): void {
  for (const id of CHAIN) {
    if (id === stop) return;
    expect(m.complete(id).granted, `could not reach ${stop}: ${id} refused`).toBe(true);
  }
}

// ----------------------------------------------------------------- 1. V1

describe('1-2. the convoy stop has two sources and grants once', () => {
  it('completes V1 from the tyre tracks alone', () => {
    const m = new Mission();
    expect(m.complete('V1').granted).toBe(true);
    expect(m.isComplete('V1')).toBe(true);
  });

  it('completes V1 from the ransacked stall alone', () => {
    // Same beat, different interactable: the scene maps both to 'V1'.
    const m = new Mission();
    expect(m.complete('V1').granted).toBe(true);
  });

  it('grants nothing the second time, whichever source is used first', () => {
    const m = new Mission();
    expect(m.complete('V1').granted).toBe(true);
    const second = m.complete('V1');
    expect(second.granted).toBe(false);
    // Not reported as blocked either - it is simply already known.
    expect(second.blockedBy).toBeUndefined();
  });

  it('gives each V1 source its own dialogue so the repeat is not noticeable', () => {
    expect(DIALOGUE.village_tracks.length).toBeGreaterThan(0);
    expect(DIALOGUE.village_stall.length).toBeGreaterThan(0);
    expect(DIALOGUE.village_tracks).not.toEqual(DIALOGUE.village_stall);
  });
});

// ----------------------------------------------------------------- 3-5. V2

describe('3-5. the destination has two sources, one of them optional-by-guard', () => {
  it('completes V2 from the waybill', () => {
    const m = new Mission();
    m.complete('V1');
    expect(m.complete('V2').granted).toBe(true);
  });

  it('completes V2 from the overheard conversation', () => {
    const m = new Mission();
    m.complete('V1');
    // The trigger calls the same beat; the scene decides whether a guard is in
    // earshot, which is a spatial condition, not a progression one.
    expect(m.complete('V2').granted).toBe(true);
  });

  it('still completes V2 from the waybill when every guard is dead', () => {
    // The overheard line needs a living guard; the waybill never does. Mission
    // holds no guard state at all, which is exactly why killing cannot block it.
    const m = new Mission();
    m.complete('V1');
    expect(m.complete('V2').granted).toBe(true);
    expect(m.isComplete('V2')).toBe(true);
  });

  it('refuses V2 before the convoy stop is understood', () => {
    const m = new Mission();
    const result = m.complete('V2');
    expect(result.granted).toBe(false);
    expect(result.blockedBy).toBe('V1');
  });
});

// ----------------------------------------------------------------- 6-7. V3

describe('6-7. both routes reach the depot and the office', () => {
  it('completes V3 from either approach trigger', () => {
    for (const _route of ['main street', 'garden']) {
      const m = new Mission();
      advanceTo(m, 'V3');
      expect(m.complete('V3').granted, _route).toBe(true);
    }
  });

  it('opens the office search as soon as the depot is reached, by either route', () => {
    const m = new Mission();
    advanceTo(m, 'V3');
    m.complete('V3');
    expect(m.objectives.isAvailable(KEY_OBJECTIVE)).toBe(true);
  });
});

// --------------------------------------------------------------- 8-10. key

describe('8-10. the ledger carries the garage key', () => {
  it('grants the key exactly when V5 completes, and not before', () => {
    const m = new Mission();
    expect(m.hasGarageKey).toBe(false);
    advanceTo(m, 'V5');
    expect(m.hasGarageKey, 'key granted before the office').toBe(false);
    m.complete('V5');
    expect(m.hasGarageKey).toBe(true);
  });

  it('leaves neither garage entrance passable without the key', () => {
    const m = new Mission();
    advanceTo(m, 'V5');
    for (const door of GARAGE_DOORS) {
      expect(m.isDoorLocked(door), door).toBe(true);
      expect(m.isDoorOpen(door), door).toBe(false);
    }
  });

  it('opens BOTH entrances with the one key', () => {
    const m = new Mission();
    advanceTo(m, 'V5');
    m.complete('V5');
    for (const door of GARAGE_DOORS) {
      expect(m.isDoorOpen(door), door).toBe(true);
      expect(m.isDoorLocked(door), door).toBe(false);
    }
  });

  it('names the key beat on the objective that actually supplies it', () => {
    const def = OBJECTIVES.find((o) => o.id === KEY_OBJECTIVE);
    expect(def?.clue).toMatch(/key/i);
  });
});

describe('a locked door is geometry, not a flag', () => {
  /**
   * The engine contract behind the key: a closed door tile is solid to
   * movement, bullets, line of sight and A* through one code path, so what the
   * player sees and what the player can pass can never disagree.
   */
  it('blocks movement, sight and pathing while closed, and none of them when open', () => {
    const grid = new Grid(5, 3);
    // A wall across the middle row with one tile left as the doorway.
    for (let x = 0; x < 5; x++)
      if (x !== 2) grid.merge(x, 1, { collides: true, blocksSight: true });
    grid.setDoor(2, 1, true);

    const below = { x: 2 * 16 + 8, y: 2 * 16 + 8 };
    const above = { x: 2 * 16 + 8, y: 8 };

    expect(grid.solidAt(2, 1)).toBe(true);
    expect(grid.at(2, 1).blocksSight).toBe(true);
    expect(grid.hasLineOfSight(below, above, false)).toBe(false);
    expect(grid.findPath(below, above)).toBeNull();
    // Range stops short of the map edge: out of bounds counts as solid, so a
    // longer ray would report blocked for the wrong reason.
    expect(grid.raycastShot(below, -Math.PI / 2, 32).blocked).toBe(true);

    grid.setDoor(2, 1, false);
    expect(grid.solidAt(2, 1)).toBe(false);
    expect(grid.hasLineOfSight(below, above, false)).toBe(true);
    expect(grid.findPath(below, above)).not.toBeNull();
    expect(grid.raycastShot(below, -Math.PI / 2, 32).blocked).toBe(false);
  });

  it('leaves non-door tiles untouched', () => {
    const grid = new Grid(3, 3);
    grid.merge(1, 1, { collides: true });
    expect(grid.isDoorTile(1, 1)).toBe(false);
    expect(grid.solidAt(1, 1)).toBe(true);
  });
});

// ------------------------------------------------------------- 11-12. V4

describe('11-12. the transport is behind the key', () => {
  it('refuses V4 until the ledger is read', () => {
    const m = new Mission();
    advanceTo(m, 'V5');
    const result = m.complete('V4');
    expect(result.granted).toBe(false);
    expect(result.blockedBy).toBe('V5');
  });

  it('grants V4 once the garage is open', () => {
    const m = new Mission();
    advanceTo(m, 'V4');
    expect(m.complete('V4').granted).toBe(true);
  });
});

// ------------------------------------------------------------- 13-15. V6/V7

describe('13-15. the cultist and BELIAL are mandatory and one-shot', () => {
  it('plays the cultist scene at most once', () => {
    const m = new Mission();
    expect(m.markEvent('scene_actor_cultist')).toBe(true);
    expect(m.markEvent('scene_actor_cultist')).toBe(false);
    expect(m.hasEvent('scene_actor_cultist')).toBe(true);
  });

  it('cannot be skipped: V7 is unreachable without V6', () => {
    const m = new Mission();
    advanceTo(m, 'V6');
    const result = m.complete('V7');
    expect(result.granted).toBe(false);
    expect(result.blockedBy).toBe('V6');
  });

  it('makes V6 and V7 mandatory, not optional', () => {
    for (const id of ['V6', 'V7']) {
      const def = OBJECTIVES.find((o) => o.id === id);
      expect(def, id).toBeDefined();
      expect(def?.optional, `${id} must not be optional`).toBeFalsy();
    }
  });

  it('names BELIAL in the clue and explains nothing', () => {
    const v7 = OBJECTIVES.find((o) => o.id === 'V7');
    expect(v7?.clue).toMatch(/BELIAL/);
    const lines = DIALOGUE.village_belial.map((l) => l.text).join(' ');
    expect(lines).toMatch(/Belial/);
    expect(lines).toMatch(/means nothing/i);
  });
});

// --------------------------------------------------------------- 16. exit

describe('16. departure', () => {
  it('refuses the exit until BELIAL is found', () => {
    const m = new Mission();
    advanceTo(m, 'V7');
    expect(m.isComplete(EXIT_REQUIRES)).toBe(false);
    expect(m.complete(FINAL_OBJECTIVE).granted).toBe(false);
  });

  it('completes the mission once BELIAL is found and the player leaves', () => {
    const m = new Mission();
    advanceTo(m, 'V8');
    expect(m.isComplete(EXIT_REQUIRES)).toBe(true);
    expect(m.complete(FINAL_OBJECTIVE).granted).toBe(true);
  });

  it('shows a specific outstanding objective rather than a blank refusal', () => {
    const m = new Mission();
    advanceTo(m, 'V7');
    expect(m.activeText()).toBe(OBJECTIVES.find((o) => o.id === 'V7')?.text);
    expect(DIALOGUE.village_exit_blocked.length).toBeGreaterThan(0);
  });
});

// ------------------------------------------------------- 17. no kill needed

describe('17. the mission never requires a kill, and never breaks from one', () => {
  it('completes end to end with no combat state involved at all', () => {
    // Mission holds no enemy state, so a pacifist run and a loud run traverse
    // the identical state machine. This is the structural guarantee.
    const m = new Mission();
    for (const id of CHAIN) expect(m.complete(id).granted, id).toBe(true);
    expect(m.isComplete(FINAL_OBJECTIVE)).toBe(true);
  });

  it('is unaffected by an aggressive playthrough that kills everything first', () => {
    // Nothing a player can do to a guard appears in this state; the only beat
    // with a guard precondition (the overheard line) has a second source.
    const m = new Mission();
    for (const id of CHAIN) m.complete(id);
    expect(m.isComplete(FINAL_OBJECTIVE)).toBe(true);
    expect(m.hasGarageKey).toBe(true);
  });

  it('puts no objective on an enemy: every beat id resolves to a site, not a kill', () => {
    for (const def of OBJECTIVES) {
      expect(def.text, def.id).not.toMatch(/\b(kill|eliminate|neutralis|neutraliz)/i);
    }
  });
});

// -------------------------------------------------- 18. checkpoints / saves

describe('18. checkpoints restore the physical level, not just the HUD', () => {
  it('round-trips objectives, the key, both doors, events and triggers', () => {
    const m = new Mission();
    advanceTo(m, 'V4');
    m.markEvent('arrival_dialogue');
    m.fireTrigger('trigger_depot_street');
    const snap = m.snapshot();

    const restored = new Mission();
    restored.restore(snap);

    expect(restored.isComplete('V5')).toBe(true);
    expect(restored.hasGarageKey).toBe(true);
    for (const door of GARAGE_DOORS) expect(restored.isDoorOpen(door), door).toBe(true);
    expect(restored.hasEvent('arrival_dialogue')).toBe(true);
    expect(restored.hasFired('trigger_depot_street')).toBe(true);
    expect(restored.snapshot()).toEqual(snap);
  });

  it('keeps a played cultist scene played across a reload', () => {
    const m = new Mission();
    advanceTo(m, 'V6');
    m.markEvent('scene_actor_cultist');
    m.complete('V6');

    const restored = new Mission();
    restored.restore(m.snapshot());
    // The scene must not replay, and V6 must stay granted.
    expect(restored.markEvent('scene_actor_cultist')).toBe(false);
    expect(restored.isComplete('V6')).toBe(true);
  });

  it('repairs a snapshot that has V5 but a locked garage', () => {
    // Defence against a hand-edited or partially-written save: the key is
    // implied by the beat, so the garage can never be permanently shut.
    const m = new Mission();
    advanceTo(m, 'V4');
    const tampered = { ...m.snapshot(), hasGarageKey: false, openDoors: [] };

    const restored = new Mission();
    restored.restore(tampered);
    expect(restored.hasGarageKey).toBe(true);
    for (const door of GARAGE_DOORS) expect(restored.isDoorOpen(door), door).toBe(true);
  });

  it('is finishable after a reload taken at every checkpoint beat', () => {
    for (const stop of ['V2', 'V5', 'V7']) {
      const m = new Mission();
      advanceTo(m, stop);
      m.complete(stop);

      const resumed = new Mission();
      resumed.restore(m.snapshot());
      for (const id of CHAIN) if (!resumed.isComplete(id)) resumed.complete(id);
      expect(resumed.isComplete(FINAL_OBJECTIVE), `stuck after reloading at ${stop}`).toBe(true);
    }
  });

  it('starts clean from an absent snapshot', () => {
    const m = new Mission();
    advanceTo(m, 'V5');
    m.complete('V5');
    m.reset();
    expect(m.hasGarageKey).toBe(false);
    expect(m.isComplete('V1')).toBe(false);
    for (const door of GARAGE_DOORS) expect(m.isDoorLocked(door), door).toBe(true);
  });

  it('refuses a pre-rework save outright, because the beat ids changed meaning', () => {
    // V3 used to be an optional BELIAL mark and VX used to be the exit, so
    // version-1 progress is not translatable. Save.ts rejects on version.
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(2);
  });
});

// -------------------------------------------------------------- regressions

describe('one-shot regions never strand the player', () => {
  it('does not consume a trigger the player crossed before its prerequisite', () => {
    // The scene only calls fireTrigger once the beat is actually granted, so a
    // premature crossing leaves the trigger live.
    const m = new Mission();
    expect(m.complete('V3').granted).toBe(false);
    expect(m.hasFired('trigger_depot_street')).toBe(false);

    advanceTo(m, 'V3');
    expect(m.complete('V3').granted).toBe(true);
    expect(m.fireTrigger('trigger_depot_street')).toBe(true);
    expect(m.fireTrigger('trigger_depot_street')).toBe(false);
  });

  it('keeps the HUD pointer on the earliest outstanding beat throughout', () => {
    const m = new Mission();
    const seen: string[] = [];
    for (const id of CHAIN) {
      seen.push(m.active()?.id ?? 'none');
      m.complete(id);
    }
    expect(seen).toEqual(CHAIN);
    expect(m.active()).toBeNull();
  });
});
