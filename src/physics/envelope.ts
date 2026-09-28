/**
 * Torque envelopes T_max(ω), T_min(ω) (TECH_SPEC §6.2, §6.3, §6.5).
 * For each i_d on a 401-point grid take the largest |i_q| inside the current circle and the
 * voltage limit, keep the best torque, refine with golden section. The regen envelope is further
 * limited to a 150 kW battery charge power (bisection on T for P_dc = −150 kW).
 * Source: reference envelope_raw(), envelope().
 */
import { BATTERY } from '@/config/battery';
import { SOLVER, type MotorKind } from '@/config/motor';
import { imIqLimit } from '@/physics/induction';
import { evaluate, goldenMin, idRange, linspaceAt, pDcW, solve } from '@/physics/operatingPoint';
import { pmIqLimit } from '@/physics/pmsm';
import type { OpPoint } from '@/physics/types';

export interface Envelope {
  tMax: number;
  tMin: number;
  opMax: OpPoint;
  opMin: OpPoint;
  /** regen envelope before the battery charge limit */
  tMinRaw: number;
}

export function iqLimit(
  kind: MotorKind,
  w: number,
  idA: number,
  sign: 1 | -1,
  vMax: number,
): number {
  return kind === 'pm' ? pmIqLimit(w, idA, sign, vMax) : imIqLimit(w, idA, sign, vMax);
}

/** Maximum |T| with the given sign at ω_m within the current and voltage limits. */
export function envelopeRaw(kind: MotorKind, w: number, sign: 1 | -1, vMax: number): OpPoint {
  const [lo, hi] = idRange(kind);
  const n = SOLVER.envelopeSamples;
  let k = -1;
  let best = -Infinity;
  for (let i = 0; i <= n; i++) {
    const id = linspaceAt(lo, hi, n, i);
    const iq = iqLimit(kind, w, id, sign, vMax);
    if (Number.isNaN(iq)) continue;
    const t = sign * evaluate(kind, w, id, iq).torqueNm;
    if (t > best) {
      best = t;
      k = i;
    }
  }
  if (k < 0) return { idA: 0, iqA: 0, torqueNm: 0, feasible: false };
  const a = linspaceAt(lo, hi, n, Math.max(k - 1, 0));
  const b = linspaceAt(lo, hi, n, Math.min(k + 1, n));
  const negT = (x: number): number => {
    const iq = iqLimit(kind, w, x, sign, vMax);
    if (Number.isNaN(iq)) return Infinity;
    return -sign * evaluate(kind, w, x, iq).torqueNm;
  };
  let x = goldenMin(negT, a, b);
  if (negT(x) > -best) x = linspaceAt(lo, hi, n, k);
  const iq = iqLimit(kind, w, x, sign, vMax);
  return { idA: x, iqA: iq, torqueNm: evaluate(kind, w, x, iq).torqueNm, feasible: true };
}

export function envelope(kind: MotorKind, w: number, vMax: number): Envelope {
  const opMax = envelopeRaw(kind, w, 1, vMax);
  let opMin = envelopeRaw(kind, w, -1, vMax);
  let tMin = opMin.torqueNm;
  const tMinRaw = opMin.torqueNm;
  const lim = -BATTERY.chargeLimitW;
  if (opMin.feasible && pDcW(kind, w, opMin.idA, opMin.iqA) < lim) {
    let a = opMin.torqueNm;
    let b = 0;
    for (let i = 0; i < SOLVER.bisectIters; i++) {
      const mid = 0.5 * (a + b);
      const x = solve(kind, w, mid, vMax, opMax, opMin);
      if (pDcW(kind, w, x.idA, x.iqA) < lim) a = mid;
      else b = mid;
    }
    tMin = b;
    const x = solve(kind, w, tMin, vMax, opMax, opMin);
    opMin = { idA: x.idA, iqA: x.iqA, torqueNm: tMin, feasible: true };
  }
  return { tMax: opMax.torqueNm, tMin, opMax, opMin, tMinRaw };
}
