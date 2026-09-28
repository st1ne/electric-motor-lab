/**
 * Vehicle, drivetrain and driver constants (TECH_SPEC §6.1, §6.9). Mirrors VEHICLE and DRIVER in
 * reference/motor_model_reference.py.
 */
export const G0 = 9.81;

export const VEHICLE = {
  massKg: 1850,
  /** rotating inertia equivalent as a fraction of the mass */
  rotInertiaFrac: 0.04,
  cdA: 0.23 * 2.22,
  rhoAir: 1.2,
  crr: 0.009,
  wheelRadiusM: 0.35,
  gearRatio: 9.0,
  gearEff: 0.975,
  mu: 1.0,
  rearStaticShare: 0.55,
  cgHeightM: 0.5,
  wheelbaseM: 2.88,
  vMaxKmh: 225,
  limiterBandKmh: 2,
} as const;

/** Two-stage helical reduction 19:57 × 23:69 = 9.0 : 1 (§5.5). */
export const GEAR_TEETH = { z1: 19, z2: 57, z3: 23, z4: 69 } as const;

export const DRIVER = {
  brakeMaxG: 0.4,
  regenFadeKmh: 8,
  cruiseKmh: 110,
  /** throttle per km/h of speed error */
  cruiseKp: 0.15,
  /** throttle per (km/h · s) */
  cruiseKi: 0.02,
  launchReleaseKmh: 100,
  regenDecelG: 0.25,
  regenStartKmh: 120,
  /** Regen preset below this speed restarts from regenStartKmh (§3.4) */
  regenMinKmh: 20,
} as const;

/** Fixed simulation step (§6.11). */
export const SIM_DT = 1 / 240;
export const SIM_MAX_SUBSTEPS = 40;
