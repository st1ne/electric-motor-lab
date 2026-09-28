/** Fuzz (TECH_SPEC §7.3): 10,000 random (rpm, T_cmd, SoC, temperatures) → finite outputs. */
import { describe, expect, it } from 'vitest';
import type { MotorKind } from '@/config/motor';
import { createKinematics } from '@/physics/kinematics';
import { createSim, createSimState, emptyStepResult, physicsStep } from '@/physics/sim';
import { MAPS } from './helpers';

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('fuzz', () => {
  it('10,000 random states give finite outputs', () => {
    const rnd = mulberry32(42);
    const res = emptyStepResult();
    for (let n = 0; n < 10000; n++) {
      const kind: MotorKind = rnd() < 0.5 ? 'pm' : 'im';
      const st = createSimState(rnd());
      st.v = rnd() * 70; // up to 252 km/h, past the limiter and the map edge
      st.tW = 20 + rnd() * 160;
      st.tR = 20 + rnd() * 160;
      st.accel = (rnd() - 0.5) * 12;
      const braking = rnd() < 0.3;
      physicsStep(st, MAPS, kind, braking ? 0 : rnd(), braking ? rnd() : 0, res);
      for (const x of [
        st.v,
        st.soc,
        st.tW,
        st.tR,
        res.pDc,
        res.tEm,
        res.tShaft,
        res.iDc,
        res.vDc,
      ]) {
        expect(Number.isFinite(x)).toBe(true);
      }
      expect(st.v).toBeGreaterThanOrEqual(0);
      // random torque lookups anywhere on (and off) the grid
      const p = MAPS[kind].lookup(rnd() * 18000 - 1000, rnd() * 1000 - 500);
      for (const x of [p.idA, p.iqA, p.vdV, p.vqV, p.cuW, p.eff])
        expect(Number.isFinite(x)).toBe(true);
    }
  });

  it('snapshot and kinematics stay finite through a wild input sequence', () => {
    const rnd = mulberry32(7);
    const sim = createSim(MAPS, 0.5);
    const kin = createKinematics();
    const presets = ['launch', 'cruise', 'top', 'regen', 'coast', 'none'] as const;
    for (let n = 0; n < 2000; n++) {
      if (rnd() < 0.01) sim.setPreset(presets[Math.floor(rnd() * presets.length)] ?? 'none');
      const motor: MotorKind = rnd() < 0.5 ? 'pm' : 'im';
      sim.step(rnd() * 0.1, { motor, throttle: rnd(), brake: rnd() < 0.1 ? rnd() : 0 });
      const s = sim.snapshot();
      const a = kin.advance(1 / 60, s, rnd() < 0.5 ? 'auto' : 1000, rnd() < 0.05);
      for (const [k, v] of Object.entries(s)) {
        if (typeof v === 'number') expect(Number.isFinite(v), k).toBe(true);
      }
      for (const x of [a.thetaMech, a.thetaField, a.ia, a.ib, a.ic, a.slowMo, a.carrier]) {
        expect(Number.isFinite(x)).toBe(true);
      }
    }
  });
});
