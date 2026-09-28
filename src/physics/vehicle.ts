/**
 * Longitudinal vehicle model (TECH_SPEC §6.8).
 *   F_road = C_rr m g + ½ ρ C_d A v²
 *   F = T G η / r_w (motoring), T G / (r_w η) (regenerating: the gear losses reverse)
 *   traction: T_trac = μ F_z,rear r_w / (G η),  F_z,rear = m g · 0.55 + m a h / L
 *   ω_m = v G / r_w
 * Source: reference road_load(), sim_step().
 */
import { G0, VEHICLE } from '@/config/vehicle';

export const MASS_EFF_KG = VEHICLE.massKg * (1 + VEHICLE.rotInertiaFrac);

export function roadLoadN(v: number): number {
  if (v <= 0) return 0;
  return VEHICLE.crr * VEHICLE.massKg * G0 + 0.5 * VEHICLE.rhoAir * VEHICLE.cdA * v * v;
}

export function motorOmega(v: number): number {
  return (v * VEHICLE.gearRatio) / VEHICLE.wheelRadiusM;
}

export function wheelRpm(v: number): number {
  return ((v / VEHICLE.wheelRadiusM) * 30) / Math.PI;
}

export function tractionTorqueNm(accel: number): number {
  const fz =
    VEHICLE.massKg * G0 * VEHICLE.rearStaticShare +
    (VEHICLE.massKg * accel * VEHICLE.cgHeightM) / VEHICLE.wheelbaseM;
  return (VEHICLE.mu * fz * VEHICLE.wheelRadiusM) / (VEHICLE.gearRatio * VEHICLE.gearEff);
}

/** Wheel force from shaft torque; the gearbox efficiency acts against the power flow. */
export function wheelForceN(tShaftNm: number): number {
  const { gearRatio: g, gearEff: eta, wheelRadiusM: r } = VEHICLE;
  return tShaftNm >= 0 ? (tShaftNm * g * eta) / r : (tShaftNm * g) / (r * eta);
}

export function kineticEnergyJ(v: number): number {
  return 0.5 * MASS_EFF_KG * v * v;
}
