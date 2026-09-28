/** Analytic invariants (TECH_SPEC §7.2): must hold exactly, independent of tuning. */
import { describe, expect, it } from 'vitest';
import { IM, PM, V_DC_NOM, voltageMaxV } from '@/config/motor';
import { envelope } from '@/physics/envelope';
import { imEval } from '@/physics/induction';
import { evaluate, fullPoint, solve } from '@/physics/operatingPoint';
import { pmEval } from '@/physics/pmsm';
import { MAPS_FILE, rpmToW, runLaunch } from './helpers';

const V_MAX = voltageMaxV(V_DC_NOM);
const TAU = 2 * Math.PI;

describe('§7.2 invariants', () => {
  it('1. balanced phases: i_a + i_b + i_c = 0', () => {
    for (let k = 0; k < 360; k++) {
      const th = (k * TAU) / 360 + 0.123;
      const i = 537.3;
      const sum = i * (Math.cos(th) + Math.cos(th - TAU / 3) + Math.cos(th + TAU / 3));
      expect(Math.abs(sum)).toBeLessThan(1e-9 * i);
    }
  });

  it('2. power balance (IPM): 1.5 (v_d i_d + v_q i_q) = T ω_m + P_cu', () => {
    for (const [rpm, id, iq] of [
      [1000, -200, 400],
      [6000, -500, 300],
      [12000, -700, -150],
      [3000, 0, 100],
    ] as const) {
      const w = rpmToW(rpm);
      const p = pmEval(w, id, iq);
      const lhs = 1.5 * (p.vdV * id + p.vqV * iq);
      const rhs = p.torqueNm * w + p.cuDcW;
      expect(Math.abs(lhs - rhs) / Math.abs(rhs)).toBeLessThan(1e-6);
    }
  });

  it('2b. power balance (IM): 1.5 (v·i) = P_airgap + P_cu, P_airgap = T ω_e / p', () => {
    const p = imEval(rpmToW(5000), 120, 350);
    const lhs = 1.5 * (p.vdV * 120 + p.vqV * 350);
    const rhs = (p.torqueNm * p.omegaElecRad) / IM.polePairs + p.cuDcW;
    expect(Math.abs(lhs - rhs) / rhs).toBeLessThan(1e-6);
  });

  it('3. torque consistency: the solved (i_d, i_q) reproduce the requested torque', () => {
    for (const kind of ['pm', 'im'] as const) {
      for (const rpm of [500, 4000, 9000, 14000]) {
        const w = rpmToW(rpm);
        const env = envelope(kind, w, V_MAX);
        for (const t of [-100, 30, 120, 0.9 * env.tMax]) {
          if (t < env.tMin || t > env.tMax) continue;
          const op = solve(kind, w, t, V_MAX, env.opMax, env.opMin);
          expect(op.feasible).toBe(true);
          expect(evaluate(kind, w, op.idA, op.iqA).torqueNm).toBeCloseTo(t, 6);
        }
      }
    }
  });

  it('4. limits: every feasible map cell satisfies |i| ≤ I_max and |v| ≤ V_max', () => {
    const { grid } = MAPS_FILE;
    for (const kind of ['pm', 'im'] as const) {
      const m = MAPS_FILE.motors[kind];
      const iMax = kind === 'pm' ? PM.currentMaxA : IM.currentMaxA;
      const f = m.fields;
      for (let i = 0; i < grid.rpmCount; i++) {
        for (let j = 0; j < grid.torqueCount; j++) {
          const k = i * grid.torqueCount + j;
          // stored values are rounded to 4 significant digits: allow that rounding
          const id = f.id?.[k] ?? 0;
          const iq = f.iq?.[k] ?? 0;
          const vd = f.vd?.[k] ?? 0;
          const vq = f.vq?.[k] ?? 0;
          expect(Math.hypot(id, iq)).toBeLessThanOrEqual(iMax * (1 + 1e-3));
          expect(Math.hypot(vd, vq)).toBeLessThanOrEqual(V_MAX * (1 + 1e-3));
        }
      }
    }
    // exact check on unquantized solver output
    for (const kind of ['pm', 'im'] as const) {
      const iMax = kind === 'pm' ? PM.currentMaxA : IM.currentMaxA;
      for (let rpm = 0; rpm <= 16000; rpm += 1000) {
        const w = rpmToW(rpm);
        const env = envelope(kind, w, V_MAX);
        for (let t = -420; t <= 420; t += 30) {
          const op = solve(kind, w, t, V_MAX, env.opMax, env.opMin);
          const p = evaluate(kind, w, op.idA, op.iqA);
          expect(p.currentPeakA).toBeLessThanOrEqual(iMax + 1e-6);
          expect(p.vMagV).toBeLessThanOrEqual(V_MAX + 1e-6);
        }
      }
    }
  });

  it('5. MTPA angle: IPM at low speed and T > 20 N·m has γ in (90°, 135°)', () => {
    const w = rpmToW(1000);
    const env = envelope('pm', w, V_MAX);
    for (let t = 25; t <= env.tMax; t += 25) {
      const op = solve('pm', w, t, V_MAX, env.opMax, env.opMin);
      const gamma = (Math.atan2(op.iqA, op.idA) * 180) / Math.PI;
      expect(gamma).toBeGreaterThan(90);
      expect(gamma).toBeLessThan(135);
    }
  });

  it('6. field weakening: above base speed at T_max, i_d is more negative than at base speed', () => {
    const base = envelope('pm', rpmToW(4000), V_MAX).opMax.idA;
    for (const rpm of [6000, 9000, 12000, 15000]) {
      expect(envelope('pm', rpmToW(rpm), V_MAX).opMax.idA).toBeLessThan(base);
    }
  });

  it('7. slip sign: > 0 motoring, < 0 regenerating, 0 at T = 0', () => {
    const w = rpmToW(6000);
    const env = envelope('im', w, V_MAX);
    const s = (t: number): number =>
      fullPoint('im', w, solve('im', w, t, V_MAX, env.opMax, env.opMin)).slip;
    expect(s(100)).toBeGreaterThan(0);
    expect(s(-100)).toBeLessThan(0);
    expect(s(0)).toBe(0);
  });

  it('8. rotor loss identity (IM): P_rcu = s · P_airgap', () => {
    for (const [rpm, id, iq] of [
      [2000, 150, 400],
      [8000, 90, 300],
      [12000, 60, -250],
    ] as const) {
      const p = imEval(rpmToW(rpm), id, iq);
      const s = p.omegaSlipRad / p.omegaElecRad;
      const pAirgap = (p.torqueNm * p.omegaElecRad) / IM.polePairs;
      expect(Math.abs(p.rcuW - s * pAirgap) / p.rcuW).toBeLessThan(1e-6);
    }
  });

  it('9. energy conservation over a launch within 0.5 %', () => {
    for (const kind of ['pm', 'im'] as const) {
      expect(runLaunch(kind).energyErrorRel).toBeLessThan(0.005);
    }
  });

  it('10. coast: induction electrical loss is exactly 0 at T_cmd = 0', () => {
    const w = rpmToW(6800);
    const env = envelope('im', w, V_MAX);
    const fp = fullPoint('im', w, solve('im', w, 0, V_MAX, env.opMax, env.opMin));
    expect(fp.cuW + fp.rcuW + fp.feW + fp.invW).toBe(0);
    expect(fp.pDcW).toBe(0);
  });

  it('IPM characteristic current ψ_m / L_d < I_max (infinite-speed field weakening)', () => {
    expect(PM.psiM / PM.lD).toBeLessThan(PM.currentMaxA);
  });
});
