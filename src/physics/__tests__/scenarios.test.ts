/** Scenario tests (TECH_SPEC §7.3) plus the driver presets and regime texts. */
import { describe, expect, it } from 'vitest';
import { DRIVER } from '@/config/vehicle';
import { createSim } from '@/physics/sim';
import { MAPS, runDerate, runLaunch, runRegen } from './helpers';

describe('§7.3 scenarios', () => {
  it('launch 0–100: no NaN, SoC decreases monotonically', () => {
    for (const kind of ['pm', 'im'] as const) {
      const r = runLaunch(kind);
      expect(r.nan).toBe(false);
      expect(r.socMonotonic).toBe(true);
      expect(r.t100).not.toBeNull();
    }
  });

  it('regen from 120 km/h at 0.25 g: SoC rises, friction takes over below 8 km/h, no overshoot', () => {
    for (const kind of ['pm', 'im'] as const) {
      const r = runRegen(kind);
      expect(r.socGain).toBeGreaterThan(0);
      expect(r.fricBelow).toBeGreaterThan(1000); // friction brakes carry the stop
      expect(r.vEnd).toBe(0);
      expect(r.overshoot).toBe(false);
      // 120 km/h at 0.25 g ≈ 13.6 s
      expect(r.stopTime).toBeGreaterThan(12.5);
      expect(r.stopTime).toBeLessThan(14.5);
      // the brief: "+130 kW back into the battery"
      expect(r.pRegenMaxKw).toBeGreaterThan(115);
      expect(r.pRegenMaxKw).toBeLessThan(150.001);
    }
  });

  it('10 back-to-back launches + brakes derate the Magnet motor; one launch does not', () => {
    const d = runDerate('pm');
    expect(d.first).not.toBeNull();
    expect(d.first ?? 0).toBeGreaterThan(1);
    expect(d.tWMax).toBeGreaterThan(150);
    expect(d.derateMin).toBeLessThan(1);
  });
});

describe('driver presets through createSim', () => {
  const run = (
    sim: ReturnType<typeof createSim>,
    seconds: number,
    throttle = 0,
    brake = 0,
    motor: 'pm' | 'im' = 'pm',
  ) => {
    for (let t = 0; t < seconds; t += 1 / 60) sim.step(1 / 60, { motor, throttle, brake });
  };

  it('Launch records a 0–100 time and releases; the text regimes follow', () => {
    const sim = createSim(MAPS, 1);
    let time: number | null = null;
    sim.onLaunchTime((s) => (time = s));
    sim.setPreset('launch');
    run(sim, 1);
    expect(sim.snapshot().regime).toBe('CONSTANT_TORQUE');
    run(sim, 9);
    expect(time).not.toBeNull();
    expect(time ?? 0).toBeGreaterThan(5.4);
    expect(time ?? 0).toBeLessThan(6.8);
    expect(sim.snapshot().preset).toBe('none');
  });

  it('Launch while moving brakes to a stop first', () => {
    const sim = createSim(MAPS, 0.9);
    sim.setSpeedKmh(60);
    sim.setPreset('launch');
    run(sim, 0.5);
    expect(sim.snapshot().kmh).toBeLessThan(60);
    run(sim, 12);
    expect(sim.snapshot().launchTime).not.toBeNull();
  });

  it('Cruise holds 110 km/h with small torque (CRUISE text)', () => {
    const sim = createSim(MAPS, 0.8);
    sim.setSpeedKmh(90);
    sim.setPreset('cruise');
    run(sim, 40);
    const s = sim.snapshot();
    expect(s.kmh).toBeGreaterThan(108.5);
    expect(s.kmh).toBeLessThan(111.5);
    expect(s.regime).toBe('CRUISE');
  });

  it('Top speed: field weakening, then the limiter', () => {
    const sim = createSim(MAPS, 1);
    sim.setSpeedKmh(140);
    sim.setPreset('top');
    run(sim, 1);
    const fw = sim.snapshot();
    expect(fw.regime).toBe('FIELD_WEAKENING');
    expect(fw.id).toBeLessThan(-300);
    expect(fw.emfNoLoad).toBeGreaterThan(fw.vMax);
    run(sim, 60);
    expect(sim.snapshot().regime).toBe('TOP_SPEED');
  });

  it('Regen below 20 km/h restarts from 120 km/h and stops; REGEN text, negative DC power', () => {
    const sim = createSim(MAPS, 0.7);
    sim.setPreset('regen');
    expect(sim.state.v * 3.6).toBeCloseTo(DRIVER.regenStartKmh, 9);
    run(sim, 1);
    const s = sim.snapshot();
    expect(s.regime).toBe('REGEN');
    expect(s.pDc).toBeLessThan(-80e3);
    run(sim, 15);
    expect(sim.snapshot().kmh).toBe(0);
  });

  it('Coast: Magnet drags (iron + mech), Induction only mech; both drag powers reported', () => {
    for (const motor of ['pm', 'im'] as const) {
      const sim = createSim(MAPS, 0.8);
      sim.setSpeedKmh(100);
      sim.setPreset('coast');
      run(sim, 0.2, 0, 0, motor);
      const s = sim.snapshot();
      expect(s.regime).toBe(motor === 'pm' ? 'COAST_PM' : 'COAST_IM');
      expect(s.dragPmW).toBeGreaterThan(400);
      expect(s.dragImW).toBeLessThan(120);
      if (motor === 'im') expect(s.iPeak).toBe(0);
    }
  });

  it('Induction drive reports slip and a bar current', () => {
    const sim = createSim(MAPS, 0.8);
    sim.setSpeedKmh(60);
    run(sim, 0.5, 0.8, 0, 'im');
    const s = sim.snapshot();
    expect(s.regime).toBe('INDUCTION_SLIP');
    expect(s.slip).toBeGreaterThan(0.005);
    expect(s.barCurrentA).toBeGreaterThan(500);
    expect(s.barCurrentA).toBeLessThan(3000);
  });

  it('switching motors keeps the car speed', () => {
    const sim = createSim(MAPS, 0.8);
    sim.setSpeedKmh(80);
    run(sim, 0.2, 0.3, 0, 'pm');
    const v0 = sim.snapshot().kmh;
    run(sim, 1 / 60, 0.3, 0, 'im');
    expect(Math.abs(sim.snapshot().kmh - v0)).toBeLessThan(0.1);
  });
});
