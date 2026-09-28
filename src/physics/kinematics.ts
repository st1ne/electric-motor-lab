/**
 * Field and phase kinematics in DISPLAY time (TECH_SPEC §6.6, §6.11).
 *   dt_d = dt_real / S (S = slow-mo factor); frozen → dt_d = 0
 *   θ_m += ω_m dt_d,  θ_re = p θ_m
 *   IPM: dq frame θ = θ_re.  IM: θ_e += ω_e dt_d (runs ahead of p θ_m by the slip).
 *   Current vector θ_i = θ + atan2(i_q, i_d); i_a,b,c = |I| cos(θ_i − 0, 2π/3, −2π/3)
 *   Air-gap field θ_field = θ + atan2(ψ_q, ψ_d): the stator flux linkage, i.e. the magnet field
 *   (IPM: ψ_m on d) combined with the armature field by their magnitudes, so the arrow sits
 *   between the rotor d-axis and the current vector.
 *   Auto slow-mo: S → max(1, f_field,mech / 0.4) with a 1 s log-space lerp; the label snaps to
 *   the nearest 1/2/5 step.
 */
import { IM, PM, V_DC_NOM, type MotorKind } from '@/config/motor';
import { IM_LS, IM_SIGMA } from '@/physics/induction';
import { advanceCarrier, carrierValue, svpwmDuty, switchStates } from '@/physics/pwm';
import type { DisplayAngles, SimSnapshot } from '@/physics/types';

const TAU = 2 * Math.PI;
export const AUTO_FIELD_REV_PER_S = 0.4;

export type SlowMoSetting = 'auto' | 100 | 1000 | 10000 | 1;
export const SLOW_MO_STEPS: readonly SlowMoSetting[] = ['auto', 100, 1000, 10000, 1];

export function polePairs(kind: MotorKind): number {
  return kind === 'pm' ? PM.polePairs : IM.polePairs;
}

/** Mechanical rev/s of the rotating field. */
export function fieldRevPerS(s: Pick<SimSnapshot, 'omegaE' | 'motor'>): number {
  return Math.abs(s.omegaE) / (TAU * polePairs(s.motor));
}

export function autoSlowMoTarget(s: Pick<SimSnapshot, 'omegaE' | 'motor'>): number {
  return Math.max(1, fieldRevPerS(s) / AUTO_FIELD_REV_PER_S);
}

/** Nearest 1/2/5 × 10^k step (in log space). */
export function snap125(x: number): number {
  if (x <= 1) return 1;
  const e = Math.floor(Math.log10(x));
  const base = 10 ** e;
  let best = base;
  for (const m of [1, 2, 5, 10]) {
    const c = m * base;
    if (Math.abs(Math.log(c / x)) < Math.abs(Math.log(best / x))) best = c;
  }
  return best;
}

/** Stator flux linkage (ψ_d, ψ_q) in the dq frame. */
export function fluxDq(kind: MotorKind, id: number, iq: number): [number, number] {
  if (kind === 'pm') return [PM.lD * id + PM.psiM, PM.lQ * iq];
  return [IM_LS * id, IM_SIGMA * IM_LS * iq];
}

/** Reference flux for the field strength: magnets (IPM), rated magnetizing flux (IM). */
export function fluxRef(kind: MotorKind): number {
  return kind === 'pm' ? PM.psiM : IM_LS * IM.idRatedA;
}

export interface Kinematics {
  readonly angles: DisplayAngles;
  /** current effective slow-mo factor S */
  readonly slowMo: number;
  /** readable label value (1/2/5 steps) */
  readonly slowMoLabel: number;
  advance(frameDt: number, s: SimSnapshot, setting: SlowMoSetting, frozen: boolean): DisplayAngles;
  reset(): void;
}

export function createKinematics(): Kinematics {
  let logS = 0;
  let initialized = false;
  let carrierPhase = 0;
  let thetaSyncRel = 0; // θ_e − θ_re (IM slip angle accumulator)
  const angles: DisplayAngles = {
    tDisplay: 0,
    slowMo: 1,
    thetaMech: 0,
    thetaElecRotor: 0,
    thetaSync: 0,
    thetaCurrent: 0,
    thetaField: 0,
    fieldStrength: 0,
    ia: 0,
    ib: 0,
    ic: 0,
    duty: [0.5, 0.5, 0.5],
    carrier: 0,
    switchStates: [false, true, false, true, false, true],
    lapsGained: 0,
  };

  return {
    angles,
    get slowMo() {
      return Math.exp(logS);
    },
    get slowMoLabel() {
      return snap125(Math.exp(logS));
    },
    advance(frameDt, s, setting, frozen) {
      const p = polePairs(s.motor);
      if (setting === 'auto') {
        const target = Math.log(autoSlowMoTarget(s));
        if (!initialized) logS = target;
        else logS += (target - logS) * Math.min(frameDt / 1, 1);
      } else {
        logS = Math.log(setting);
      }
      initialized = true;
      const S = Math.exp(logS);
      const dtd = frozen ? 0 : frameDt / S;
      angles.slowMo = S;
      angles.tDisplay += dtd;

      angles.thetaMech = (angles.thetaMech + s.omegaM * dtd) % TAU;
      angles.thetaElecRotor = p * angles.thetaMech;
      if (s.motor === 'im') {
        thetaSyncRel += (s.omegaE - p * s.omegaM) * dtd;
        angles.lapsGained = thetaSyncRel / (TAU * p);
      } else {
        thetaSyncRel = 0;
      }
      angles.thetaSync = angles.thetaElecRotor + thetaSyncRel;

      const iMag = Math.hypot(s.id, s.iq);
      const gamma = iMag > 1e-6 ? Math.atan2(s.iq, s.id) : 0;
      angles.thetaCurrent = angles.thetaSync + gamma;
      const [psiD, psiQ] = fluxDq(s.motor, s.id, s.iq);
      angles.thetaField = angles.thetaSync + Math.atan2(psiQ, psiD);
      angles.fieldStrength = Math.hypot(psiD, psiQ) / fluxRef(s.motor);

      angles.ia = iMag * Math.cos(angles.thetaCurrent);
      angles.ib = iMag * Math.cos(angles.thetaCurrent - TAU / 3);
      angles.ic = iMag * Math.cos(angles.thetaCurrent + TAU / 3);

      svpwmDuty(s.vd, s.vq, angles.thetaSync, s.vDc > 1 ? s.vDc : V_DC_NOM, angles.duty);
      carrierPhase = advanceCarrier(carrierPhase, dtd);
      angles.carrier = carrierValue(carrierPhase);
      switchStates(angles.duty, angles.carrier, angles.switchStates);
      return angles;
    },
    reset() {
      initialized = false;
      thetaSyncRel = 0;
      angles.lapsGained = 0;
    },
  };
}
