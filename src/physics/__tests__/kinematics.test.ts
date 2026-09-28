/** Display kinematics and PWM (TECH_SPEC §6.6, §6.7, §10.1). */
import { describe, expect, it } from 'vitest';
import { IM, PM } from '@/config/motor';
import { createKinematics, snap125 } from '@/physics/kinematics';
import { inversePark, svpwmDuty } from '@/physics/pwm';
import { createSim } from '@/physics/sim';
import type { SimSnapshot } from '@/physics/types';
import { MAPS } from './helpers';

const TAU = 2 * Math.PI;
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

function snapshotAt(kmh: number, throttle: number, motor: 'pm' | 'im'): SimSnapshot {
  const sim = createSim(MAPS, 0.8);
  sim.setSpeedKmh(kmh);
  sim.step(1 / 240 + 1e-9, { motor, throttle, brake: 0 });
  return sim.snapshot();
}

describe('kinematics', () => {
  it('phase A peaks exactly when the current vector points along the A axis', () => {
    const s = snapshotAt(60, 0.5, 'pm');
    const kin = createKinematics();
    let bestIa = -Infinity;
    let angleAtBest = 0;
    for (let k = 0; k < 4000; k++) {
      const a = kin.advance(1 / 240, s, 1000, false);
      if (a.ia > bestIa) {
        bestIa = a.ia;
        angleAtBest = a.thetaCurrent;
      }
    }
    expect(Math.abs(wrap(angleAtBest))).toBeLessThan(0.02);
    expect(bestIa).toBeCloseTo(Math.hypot(s.id, s.iq), 0);
  });

  it('magnet rotor: field and rotor locked at a steady angle', () => {
    const s = snapshotAt(60, 0.5, 'pm');
    const kin = createKinematics();
    const rel: number[] = [];
    for (let k = 0; k < 600; k++) {
      const a = kin.advance(1 / 60, s, 1000, false);
      rel.push(wrap(a.thetaField - a.thetaElecRotor));
    }
    const spread = Math.max(...rel) - Math.min(...rel);
    expect(spread).toBeLessThan(1e-9);
    expect(a0(rel)).toBeGreaterThan(0); // the field leads the rotor d-axis when motoring
  });

  it('induction: the field gains laps on the rotor at slip · f_sync; none at T = 0', () => {
    const s = snapshotAt(60, 0.8, 'im');
    const kin = createKinematics();
    const tDisplay = 20;
    for (let k = 0; k < 60 * tDisplay * 1000; k += 1000) kin.advance(1 / 60, s, 1000, false);
    const fSync = s.omegaE / (TAU * IM.polePairs);
    const expected = s.slip * fSync * kin.angles.tDisplay;
    expect(kin.angles.lapsGained).toBeCloseTo(expected, 6);
    const coast = snapshotAt(60, 0, 'im');
    const kin2 = createKinematics();
    for (let k = 0; k < 600; k++) kin2.advance(1 / 60, coast, 1000, false);
    expect(kin2.angles.lapsGained).toBe(0);
  });

  it('freeze stops display time only', () => {
    const s = snapshotAt(60, 0.5, 'pm');
    const kin = createKinematics();
    kin.advance(1 / 60, s, 1000, false);
    const th = kin.angles.thetaMech;
    kin.advance(1 / 60, s, 1000, true);
    expect(kin.angles.thetaMech).toBe(th);
  });

  it('Auto slow-mo turns the field at ~0.4 rev/s and snaps its label to 1/2/5 steps', () => {
    const s = snapshotAt(100, 0.3, 'pm');
    const kin = createKinematics();
    for (let k = 0; k < 600; k++) kin.advance(1 / 60, s, 'auto', false);
    const fieldRev = Math.abs(s.omegaE) / (TAU * PM.polePairs) / kin.slowMo;
    expect(fieldRev).toBeCloseTo(0.4, 3);
    expect([1, 2, 5]).toContain(Number(String(kin.slowMoLabel)[0]));
    expect(snap125(180)).toBe(200);
    expect(snap125(330)).toBe(500);
    expect(snap125(1400)).toBe(1000);
  });
});

describe('pwm', () => {
  it('inverse Park: balanced phase voltages with amplitude |v|', () => {
    for (let k = 0; k < 50; k++) {
      const th = k * 0.37;
      const [a, b, c] = inversePark(30, 180, th);
      expect(a + b + c).toBeCloseTo(0, 9);
      expect(Math.max(Math.abs(a), Math.abs(b), Math.abs(c))).toBeLessThanOrEqual(
        Math.hypot(30, 180) + 1e-9,
      );
    }
  });

  it('SVPWM duties stay within 0…1 up to the voltage limit and average to the phase voltage', () => {
    const vDc = 380;
    const vMax = (0.95 * vDc) / Math.sqrt(3);
    for (let k = 0; k < 100; k++) {
      const th = k * 0.0628;
      const d = svpwmDuty(0, vMax, th, vDc);
      for (const x of d) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(1);
      }
      const v = inversePark(0, vMax, th);
      // line-to-line voltages are reproduced by the duty differences
      expect((d[0] - d[1]) * vDc).toBeCloseTo(v[0] - v[1], 6);
    }
  });
});

function a0(xs: number[]): number {
  return xs[0] ?? 0;
}
