/**
 * Minimal tween manager (§4.6).
 * Built in TODO.md Phase 5.
 */
import { notImplemented } from '@/util/stub';

export interface Tweens {
  to(from: number, to: number, durationS: number, onUpdate: (v: number) => void): void;
  update(dt: number): void;
}

export function createTweens(): Tweens {
  return notImplemented('createTweens');
}
