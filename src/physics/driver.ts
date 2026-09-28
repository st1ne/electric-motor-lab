/**
 * Driver model and drive presets (TECH_SPEC §3.4, §6.9).
 *   Pedal: T_cmd = u · T_max(ω). Brake: requested deceleration 0.4 g · b.
 *   Launch: brake to a stop if moving, then u = 1; release at 100 km/h and record the time.
 *   Cruise: PI speed hold at 110 km/h (Kp 0.15 per km/h, Ki 0.02), conditional-integration
 *           anti-windup (the integrator only runs while the output is unsaturated).
 *   Top speed: u = 1 until the limiter.  Regen: 0.25 g until 0 (from 120 km/h below 20 km/h).
 *   Coast: u = 0, b = 0.
 * Source: reference cruise_pi() and the scenario functions.
 */
import { DRIVER, SIM_DT } from '@/config/vehicle';
import type { Preset } from '@/physics/types';

export interface DriverState {
  preset: Preset;
  /** launch sub-phase: stop first if the car is moving */
  launchPhase: 'stopping' | 'running';
  launchStartT: number;
  cruiseInt: number;
}

export interface DriverCommand {
  throttle: number;
  brake: number;
}

export function createDriverState(): DriverState {
  return { preset: 'none', launchPhase: 'running', launchStartT: 0, cruiseInt: 0 };
}

/**
 * Activate a preset at time t and speed kmh. Returns a speed (km/h) the dyno should jump to
 * first, or null: Regen below 20 km/h restarts from 120 km/h (§3.4).
 */
export function startPreset(d: DriverState, preset: Preset, t: number, kmh: number): number | null {
  d.preset = preset;
  d.cruiseInt = 0;
  d.launchPhase = kmh > 0.5 ? 'stopping' : 'running';
  d.launchStartT = t;
  return preset === 'regen' && kmh < DRIVER.regenMinKmh ? DRIVER.regenStartKmh : null;
}

/** PI speed hold; returns the throttle 0…1 and updates the integrator. */
export function cruisePi(d: DriverState, kmh: number, targetKmh: number, dt = SIM_DT): number {
  const e = targetKmh - kmh;
  const uUnsat = DRIVER.cruiseKp * e + DRIVER.cruiseKi * (d.cruiseInt + e * dt);
  if (uUnsat > 0 && uUnsat < 1) d.cruiseInt += e * dt;
  return Math.min(Math.max(DRIVER.cruiseKp * e + DRIVER.cruiseKi * d.cruiseInt, 0), 1);
}

export interface DriverEvents {
  /** 0–100 time recorded this step */
  launchTime: number | null;
  /** the preset ended by itself (launch released, regen stopped) */
  presetEnded: boolean;
}

/**
 * Command for one fixed step. Pedal inputs apply only while no preset is active; a pressed
 * brake pedal always wins.
 */
export function driverCommand(
  d: DriverState,
  t: number,
  kmh: number,
  pedalThrottle: number,
  pedalBrake: number,
  events: DriverEvents,
): DriverCommand {
  events.launchTime = null;
  events.presetEnded = false;
  if (pedalBrake > 0) return { throttle: 0, brake: pedalBrake };
  switch (d.preset) {
    case 'none':
      return { throttle: pedalThrottle, brake: 0 };
    case 'coast':
      return { throttle: 0, brake: 0 };
    case 'top':
      return { throttle: 1, brake: 0 };
    case 'cruise':
      return { throttle: cruisePi(d, kmh, DRIVER.cruiseKmh), brake: 0 };
    case 'regen': {
      if (kmh <= 0) {
        d.preset = 'none';
        events.presetEnded = true;
        return { throttle: 0, brake: 0 };
      }
      return { throttle: 0, brake: DRIVER.regenDecelG / DRIVER.brakeMaxG };
    }
    case 'launch': {
      if (d.launchPhase === 'stopping') {
        if (kmh > 0) return { throttle: 0, brake: 1 };
        d.launchPhase = 'running';
        d.launchStartT = t;
      }
      if (kmh >= DRIVER.launchReleaseKmh) {
        events.launchTime = t - d.launchStartT;
        d.preset = 'none';
        events.presetEnded = true;
        return { throttle: 0, brake: 0 };
      }
      return { throttle: 1, brake: 0 };
    }
  }
}
