import { describe, expect, it } from 'vitest';
import { phaseSlot } from '@/scene/labelDefs';
import { offscreen, overlaps, placeLabels } from '@/scene/labels';
import { slotAngle, slotPhase } from '@/scene/motor/profile';

describe('label placement', () => {
  const box = (x: number, y: number): { x: number; y: number; w: number; h: number } => ({
    x,
    y,
    w: 100,
    h: 20,
  });

  it('keeps the first label at its anchor and nudges an overlapping one', () => {
    const p = placeLabels([box(100, 100), box(110, 105)]);
    expect(p[0]).toEqual({ dy: 0, flip: false });
    expect(p[1]).not.toBeNull();
    expect(p[1]?.dy !== 0 || p[1]?.flip).toBeTruthy();
  });

  it('caps the number of labels', () => {
    const rects = Array.from({ length: 12 }, (_, i) => box(0, i * 40));
    expect(placeLabels(rects, 9).filter(Boolean)).toHaveLength(9);
  });

  it('flips a label at the right edge of the screen', () => {
    const p = placeLabels([box(950, 100)], 9, 4, offscreen(1000, 800));
    expect(p[0]?.flip).toBe(true);
  });

  it('overlap is strict at shared edges', () => {
    expect(overlaps(box(0, 0), box(100, 0))).toBe(false);
    expect(overlaps(box(0, 0), box(99, 0))).toBe(true);
  });
});

describe('phase label anchors', () => {
  it('each phase gets its own slot inside the cutaway quadrant', () => {
    const ks = [phaseSlot(0, 78), phaseSlot(1, 57), phaseSlot(2, 37)];
    ks.forEach((k, ph) => {
      expect(slotPhase(k).phase).toBe(ph);
      const phi = Math.atan2(Math.sin(slotAngle(k)), Math.cos(slotAngle(k)));
      expect(phi).toBeGreaterThan(0);
      expect(phi).toBeLessThan(Math.PI / 2);
    });
    expect(new Set(ks).size).toBe(3);
  });
});
