/**
 * UI state (TECH_SPEC §13.3): everything the visitor controls.
 * Held in the observable store (state/store.ts); changed only through state/actions.ts.
 */
import type { MotorKind } from '@/config/motor';
import type { SlowMoSetting } from '@/physics/kinematics';
import type { Preset } from '@/physics/types';

export type FollowMode = 'all' | 'field' | 'power' | 'heat';
export type ViewMode = 'whole' | 'cutaway' | 'exploded';
export type ChartTab = 'map' | 'scope' | 'losses' | 'run';
/** camera chips (§3.8); null once the visitor orbits away */
export type CamChip = 'stator' | 'rotor' | 'inverter' | 'wheels';

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
  helpOpen: boolean;
  tourStep: number | null;
  /** the camera chip the view came from (URL `cam`) */
  cam: CamChip | null;
  /** debug: hide housing and inverter lid to inspect the motor (dev key H in Phase 3) */
  debugHousing: boolean;
}

export function defaultUiState(): UiState {
  return {
    // §19: default Cutaway + Field + Auto slow-mo, so the rotating field shows without a click
    follow: 'field',
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
    helpOpen: false,
    tourStep: null,
    cam: null,
    debugHousing: false,
  };
}
