/**
 * Regime classification for the explanation texts (TECH_SPEC §3.5, §6.11).
 * Priority: STANDSTILL → DERATE (overrides) → TOP_SPEED → REGEN → COAST → INDUCTION_SLIP →
 * FIELD_WEAKENING → CRUISE (|T| < 25 % T_max) → CONSTANT_TORQUE.
 */
import type { MotorKind } from '@/config/motor';
import { VEHICLE } from '@/config/vehicle';

export type Regime =
  | 'STANDSTILL'
  | 'CONSTANT_TORQUE'
  | 'CRUISE'
  | 'FIELD_WEAKENING'
  | 'INDUCTION_SLIP'
  | 'REGEN'
  | 'COAST_PM'
  | 'COAST_IM'
  | 'DERATE'
  | 'TOP_SPEED';

export interface RegimeInputs {
  motor: MotorKind;
  kmh: number;
  tMotor: number;
  tMax: number;
  derate: number;
  pDc: number;
  voltageLimited: boolean;
  braking: boolean;
}

export function classifyRegime(s: RegimeInputs): Regime {
  if (s.kmh < 0.5 && Math.abs(s.tMotor) < 1) return 'STANDSTILL';
  if (s.derate < 1) return 'DERATE';
  if (s.kmh >= VEHICLE.vMaxKmh - 1 && s.tMotor >= 0) return 'TOP_SPEED';
  if (s.tMotor < -1 || (s.braking && s.pDc < 0)) return 'REGEN';
  if (Math.abs(s.tMotor) < 1) return s.motor === 'pm' ? 'COAST_PM' : 'COAST_IM';
  if (s.motor === 'im') return 'INDUCTION_SLIP';
  if (s.voltageLimited) return 'FIELD_WEAKENING';
  if (Math.abs(s.tMotor) < 0.25 * s.tMax) return 'CRUISE';
  return 'CONSTANT_TORQUE';
}
