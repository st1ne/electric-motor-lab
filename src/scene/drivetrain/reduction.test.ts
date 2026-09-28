/** Reduction kinematics (TECH_SPEC §5.5): 19:57 × 23:69 = 9.0 : 1 and the teeth interleave. */
import { describe, expect, it } from 'vitest';
import { GEAR_TEETH, VEHICLE } from '@/config/vehicle';
import { pitchRadius } from '@/scene/drivetrain/gears';
import {
  AXLE,
  INTERMEDIATE,
  meshOffset,
  MODULE_1,
  MODULE_2,
  MOTOR_AXIS,
  RATIO_INTERMEDIATE,
  RATIO_OUTPUT,
} from '@/scene/drivetrain/reduction';

const dist = (a: [number, number], b: [number, number]): number =>
  Math.hypot(a[0] - b[0], a[1] - b[1]);

describe('reduction', () => {
  it('total ratio is the physics gear ratio 9.0', () => {
    expect(1 / RATIO_OUTPUT).toBeCloseTo(VEHICLE.gearRatio, 9);
    expect(RATIO_INTERMEDIATE).toBeLessThan(0); // one external mesh reverses
    expect(RATIO_OUTPUT).toBeGreaterThan(0); // two meshes: the wheels turn with the rotor
  });

  it('centre distances equal the pitch-radius sums (gears touch at the pitch circle)', () => {
    const Z = GEAR_TEETH;
    expect(pitchRadius(Z.z1, MODULE_1) + pitchRadius(Z.z2, MODULE_1)).toBeCloseTo(
      dist(MOTOR_AXIS, INTERMEDIATE),
      9,
    );
    expect(pitchRadius(Z.z3, MODULE_2) + pitchRadius(Z.z4, MODULE_2)).toBeCloseTo(
      dist(INTERMEDIATE, AXLE),
      9,
    );
  });

  it('the driven gear shows a gap on the line of centres whenever the driver shows a tooth', () => {
    const za = 19;
    const zb = 57;
    const phi = 0.7;
    const cb = meshOffset(phi, za, zb);
    const pb = (2 * Math.PI) / zb;
    for (let k = 0; k < 5; k++) {
      const thA = phi + Math.PI / 2 + (k * 2 * Math.PI) / za; // driver tooth k on the line
      const thB = (-za / zb) * thA + cb;
      // driven teeth sit at φ = j·p − π/2 + θb; the line of centres seen from b is at φ + π
      const rel = (phi + Math.PI - (thB - Math.PI / 2)) / pb;
      expect(rel - Math.floor(rel)).toBeCloseTo(0.5, 9);
    }
  });
});
