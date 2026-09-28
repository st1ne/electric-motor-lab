/** Shared physics types (TECH_SPEC §13.3). All quantities SI; dq values are peak. */
import type { MotorKind } from '@/config/motor';
import type { Regime } from '@/physics/regime';

export type { MotorKind };

/** Every quantity of one machine state at (ω_m, i_d, i_q). */
export interface MachinePoint {
  torqueNm: number;
  vdV: number;
  vqV: number;
  vMagV: number;
  currentPeakA: number;
  /** electrical frequency of the dq frame, rad/s (IM: includes slip) */
  omegaElecRad: number;
  /** IM slip frequency (electrical), rad/s; 0 for the IPM */
  omegaSlipRad: number;
  /** stator copper incl. AC factor at the evaluation temperature */
  cuW: number;
  /** DC part of the stator copper (1.5 R_s |i|²), for the power balance */
  cuDcW: number;
  rcuW: number;
  feW: number;
  magW: number;
  invW: number;
  /** IM referred rotor q current i_rq = −(L_m/L_r) i_q; 0 for the IPM */
  irqA: number;
  psiDWb: number;
  psiQWb: number;
}

export interface OpPoint {
  idA: number;
  iqA: number;
  torqueNm: number;
  feasible: boolean;
}

/** An operating point with its full loss breakdown (map cell, table row). */
export interface FullPoint {
  idA: number;
  iqA: number;
  torqueNm: number;
  vdV: number;
  vqV: number;
  vMagV: number;
  currentPeakA: number;
  omegaElecRad: number;
  cuW: number;
  rcuW: number;
  feW: number;
  magW: number;
  mechW: number;
  invW: number;
  pShaftW: number;
  pDcW: number;
  eff: number;
  slip: number;
  feasible: boolean;
}

export interface Losses {
  cuW: number;
  rcuW: number;
  feW: number;
  magW: number;
  invW: number;
  mechW: number;
  gearW: number;
}

export type Preset = 'none' | 'launch' | 'cruise' | 'top' | 'regen' | 'coast';

/** Pedal inputs; presets are started with sim.setPreset(). */
export interface SimInputs {
  motor: MotorKind;
  /** pedal 0…1 (ignored while a preset drives) */
  throttle: number;
  /** brake 0…1 (always overrides a preset) */
  brake: number;
}

/** Everything the scene and UI read from the physics each frame (§13.3). */
export interface SimSnapshot {
  t: number;
  v: number;
  kmh: number;
  motor: MotorKind;
  preset: Preset;
  throttle: number;
  brake: number;
  omegaM: number;
  rpm: number;
  wheelRpm: number;
  /** requested electromagnetic torque */
  tCmd: number;
  /** delivered electromagnetic torque */
  tMotor: number;
  /** shaft torque (after iron, magnet and mechanical drag) */
  tShaft: number;
  tWheel: number;
  tMax: number;
  tMin: number;
  limited: boolean;
  tractionLimited: boolean;
  id: number;
  iq: number;
  iPeak: number;
  vd: number;
  vq: number;
  vMag: number;
  vMax: number;
  /** no-load back-EMF ω_e ψ_m (IPM), the ghost needle of §10.3 */
  emfNoLoad: number;
  slip: number;
  omegaE: number;
  /** IM physical bar current estimate (display only) */
  barCurrentA: number;
  losses: Losses;
  lossTotalW: number;
  pShaft: number;
  pDc: number;
  pWheel: number;
  eff: number;
  vDc: number;
  iDc: number;
  soc: number;
  tWinding: number;
  tRotor: number;
  derate: number;
  frictionBrakeW: number;
  regime: Regime;
  launchTime: number | null;
  /** time since the current launch started (null when not launching) */
  launchElapsed: number | null;
  /** load angle δ = atan2(−v_d, v_q), rad */
  loadAngle: number;
  /** current angle γ = atan2(i_q, i_d), rad */
  currentAngle: number;
  /** voltage limit binding (field weakening) */
  voltageLimited: boolean;
  /** spin (drag) power of both machines at this speed with zero current (§10.2) */
  dragPmW: number;
  dragImW: number;
}

/** Display-time angles and phase quantities (§6.6, §6.7). */
export interface DisplayAngles {
  /** display (slowed) time */
  tDisplay: number;
  slowMo: number;
  thetaMech: number;
  thetaElecRotor: number;
  /** IM synchronous-frame angle (electrical); equals thetaElecRotor for the IPM */
  thetaSync: number;
  /** stator current vector angle (electrical) */
  thetaCurrent: number;
  /** air-gap field angle (electrical) */
  thetaField: number;
  /** relative field strength 0…~1.2 */
  fieldStrength: number;
  ia: number;
  ib: number;
  ic: number;
  duty: [number, number, number];
  carrier: number;
  /** upper/lower switch of legs A, B, C: [aHi, aLo, bHi, bLo, cHi, cLo] */
  switchStates: [boolean, boolean, boolean, boolean, boolean, boolean];
  /** field laps gained on the rotor (IM) */
  lapsGained: number;
}
