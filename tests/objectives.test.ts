import { describe, expect, it } from 'vitest';
import { Objectives } from '../src/systems/Objectives';
import { EXIT_REQUIRES, FINAL_OBJECTIVE } from '../src/data/objectives';

/**
 * Generic gating mechanics only. The Valcendre-specific progression contract
 * (alternate sources, the key, the doors, kill-independence) lives in
 * tests/mission.test.ts, which exercises the same engine through Mission.
 */

describe('objective gating', () => {
  it('refuses an objective whose prerequisite is incomplete', () => {
    const o = new Objectives();
    expect(o.complete('V2')).toBe(false);
    expect(o.isComplete('V2')).toBe(false);
  });

  it('grants an objective once and only once', () => {
    const o = new Objectives();
    expect(o.complete('V1')).toBe(true);
    expect(o.complete('V1')).toBe(false);
    expect(o.isComplete('V1')).toBe(true);
  });

  it('fires the completion handler exactly once per objective', () => {
    const o = new Objectives();
    const fired: string[] = [];
    o.onComplete((def) => fired.push(def.id));
    o.complete('V1');
    o.complete('V1');
    o.complete('V2');
    expect(fired).toEqual(['V1', 'V2']);
  });

  it('advances the active objective in authored narrative order', () => {
    const o = new Objectives();
    expect(o.active()?.id).toBe('V1');
    o.complete('V1');
    expect(o.active()?.id).toBe('V2');
    o.complete('V2');
    expect(o.active()?.id).toBe('V3');
    o.complete('V3');
    // Narrative order, not id order: the ledger precedes the transport.
    expect(o.active()?.id).toBe('V5');
  });

  it('keeps the exit gated behind the whole chain', () => {
    const o = new Objectives();
    expect(o.isAvailable(FINAL_OBJECTIVE)).toBe(false);
    for (const id of ['V1', 'V2', 'V3', 'V5', 'V4', 'V6']) {
      o.complete(id);
      expect(o.isAvailable(FINAL_OBJECTIVE), `available too early, after ${id}`).toBe(false);
    }
    o.complete(EXIT_REQUIRES);
    expect(o.isAvailable(FINAL_OBJECTIVE)).toBe(true);
  });

  it('round-trips through a snapshot without duplicating state', () => {
    const o = new Objectives();
    o.complete('V1');
    o.complete('V2');
    const snap = o.snapshot();

    const restored = new Objectives();
    restored.restore(snap);
    expect(restored.isComplete('V1')).toBe(true);
    expect(restored.isComplete('V2')).toBe(true);
    expect(restored.complete('V2')).toBe(false);
    expect(restored.active()?.id).toBe('V3');
  });

  it('ignores unknown ids in a restored snapshot', () => {
    const o = new Objectives();
    o.restore({ completed: ['V1', 'NOT_A_REAL_ID'] });
    expect(o.isComplete('V1')).toBe(true);
    expect(o.snapshot().completed).toEqual(['V1']);
  });
});
