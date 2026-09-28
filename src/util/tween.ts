/**
 * Minimal tween manager (TECH_SPEC §4.6): numeric tweens with an ease-out curve, advanced once
 * per frame. Starting a tween with an existing key retargets it from its current value.
 */
import { easeOutQuint } from '@/util/easing';

export interface Tweens {
  /** Tween `key` towards `to` over `durationS`; onUpdate receives every intermediate value. */
  to(key: string, from: number, to: number, durationS: number, onUpdate: (v: number) => void): void;
  update(dt: number): void;
  /** current value of a running tween, or undefined */
  value(key: string): number | undefined;
}

interface Tween {
  from: number;
  to: number;
  t: number;
  dur: number;
  v: number;
  onUpdate: (v: number) => void;
}

export function createTweens(): Tweens {
  const running = new Map<string, Tween>();
  return {
    to(key, from, to, durationS, onUpdate) {
      const cur = running.get(key);
      const start = cur ? cur.v : from;
      if (durationS <= 0) {
        running.delete(key);
        onUpdate(to);
        return;
      }
      running.set(key, { from: start, to, t: 0, dur: durationS, v: start, onUpdate });
    },
    update(dt) {
      for (const [key, tw] of running) {
        tw.t += dt;
        const k = Math.min(tw.t / tw.dur, 1);
        tw.v = tw.from + (tw.to - tw.from) * easeOutQuint(k);
        tw.onUpdate(tw.v);
        if (k >= 1) running.delete(key);
      }
    },
    value(key) {
      return running.get(key)?.v;
    },
  };
}
