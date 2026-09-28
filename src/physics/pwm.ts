/**
 * SVPWM visual layer (TECH_SPEC §6.7).
 *   v_abc = inverse Park of (v_d, v_q) at the dq-frame angle θ
 *   d_x   = 0.5 + (v_x − (v_max + v_min)/2) / V_dc        (min-max zero-sequence injection)
 *   carrier: triangle 0…1 at f_sw in DISPLAY time; the upper switch of leg x conducts
 *   while d_x > carrier, the lower switch otherwise.
 */
import { F_SW_HZ } from '@/config/motor';

const SQRT3_2 = Math.sqrt(3) / 2;

/** Phase voltages from dq at frame angle theta (amplitude-invariant inverse Park). */
export function inversePark(vd: number, vq: number, theta: number): [number, number, number] {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const va = vd * c - vq * s;
  const vb = vd * s + vq * c;
  return [va, -0.5 * va + SQRT3_2 * vb, -0.5 * va - SQRT3_2 * vb];
}

export function svpwmDuty(
  vd: number,
  vq: number,
  theta: number,
  vDc: number,
  out: [number, number, number] = [0.5, 0.5, 0.5],
): [number, number, number] {
  const v = inversePark(vd, vq, theta);
  const mid = (Math.max(v[0], v[1], v[2]) + Math.min(v[0], v[1], v[2])) / 2;
  for (let k = 0; k < 3; k++) {
    out[k] = Math.min(Math.max(0.5 + ((v[k] ?? 0) - mid) / vDc, 0), 1);
  }
  return out;
}

/** Triangle carrier 0…1 from a phase measured in carrier periods. */
export function carrierValue(phaseCycles: number): number {
  const f = phaseCycles - Math.floor(phaseCycles);
  return 1 - Math.abs(2 * f - 1);
}

/** Advance the carrier phase by a display-time step. */
export function advanceCarrier(phaseCycles: number, dtDisplay: number): number {
  const p = phaseCycles + F_SW_HZ * dtDisplay;
  return p - Math.floor(p);
}

export function switchStates(
  duty: readonly [number, number, number],
  carrier: number,
  out: [boolean, boolean, boolean, boolean, boolean, boolean],
): void {
  for (let k = 0; k < 3; k++) {
    const on = (duty[k] ?? 0) > carrier;
    out[2 * k] = on;
    out[2 * k + 1] = !on;
  }
}
