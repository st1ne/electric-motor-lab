/**
 * Losses (TECH_SPEC §3.6.3): one horizontal stacked bar of the loss breakdown in W (stator
 * copper, iron, rotor copper (Induction only), magnets/eddy (Magnet only), inverter,
 * bearings + windage, gearbox), a legend with each part, and the total and efficiency.
 * The bar's scale steps (1, 2, 5 × 10ⁿ W) so it doesn't jitter.
 */
import { fmt } from '@/physics/format';
import type { Losses } from '@/physics/types';
import type { ChartCanvas } from '@/ui/charts/chartBase';
import { CHART_COLORS, type ChartView } from '@/ui/charts/types';

interface Part {
  key: keyof Losses;
  label: string;
  color: string;
  only?: 'pm' | 'im';
}

export const LOSS_PARTS: readonly Part[] = [
  { key: 'cuW', label: 'Stator copper', color: '#ff7a3d' },
  { key: 'feW', label: 'Iron', color: '#b794ff' },
  { key: 'rcuW', label: 'Rotor copper', color: '#ffb547', only: 'im' },
  { key: 'magW', label: 'Magnet eddy', color: '#cfd6de', only: 'pm' },
  { key: 'invW', label: 'Inverter', color: '#4cc9ff' },
  { key: 'mechW', label: 'Bearings + air', color: '#8b93a7' },
  { key: 'gearW', label: 'Gearbox', color: '#5be49b' },
];

/** The next "nice" full-scale value ≥ x (1, 2, 5 × 10ⁿ). */
export function niceCeil(x: number): number {
  const e = 10 ** Math.floor(Math.log10(Math.max(x, 1)));
  for (const m of [1, 2, 5, 10]) if (m * e >= x) return m * e;
  return 10 * e;
}

export function createLossesBar(): ChartView {
  let scale = 1000;
  return {
    describe({ s }) {
      return `Losses: ${fmt(s.lossTotalW)} W in total, efficiency ${fmt(s.eff * 100, 1)} %.`;
    },
    draw(c: ChartCanvas, { s }) {
      const parts = LOSS_PARTS.filter((p) => !p.only || p.only === s.motor);
      const total = parts.reduce((a, p) => a + Math.max(s.losses[p.key], 0), 0);
      const want = niceCeil(total * 1.05);
      // grow at once, shrink only when clearly smaller (no jitter at a boundary)
      if (want > scale || want < scale / 2.5) scale = want;
      // self-drawn: no axes, the bar spans the full canvas width
      const { ctx, theme } = c;
      const u = theme.lineScale;
      ctx.clearRect(0, 0, c.width, c.height);
      if (theme.background) {
        ctx.fillStyle = theme.background;
        ctx.fillRect(0, 0, c.width, c.height);
      }
      const plot = { l: 4 * u, r: c.width - 4 * u };
      const X = (w: number): number => plot.l + (w / scale) * (plot.r - plot.l);
      const barTop = 30 * u;
      const barH = 18 * u;
      let x = 0;
      for (const p of parts) {
        const w = Math.max(s.losses[p.key], 0);
        if (w <= 0) continue;
        ctx.fillStyle = p.color;
        const x0 = X(x);
        const x1 = X(Math.min(x + w, scale));
        ctx.fillRect(x0, barTop, Math.max(x1 - x0 - 1, 0.5), barH);
        x += w;
      }
      // bar frame, scale labels and the title row
      ctx.strokeStyle = theme.axis;
      ctx.lineWidth = 1;
      ctx.strokeRect(plot.l + 0.5, barTop - 0.5, plot.r - plot.l - 1, barH + 1);
      ctx.font = theme.font;
      ctx.fillStyle = CHART_COLORS.dim;
      ctx.textBaseline = 'bottom';
      ctx.textAlign = 'left';
      ctx.fillText('0', plot.l, barTop - 2);
      ctx.textAlign = 'right';
      ctx.fillText(
        scale >= 1000 ? `${fmt(scale / 1000)} kW` : `${fmt(scale)} W`,
        plot.r,
        barTop - 2,
      );
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillStyle = theme.tick;
      ctx.fillText('LOSSES', plot.l, 2);
      // legend: two columns under the bar
      ctx.font = theme.font;
      ctx.textBaseline = 'middle';
      const rowH = 15 * u;
      const colW = (plot.r - plot.l) / 2;
      parts.forEach((p, i) => {
        const cx = plot.l + (i % 2) * colW;
        const cy = barTop + barH + 14 * u + Math.floor(i / 2) * rowH;
        ctx.fillStyle = p.color;
        ctx.fillRect(cx, cy - 3 * u, 6 * u, 6 * u);
        ctx.fillStyle = CHART_COLORS.muted;
        ctx.textAlign = 'left';
        ctx.fillText(p.label, cx + 10 * u, cy);
        ctx.fillStyle = CHART_COLORS.text;
        ctx.textAlign = 'right';
        ctx.fillText(`${fmt(s.losses[p.key])} W`, cx + colW - 8 * u, cy);
      });
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillStyle = CHART_COLORS.heat;
      ctx.fillText(`total ${fmt(total)} W · η ${fmt(s.eff * 100, 1)} %`, plot.r, 2);
    },
  };
}
