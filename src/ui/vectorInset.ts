/**
 * dq-plane inset (TECH_SPEC §10.3): i_d horizontal, i_q vertical. The current-limit circle
 * |i| = I_max, the voltage-limit ellipse at the present speed (every point inside it can be
 * driven with the available voltage), the current vector and the operating point with a short
 * trail. Resistance is neglected for the ellipse:
 *   Magnet:    (L_d i_d + ψ_m)² + (L_q i_q)² = (V_max / ω_e)²  (centre −ψ_m/L_d, shrinks with speed)
 *   Induction: (L_s i_d)² + (σL_s i_q)² = (V_max / ω_e)²
 * As speed rises the ellipse closes in; in field weakening the point rides its edge, sliding left
 * (more negative i_d). The ellipse flashes violet while the voltage limit binds.
 */
import { IM, PM } from '@/config/motor';
import { fmt } from '@/physics/format';
import type { SimSnapshot } from '@/physics/types';
import { CHART_COLORS } from '@/ui/charts/types';
import { h } from '@/ui/dom';
import { METER_SIZE, meterCanvas, type Meter } from '@/ui/voltageGauge';

const TRAIL = 40;
const LS = IM.lM + IM.lLs;
const SIGMA_LS = LS - (IM.lM * IM.lM) / (IM.lM + IM.lLr);

export function createVectorInset(): Meter {
  const { canvas, ctx, resize } = meterCanvas('dq current diagram');
  const el = h('div.meter', {}, canvas);
  const W = METER_SIZE.width;
  const H = METER_SIZE.height;
  const trail: [number, number][] = [];

  return {
    el,
    resize,
    draw(s: SimSnapshot, nowS: number) {
      const iMax = s.motor === 'pm' ? PM.currentMaxA : IM.currentMaxA;
      // 1:1 aspect, i_q ±1.1 I_max; the whole current circle at the right, the d-axis to the left
      const top = 4;
      const bottom = H - 4;
      const k = (bottom - top) / (2.2 * iMax);
      const ox = W - 6 - iMax * k;
      const oy = (top + bottom) / 2;
      const X = (id: number): number => ox + id * k;
      const Y = (iq: number): number => oy - iq * k;
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, top - 2, W, bottom - top + 4);
      ctx.clip();
      // axes
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, Math.round(oy) + 0.5);
      ctx.lineTo(W, Math.round(oy) + 0.5);
      ctx.moveTo(Math.round(ox) + 0.5, top);
      ctx.lineTo(Math.round(ox) + 0.5, bottom);
      ctx.stroke();
      // current-limit circle
      ctx.strokeStyle = 'rgba(232,236,245,0.5)';
      ctx.beginPath();
      ctx.arc(X(0), Y(0), iMax * k, 0, 2 * Math.PI);
      ctx.stroke();
      // voltage-limit ellipse
      const w = Math.abs(s.omegaE);
      if (w > 1) {
        const psi = s.vMax / w;
        const [cx, a, b] =
          s.motor === 'pm'
            ? [-PM.psiM / PM.lD, psi / PM.lD, psi / PM.lQ]
            : [0, psi / LS, psi / SIGMA_LS];
        if (a * k < 4000) {
          const flash = s.voltageLimited ? 0.6 + 0.4 * Math.sin(nowS * 2 * Math.PI * 2) : 0.55;
          ctx.strokeStyle = CHART_COLORS.field;
          ctx.globalAlpha = flash;
          ctx.lineWidth = s.voltageLimited ? 1.8 : 1.2;
          ctx.beginPath();
          ctx.ellipse(X(cx), Y(0), a * k, b * k, 0, 0, 2 * Math.PI);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
      // trail and the current vector
      const last = trail[trail.length - 1];
      if (!last || Math.hypot(last[0] - s.id, last[1] - s.iq) > iMax * 0.004) {
        trail.push([s.id, s.iq]);
        if (trail.length > TRAIL) trail.shift();
      }
      const col = s.pDc < 0 ? CHART_COLORS.regen : CHART_COLORS.power;
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      trail.forEach(([id, iq], i) => (i ? ctx.lineTo(X(id), Y(iq)) : ctx.moveTo(X(id), Y(iq))));
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(X(0), Y(0));
      ctx.lineTo(X(s.id), Y(s.iq));
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(X(s.id), Y(s.iq), 3.5, 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();

      ctx.font = '9px "JetBrains Mono", ui-monospace, monospace';
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillStyle = CHART_COLORS.muted;
      ctx.textAlign = 'right';
      ctx.fillText('i_q', Math.round(ox) - 3, top);
      ctx.textAlign = 'left';
      ctx.fillText('i_d', 3, oy + 2);
      ctx.fillText('dq', 3, 2);
      ctx.textAlign = 'right';
      ctx.fillStyle = s.id < 0 && s.voltageLimited ? CHART_COLORS.field : CHART_COLORS.text;
      ctx.fillText(`i_d ${fmt(s.id)} A`, W - 4, H - 12);
    },
    describe(s) {
      return (
        `Current vector: d ${fmt(s.id)} amps, q ${fmt(s.iq)} amps` +
        (s.voltageLimited ? ', on the voltage-limit ellipse (field weakening)' : '')
      );
    },
  };
}
