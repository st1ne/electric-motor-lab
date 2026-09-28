/**
 * Tiny observable store (TECH_SPEC §13.3): get, set(partial), subscribe(selector, cb).
 * set() replaces the state object; subscribers fire only when their selected value changed
 * (Object.is), with the new and previous value.
 */

export interface Store<S> {
  get(): S;
  set(partial: Partial<S>): void;
  /** Call cb whenever selector(state) changes; `immediate` also calls it once now. */
  subscribe<T>(
    selector: (s: S) => T,
    cb: (value: T, prev: T) => void,
    immediate?: boolean,
  ): () => void;
}

interface Sub<S> {
  selector: (s: S) => unknown;
  cb: (value: unknown, prev: unknown) => void;
  last: unknown;
}

export function createStore<S extends object>(initial: S): Store<S> {
  let state = initial;
  const subs = new Set<Sub<S>>();
  return {
    get: () => state,
    set(partial) {
      let changed = false;
      for (const k of Object.keys(partial) as (keyof S)[]) {
        if (!Object.is(state[k], partial[k])) changed = true;
      }
      if (!changed) return;
      state = { ...state, ...partial };
      for (const sub of [...subs]) {
        const v = sub.selector(state);
        if (!Object.is(v, sub.last)) {
          const prev = sub.last;
          sub.last = v;
          sub.cb(v, prev);
        }
      }
    },
    subscribe(selector, cb, immediate = false) {
      const sub: Sub<S> = {
        selector,
        cb: cb as (v: unknown, p: unknown) => void,
        last: selector(state),
      };
      subs.add(sub);
      if (immediate) sub.cb(sub.last, sub.last);
      return () => subs.delete(sub);
    },
  };
}
