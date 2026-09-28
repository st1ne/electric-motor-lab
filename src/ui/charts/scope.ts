/**
 * Oscilloscope (TECH_SPEC §3.6.2, §10.1): phase currents i_a/i_b/i_c over two electrical periods
 * in phase colours. The window is fixed in current angle; the cursor sits at θ_i mod 2 periods,
 * so it sweeps in slow-mo time in step with the field arrow in 3D (phase A peaks exactly when the
 * arrow points at the A-coil axis). Behind the traces: the phase-A voltage (faint) against the
 * dashed voltage-limit lines ±V_max, which it touches in field weakening.
 * Readout: `1 div = {x} ms real` (8 divisions over the two periods).
 */
import { PHASE_COLORS } from '@/config/theme';
import { fmt } from '@/physics/format';
import type { ChartCanvas } from '@/ui/charts/chartBase';
import { CHART_COLORS, type ChartView } from '@/ui/charts/types';

const TAU = 2 * Math.PI;
const WINDOW = 2 * TAU;
const N = 160;
/** V_max sits at this fraction of the current axis */
const V_LEVEL = 0.9;
/** current axis steps, A */
const SCALES = [100, 200, 500, 1000] as const; // ≥ 1.15 × I_max of both machines

/** Real-time duration of one of the 8 divisions, as text. */
export function divText(omegaE: number): string {
  const w = Math.abs(omegaE);
  if (w < 1e-3) return '1 div = — ms real';
  const ms = (WINDOW / w / 8) * 1e3;
  return `1 div = ${fmt(ms, ms >= 10 ? 0 : ms >= 1 ? 1 : 2)} ms real`;
}

export function createScope(): ChartView {
  const xs = new Float64Array(N + 1);
  const ys = new Float64Array(N + 1);
  for (let i = 0; i <= N; i++) xs[i] = (i / N) * 720;
  let iAxis = 1000;

  return {
    describe({ s }) {
      return (
        `Scope: three phase currents of ${fmt(Math.hypot(s.id, s.iq))} A peak, 120 degrees apart; ` +
        `voltage ${fmt(s.vMag)} of ${fmt(s.vMax)} V.`
      );
    },
    draw(c: ChartCanvas, { s, angles, ui }) {
      // autoscale in steps with hysteresis, so small cruise currents still read as sines
      // (the top step covers either machine's current limit with headroom)
      const need = Math.hypot(s.id, s.iq) * 1.15;
      const want = SCALES.find((a) => a >= need) ?? 1000;
      if (want > iAxis || want < iAxis * 0.4) iAxis = want;
      c.begin({
        x: { min: 0, max: 720 },
        y: { min: -iAxis, max: iAxis },
        xTicks: [0, 90, 180, 270, 360, 450, 540, 630, 720],
        yTicks: [-iAxis / 2, 0, iAxis / 2].map((v) => Math.round(v)),
        xFormat: () => '',
        yFormat: (v) => fmt(v),
        xTitle: divText(s.omegaE),
        yTitle: 'A',
      });
      const iMag = Math.hypot(s.id, s.iq);
      const cursor = ((angles.thetaCurrent % WINDOW) + WINDOW) % WINDOW;
      const vScale = (V_LEVEL * iAxis) / Math.max(s.vMax, 1);
      const vPhase = Math.atan2(s.vq, s.vd) - Math.atan2(s.iq, s.id);
      const lim = s.vMax * vScale;
      c.clipped(() => {
        c.polyline([0, 720], [lim, lim], {
          color: CHART_COLORS.field,
          width: 1,
          dash: [4, 3],
          alpha: 0.7,
        });
        c.polyline([0, 720], [-lim, -lim], {
          color: CHART_COLORS.field,
          width: 1,
          dash: [4, 3],
          alpha: 0.7,
        });
        for (let i = 0; i <= N; i++) ys[i] = s.vMag * vScale * Math.cos((i / N) * WINDOW + vPhase);
        c.polyline(xs, ys, {
          color: CHART_COLORS.field,
          width: 1.2,
          alpha: s.voltageLimited ? 0.9 : 0.45,
        });
        for (let ph = 2; ph >= 0; ph--) {
          if (ui.onlyPhaseA && ph > 0) continue;
          for (let i = 0; i <= N; i++) ys[i] = iMag * Math.cos((i / N) * WINDOW - (ph * TAU) / 3);
          c.polyline(xs, ys, { color: PHASE_COLORS[ph] ?? '#fff', width: 1.6, alpha: 0.95 });
        }
        const cx = (cursor / WINDOW) * 720;
        c.polyline([cx, cx], [-iAxis, iAxis], { color: CHART_COLORS.text, width: 1, alpha: 0.7 });
        for (let ph = 0; ph < 3; ph++) {
          if (ui.onlyPhaseA && ph > 0) continue;
          c.dot(cx, iMag * Math.cos(cursor - (ph * TAU) / 3), PHASE_COLORS[ph] ?? '#fff', 3);
        }
      });
      const { ctx, plot, theme } = c;
      ctx.font = theme.font;
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillStyle = CHART_COLORS.field;
      ctx.fillText('V max', plot.l + 3, c.Y(lim) + 2);
      ctx.textBaseline = 'bottom';
      ctx.textAlign = 'right';
      ctx.fillStyle = CHART_COLORS.muted;
      ctx.fillText(ui.onlyPhaseA ? 'phase A only' : 'i_a  i_b  i_c', plot.r - 3, plot.b - 2);
    },
  };
}
