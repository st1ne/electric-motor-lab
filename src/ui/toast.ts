/** Toasts (TECH_SPEC §6.9, §16): short messages, bottom centre, 3.5 s, one at a time. */
import { h } from '@/ui/dom';

export interface Toaster {
  readonly el: HTMLElement;
  show(html: string, durationS?: number): void;
}

export function createToaster(): Toaster {
  const el = h('div.toast', { role: 'status', 'aria-live': 'polite' });
  let timer = 0;
  return {
    el,
    show(html, durationS = 3.5) {
      el.innerHTML = html;
      el.classList.add('show');
      window.clearTimeout(timer);
      timer = window.setTimeout(() => el.classList.remove('show'), durationS * 1000);
    },
  };
}
