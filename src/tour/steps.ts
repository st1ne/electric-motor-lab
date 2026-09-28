/**
 * Guided tour steps (TECH_SPEC §11): camera, state and caption per step, ≈ 50 s in all.
 *
 * | # | Camera   | State                                  | Caption                                   |
 * | 1 | Stator   | Cruise 60, Magnet, ×1000, only phase A | One coil alone just pulses back and forth. |
 * | 2 | Stator   | all three phases                       | Three coils, 120° apart, make a field …    |
 * | 3 | Rotor    | Launch                                 | More current, stronger pull …              |
 * | 4 | Rotor    | Induction, Cruise                      | No magnets? The rotor must lag …           |
 * | 5 | Inverter | Top speed, Magnet                      | Too fast for the battery's voltage …       |
 * | 6 | Wheels   | Regen                                  | Brake, and the motor becomes a generator.  |
 */
import type { Preset } from '@/physics/types';
import type { CamChip, UiState } from '@/state/uiState';

export interface TourStep {
  readonly camera: CamChip;
  readonly title: string;
  readonly caption: string;
  readonly durationS: number;
  /** UI state applied on entry */
  readonly state: Partial<UiState>;
  /** drive preset started on entry (after the speed jump) */
  readonly preset?: Preset;
  /** cruise target for a Cruise preset, km/h */
  readonly cruiseKmh?: number;
  /** the dyno jumps to this speed on entry, km/h */
  readonly speedKmh?: number;
}

export const TOUR_STEPS: readonly TourStep[] = [
  {
    camera: 'stator',
    title: 'One coil',
    caption: 'One coil alone just pulses back and forth.',
    durationS: 9,
    state: {
      motor: 'pm',
      slowMo: 1000,
      onlyPhaseA: true,
      follow: 'field',
      view: 'cutaway',
      chart: 'scope',
      frozen: false,
    },
    preset: 'cruise',
    cruiseKmh: 60,
    speedKmh: 60,
  },
  {
    camera: 'stator',
    title: 'Three coils',
    caption: 'Three coils, 120° apart, make a field that turns.',
    durationS: 9,
    state: { onlyPhaseA: false },
  },
  {
    camera: 'rotor',
    title: 'Launch',
    caption: 'More current, stronger pull: 420 N·m from standstill.',
    durationS: 8,
    state: { slowMo: 'auto', chart: 'map' },
    preset: 'launch',
    speedKmh: 0,
  },
  {
    camera: 'rotor',
    title: 'Induction',
    caption: 'No magnets? The rotor must lag, or nothing pulls.',
    durationS: 8,
    state: { motor: 'im', slowMo: 1000, chart: 'scope' },
    preset: 'cruise',
    cruiseKmh: 60,
    speedKmh: 60,
  },
  {
    camera: 'inverter',
    title: 'Field weakening',
    caption: "Too fast for the battery's voltage: weaken the field.",
    durationS: 9,
    state: { motor: 'pm', slowMo: 'auto', follow: 'power', chart: 'map' },
    preset: 'top',
    speedKmh: 130,
  },
  {
    camera: 'wheels',
    title: 'Regen',
    caption: 'Brake, and the motor becomes a generator.',
    durationS: 8,
    state: { follow: 'power', view: 'whole', chart: 'losses' },
    preset: 'regen',
  },
];
