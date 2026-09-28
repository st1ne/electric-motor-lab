/**
 * Guided tour steps (§11): camera, state and caption per step.
 * Built in TODO.md Phase 12.
 */
export interface TourStep {
  camera: 'stator' | 'rotor' | 'inverter' | 'wheels';
  caption: string;
}

export const TOUR_STEPS: readonly TourStep[] = [];
