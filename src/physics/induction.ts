/**
 * Induction machine, steady-state rotor-flux-oriented dq model (TECH_SPEC §6.3, §6.4).
 *   L_s = L_m + L_ls,  L_r = L_m + L_lr,  σ = 1 − L_m² / (L_s L_r)
 *   ψ_r = L_m i_d,     T = 1.5 p (L_m² / L_r) i_d i_q
 *   ω_sl = R_r i_q / (L_r i_d),  ω_e = p ω_m + ω_sl,  s = ω_sl / ω_e
 *   v_d = R_s i_d − ω_e σ L_s i_q,  v_q = R_s i_q + ω_e L_s i_d
 *   i_rq = −(L_m / L_r) i_q,  P_rcu = 1.5 R_r i_rq²  (= s · P_airgap)
 * Source: Novotny & Lipo, "Vector Control and Dynamics of AC Drives", ch. 5; reference im_eval().
 */
import { IM, SOLVER, T_REF_C } from '@/config/motor';
import { acFactor, inverterLossW, ironLossW, resistanceAtTemp } from '@/physics/losses';
import type { MachinePoint } from '@/physics/types';

const TAU = 2 * Math.PI;

export const IM_LS = IM.lM + IM.lLs;
export const IM_LR = IM.lM + IM.lLr;
export const IM_SIGMA = 1 - (IM.lM * IM.lM) / (IM_LS * IM_LR);
export const IM_KT = (1.5 * IM.polePairs * IM.lM * IM.lM) / IM_LR;

export function imTorque(idA: number, iqA: number): number {
  return IM_KT * idA * iqA;
}

export function imIqForTorque(torqueNm: number, idA: number): number {
  return torqueNm / (IM_KT * idA);
}

export function imSlipOmega(idA: number, iqA: number): number {
  return idA > 0 ? (IM.rR * iqA) / (IM_LR * idA) : 0;
}

export function imEval(
  omegaMechRad: number,
  idA: number,
  iqA: number,
  tempC = T_REF_C,
): MachinePoint {
  const rS = resistanceAtTemp(IM.rS20, tempC);
  const wSl = imSlipOmega(idA, iqA);
  const omegaE = IM.polePairs * omegaMechRad + wSl;
  const vd = rS * idA - omegaE * IM_SIGMA * IM_LS * iqA;
  const vq = rS * iqA + omegaE * IM_LS * idA;
  const i2 = idA * idA + iqA * iqA;
  const iMag = Math.sqrt(i2);
  const fE = Math.abs(omegaE) / TAU;
  const cuDc = 1.5 * rS * i2;
  const irq = -(IM.lM / IM_LR) * iqA;
  const psiD = IM_LS * idA;
  const psiQ = IM_SIGMA * IM_LS * iqA;
  return {
    torqueNm: imTorque(idA, iqA),
    vdV: vd,
    vqV: vq,
    vMagV: Math.sqrt(vd * vd + vq * vq),
    currentPeakA: iMag,
    omegaElecRad: omegaE,
    omegaSlipRad: wSl,
    cuW: cuDc * acFactor(fE, IM.fAcHz),
    cuDcW: cuDc,
    rcuW: 1.5 * IM.rR * irq * irq,
    feW: ironLossW(IM.kH, IM.kE, fE, Math.sqrt(psiD * psiD + psiQ * psiQ)),
    magW: 0,
    invW: inverterLossW(iMag),
    irqA: irq,
    psiDWb: psiD,
    psiQWb: psiQ,
  };
}

/**
 * Largest |i_q| of the given sign within both limits at i_d. The slip makes |v| nonlinear in
 * i_q, so this bisects (|v| is monotonic in |i_q| along one sign). NaN if i_q = 0 violates it.
 */
export function imIqLimit(omegaMechRad: number, idA: number, sign: 1 | -1, vMax: number): number {
  const iqCur = Math.sqrt(Math.max(IM.currentMaxA ** 2 - idA * idA, 0));
  if (imEval(omegaMechRad, idA, 0).vMagV > vMax) return NaN;
  if (imEval(omegaMechRad, idA, sign * iqCur).vMagV <= vMax) return sign * iqCur;
  let lo = 0;
  let hi = iqCur;
  for (let k = 0; k < SOLVER.bisectIters; k++) {
    const mid = 0.5 * (lo + hi);
    if (imEval(omegaMechRad, idA, sign * mid).vMagV <= vMax) lo = mid;
    else hi = mid;
  }
  return sign * lo;
}
