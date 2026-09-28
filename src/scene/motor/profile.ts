/**
 * Cross-section helpers for the motor (TECH_SPEC §5.2–5.3). All motor parts are built in
 * full-scale metres with the machine axis along local +x (output side +x).
 *
 * Angle convention (used everywhere, also by the field visuals): a cross-section point at
 * mechanical angle φ and radius r sits at (y, z) = (r cos φ, r sin φ). φ = 0 is straight up and
 * φ grows towards +z, which is exactly what `object.rotation.x = φ` does. The rotor turns by
 * rotation.x = θ_mech; the stator winding is laid out so that phase A's magnetic axis is at φ = 0.
 */
import { ExtrudeGeometry, Matrix4, Shape, Path, type BufferGeometry } from 'three';
import { GEOMETRY, PM } from '@/config/motor';

/** Maps ExtrudeGeometry output (shape x, shape y, depth z) to (y, z, x): the depth becomes the axis. */
export const SHAPE_TO_AXIAL = new Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1);

export const SLOT_PITCH = (2 * Math.PI) / GEOMETRY.slots;

/**
 * Mechanical angle of stator slot 0's centre. The winding sequence per pole pair is
 * A, −C, B, −A, C, −B (3 slots each, 20° electrical per slot). The "go" conductors of A sit in
 * slots 0–2 (centre: slot 1), so A's magnetic axis is 90° electrical ahead of slot 1. Choosing
 * slot 0 at −(Δ + 90°/p) puts that axis at φ = 0.
 */
export const SLOT0_ANGLE = -(SLOT_PITCH + Math.PI / 2 / PM.polePairs);

export function slotAngle(k: number): number {
  return SLOT0_ANGLE + k * SLOT_PITCH;
}

export type PhaseIndex = 0 | 1 | 2;
/** Phase and sign of stator slot k (§5.2 pattern A, −C, B, −A, C, −B). */
export function slotPhase(k: number): { phase: PhaseIndex; sign: 1 | -1 } {
  const g = Math.floor((((k % GEOMETRY.slots) + GEOMETRY.slots) % GEOMETRY.slots) / 3) % 6;
  const table: { phase: PhaseIndex; sign: 1 | -1 }[] = [
    { phase: 0, sign: 1 },
    { phase: 2, sign: -1 },
    { phase: 1, sign: 1 },
    { phase: 0, sign: -1 },
    { phase: 2, sign: 1 },
    { phase: 1, sign: -1 },
  ];
  return table[g] ?? { phase: 0, sign: 1 };
}

/** Shape-plane coordinates of (r, φ). */
export function polar(r: number, phi: number): [number, number] {
  return [r * Math.cos(phi), r * Math.sin(phi)];
}

/** Extrude a cross-section along the axis, centred on x = 0. */
export function extrudeAxial(shape: Shape, length: number, curveSegments = 96): BufferGeometry {
  const g = new ExtrudeGeometry(shape, { depth: length, bevelEnabled: false, curveSegments });
  g.translate(0, 0, -length / 2);
  g.applyMatrix4(SHAPE_TO_AXIAL);
  g.computeVertexNormals();
  return g;
}

/** Annulus (optionally an angular sector) as a Shape. */
export function annulusShape(rIn: number, rOut: number, phi0 = 0, phi1 = 2 * Math.PI): Shape {
  const s = new Shape();
  const full = phi1 - phi0 >= 2 * Math.PI - 1e-9;
  if (full) {
    s.absarc(0, 0, rOut, 0, 2 * Math.PI, false);
    if (rIn <= 0) return s;
    const hole = new Path();
    hole.absarc(0, 0, rIn, 0, 2 * Math.PI, true);
    s.holes.push(hole);
    return s;
  }
  s.absarc(0, 0, rOut, phi0, phi1, false);
  s.absarc(0, 0, rIn, phi1, phi0, true);
  s.closePath();
  return s;
}

/** Twist vertices about the x axis by radPerM · x (skewed bars, helical teeth). */
export function twistAboutX(g: BufferGeometry, radPerM: number): BufferGeometry {
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const a = radPerM * x;
    const c = Math.cos(a);
    const s = Math.sin(a);
    pos.setXYZ(i, x, y * c - z * s, y * s + z * c);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}
