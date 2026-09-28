/**
 * Loss model shared by both machines (TECH_SPEC §6.4).
 *   R_s(T)   = R_s20 [1 + 0.00393 (T − 20)]
 *   k_ac(f)  = 1 + (f_e / f_ac)²                         (hairpin AC resistance)
 *   P_mech   = c_b ω_m + c_w ω_m³                        (bearings + windage)
 *   P_inv    = 1.5 R_on,eff |i|² + k_sw f_sw V_dc |i|    (SiC conduction + switching)
 * Source: reference/motor_model_reference.py (r_of_temp, mech_loss, inverter_loss).
 */
import { ALPHA_CU, F_SW_HZ, INVERTER, MECH, V_DC_NOM } from '@/config/motor';

export function resistanceAtTemp(r20Ohm: number, tempC: number): number {
  return r20Ohm * (1 + ALPHA_CU * (tempC - 20));
}

export function acFactor(fElecHz: number, fAcHz: number): number {
  return 1 + (fElecHz / fAcHz) ** 2;
}

export function mechLossW(omegaMechRad: number): number {
  const w = Math.abs(omegaMechRad);
  return MECH.cB * w + MECH.cW * w * w * w;
}

export function inverterLossW(currentPeakA: number, vDc = V_DC_NOM): number {
  return (
    1.5 * INVERTER.rOnEffOhm * currentPeakA * currentPeakA +
    INVERTER.kSw * F_SW_HZ * vDc * currentPeakA
  );
}

/** Iron loss (Steinmetz hysteresis + eddy) for a stator flux linkage ψs. */
export function ironLossW(kH: number, kE: number, fElecHz: number, psiS: number): number {
  return (kH * fElecHz + kE * fElecHz * fElecHz) * psiS * psiS;
}

/** Copper-loss scale from the map reference temperature to the actual winding temperature. */
export function copperTempScale(tempC: number, refC: number): number {
  return (1 + ALPHA_CU * (tempC - 20)) / (1 + ALPHA_CU * (refC - 20));
}
