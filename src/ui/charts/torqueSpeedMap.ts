/**
 * Torque–speed map (TECH_SPEC §3.6.1): x 0–16,000 rpm, y −420…+420 N·m.
 *   Efficiency heat map from the build-time maps with contours at 85/90/94/96/97 %, pre-rendered
 *   once per motor into an offscreen raster in plot coordinates; drive and regen envelopes as
 *   white lines; the base-speed marker; the live dot with a 5 s trail. A motor swap cross-fades
 *   the raster over 400 ms.
 */
import { MAP_GRID, type MotorKind } from '@/config/motor';
import { fmt } from '@/physics/format';
import type { MotorMaps } from '@/physics/sim';
import type { ChartCanvas } from '@/ui/charts/chartBase';
import { CHART_COLORS, type ChartView } from '@/ui/charts/types';

const RPM_MAX = 16000;
const T_MIN = -420;
const T_MAX = 420;
const CONTOURS = [0.85, 0.9, 0.94, 0.96, 0.97] as const;
const RASTER_W = 320;
const RASTER_H = 168;
const TRAIL_S = 5;
const FADE_S = 0.4;

/** eff 0.70 … 0.97 → dark navy … violet … cyan */
const RAMP: [number, [number, number, number]][] = [
  [0.7, [16, 20, 38]],
  [0.85, [52, 40, 96]],
  [0.92, [92, 70, 170]],
  [0.96, [70, 130, 200]],
  [0.975, [120, 210, 240]],
];

function rampColor(eff: number): [number, number, number] {
  const [eFirst, cFirst] = RAMP[0] as [number, [number, number, number]];
  if (eff <= eFirst) return cFirst;
  for (let i = 1; i < RAMP.length; i++) {
    const [e1, c1] = RAMP[i] as [number, [number, number, number]];
    if (eff <= e1) {
      const [e0, c0] = RAMP[i - 1] as [number, [number, number, number]];
      const t = (eff - e0) / (e1 - e0);
      return [
        c0[0] + (c1[0] - c0[0]) * t,
        c0[1] + (c1[1] - c0[1]) * t,
        c0[2] + (c1[2] - c0[2]) * t,
      ];
    }
  }
  return RAMP[RAMP.length - 1]?.[1] ?? [0, 0, 0];
}

/** Efficiency raster over the full axis range (outside the envelope transparent). */
function renderRaster(maps: MotorMaps, kind: MotorKind): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = RASTER_W;
  cv.height = RASTER_H;
  const ctx = cv.getContext('2d');
  if (!ctx) return cv;
  const img = ctx.createImageData(RASTER_W, RASTER_H);
  const mp = maps[kind];
  const level = new Int8Array(RASTER_W * RASTER_H).fill(-1);
  const effs = new Float32Array(RASTER_W * RASTER_H);
  for (let x = 0; x < RASTER_W; x++) {
    const rpm = ((x + 0.5) / RASTER_W) * RPM_MAX;
    const hi = mp.tMax(rpm);
    const lo = mp.tMin(rpm);
    for (let y = 0; y < RASTER_H; y++) {
      const tq = T_MAX - ((y + 0.5) / RASTER_H) * (T_MAX - T_MIN);
      if (tq > hi || tq < lo || Math.abs(tq) < 2 || rpm < 150) continue;
      const eff = mp.lookup(rpm, tq).eff;
      const k = y * RASTER_W + x;
      effs[k] = eff;
      level[k] = CONTOURS.filter((c) => eff >= c).length;
    }
  }
  for (let y = 0; y < RASTER_H; y++) {
    for (let x = 0; x < RASTER_W; x++) {
      const k = y * RASTER_W + x;
      const lv = level[k] ?? -1;
      if (lv < 0) continue;
      const right = x + 1 < RASTER_W ? (level[k + 1] ?? -1) : lv;
      const down = y + 1 < RASTER_H ? (level[k + RASTER_W] ?? -1) : lv;
      const edge = (right >= 0 && right !== lv) || (down >= 0 && down !== lv);
      const [r, g, b] = edge ? [230, 236, 250] : rampColor(effs[k] ?? 0);
      img.data[k * 4] = r;
      img.data[k * 4 + 1] = g;
      img.data[k * 4 + 2] = b;
      img.data[k * 4 + 3] = edge ? 150 : 200;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

export function createTorqueSpeedMap(maps: MotorMaps): ChartView {
  const rasters: Partial<Record<MotorKind, HTMLCanvasElement>> = {};
  const raster = (k: MotorKind): HTMLCanvasElement => (rasters[k] ??= renderRaster(maps, k));
  const env: Record<MotorKind, { rpm: number[]; hi: number[]; lo: number[]; base: number }> = {
    pm: envelopeOf('pm'),
    im: envelopeOf('im'),
  };
  function envelopeOf(k: MotorKind): { rpm: number[]; hi: number[]; lo: number[]; base: number } {
    const m = maps[k].map;
    const rpm = m.tMax.map((_, i) => MAP_GRID.rpmStart + i * MAP_GRID.rpmStep);
    const t0 = m.tMax[1] ?? m.tMax[0] ?? 0;
    const idx = m.tMax.findIndex((t, i) => i > 1 && t < 0.985 * t0);
    return { rpm, hi: m.tMax, lo: m.tMin, base: rpm[Math.max(idx - 1, 0)] ?? 0 };
  }

  const trail: { t: number; rpm: number; tq: number; regen: boolean }[] = [];
  let shown: MotorKind | null = null;
  let prev: MotorKind | null = null;
  let fadeStart = -1;

  const axes = {
    x: { min: 0, max: RPM_MAX },
    y: { min: T_MIN, max: T_MAX },
    xTicks: [0, 4000, 8000, 12000, 16000],
    yTicks: [-400, -200, 0, 200, 400],
    xFormat: (v: number) => (v === 0 ? '0' : `${v / 1000}k`),
    yFormat: (v: number) => fmt(v),
    xTitle: 'rpm',
    yTitle: 'N·m',
  };

  return {
    describe({ s }) {
      return (
        `Torque–speed map, ${s.motor === 'pm' ? 'magnet' : 'induction'} motor: ` +
        `${fmt(s.tMotor)} N·m at ${fmt(s.rpm)} rpm, efficiency ${fmt(s.eff * 100, 1)} %.`
      );
    },
    sample({ s, nowS }) {
      const last = trail[trail.length - 1];
      if (!last || nowS - last.t > 1 / 30)
        trail.push({ t: nowS, rpm: s.rpm, tq: s.tMotor, regen: s.pDc < 0 });
      while (trail.length && nowS - (trail[0]?.t ?? 0) > TRAIL_S) trail.shift();
    },
    draw(c: ChartCanvas, { s, nowS }) {
      if (shown !== s.motor) {
        prev = shown;
        shown = s.motor;
        fadeStart = nowS;
      }
      c.begin(axes);
      const { ctx, plot, theme } = c;
      const f = prev ? Math.min((nowS - fadeStart) / FADE_S, 1) : 1;
      if (f >= 1) prev = null;
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      if (prev) {
        ctx.globalAlpha = 1 - f;
        ctx.drawImage(raster(prev), plot.l, plot.t, plot.r - plot.l, plot.b - plot.t);
      }
      ctx.globalAlpha = f;
      ctx.drawImage(raster(s.motor), plot.l, plot.t, plot.r - plot.l, plot.b - plot.t);
      ctx.restore();

      const e = env[s.motor];
      c.clipped(() => {
        c.polyline([0, RPM_MAX], [0, 0], { color: CHART_COLORS.muted, width: 1, alpha: 0.5 });
        c.polyline(e.rpm, e.hi, { color: CHART_COLORS.text, width: 1.6 });
        c.polyline(e.rpm, e.lo, { color: CHART_COLORS.text, width: 1.6, alpha: 0.8 });
        c.polyline([e.base, e.base], [T_MIN, T_MAX], {
          color: CHART_COLORS.field,
          width: 1,
          dash: [3, 3],
          alpha: 0.8,
        });
        // trail, oldest faint
        for (let i = 1; i < trail.length; i++) {
          const a = trail[i - 1];
          const b = trail[i];
          if (!a || !b) continue;
          const age = (nowS - b.t) / TRAIL_S;
          c.polyline([a.rpm, b.rpm], [a.tq, b.tq], {
            color: b.regen ? CHART_COLORS.regen : CHART_COLORS.power,
            width: 2,
            alpha: 0.7 * (1 - age),
          });
        }
        const col = s.pDc < 0 ? CHART_COLORS.regen : CHART_COLORS.power;
        c.ring(s.rpm, s.tMotor, 7, col, 0.35);
        c.dot(s.rpm, s.tMotor, col, 3.5);
      });
      ctx.font = theme.font;
      ctx.fillStyle = CHART_COLORS.field;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('base speed', c.X(e.base) + 3, plot.t + 2);
      ctx.fillStyle = CHART_COLORS.muted;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText('regen', plot.r - 3, plot.b - 2);
      ctx.fillText(`η ${fmt(s.eff * 100, 1)} %`, plot.r - 3, c.Y(0) - 3);
    },
  };
}
