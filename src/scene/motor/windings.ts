/**
 * Hairpin winding (TECH_SPEC §5.2, §6.6), the heart of the field story.
 *  - 54 slots × 4 layers of rectangular copper, full pitch (9 slots), pattern per pole pair
 *    A, −C, B, −A, C, −B with 3 slots each (see profile.ts for the angle convention).
 *  - One template geometry per hairpin pair: legs in slot k (layers 1, 3) and slot k + 9
 *    (layers 2, 4), crown arcs at the non-drive end (−x) and twisted weld-end bends (+x).
 *    It is instanced 18× per phase (every slot is the base of one pair), so the whole winding is
 *    three draw calls, one per phase, each with its own material.
 *  - Coil glow: emissive in the phase colour ∝ |i_phase| / I_max (§6.6).
 *  - Lead cables leave the weld end at the top towards the inverter AC bus bars.
 */
import {
  BoxGeometry,
  CatmullRomCurve3,
  Color,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  TubeGeometry,
  Vector3,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GEOMETRY, IM, PM } from '@/config/motor';
import { PALETTE, PHASE_COLORS } from '@/config/theme';
import { makeMaterial } from '@/scene/materials';
import { disposeTree, type FrameContext, type SceneModule } from '@/scene/module';
import { SLOT_PITCH, slotAngle, slotPhase, type PhaseIndex } from '@/scene/motor/profile';
import { smoothstep } from '@/util/math';

const G = GEOMETRY;
const SPAN = 9; // full pitch: 54 slots / 6 poles
const HALF_L = G.stackLength / 2;
const BAR_RADIAL = 0.0038;
const BAR_TANG = 0.0036;
const TUBE_R = 0.0019;

/** Radius of layer 1…4 (layer 1 innermost, next to the air gap). */
export function layerRadius(layer: number): number {
  const pitch = G.slotDepth / G.hairpinLayers;
  return G.statorBoreR + pitch * (layer - 0.5);
}

const at = (x: number, r: number, phi: number): Vector3 =>
  new Vector3(x, r * Math.cos(phi), r * Math.sin(phi));

/** Straight bar of one layer in the slot at angle phi, overhanging the stack by ext0/ext1. */
function bar(layer: number, phi: number, ext0: number, ext1: number): BufferGeometry {
  const len = G.stackLength + ext0 + ext1;
  const g = new BoxGeometry(len, BAR_RADIAL, BAR_TANG);
  g.translate((ext1 - ext0) / 2, layerRadius(layer), 0);
  g.applyMatrix4(new Matrix4().makeRotationX(phi));
  return g;
}

/** Tube along a curve on the winding cylinder: from (x0, r0, φ0) to (x1, r1, φ1) with an axial bulge. */
function endArc(
  x0: number,
  xPeak: number,
  r0: number,
  r1: number,
  phi0: number,
  phi1: number,
  n = 18,
): BufferGeometry {
  const pts: Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const bulge = Math.sin(Math.PI * t);
    pts.push(
      at(x0 + (xPeak - x0) * bulge, r0 + (r1 - r0) * t + 0.004 * bulge, phi0 + (phi1 - phi0) * t),
    );
  }
  return new TubeGeometry(new CatmullRomCurve3(pts), n * 2, TUBE_R, 5, false);
}

/** Weld-end bend: leg leaves the stack, bends half a span tangentially, ends in a weld tip. */
function weldBend(r: number, phi: number, dir: number): BufferGeometry {
  const x0 = HALF_L + 0.008;
  const pts = [
    at(x0 - 0.001, r, phi),
    at(x0 + 0.006, r, phi + dir * 0.4 * SLOT_PITCH),
    at(x0 + 0.014, r, phi + dir * 2.4 * SLOT_PITCH),
    at(x0 + 0.02, r, phi + dir * 4.3 * SLOT_PITCH),
    at(x0 + 0.026, r, phi + dir * 4.5 * SLOT_PITCH),
  ];
  return new TubeGeometry(new CatmullRomCurve3(pts), 12, TUBE_R, 5, false);
}

/** One hairpin pair with its base slot at φ = 0 and the partner slot at +9 pitches. */
function hairpinTemplate(): BufferGeometry {
  const phiB = SPAN * SLOT_PITCH;
  const parts: BufferGeometry[] = [
    bar(1, 0, 0.006, 0.008),
    bar(3, 0, 0.006, 0.008),
    bar(2, phiB, 0.006, 0.008),
    bar(4, phiB, 0.006, 0.008),
    // crown end (−x): layer 1 → 2 and layer 3 → 4 over the full pitch
    endArc(-HALF_L - 0.005, -HALF_L - G.endTurnReach, layerRadius(1), layerRadius(2), 0, phiB),
    endArc(
      -HALF_L - 0.005,
      -HALF_L - G.endTurnReach * 0.82,
      layerRadius(3),
      layerRadius(4),
      0,
      phiB,
    ),
    // weld end (+x): neighbouring layers bend in opposite directions and meet their partners
    weldBend(layerRadius(1), 0, 1),
    weldBend(layerRadius(3), 0, 1),
    weldBend(layerRadius(2), phiB, -1),
    weldBend(layerRadius(4), phiB, -1),
  ];
  // mergeGeometries needs matching attributes: drop the uv sets (tubes and boxes differ)
  parts.forEach((g) => g.deleteAttribute('uv'));
  const merged = mergeGeometries(parts.map((g) => g.toNonIndexed()));
  parts.forEach((g) => g.dispose());
  return merged;
}

/** Emissive intensity at full current (bloom threshold ≈ 0.8 of the tone-mapped value). */
const GLOW_MAX = 2.6;
const GLOW_BASE = 0.06;

export interface Windings extends SceneModule<Group> {
  readonly materials: readonly MeshStandardMaterial[];
}

export function createWindings(leadTargets: readonly Vector3[] = []): Windings {
  const group = new Group();
  group.name = 'windings';
  const template = hairpinTemplate();
  const m = new Matrix4();
  const materials: MeshStandardMaterial[] = [];
  for (let ph = 0 as PhaseIndex; ph < 3; ph = (ph + 1) as PhaseIndex) {
    const mat = makeMaterial(
      {
        color: PALETTE.copper,
        metalness: 1,
        roughness: 0.3,
        emissive: new Color(PHASE_COLORS[ph]),
        emissiveIntensity: GLOW_BASE,
        side: DoubleSide,
      },
      'field',
      { cut: true },
    );
    materials.push(mat);
    const slots: number[] = [];
    for (let k = 0; k < G.slots; k++) if (slotPhase(k).phase === ph) slots.push(k);
    const inst = new InstancedMesh(template, mat, slots.length);
    slots.forEach((k, i) => inst.setMatrixAt(i, m.makeRotationX(slotAngle(k))));
    inst.castShadow = true;
    inst.name = `phase-${'ABC'[ph]}`;
    group.add(inst);
  }

  // lead cables: from the weld end of the outermost layer near the top to the inverter terminals
  leadTargets.forEach((target, ph) => {
    const k = [1, 7, 13][ph] ?? 1; // a "go" slot of each phase near the top
    const phi = slotAngle(k);
    const start = at(HALF_L + 0.03, layerRadius(4), phi);
    const curve = new CatmullRomCurve3([
      start,
      at(HALF_L + 0.045, layerRadius(4) + 0.006, phi),
      new Vector3(start.x + 0.02, (start.y + target.y) / 2 + 0.02, target.z),
      target,
    ]);
    const mat = materials[ph] ?? materials[0];
    const lead = new Mesh(new TubeGeometry(curve, 32, 0.0035, 8, false), mat);
    lead.castShadow = true;
    group.add(lead);
  });

  // current particles on the crown end turns (§6.6): one dot per crown arc, moving along it in
  // the direction of the phase current (reversed for the hairpins that start in a "−" slot)
  const particleGeo = new SphereGeometry(0.0022, 8, 6);
  const particles: { mesh: InstancedMesh; mat: MeshBasicMaterial; slots: number[]; t: number[] }[] =
    [];
  for (let ph = 0; ph < 3; ph++) {
    const slots: number[] = [];
    for (let k = 0; k < G.slots; k++) if (slotPhase(k).phase === ph) slots.push(k);
    const mat = new MeshBasicMaterial({
      color: new Color(PHASE_COLORS[ph]),
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new InstancedMesh(particleGeo, mat, slots.length * 2);
    mesh.frustumCulled = false;
    group.add(mesh);
    particles.push({
      mesh,
      mat,
      slots,
      t: slots.flatMap((_, i) => [(i * 0.37) % 1, (i * 0.37 + 0.5) % 1]),
    });
  }
  const pm = new Matrix4();
  const phiB = SPAN * SLOT_PITCH;
  let lastT = 0;

  return {
    object3d: group,
    materials,
    update(ctx: FrameContext) {
      const a = ctx.angles;
      const s = ctx.snapshot;
      const iMax = s.motor === 'pm' ? PM.currentMaxA : IM.currentMaxA;
      const currents = [a.ia, a.ib, a.ic];
      const onlyA = ctx.ui.onlyPhaseA;
      // When the current cycles faster than a few Hz on screen (Real mode), per-frame samples
      // would strobe: blend to the cycle average |i| = (2/π)·I instead.
      const fShown = Math.abs(s.omegaE) / (2 * Math.PI) / Math.max(a.slowMo, 1);
      const avg = smoothstep(2, 6, fShown);
      const iAvg = (2 / Math.PI) * s.iPeak;
      materials.forEach((mat, ph) => {
        const inst = Math.abs(currents[ph] ?? 0);
        const i = onlyA && ph > 0 ? 0 : inst + (iAvg - inst) * avg;
        mat.emissiveIntensity = GLOW_BASE + GLOW_MAX * Math.min(i / iMax, 1.2);
      });

      const dtd = Math.max(a.tDisplay - lastT, 0);
      lastT = a.tDisplay;
      const show = (1 - avg) * (ctx.ui.follow === 'field' ? 1 : ctx.ui.follow === 'all' ? 0.6 : 0);
      particles.forEach((pt, ph) => {
        const cur = onlyA && ph > 0 ? 0 : (currents[ph] ?? 0);
        const level = Math.min(Math.abs(cur) / iMax, 1);
        pt.mesh.visible = show > 0.01;
        if (!pt.mesh.visible) return;
        pt.mat.opacity = show * (0.15 + 0.85 * Math.min(level * 3, 1));
        pt.slots.forEach((k, i) => {
          const dir = slotPhase(k).sign * Math.sign(cur);
          for (let layer = 0; layer < 2; layer++) {
            const idx = i * 2 + layer;
            let t = (pt.t[idx] ?? 0) + dir * dtd * (0.4 + 2.2 * level);
            t -= Math.floor(t);
            pt.t[idx] = t;
            const r0 = layerRadius(layer === 0 ? 1 : 3);
            const r1 = layerRadius(layer === 0 ? 2 : 4);
            const reach = layer === 0 ? G.endTurnReach : G.endTurnReach * 0.82;
            const bulge = Math.sin(Math.PI * t);
            const x = -HALF_L - 0.005 - reach * bulge + 0.005 * bulge;
            const r = r0 + (r1 - r0) * t + 0.004 * bulge + 0.0025;
            const phi = slotAngle(k) + phiB * t;
            pm.makeTranslation(x, r * Math.cos(phi), r * Math.sin(phi));
            pt.mesh.setMatrixAt(idx, pm);
          }
        });
        pt.mesh.instanceMatrix.needsUpdate = true;
      });
    },
    dispose: () => disposeTree(group),
  };
}
