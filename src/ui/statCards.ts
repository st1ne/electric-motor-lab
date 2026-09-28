/**
 * Stat cards (TECH_SPEC §3.3): MOTOR rpm · TORQUE N·m · POWER kW with sub-lines.
 *   Magnet:    "138 km/h · gear 9.0 : 1"      Induction: "slip 2.1 % · 138 km/h"
 *   TORQUE:    shaft torque, sub "1.67 kN·m at the wheels"
 *   POWER:     shaft power, sub "efficiency 95.8 %"; in regen the DC power flowing back, green,
 *              with a leading minus and "into the battery".
 * Targets are sampled at 10 Hz and tweened over 250 ms; tabular digits in fixed-width boxes.
 */
import { VEHICLE } from '@/config/vehicle';
import { fmt } from '@/physics/format';
import type { SimSnapshot } from '@/physics/types';
import { h, setText } from '@/ui/dom';
import { createTweens } from '@/util/tween';

const TWEEN_S = 0.25;
const SAMPLE_S = 0.1;

interface Card {
  el: HTMLElement;
  value: HTMLElement;
  unit: HTMLElement;
  sub: HTMLElement;
}

function card(label: string, unit: string): Card {
  const value = h('span.stat-value.mono', {}, '0');
  const unitEl = h('span.stat-unit', {}, unit);
  const sub = h('div.stat-sub.mono', {}, '');
  const el = h(
    'div.stat.glass',
    { role: 'group', 'aria-label': label },
    h('div.stat-label', {}, label),
    h('div.stat-main', {}, value, unitEl),
    sub,
  );
  return { el, value, unit: unitEl, sub };
}

export interface StatCards {
  readonly el: HTMLElement;
  update(dt: number, s: SimSnapshot): void;
}

export function createStatCards(): StatCards {
  const motor = card('MOTOR', 'rpm');
  const torque = card('TORQUE', 'N·m');
  const power = card('POWER', 'kW');
  const el = h('div.stats', {}, motor.el, torque.el, power.el);
  const tweens = createTweens();
  const shown = { rpm: 0, torque: 0, power: 0 };
  let timer = SAMPLE_S;

  return {
    el,
    update(dt, s) {
      tweens.update(dt);
      timer += dt;
      if (timer >= SAMPLE_S) {
        timer = 0;
        const regen = s.pDc < -500 && s.tMotor < 0;
        const targets = {
          rpm: s.rpm,
          torque: s.tShaft,
          power: regen ? s.pDc / 1e3 : s.pShaft / 1e3,
        };
        for (const k of ['rpm', 'torque', 'power'] as const) {
          tweens.to(k, shown[k], targets[k], TWEEN_S, (v) => (shown[k] = v));
        }
        const kmh = fmt(s.kmh);
        setText(
          motor.sub,
          s.motor === 'pm'
            ? `${kmh} km/h · gear ${VEHICLE.gearRatio.toFixed(1)} : 1`
            : `slip ${fmt(100 * s.slip, 1)} % · ${kmh} km/h`,
        );
        setText(torque.sub, `${fmt(s.tWheel / 1e3, 2)} kN·m at the wheels`);
        power.el.classList.toggle('regen', regen);
        setText(
          power.sub,
          regen
            ? 'into the battery'
            : s.eff > 0
              ? `efficiency ${fmt(100 * s.eff, 1)} %`
              : 'efficiency –',
        );
        motor.el.classList.toggle('limited', s.derate < 1);
      }
      setText(motor.value, fmt(shown.rpm));
      setText(torque.value, fmt(shown.torque));
      setText(power.value, fmt(shown.power, Math.abs(shown.power) < 10 ? 1 : 0));
    },
  };
}
