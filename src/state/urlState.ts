/**
 * URL state: motor, view, follow, preset, thr, slow, chart, cam; replaceState debounced 500 ms (§16).
 * Built in TODO.md Phase 12.
 */
import type { UiState } from '@/state/uiState';
import { notImplemented } from '@/util/stub';

export function readUrlState(): Partial<UiState> {
  return notImplemented('readUrlState');
}

export function writeUrlState(_ui: UiState): void {
  notImplemented('writeUrlState');
}
