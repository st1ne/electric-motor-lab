/**
 * UI state (TECH_SPEC §13.3): everything the visitor controls.
 * The store (Phase 5) wraps this; until then main.ts mutates a plain object.
 */
import type { MotorKind } from '@/config/motor';
import type { SlowMoSetting } from '@/physics/kinematics';
import type { Preset } from '@/physics/types';

export type FollowMode = 'all' | 'field' | 'power' | 'heat';
export type ViewMode = 'whole' | 'cutaway' | 'exploded';
export type ChartTab = 'map' | 'scope' | 'losses' | 'run';

export interface UiState {
  follow: FollowMode;
  view: ViewMode;
  motor: MotorKind;
  preset: Preset;
  /** pedal 0…1 */
  throttle: number;
  /** brake 0…1 */
  brake: number;
  slowMo: SlowMoSetting;
  /** freeze the electromagnetic visuals only (Space) */
  frozen: boolean;
  chart: ChartTab;
  onlyPhaseA: boolean;
  sound: boolean;
  tourStep: number | null;
  /** debug: hide housing and inverter lid to inspect the motor (dev key H in Phase 3) */
  debugHousing: boolean;
}

export function defaultUiState(): UiState {
  return {
    follow: 'all',
    view: 'cutaway',
    motor: 'pm',
    preset: 'cruise',
    throttle: 0,
    brake: 0,
    slowMo: 'auto',
    frozen: false,
    chart: 'scope',
    onlyPhaseA: false,
    sound: false,
    tourStep: null,
    debugHousing: false,
  };
}
