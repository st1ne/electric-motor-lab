/**
 * Live explanation panel (TECH_SPEC §3.5, §15): re-renders at most every 150 ms and only when the
 * rounded text changed; a visually hidden aria-live="polite" copy updates at most every 2 s.
 */
import type { Regime } from '@/physics/regime';
import type { SimSnapshot } from '@/physics/types';
import { h, setHtml, setText } from '@/ui/dom';
import { renderLapCounter, renderSlowMoTail, renderTemplate, toPlainText } from '@/ui/templates';

const RENDER_S = 0.15;
const LIVE_S = 2;

const TITLES: Record<Regime, string> = {
  STANDSTILL: 'Standstill',
  CONSTANT_TORQUE: 'Constant torque',
  CRUISE: 'Cruise',
  FIELD_WEAKENING: 'Field weakening',
  INDUCTION_SLIP: 'Slip',
  REGEN: 'Regen',
  COAST_PM: 'Coasting · magnet drag',
  COAST_IM: 'Coasting · free cage',
  DERATE: 'Derate',
  TOP_SPEED: 'Top speed',
};

export interface Explainer {
  readonly el: HTMLElement;
  update(dt: number, s: SimSnapshot, slowMo: number, laps: number): void;
}

export function createExplainer(): Explainer {
  const title = h('div.explain-title');
  const body = h('p.explain-body');
  const tail = h('p.explain-tail');
  const live = h('div.sr-only', { 'aria-live': 'polite' });
  const el = h(
    'section.panel.glass.explainer',
    { 'aria-label': 'What is happening' },
    title,
    body,
    tail,
    live,
  );
  let t = RENDER_S;
  let tLive = LIVE_S;
  let liveText = '';
  return {
    el,
    update(dt, s, slowMo, laps) {
      t += dt;
      tLive += dt;
      if (t < RENDER_S) return;
      t = 0;
      const html = renderTemplate(s);
      el.dataset.regime = s.regime;
      setText(title, TITLES[s.regime]);
      setHtml(body, html);
      setHtml(
        tail,
        [renderLapCounter(s, slowMo, laps), renderSlowMoTail(s, slowMo)].filter(Boolean).join(' '),
      );
      const plain = toPlainText(html);
      if (tLive >= LIVE_S && plain !== liveText) {
        tLive = 0;
        liveText = plain;
        setText(live, plain);
      }
    },
  };
}
