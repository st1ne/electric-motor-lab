/**
 * Frame-time throttle (TECH_SPEC §14.4): text 10 Hz, charts 30 Hz. ready(dt) returns true at
 * most `hz` times per second of real time; the first call is always ready.
 */

export interface Throttle {
  ready(dt: number): boolean;
  /** make the next ready() call fire regardless of time */
  force(): void;
}

export function createThrottle(hz: number): Throttle {
  const period = 1 / hz;
  let acc = period;
  return {
    ready(dt) {
      acc += dt;
      if (acc < period) return false;
      // keep the phase but never build up a backlog
      acc = Math.min(acc - period, period);
      return true;
    },
    force() {
      acc = period;
    },
  };
}

/** UI update rates (§14.4). */
export const RATE_HZ = { text: 10, charts: 30 } as const;
