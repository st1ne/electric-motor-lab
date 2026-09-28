/**
 * What the field visuals show this frame (TECH_SPEC §6.6, §10.1). Every field effect reads this,
 * so the arrow, the gap arrows, the flux lines, the hologram and the scope stay phase-locked.
 *   Normal:       θ = θ_field (stator flux linkage: magnets + armature), strength = |ψ| / ψ_ref
 *   Only phase A: the stator field of phase A alone — fixed on the A axis (θ = 0 electrical),
 *                 strength ∝ i_a, flipping to θ = π when i_a < 0: a pulsating, not a rotating,
 *                 field. The rotor keeps turning; only the picture changes.
 * Angles are electrical; the mechanical direction of a north pole is θ / p (+ k·2π/p).
 */
import { IM, PM } from '@/config/motor';
import type { FrameContext } from '@/scene/module';

export interface FieldView {
  /** electrical field angle, rad */
  thetaElec: number;
  /** ≥ 0, ~1 at rated flux */
  strength: number;
  /** pole pairs of the machine on the bench */
  p: number;
  /** mechanical angle of a north pole of the field */
  poleMech: number;
  /** rotor d-axis (mechanical, visual) */
  rotorMech: number;
  /** 0…1 opacity factor: field pictures fade out when the field turns too fast to follow */
  visible: number;
}

const view: FieldView = {
  thetaElec: 0,
  strength: 0,
  p: 3,
  poleMech: 0,
  rotorMech: 0,
  visible: 1,
};

/** Displayed field rotation above which the picture strobes (rev/s on screen). */
const MAX_SHOWN_HZ = 4;

export function fieldView(ctx: FrameContext): FieldView {
  const s = ctx.snapshot;
  const a = ctx.angles;
  const p = s.motor === 'pm' ? PM.polePairs : IM.polePairs;
  view.p = p;
  if (ctx.ui.onlyPhaseA) {
    const iRef = s.motor === 'pm' ? PM.currentMaxA : IM.currentMaxA;
    view.thetaElec = a.ia >= 0 ? 0 : Math.PI;
    view.strength = Math.min((1.6 * Math.abs(a.ia)) / iRef, 1.3);
  } else {
    view.thetaElec = a.thetaField;
    view.strength = a.fieldStrength;
  }
  view.poleMech = view.thetaElec / p;
  view.rotorMech = ctx.mechAngle;
  const shownHz = Math.abs(s.omegaE) / (2 * Math.PI * p) / Math.max(a.slowMo, 1);
  view.visible = ctx.realTime ? 0 : 1 - Math.min(Math.max((shownHz - MAX_SHOWN_HZ) / 4, 0), 1);
  return view;
}
