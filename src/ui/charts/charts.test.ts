import { describe, expect, it } from 'vitest';
import { heatColor } from '@/scene/fx/heat';
import { DIMMED } from '@/scene/follow';
import { niceCeil } from '@/ui/charts/lossesBar';
import { divText } from '@/ui/charts/scope';

describe('chart helpers', () => {
  it('niceCeil steps 1-2-5', () => {
    expect(niceCeil(0)).toBe(1);
    expect(niceCeil(900)).toBe(1000);
    expect(niceCeil(1001)).toBe(2000);
    expect(niceCeil(4200)).toBe(5000);
    expect(niceCeil(22216)).toBe(50000);
  });

  it('scope divisions: two electrical periods over 8 divisions', () => {
    // 50 Hz electrical: T = 20 ms, 2T / 8 = 5 ms
    expect(divText(2 * Math.PI * 50)).toBe('1 div = 5.0 ms real');
    expect(divText(0)).toContain('—');
  });
});

describe('follow and heat', () => {
  it('every mode keeps its own system bright', () => {
    expect(DIMMED.all).toHaveLength(0);
    expect(DIMMED.field).not.toContain('field');
    expect(DIMMED.power).not.toContain('power');
    expect(DIMMED.heat).not.toContain('field'); // windings and magnets carry the heat ramp
  });

  it('heat ramp runs blue → orange → white and clamps', () => {
    const cold = heatColor(20);
    const hot = heatColor(500);
    expect(cold.b).toBeGreaterThan(cold.r);
    expect(hot.r).toBeGreaterThan(0.9);
    expect(hot.g).toBeGreaterThan(0.9);
    expect(heatColor(40).equals(cold)).toBe(true);
  });
});
