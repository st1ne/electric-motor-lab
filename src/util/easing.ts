/** Easing curves (TECH_SPEC §4.6). */

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** Matches the CSS --ease-out cubic-bezier(0.22, 1, 0.36, 1) closely enough for tweens. */
export function easeOutQuint(t: number): number {
  return 1 - (1 - t) ** 5;
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
