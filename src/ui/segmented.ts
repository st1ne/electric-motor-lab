/**
 * Segmented control (TECH_SPEC §3.4): a row of real buttons; the active one is a white pill with
 * dark text. The row header carries the label and a dim mono hotkey hint.
 */
import { h } from '@/ui/dom';

export interface SegOption<T> {
  value: T;
  label: string;
  title?: string;
}

export interface Segmented<T> {
  readonly el: HTMLElement;
  set(value: T): void;
}

export function createSegmented<T>(opts: {
  label: string;
  hint?: string;
  options: readonly SegOption<T>[];
  value: T;
  onSelect: (v: T) => void;
  className?: string;
}): Segmented<T> {
  const buttons = opts.options.map((o) => {
    // the visible label is the accessible name; the title is only a tooltip
    const b = h('button.seg', { type: 'button', title: o.title, 'aria-label': o.label }, o.label);
    b.addEventListener('click', () => opts.onSelect(o.value));
    return b;
  });
  const group = h('div.seg-group', { role: 'group', 'aria-label': opts.label }, ...buttons);
  const el = h(
    `div.row${opts.className ? `.${opts.className}` : ''}`,
    {},
    rowHeader(opts.label, opts.hint),
    group,
  );
  const set = (v: T): void => {
    opts.options.forEach((o, i) => {
      const on = Object.is(o.value, v);
      const b = buttons[i];
      if (!b) return;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
  };
  set(opts.value);
  return { el, set };
}

export function rowHeader(label: string, hint?: string, extra?: HTMLElement): HTMLElement {
  return h(
    'div.row-head',
    {},
    h('span.row-label', {}, label),
    hint ? h('span.hint.mono', { 'aria-hidden': 'true' }, hint) : null,
    extra ?? null,
  );
}
