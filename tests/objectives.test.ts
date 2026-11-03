import { describe, expect, it } from 'vitest';
import { Objectives } from '../src/systems/Objectives';

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

  it('advances the active objective in authored order', () => {
    const o = new Objectives();
    expect(o.active()?.id).toBe('V1');
    o.complete('V1');
    expect(o.active()?.id).toBe('V2');
    o.complete('V2');
    // V3 is optional, so the pointer skips to the exit.
    expect(o.active()?.id).toBe('VX');
  });

  it('keeps the exit gated behind the transport log', () => {
    const o = new Objectives();
    expect(o.isAvailable('VX')).toBe(false);
    o.complete('V1');
    o.complete('V2');
    expect(o.isAvailable('VX')).toBe(true);
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
    expect(restored.active()?.id).toBe('VX');
  });

  it('ignores unknown ids in a restored snapshot', () => {
    const o = new Objectives();
    o.restore({ completed: ['V1', 'NOT_A_REAL_ID'] });
    expect(o.isComplete('V1')).toBe(true);
    expect(o.snapshot().completed).toEqual(['V1']);
  });
});
