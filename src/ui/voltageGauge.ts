/**
 * Voltage gauge (TECH_SPEC §10.3): a semicircle meter of the phase voltage |v| against V_max,
 * with a ghost needle for the no-load back-EMF ω_e ψ_m (Magnet only: what the magnets alone
 * would induce with no d-current). When the ghost passes V_max the gauge flashes violet (at most
 * 2 Hz): the controller must weaken the field. Sits under the chart in the chart card.
 */
import { fmt } from '@/physics/format';
import type { SimSnapshot } from '@/physics/types';
import { CHART_COLORS } from '@/ui/charts/types';
import { h } from '@/ui/dom';

export const METER_SIZE = { width: 164, height: 108 } as const;
const FULL = 1.35;

export interface Meter {
  readonly el: HTMLElement;
  draw(s: SimSnapshot, nowS: number): void;
  describe(s: SimSnapshot): string;
  resize(dpr: number): void;
}

/** DPR-aware canvas for the small meters. */
export function meterCanvas(label: string): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  resize(dpr: number): void;
} {
  const canvas = h('canvas.meter-canvas', { role: 'img', 'aria-label': label });
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const resize = (dpr: number): void => {
    canvas.width = Math.round(METER_SIZE.width * dpr);
    canvas.height = Math.round(METER_SIZE.height * dpr);
    canvas.style.width = `${METER_SIZE.width}px`;
    canvas.style.height = `${METER_SIZE.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize(Math.min(window.devicePixelRatio || 1, 2));
  return { canvas, ctx, resize };
}

export function createVoltageGauge(): Meter {
  const { canvas, ctx, resize } = meterCanvas('Voltage gauge');
  const el = h('div.meter', {}, canvas);
  const W = METER_SIZE.width;
  const H = METER_SIZE.height;
  const cx = W / 2;
  const cy = H - 22;
  const r = 58;
  const ang = (u: number): number => Math.PI + Math.min(Math.max(u / FULL, 0), 1) * Math.PI;

  const needle = (u: number, color: string, width: number, dash: number[] = []): void => {
    const a = ang(u);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * (r - 3), cy + Math.sin(a) * (r - 3));
    ctx.stroke();
    ctx.restore();
  };

  return {
    el,
    resize,
    draw(s, nowS) {
      const vMax = Math.max(s.vMax, 1);
      const ghost = s.motor === 'pm' ? s.emfNoLoad / vMax : 0;
      const weak = ghost > 1;
      const flash = weak ? 0.5 + 0.5 * Math.sin(nowS * 2 * Math.PI * 2) : 0;
      ctx.clearRect(0, 0, W, H);
      ctx.lineCap = 'butt';
      // scale arc: 0…V_max muted, V_max…full alarm
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.arc(cx, cy, r, ang(0), ang(1));
      ctx.stroke();
      ctx.strokeStyle = weak ? `rgba(183,148,255,${0.45 + 0.55 * flash})` : 'rgba(255,77,94,0.45)';
      ctx.beginPath();
      ctx.arc(cx, cy, r, ang(1), ang(FULL));
      ctx.stroke();
      // live |v| arc
      ctx.strokeStyle = s.voltageLimited ? CHART_COLORS.field : CHART_COLORS.text;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, r - 7, ang(0), ang(s.vMag / vMax));
      ctx.stroke();
      // V_max tick
      const a1 = ang(1);
      ctx.strokeStyle = CHART_COLORS.field;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a1) * (r - 10), cy + Math.sin(a1) * (r - 10));
      ctx.lineTo(cx + Math.cos(a1) * (r + 6), cy + Math.sin(a1) * (r + 6));
      ctx.stroke();
      if (ghost > 0.01) needle(ghost, CHART_COLORS.field, 1.5, [3, 2]);
      needle(s.vMag / vMax, CHART_COLORS.text, 2);
      ctx.fillStyle = CHART_COLORS.text;
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, 2 * Math.PI);
      ctx.fill();

      ctx.font = '9px "JetBrains Mono", ui-monospace, monospace';
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillStyle = CHART_COLORS.muted;
      ctx.fillText('|v|', 4, 3);
      ctx.textAlign = 'right';
      ctx.fillStyle = s.voltageLimited ? CHART_COLORS.field : CHART_COLORS.text;
      ctx.fillText(`${fmt(s.vMag)} / ${fmt(s.vMax)} V`, W - 4, 3);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = weak ? CHART_COLORS.field : CHART_COLORS.dim;
      ctx.fillText(
        ghost > 0.01 ? `magnets alone: ${fmt(s.emfNoLoad)} V` : 'no magnets: no back-EMF at 0 A',
        cx,
        H - 3,
      );
    },
    describe(s) {
      return (
        `Phase voltage ${fmt(s.vMag)} of ${fmt(s.vMax)} volts` +
        (s.motor === 'pm' ? `; magnets alone would induce ${fmt(s.emfNoLoad)} volts` : '')
      );
    },
  };
}
