/**
 * Chart card (TECH_SPEC §3.6, §10.3): tabs Torque–speed · Scope · Losses · Run (C cycles) over a
 * DPR-aware canvas redrawn at up to 30 Hz, and under it the voltage gauge and the dq inset.
 * Every view samples each frame (trails, the run history) even while another tab shows.
 * The canvases' aria-labels summarise the charts about once a second.
 * 900–1279 px: the card collapses to a "Chart" button until opened (§15).
 */
import type { MotorMaps } from '@/physics/sim';
import type { DisplayAngles, SimSnapshot } from '@/physics/types';
import type { Store } from '@/state/store';
import type { ChartTab, UiState } from '@/state/uiState';
import { createChartCanvas } from '@/ui/charts/chartBase';
import { createLossesBar } from '@/ui/charts/lossesBar';
import { createRunChart } from '@/ui/charts/runChart';
import { createScope } from '@/ui/charts/scope';
import { createTorqueSpeedMap } from '@/ui/charts/torqueSpeedMap';
import type { ChartInput, ChartView } from '@/ui/charts/types';
import { h } from '@/ui/dom';
import { createVectorInset } from '@/ui/vectorInset';
import { createVoltageGauge } from '@/ui/voltageGauge';
import { createThrottle, RATE_HZ } from '@/util/throttle';

export const CHART_SIZE = { width: 334, height: 150 } as const;

const TABS: readonly { id: ChartTab; label: string }[] = [
  { id: 'map', label: 'Torque–speed' },
  { id: 'scope', label: 'Scope' },
  { id: 'losses', label: 'Losses' },
  { id: 'run', label: 'Run' },
];

export interface ChartCard {
  readonly el: HTMLElement;
  /** the views, shared with the wall screens */
  readonly views: Record<ChartTab, ChartView>;
  update(
    s: SimSnapshot,
    angles: DisplayAngles,
    ui: Readonly<UiState>,
    dt: number,
    nowS: number,
  ): void;
  resize(dpr: number): void;
}

export function createChartCard(store: Store<UiState>, maps: MotorMaps): ChartCard {
  const views: Record<ChartTab, ChartView> = {
    map: createTorqueSpeedMap(maps),
    scope: createScope(),
    losses: createLossesBar(),
    run: createRunChart(),
  };
  const tabs = h('div.chart-tabs', { role: 'tablist', 'aria-label': 'Chart' });
  const buttons = TABS.map((t) => {
    const b = h(
      'button.chart-tab',
      { type: 'button', role: 'tab', 'aria-selected': 'false' },
      t.label,
    );
    b.addEventListener('click', () => store.set({ chart: t.id }));
    tabs.append(b);
    return b;
  });
  const canvas = h('canvas.chart-canvas', { role: 'img' });
  const gauge = createVoltageGauge();
  const inset = createVectorInset();
  const meters = h('div.meters', {}, gauge.el, inset.el);
  const toggle = h('button.chart-toggle', { type: 'button', 'aria-expanded': 'false' }, 'Chart');
  const el = h(
    'section.chart-card.glass',
    { 'aria-label': 'Chart' },
    h('header.chart-head', {}, toggle, tabs, h('span.hint.mono', { 'aria-hidden': 'true' }, 'C')),
    canvas,
    meters,
  );
  const chart = createChartCanvas(canvas);
  const dpr = (): number => Math.min(window.devicePixelRatio || 1, 2);
  chart.resize(CHART_SIZE.width, CHART_SIZE.height, dpr());
  toggle.addEventListener('click', () => {
    const open = !el.classList.contains('open');
    el.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
    redraw.force();
  });

  const redraw = createThrottle(RATE_HZ.charts);
  const describe = createThrottle(1);
  let lastTab: ChartTab | null = null;

  return {
    el,
    views,
    resize(d) {
      chart.resize(CHART_SIZE.width, CHART_SIZE.height, d);
      gauge.resize(d);
      inset.resize(d);
      redraw.force();
    },
    update(s, angles, ui, dt, nowS) {
      const input: ChartInput = { s, angles, ui, nowS };
      for (const v of Object.values(views)) v.sample?.(input, dt);
      if (ui.chart !== lastTab) {
        lastTab = ui.chart;
        TABS.forEach((t, i) => {
          const b = buttons[i] as HTMLButtonElement;
          const on = t.id === ui.chart;
          b.setAttribute('aria-selected', String(on));
          b.classList.toggle('on', on);
        });
        redraw.force();
        describe.force();
        // a tab switch cross-fades instead of snapping
        canvas.classList.remove('fade-in');
        void canvas.offsetWidth;
        canvas.classList.add('fade-in');
      }
      if (!redraw.ready(dt)) return;
      if (canvas.offsetParent === null) return; // collapsed or hidden: skip the drawing
      const view = views[ui.chart];
      view.draw(chart, input);
      gauge.draw(s, nowS);
      inset.draw(s, nowS);
      if (describe.ready(1 / RATE_HZ.charts)) {
        canvas.setAttribute('aria-label', view.describe(input));
        gauge.el.firstElementChild?.setAttribute('aria-label', gauge.describe(s));
        inset.el.firstElementChild?.setAttribute('aria-label', inset.describe(s));
      }
    },
  };
}
