/**
 * Explanation templates, one per regime (TECH_SPEC §3.5), wording as in the spec. Concept words
 * are coloured: field violet, phase A/B/C in phase colours, power amber, regen green, heat orange.
 * Every number comes from the SimSnapshot. Returns an HTML string (numbers only are interpolated).
 */
import { IM, PM } from '@/config/motor';
import { DRIVER } from '@/config/vehicle';
import { fmt } from '@/physics/format';
import type { SimSnapshot } from '@/physics/types';

const TAU = 2 * Math.PI;

const field = '<span class="w-field">field</span>';
const power = '<span class="w-power">power</span>';
const b = (x: string): string => `<strong class="mono">${x}</strong>`;

export function fieldRevPerSecond(s: SimSnapshot): number {
  const p = s.motor === 'pm' ? PM.polePairs : IM.polePairs;
  return Math.abs(s.omegaE) / (TAU * p);
}

export function renderTemplate(s: SimSnapshot): string {
  const kmh = fmt(s.kmh);
  const rpm = fmt(s.rpm);
  const fe = fmt(Math.abs(s.omegaE) / TAU);
  const kw = (w: number): string => fmt(w / 1e3);
  switch (s.regime) {
    case 'STANDSTILL':
      return `Motor stopped. No current, no ${field}. Press ${b('Launch')} or push the throttle.`;
    case 'CONSTANT_TORQUE':
      return (
        `Three currents of ${b(`${fmt(s.iPeak)} A`)} peak, each shifted by 120°, add up to one ` +
        `${field} that turns at ${b(`${fe} Hz`)}. The rotor's magnets are pulled along ` +
        `${b(`${fmt((Math.abs(s.loadAngle) * 180) / Math.PI)}°`)} behind it: ` +
        `${b(`${fmt(s.tMotor)} N·m`)}, all the way up to base speed.`
      );
    case 'CRUISE':
      return (
        `Cruising at ${b(`${kmh} km/h`)} takes only ${b(`${kw(s.pShaft)} kW`)}. The currents are ` +
        `small (${fmt(s.iPeak)} A), so almost nothing is lost: ${b(`${fmt(100 * s.eff, 1)} %`)} ` +
        `of the battery's ${power} turns the wheels.`
      );
    case 'FIELD_WEAKENING':
      return (
        `At ${b(`${rpm} rpm`)} the spinning magnets would generate ${b(`${fmt(s.emfNoLoad)} V`)}, ` +
        `more than the battery's ${b(`${fmt(s.vMax)} V`)}. The controller pushes ` +
        `${b(`${fmt(Math.abs(s.id))} A`)} against its own magnets to weaken the ${field} and keep ` +
        `accelerating. Power stays near ${b(`${kw(s.pShaft)} kW`)} while torque falls.`
      );
    case 'INDUCTION_SLIP': {
      const fsync = (Math.abs(s.omegaE) / IM.polePairs) * (30 / Math.PI);
      return (
        `No magnets here. The ${field} turns at ${b(`${fmt(fsync)} rpm`)}, the cage at ` +
        `${b(`${rpm} rpm`)}: ${b(`${fmt(100 * s.slip, 1)} %`)} slower. That lag makes the bars cut ` +
        `through the ${field}, which induces ${b(`${fmt(s.barCurrentA)} A`)} in them. The induced ` +
        `current is what gets pulled. No lag, no current, no torque.`
      );
    }
    case 'REGEN': {
      // below the fade speed the motor has too little speed to recover much: the pads take over
      if (s.kmh < DRIVER.regenFadeKmh && s.frictionBrakeW > -s.pDc)
        return (
          `Almost stopped. Below ${b(`${fmt(DRIVER.regenFadeKmh)} km/h`)} there is too little ` +
          `speed left to generate much, so the motor's braking fades out and the friction ` +
          `brakes finish the stop (${b(`${kw(s.frictionBrakeW)} kW`)}).`
        );
      const pads =
        s.frictionBrakeW < 500
          ? 'The friction brakes stay off.'
          : `The friction brakes handle only ${b(`${kw(s.frictionBrakeW)} kW`)}.`;
      return (
        `Braking with the motor. The rotor now runs ${b('ahead')} of the ${field}, so the motor ` +
        `works as a generator: ${b(`${kw(-s.pDc)} kW`)} flows back into the battery. ${pads}`
      );
    }
    case 'COAST_PM':
      return (
        `Coasting at ${b(`${kmh} km/h`)} with no current. The magnets still sweep past the steel ` +
        `stator and waste ${b(`${fmt(s.dragPmW)} W`)} as <span class="w-heat">heat</span>. An ` +
        `induction motor with no current would waste only ${b(`${fmt(s.dragImW)} W`)}.`
      );
    case 'COAST_IM':
      return (
        `Coasting with no current means no ${field} at all. The cage spins freely and only the ` +
        `bearings and air cost ${b(`${fmt(s.dragImW)} W`)}. That's why many dual-motor EVs put ` +
        `an induction motor on the axle that often idles.`
      );
    case 'DERATE':
      return (
        `Winding at ${b(`${fmt(s.tWinding)} °C`)}, magnets at ${b(`${fmt(s.tRotor)} °C`)}. The ` +
        `controller trims torque to ${b(`${fmt(s.tMax)} N·m`)} to protect them.`
      );
    case 'TOP_SPEED':
      return (
        `Top speed ${b(`${kmh} km/h`)} (${b(`${rpm} rpm`)}). The motor could spin a bit faster; ` +
        `the software limit is here.`
      );
  }
}

/** "Field slowed ×{S}; in real time it turns {fe} times a second." */
export function renderSlowMoTail(s: SimSnapshot, slowMo: number): string {
  if (slowMo <= 1 || Math.abs(s.omegaE) < 1e-3) return '';
  return (
    `<span class="tail"><span class="w-field">Field</span> ` +
    `slowed ${b(`×${fmt(slowMo)}`)}; in real time it turns ${b(fmt(fieldRevPerSecond(s)))} times ` +
    `a second.</span>`
  );
}

/**
 * Induction lap counter (§10.2): the field gains one lap on the cage every 1 / (s · f_sync)
 * seconds (real time), i.e. S times longer on screen.
 */
export function renderLapCounter(s: SimSnapshot, slowMo: number, laps: number): string {
  if (s.motor !== 'im' || Math.abs(s.slip) < 5e-4 || s.iPeak < 1) return '';
  const gainHz = Math.abs(s.slip) * fieldRevPerSecond(s); // laps per real second
  const period = Math.max(slowMo, 1) / gainHz;
  const every = period >= 10 ? fmt(period) : fmt(period, 1);
  return (
    `<span class="tail">The <span class="w-field">field</span> has gained ` +
    `${b(fmt(Math.abs(laps), Math.abs(laps) < 10 ? 2 : 1))} laps on the rotor: one lap every ${b(`${every} s`)}` +
    `${slowMo > 1 ? ' (slowed)' : ''}.</span>`
  );
}

/** Plain-text version for the aria-live region. */
export function toPlainText(html: string): string {
  return html.replace(/<[^>]+>/g, '');
}
