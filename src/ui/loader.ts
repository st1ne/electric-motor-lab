/**
 * Loader (TECH_SPEC §2): a stator ring whose three coils light up in sequence (A, B, C in phase
 * colours), then fades into the scene once the first frame has rendered.
 */
import { h } from '@/ui/dom';

const MIN_S = 0.9;

export interface Loader {
  readonly el: HTMLElement;
  /** call after the first rendered frame */
  done(): void;
}

export function createLoader(): Loader {
  const arcs = [0, 1, 2]
    .map((i) => {
      const a0 = -90 + i * 120 + 12;
      const a1 = a0 + 96;
      const p = (a: number): string =>
        `${(32 + 22 * Math.cos((a * Math.PI) / 180)).toFixed(2)} ${(32 + 22 * Math.sin((a * Math.PI) / 180)).toFixed(2)}`;
      return `<path class="ld-coil ld-${'abc'[i]}" d="M${p(a0)} A22 22 0 0 1 ${p(a1)}"/>`;
    })
    .join('');
  const el = h('div.loader', { role: 'progressbar', 'aria-label': 'Loading the lab' });
  el.innerHTML = `<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="22" class="ld-ring"/>${arcs}</svg>
    <div class="ld-text mono">ELECTRIC MOTOR LAB</div>`;
  const start = performance.now();
  return {
    el,
    done() {
      const wait = Math.max(0, MIN_S * 1000 - (performance.now() - start));
      window.setTimeout(() => {
        el.classList.add('gone');
        window.setTimeout(() => el.remove(), 700);
      }, wait);
    },
  };
}
