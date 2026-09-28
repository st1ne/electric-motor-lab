/**
 * Run (TECH_SPEC §3.6.4): speed over the last 30 s, sampled at 10 Hz whether or not the tab is
 * showing. Samples taken during a launch are drawn thick in amber (the 0–100 run), with a dashed
 * line at 100 km/h and the last recorded time `0–100 in 6.1 s` (or the running clock).
 */
import { fmt } from '@/physics/format';
import type { ChartCanvas } from '@/ui/charts/chartBase';
import { CHART_COLORS, type ChartView } from '@/ui/charts/types';

const WINDOW_S = 30;
const RATE_S = 0.1;
const N = Math.round(WINDOW_S / RATE_S) + 1;

export function createRunChart(): ChartView {
  const t = new Float64Array(N);
  const v = new Float64Array(N);
  const launch = new Uint8Array(N);
  let head = 0;
  let count = 0;
  let acc = RATE_S;
  let simT = 0;
  let lastRun: number | null = null;
  const xs = new Float64Array(N);
  const ys = new Float64Array(N);

  return {
    describe({ s }) {
      return (
        `Speed over the last 30 seconds, now ${fmt(s.kmh)} km/h.` +
        (lastRun !== null ? ` Last 0 to 100 km/h run: ${fmt(lastRun, 1)} seconds.` : '')
      );
    },
    sample({ s }, dt) {
      simT += dt;
      if (s.launchTime !== null) lastRun = s.launchTime;
      acc += dt;
      if (acc < RATE_S) return;
      acc = Math.min(acc - RATE_S, RATE_S);
      t[head] = simT;
      v[head] = s.kmh;
      launch[head] = s.launchElapsed !== null ? 1 : 0;
      head = (head + 1) % N;
      count = Math.min(count + 1, N);
    },
    draw(c: ChartCanvas, { s }) {
      const vMax = 250;
      c.begin({
        x: { min: -WINDOW_S, max: 0 },
        y: { min: 0, max: vMax },
        xTicks: [-30, -20, -10, 0],
        yTicks: [0, 100, 200],
        xFormat: (x) => (x === 0 ? 'now' : `${x} s`),
        yFormat: (y) => fmt(y),
        xTitle: '',
        yTitle: 'km/h',
      });
      // oldest → newest
      const n = count;
      for (let k = 0; k < n; k++) {
        const i = (head - n + k + N) % N;
        xs[k] = (t[i] ?? 0) - simT;
        ys[k] = v[i] ?? 0;
      }
      c.clipped(() => {
        c.polyline([-WINDOW_S, 0], [100, 100], {
          color: CHART_COLORS.muted,
          width: 1,
          dash: [3, 3],
          alpha: 0.7,
        });
        c.polyline(xs.subarray(0, n), ys.subarray(0, n), {
          color: CHART_COLORS.text,
          width: 1.4,
          alpha: 0.7,
        });
        // launch segments, thick amber
        let k = 0;
        while (k < n) {
          while (k < n && !launch[(head - n + k + N) % N]) k++;
          const a = k;
          while (k < n && launch[(head - n + k + N) % N]) k++;
          if (k - a >= 2)
            c.polyline(xs.subarray(a, k), ys.subarray(a, k), {
              color: CHART_COLORS.power,
              width: 2.6,
            });
        }
        c.dot(0, s.kmh, s.pDc < 0 ? CHART_COLORS.regen : CHART_COLORS.power, 3.5);
      });
      const { ctx, plot, theme } = c;
      ctx.font = theme.font;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      if (s.launchElapsed !== null) {
        ctx.fillStyle = CHART_COLORS.power;
        ctx.fillText(`0–100 … ${fmt(s.launchElapsed, 1)} s`, plot.r, 1);
      } else if (lastRun !== null) {
        ctx.fillStyle = CHART_COLORS.power;
        ctx.fillText(`0–100 in ${fmt(lastRun, 1)} s`, plot.r, 1);
      } else {
        ctx.fillStyle = CHART_COLORS.muted;
        ctx.fillText('press Launch for a 0–100 run', plot.r, 1);
      }
    },
  };
}
