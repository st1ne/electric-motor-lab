/**
 * Two-node thermal model with oil at a fixed temperature (TECH_SPEC §6.10).
 *   C_w dT_w/dt = P_cu + 0.7 P_fe − (T_w − T_oil) / R_w,oil
 *   C_r dT_r/dt = P_rcu + P_mag + 0.3 P_fe − (T_r − T_oil) / R_r,oil
 * Derate: winding above 150 °C, or magnets above 140 °C (IPM only): the torque limit falls
 * linearly to 50 % over the next 20 K.
 * Source: reference derate_factor(), sim_step() thermal block.
 */
import type { MotorKind } from '@/config/motor';
import { THERMAL } from '@/config/thermal';

export function derateFactor(kind: MotorKind, tWindingC: number, tRotorC: number): number {
  let k = 1;
  if (tWindingC > THERMAL.tWindingLimitC) {
    k = Math.min(
      k,
      1 - 0.5 * Math.min((tWindingC - THERMAL.tWindingLimitC) / THERMAL.derateSpanK, 1),
    );
  }
  if (kind === 'pm' && tRotorC > THERMAL.tMagnetLimitC) {
    k = Math.min(k, 1 - 0.5 * Math.min((tRotorC - THERMAL.tMagnetLimitC) / THERMAL.derateSpanK, 1));
  }
  return k;
}

export interface ThermalPowers {
  cuW: number;
  feW: number;
  rcuW: number;
  magW: number;
}

/** Temperature rates (K/s) of the winding and rotor nodes. */
export function thermalRates(tW: number, tR: number, p: ThermalPowers): [number, number] {
  const dW = (p.cuW + 0.7 * p.feW - (tW - THERMAL.tOilC) / THERMAL.rWOilKPerW) / THERMAL.cWJPerK;
  const dR =
    (p.rcuW + p.magW + 0.3 * p.feW - (tR - THERMAL.tOilC) / THERMAL.rROilKPerW) / THERMAL.cRJPerK;
  return [dW, dR];
}
