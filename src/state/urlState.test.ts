import { describe, expect, it } from 'vitest';
import { defaultUiState } from '@/state/uiState';
import { readUrlState, writeUrlState } from '@/state/urlState';
import { TOUR_STEPS } from '@/tour/steps';

describe('URL state', () => {
  it('a fresh state writes a clean URL', () => {
    expect(writeUrlState(defaultUiState())).toBe('');
  });

  it('round-trips motor, view, follow, slow-mo, chart, camera and sound', () => {
    const ui = {
      ...defaultUiState(),
      motor: 'im' as const,
      view: 'exploded' as const,
      follow: 'heat' as const,
      slowMo: 1 as const,
      chart: 'losses' as const,
      cam: 'rotor' as const,
      sound: true,
      preset: 'top' as const,
    };
    const back = readUrlState(writeUrlState(ui));
    expect(back).toEqual({
      motor: 'im',
      view: 'exploded',
      follow: 'heat',
      slowMo: 1,
      chart: 'losses',
      cam: 'rotor',
      sound: true,
      preset: 'top',
    });
  });

  it('a throttle implies no preset and snaps to 5 %', () => {
    expect(readUrlState('?thr=62')).toEqual({ throttle: 0.6, preset: 'none' });
    const q = writeUrlState({ ...defaultUiState(), preset: 'none', throttle: 0.35 });
    expect(q).toContain('thr=35');
  });

  it('ignores junk', () => {
    expect(readUrlState('?motor=v8&view=x&slow=7&thr=abc&cam=moon&sound=yes')).toEqual({});
  });
});

describe('tour', () => {
  it('six steps of 7–10 s, about 50 s in all', () => {
    expect(TOUR_STEPS).toHaveLength(6);
    for (const s of TOUR_STEPS) {
      expect(s.durationS).toBeGreaterThanOrEqual(7);
      expect(s.durationS).toBeLessThanOrEqual(10);
    }
    const total = TOUR_STEPS.reduce((a, s) => a + s.durationS, 0);
    expect(total).toBeGreaterThanOrEqual(45);
    expect(total).toBeLessThanOrEqual(55);
  });

  it('step 1 shows phase A alone and step 2 all three', () => {
    expect(TOUR_STEPS[0]?.state.onlyPhaseA).toBe(true);
    expect(TOUR_STEPS[1]?.state.onlyPhaseA).toBe(false);
  });
});
