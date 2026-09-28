/**
 * Tiny observable store: get, set(partial), subscribe(selector, cb) (§13.3).
 * Built in TODO.md Phase 5.
 */
import { notImplemented } from '@/util/stub';

export interface Store<S> {
  get(): S;
  set(partial: Partial<S>): void;
  subscribe<T>(selector: (s: S) => T, cb: (value: T, prev: T) => void): () => void;
}

export function createStore<S>(_initial: S): Store<S> {
  return notImplemented('createStore');
}
