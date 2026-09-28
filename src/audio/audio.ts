/**
 * WebAudio synthesis (§12): motor whine at 6·f_e and 12·f_e, inverter hiss, gear mesh whine,
 * roller rumble, master limiter. Follows real time, not slow-mo. Off by default.
 * Built in TODO.md Phase 13.
 */
import type { SimSnapshot } from '@/physics/types';
import { notImplemented } from '@/util/stub';

export function createAudio(): { update(s: SimSnapshot): void; setEnabled(on: boolean): void } {
  return notImplemented('createAudio');
}
