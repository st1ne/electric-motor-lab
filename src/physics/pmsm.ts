/**
 * Interior permanent-magnet synchronous machine, steady-state dq model (TECH_SPEC §6.2, §6.4).
 *   ψ_d = L_d i_d + ψ_m,   ψ_q = L_q i_q,   ω_e = p ω_m
 *   v_d = R_s i_d − ω_e ψ_q,   v_q = R_s i_q + ω_e ψ_d
 *   T   = 1.5 p [ψ_m i_q + (L_d − L_q) i_d i_q]
 *   P_fe = (k_h f_e + k_e f_e²) ψ_s²,  P_mag = k_mag f_e² |i|²
 * Source: Sul, "Control of Electric Machine Drive Systems", ch. 6; reference pm_eval().
 */
import { PM, T_REF_C } from '@/config/motor';
import { acFactor, inverterLossW, ironLossW, resistanceAtTemp } from '@/physics/losses';
import type { MachinePoint } from '@/physics/types';

const TAU = 2 * Math.PI;

export function pmTorque(idA: number, iqA: number): number {
  return 1.5 * PM.polePairs * (PM.psiM * iqA + (PM.lD - PM.lQ) * idA * iqA);
}

/** i_q on the constant-torque curve through i_d (§6.2 search parametrization). */
export function pmIqForTorque(torqueNm: number, idA: number): number {
  return torqueNm / (1.5 * PM.polePairs * (PM.psiM + (PM.lD - PM.lQ) * idA));
}

export function pmEval(
  omegaMechRad: number,
  idA: number,
  iqA: number,
  tempC = T_REF_C,
): MachinePoint {
  const omegaE = PM.polePairs * omegaMechRad;
  const rS = resistanceAtTemp(PM.rS20, tempC);
  const psiD = PM.lD * idA + PM.psiM;
  const psiQ = PM.lQ * iqA;
  const vd = rS * idA - omegaE * psiQ;
  const vq = rS * iqA + omegaE * psiD;
  const i2 = idA * idA + iqA * iqA;
  const iMag = Math.sqrt(i2);
  const fE = Math.abs(omegaE) / TAU;
  const cuDc = 1.5 * rS * i2;
  const psiS = Math.sqrt(psiD * psiD + psiQ * psiQ);
  return {
    torqueNm: pmTorque(idA, iqA),
    vdV: vd,
    vqV: vq,
    vMagV: Math.sqrt(vd * vd + vq * vq),
    currentPeakA: iMag,
    omegaElecRad: omegaE,
    omegaSlipRad: 0,
    cuW: cuDc * acFactor(fE, PM.fAcHz),
    cuDcW: cuDc,
    rcuW: 0,
    feW: ironLossW(PM.kH, PM.kE, fE, psiS),
    magW: PM.kMag * fE * fE * i2,
    invW: inverterLossW(iMag),
    irqA: 0,
    psiDWb: psiD,
    psiQWb: psiQ,
  };
}

/**
 * Largest |i_q| of the given sign within the current circle and the voltage limit at i_d.
 * |v|² ≤ V² is a quadratic a·iq² + b·iq + c ≤ 0 (closed form). NaN if i_q = 0 already violates it.
 */
export function pmIqLimit(omegaMechRad: number, idA: number, sign: 1 | -1, vMax: number): number {
  const iqCur = Math.sqrt(Math.max(PM.currentMaxA ** 2 - idA * idA, 0));
  const rS = resistanceAtTemp(PM.rS20, T_REF_C);
  const wE = PM.polePairs * omegaMechRad;
  const psiD = PM.lD * idA + PM.psiM;
  const a = (wE * PM.lQ) ** 2 + rS * rS;
  const b = 2 * rS * wE * (psiD - PM.lQ * idA);
  const c = (rS * idA) ** 2 + (wE * psiD) ** 2 - vMax * vMax;
  if (c > 0) return NaN;
  const sq = Math.sqrt(Math.max(b * b - 4 * a * c, 0));
  const mag =
    sign > 0 ? Math.min((-b + sq) / (2 * a), iqCur) : Math.min(-(-b - sq) / (2 * a), iqCur);
  return sign * mag;
}
