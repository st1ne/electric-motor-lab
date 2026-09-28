/**
 * The winding really makes the field the arrow shows (TECH_SPEC §5.2, §10.1, §18.2).
 * From the 54-slot layout (A, −C, B, −A, C, −B) and the three phase currents at current angle
 * θ_i, the fundamental of the stator MMF must peak at mechanical angle θ_i / p, which is where the
 * field arrow and the gap arrows put the north pole when only the stator current is shown.
 * Conductor sheet K(φ) = Σ c_k δ(φ − φ_k); MMF F = ∫K dφ, so F_p = K_p / (i p) and the MMF
 * fundamental peaks where p φ = π/2 − arg(K_p), with K_p = Σ c_k e^{−i p φ_k}.
 */
import { describe, expect, it } from 'vitest';
import { GEOMETRY, PM } from '@/config/motor';
import { slotAngle, slotPhase } from '@/scene/motor/profile';

const p = PM.polePairs;
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

function mmfPeakElec(thetaI: number): number {
  const i = [thetaI, thetaI - (2 * Math.PI) / 3, thetaI + (2 * Math.PI) / 3].map(Math.cos);
  let re = 0;
  let im = 0;
  for (let k = 0; k < GEOMETRY.slots; k++) {
    const { phase, sign } = slotPhase(k);
    const c = sign * (i[phase] ?? 0);
    const phi = slotAngle(k);
    re += c * Math.cos(p * phi);
    im -= c * Math.sin(p * phi);
  }
  return wrap(Math.PI / 2 - Math.atan2(im, re));
}

describe('winding layout', () => {
  it('every phase has 18 slots, half of them "−"', () => {
    for (let ph = 0; ph < 3; ph++) {
      const slots = [...Array(GEOMETRY.slots).keys()].filter((k) => slotPhase(k).phase === ph);
      expect(slots).toHaveLength(18);
      expect(slots.filter((k) => slotPhase(k).sign < 0)).toHaveLength(9);
    }
  });

  it('the MMF of i_a, i_b, i_c at current angle θ_i peaks at θ_i (electrical) for every θ_i', () => {
    for (let n = 0; n < 24; n++) {
      const thetaI = (n * 2 * Math.PI) / 24;
      expect(Math.abs(wrap(mmfPeakElec(thetaI) - thetaI))).toBeLessThan(1e-9);
    }
  });

  it('phase A alone: the MMF sits on the A axis (φ = 0) and pulsates in place', () => {
    // i_a > 0, i_b = i_c = −i_a/2 is θ_i = 0; the axis must be φ = 0 mechanical (mod 2π/p)
    expect(Math.abs(wrap(p * (mmfPeakElec(0) / p)))).toBeLessThan(1e-9);
  });
});
