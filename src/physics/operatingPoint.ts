/**
 * Minimum-loss operating point (TECH_SPEC §6.2, §6.3).
 * For a torque T at speed ω_m, walk the constant-torque curve i_q(i_d) with 201 samples,
 * reject points outside |i| ≤ I_max and |v| ≤ V_max, pick the lowest loss
 * (P_cu + P_rcu + P_fe + P_mag + P_inv), then refine with a golden-section search.
 * Below base speed this lands on MTPA; above it the voltage limit binds (field weakening).
 * Source: reference solve_on_curve(), solve(), full_point().
 */
import { IM, PM, SOLVER, type MotorKind } from '@/config/motor';
import { imEval, imIqForTorque } from '@/physics/induction';
import { mechLossW } from '@/physics/losses';
import { pmEval, pmIqForTorque } from '@/physics/pmsm';
import type { FullPoint, MachinePoint, OpPoint } from '@/physics/types';

export function evaluate(
  kind: MotorKind,
  omegaMechRad: number,
  idA: number,
  iqA: number,
  tempC?: number,
): MachinePoint {
  return kind === 'pm'
    ? pmEval(omegaMechRad, idA, iqA, tempC)
    : imEval(omegaMechRad, idA, iqA, tempC);
}

export function currentMaxA(kind: MotorKind): number {
  return kind === 'pm' ? PM.currentMaxA : IM.currentMaxA;
}

/** Search range of i_d: IPM [−I_max, 0]; IM [5 % of rated, rated] (the iron saturates beyond). */
export function idRange(kind: MotorKind): [number, number] {
  return kind === 'pm' ? [-PM.currentMaxA, 0] : [0.05 * IM.idRatedA, IM.idRatedA];
}

export function iqForTorque(kind: MotorKind, torqueNm: number, idA: number): number {
  return kind === 'pm' ? pmIqForTorque(torqueNm, idA) : imIqForTorque(torqueNm, idA);
}

/** Losses that depend on the current choice (the solver's objective). */
export function elecLossW(p: MachinePoint): number {
  return p.cuW + p.rcuW + p.feW + p.magW + p.invW;
}

export function limitViolation(kind: MotorKind, p: MachinePoint, vMax: number): number {
  return Math.max(p.currentPeakA - currentMaxA(kind), 0) + Math.max(p.vMagV - vMax, 0);
}

/** i_d at sample k of N+1 evenly spaced points on [lo, hi] (numpy.linspace). */
export function linspaceAt(lo: number, hi: number, n: number, k: number): number {
  return k === n ? hi : lo + (k * (hi - lo)) / n;
}

/** Golden-section minimum of f on [a, b]; returns the final bracket midpoint. */
export function goldenMin(
  f: (x: number) => number,
  a0: number,
  b0: number,
  n = SOLVER.goldenIters,
): number {
  const g = (Math.sqrt(5) - 1) / 2;
  let a = a0;
  let b = b0;
  let c = b - g * (b - a);
  let d = a + g * (b - a);
  let fc = f(c);
  let fd = f(d);
  for (let k = 0; k < n; k++) {
    if (fc < fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - g * (b - a);
      fc = f(c);
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + g * (b - a);
      fd = f(d);
    }
  }
  return 0.5 * (a + b);
}

function pointOnCurve(kind: MotorKind, w: number, torqueNm: number, idA: number): MachinePoint {
  return evaluate(kind, w, idA, iqForTorque(kind, torqueNm, idA));
}

/** Minimum-loss i_d on the constant-torque curve within [lo, hi]; null if nothing is feasible. */
export function solveOnCurve(
  kind: MotorKind,
  w: number,
  torqueNm: number,
  vMax: number,
  lo: number,
  hi: number,
): number | null {
  const n = SOLVER.samples;
  let k = -1;
  let best = Infinity;
  for (let i = 0; i <= n; i++) {
    const p = pointOnCurve(kind, w, torqueNm, linspaceAt(lo, hi, n, i));
    if (limitViolation(kind, p, vMax) > 0) continue;
    const loss = elecLossW(p);
    if (loss < best) {
      best = loss;
      k = i;
    }
  }
  if (k < 0) return null;
  const idK = linspaceAt(lo, hi, n, k);
  const a = linspaceAt(lo, hi, n, Math.max(k - 1, 0));
  const b = linspaceAt(lo, hi, n, Math.min(k + 1, n));
  const f = (x: number): number => {
    const p = pointOnCurve(kind, w, torqueNm, x);
    return elecLossW(p) + 1e6 * limitViolation(kind, p, vMax);
  };
  let x = goldenMin(f, a, b);
  let px = pointOnCurve(kind, w, torqueNm, x);
  if (limitViolation(kind, px, vMax) > 0) {
    // pull back onto the feasible side of the limit, towards the feasible sample
    let good = idK;
    let bad = x;
    for (let i = 0; i < SOLVER.bisectIters; i++) {
      const mid = 0.5 * (good + bad);
      if (limitViolation(kind, pointOnCurve(kind, w, torqueNm, mid), vMax) > 0) bad = mid;
      else good = mid;
    }
    x = good;
    px = pointOnCurve(kind, w, torqueNm, x);
  }
  if (elecLossW(px) > best) x = idK;
  return x;
}

/**
 * Minimum-loss (i_d, i_q) for electromagnetic torque T at ω_m. Torques outside the envelope
 * return the envelope point with feasible = false. IM at T = 0: flux off, zero current.
 */
export function solve(
  kind: MotorKind,
  w: number,
  torqueNm: number,
  vMax: number,
  opMax: OpPoint,
  opMin: OpPoint,
): OpPoint {
  if (kind === 'im' && torqueNm === 0) return { idA: 0, iqA: 0, torqueNm: 0, feasible: true };
  if (torqueNm >= opMax.torqueNm) {
    return { ...opMax, feasible: torqueNm === opMax.torqueNm };
  }
  if (torqueNm <= opMin.torqueNm) {
    return { ...opMin, feasible: torqueNm === opMin.torqueNm };
  }
  const [lo, hi] = idRange(kind);
  let x = solveOnCurve(kind, w, torqueNm, vMax, lo, hi);
  if (x === null) {
    // close to the envelope: the feasible arc is narrower than the sample spacing
    const env = torqueNm > 0 ? opMax : opMin;
    const span = 0.05 * (hi - lo);
    x = solveOnCurve(
      kind,
      w,
      torqueNm,
      vMax,
      Math.max(lo, env.idA - span),
      Math.min(hi, env.idA + span),
    );
  }
  if (x === null) {
    const env = torqueNm > 0 ? opMax : opMin;
    return { ...env, feasible: false };
  }
  return { idA: x, iqA: iqForTorque(kind, torqueNm, x), torqueNm, feasible: true };
}

/** DC power P_dc = T ω_m + P_cu + P_rcu + P_inv (iron, magnet and mech losses load the shaft). */
export function pDcW(kind: MotorKind, w: number, idA: number, iqA: number): number {
  const p = evaluate(kind, w, idA, iqA);
  return p.torqueNm * w + p.cuW + p.rcuW + p.invW;
}

/** All derived quantities of an operating point (§6.4 efficiency definitions). */
export function fullPoint(kind: MotorKind, w: number, op: OpPoint): FullPoint {
  const p = evaluate(kind, w, op.idA, op.iqA);
  const mech = mechLossW(w);
  const pEm = p.torqueNm * w;
  const pShaft = pEm - p.feW - p.magW - mech;
  const pDc = pEm + p.cuW + p.rcuW + p.invW;
  let eff = 0;
  if (pShaft > 0 && pDc > 0) eff = pShaft / pDc;
  else if (pShaft < 0 && pDc < 0) eff = pDc / pShaft;
  let slip = 0;
  if (kind === 'im' && !(op.idA === 0 && op.iqA === 0) && Math.abs(p.omegaElecRad) > 1e-9) {
    slip = p.omegaSlipRad / p.omegaElecRad;
  }
  return {
    idA: op.idA,
    iqA: op.iqA,
    torqueNm: p.torqueNm,
    vdV: p.vdV,
    vqV: p.vqV,
    vMagV: p.vMagV,
    currentPeakA: p.currentPeakA,
    omegaElecRad: p.omegaElecRad,
    cuW: p.cuW,
    rcuW: p.rcuW,
    feW: p.feW,
    magW: p.magW,
    mechW: mech,
    invW: p.invW,
    pShaftW: pShaft,
    pDcW: pDc,
    eff,
    slip,
    feasible: op.feasible,
  };
}
