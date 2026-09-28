/**
 * Range slider (TECH_SPEC §3.4, §15): a real <input type="range"> with aria-valuetext and a
 * filled track. `set()` updates the thumb without firing onInput (for preset-driven values).
 */
import { h, setText } from '@/ui/dom';

export interface Slider {
  readonly el: HTMLElement;
  readonly input: HTMLInputElement;
  set(value: number): void;
}

export function createSlider(opts: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format: (v: number) => string;
  valueText: (v: number) => string;
  onInput: (v: number) => void;
}): Slider {
  const input = h('input.slider', {
    type: 'range',
    min: opts.min,
    max: opts.max,
    step: opts.step,
    value: opts.value,
    'aria-label': opts.label,
  });
  const readout = h('span.slider-value.mono', { 'aria-hidden': 'true' });
  const el = h('div.slider-wrap', {}, input, readout);
  const paint = (v: number): void => {
    const pct = ((v - opts.min) / (opts.max - opts.min)) * 100;
    input.style.setProperty('--fill', `${pct}%`);
    input.setAttribute('aria-valuetext', opts.valueText(v));
    setText(readout, opts.format(v));
  };
  input.addEventListener('input', () => {
    const v = Number(input.value);
    paint(v);
    opts.onInput(v);
  });
  paint(opts.value);
  return {
    el,
    input,
    set(v) {
      if (document.activeElement === input) return; // don't fight the user's drag
      if (Number(input.value) !== v) input.value = String(v);
      paint(v);
    },
  };
}
