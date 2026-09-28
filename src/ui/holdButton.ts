/**
 * Hold-to-brake button (TECH_SPEC §3.4): while held (pointer, Space/Enter on focus, or the S
 * hotkey via press()/release()) the brake ramps 0 → 1 (0 → 0.4 g) over RAMP_S and drops to 0
 * on release. update(dt) runs every frame.
 */
import { h } from '@/ui/dom';

const RAMP_S = 0.6;

export interface HoldButton {
  readonly el: HTMLButtonElement;
  press(): void;
  release(): void;
  update(dt: number): void;
}

export function createHoldButton(opts: {
  label: string;
  onChange: (b: number) => void;
}): HoldButton {
  const fill = h('span.hold-fill', { 'aria-hidden': 'true' });
  const el = h(
    'button.hold',
    { type: 'button', 'aria-label': `${opts.label} (hold)`, 'aria-pressed': 'false' },
    fill,
    h('span.hold-label', {}, opts.label),
  );
  let held = false;
  let level = 0;
  const press = (): void => {
    held = true;
    el.classList.add('held');
    el.setAttribute('aria-pressed', 'true');
  };
  const release = (): void => {
    held = false;
    el.classList.remove('held');
    el.setAttribute('aria-pressed', 'false');
  };
  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId);
    press();
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
    el.addEventListener(ev, release);
  }
  el.addEventListener('keydown', (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
      e.preventDefault();
      e.stopPropagation();
      press();
    }
  });
  el.addEventListener('keyup', (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.stopPropagation();
      release();
    }
  });
  el.addEventListener('contextmenu', (e) => e.preventDefault());

  return {
    el,
    press,
    release,
    update(dt) {
      const next = held ? Math.min(level + dt / RAMP_S, 1) : 0;
      if (next !== level) {
        level = next;
        fill.style.transform = `scaleX(${level})`;
        opts.onChange(level);
      }
    },
  };
}
