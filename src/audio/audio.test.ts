import { describe, expect, it } from 'vitest';
import { ceilingFade, electricalHz, gearMeshHz, whineLevel } from '@/audio/audio';

describe('audio mappings', () => {
  it('electrical frequency from ω_e', () => {
    expect(electricalHz({ omegaE: 2 * Math.PI * 471 })).toBeCloseTo(471, 6);
    expect(electricalHz({ omegaE: -2 * Math.PI * 50 })).toBeCloseTo(50, 6);
  });

  it('gear mesh at z1 · f_m', () => {
    // 6,000 rpm = 100 rev/s, 19 teeth → 1,900 Hz
    expect(gearMeshHz(6000)).toBeCloseTo(1900, 6);
  });

  it('whine grows with torque and stays within 0…1', () => {
    const idle = whineLevel({ tMotor: 0, motor: 'pm', rpm: 0 });
    const full = whineLevel({ tMotor: 420, motor: 'pm', rpm: 4000 });
    expect(idle).toBe(0);
    expect(full).toBeGreaterThan(0.9);
    expect(full).toBeLessThanOrEqual(1);
    expect(whineLevel({ tMotor: -300, motor: 'im', rpm: 6000 })).toBeGreaterThan(0.5);
  });

  it('tones fade out before the audible ceiling', () => {
    expect(ceilingFade(5000)).toBe(1);
    expect(ceilingFade(20000)).toBe(0);
  });
});
