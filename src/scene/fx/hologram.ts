/**
 * Field hologram (TECH_SPEC §4.1 "field lens", §9 Field): an enlarged, transparent copy of the
 * stator cross-section floating above the motor, so the rotating field reads from any angle.
 * It holds the stator outline with the 54 slots glowing in their phase colours, the rotor
 * (magnet poles or cage bars) turning with the real rotor, the gap-arrow ring, the flux lines,
 * the violet field arrow, the white rotor d-axis arrow and the load-angle arc.
 * The hologram turns about the vertical so its face points at the camera, always showing the
 * machine as seen from the end nearest the camera (no mirroring, same sense of rotation).
 */
import {
  AdditiveBlending,
  BufferGeometry,
  CircleGeometry,
  Color,
  DoubleSide,
  Group,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Vector3,
  type Camera,
} from 'three';
import { GEOMETRY, IM, PM } from '@/config/motor';
import { PHASE_COLORS, THEME } from '@/config/theme';
import { angleDiff, createAngleArc, createFieldArrow, type FxOptions } from '@/scene/fx/fieldArrow';
import type { FieldView } from '@/scene/fx/fieldState';
import { createFluxLines } from '@/scene/fx/fluxLines';
import { createGapArrows } from '@/scene/fx/gapArrows';
import type { FrameContext } from '@/scene/module';
import { slotAngle, slotPhase } from '@/scene/motor/profile';
import { approach } from '@/util/math';

const G = GEOMETRY;
const OPTS: FxOptions = { xray: false, additive: true, renderOrder: 20 };

function circle(r: number, color: string, opacity: number, segments = 128): Line {
  const pts: Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * 2 * Math.PI;
    pts.push(new Vector3(0, r * Math.cos(a), r * Math.sin(a)));
  }
  const line = new Line(
    new BufferGeometry().setFromPoints(pts),
    new LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
    }),
  );
  line.renderOrder = 19;
  return line;
}

export interface Hologram {
  readonly object3d: Group;
  update(ctx: FrameContext, f: FieldView, opacity: number, camera: Camera): void;
}

/**
 * @param position rig coordinates of the hologram centre
 * @param scale enlargement of the full-scale cross-section
 */
export function createHologram(position: Vector3, scale: number): Hologram {
  const root = new Group();
  root.name = 'hologram';
  root.position.copy(position);
  const face = new Group(); // yaw-billboarded; its local x is the machine axis
  face.scale.setScalar(scale);
  root.add(face);

  // faint backdrop so the glow reads against the room
  const backdrop = new Mesh(
    new CircleGeometry(G.statorOuterR * 1.12, 96).rotateY(Math.PI / 2),
    new MeshBasicMaterial({
      color: '#0b0f1c',
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  backdrop.renderOrder = 18;
  face.add(backdrop);
  face.add(circle(G.statorOuterR, '#8b93a7', 0.5), circle(G.statorBoreR, '#8b93a7', 0.35));

  // 54 slot marks in phase colours, glowing with |i_phase|
  const slotGeo = new PlaneGeometry(G.slotWidth * 1.1, G.slotDepth).rotateY(Math.PI / 2);
  slotGeo.translate(0, G.statorBoreR + G.slotDepth / 2, 0);
  // one draw: the phase colour and its glow ride in the instance colour (additive, so a dark
  // colour is a dim slot)
  const slotMat = new MeshBasicMaterial({
    color: '#ffffff',
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
  });
  const slotInst = new InstancedMesh(slotGeo, slotMat, G.slots);
  const slotPh: number[] = [];
  const m = new Matrix4();
  for (let k = 0; k < G.slots; k++) {
    slotInst.setMatrixAt(k, m.makeRotationX(slotAngle(k)));
    slotPh.push(slotPhase(k).phase);
  }
  slotInst.setColorAt(0, new Color());
  slotInst.renderOrder = 20;
  face.add(slotInst);
  const phaseCols = PHASE_COLORS.map((c) => new Color(c));
  const slotCol = new Color();

  // rotor: outline plus magnet poles (6 alternating sectors) or 50 cage bars, turning with the rotor
  const rotor = new Group();
  rotor.add(circle(G.rotorOuterR, '#c9cfdc', 0.45));
  const pmGroup = new Group();
  const poleGeo = new CircleGeometry(
    G.rotorOuterR - 0.006,
    24,
    -Math.PI / 6 + 0.06,
    Math.PI / 3 - 0.12,
  );
  poleGeo.rotateY(Math.PI / 2); // circle plane → the cross-section (shape angle 0 → +z ... fixed below)
  const northMat = new MeshBasicMaterial({
    color: new Color(THEME.field).multiplyScalar(0.2),
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  });
  const southMat = northMat.clone();
  southMat.color = new Color(THEME.field).multiplyScalar(0.05);
  for (let n = 0; n < 2 * PM.polePairs; n++) {
    const pole = new Mesh(poleGeo, n % 2 === 0 ? northMat : southMat);
    pole.rotation.x = (n * Math.PI) / PM.polePairs;
    pole.renderOrder = 19;
    pmGroup.add(pole);
  }
  const imGroup = new Group();
  const barGeo = new CircleGeometry(G.imBarR * 1.2, 10).rotateY(Math.PI / 2);
  barGeo.translate(0, 0.0676, 0);
  const barMat = new MeshBasicMaterial({
    color: new Color(THEME.heat),
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
  });
  const bars = new InstancedMesh(barGeo, barMat, G.imBars);
  for (let k = 0; k < G.imBars; k++)
    bars.setMatrixAt(k, m.makeRotationX((k * 2 * Math.PI) / G.imBars));
  bars.renderOrder = 20;
  imGroup.add(bars);
  rotor.add(pmGroup, imGroup);
  face.add(rotor);

  const flux = createFluxLines({ rCenter: 0.068, bMin: 0.012, bMax: 0.037, width: 0.0014 }, OPTS);
  const gap = createGapArrows(G.statorBoreR, 0.014, 0.004, OPTS);
  const fieldArrow = createFieldArrow(THEME.field, 0.007, OPTS, 2.2);
  const rotorArrow = createFieldArrow('#ffffff', 0.0035, OPTS, 1.4);
  const arc = createAngleArc(OPTS);
  face.add(flux.object3d, gap.object3d, fieldArrow.object3d, rotorArrow.object3d, arc.object3d);

  // CircleGeometry sectors start at +x of their own plane; after rotateY(π/2) that is −z, i.e.
  // φ = −90°. Shift the pole sectors so pole 0 (north) is centred on the rotor d-axis (φ = 0).
  pmGroup.rotation.x = Math.PI / 2;

  let yaw = 0;
  const camLocal = new Vector3();
  let fade = 0;
  return {
    object3d: root,
    update(ctx, f, opacity, camera) {
      fade += (opacity - fade) * approach(ctx.dt, 0.13);
      root.visible = fade > 0.01;
      if (!root.visible) return;
      // yaw so the machine axis (local ±x) points at the camera
      camLocal.copy(camera.position);
      root.parent?.worldToLocal(camLocal);
      const dx = camLocal.x - root.position.x;
      const dz = camLocal.z - root.position.z;
      // +x faces the camera: ψ = atan2(−dz, dx); −x faces it: ψ = atan2(dz, −dx)
      const target = dx >= 0 ? Math.atan2(-dz, dx) : Math.atan2(dz, -dx);
      yaw += angleDiff(target, yaw) * approach(ctx.dt, 0.25);
      face.rotation.y = yaw;

      const s = ctx.snapshot;
      const a = f.visible * fade;
      backdrop.material.opacity = 0.55 * fade;
      const iMax = s.motor === 'pm' ? PM.currentMaxA : IM.currentMaxA;
      const cur = [ctx.angles.ia, ctx.angles.ib, ctx.angles.ic];
      slotMat.opacity = fade;
      const glow = [0, 1, 2].map((ph) => {
        const i = ctx.ui.onlyPhaseA && ph > 0 ? 0 : Math.abs(cur[ph] ?? 0);
        return 0.12 + 0.88 * Math.min(i / iMax, 1) * f.visible;
      });
      slotPh.forEach((ph, k) => {
        slotCol.copy(phaseCols[ph] as Color).multiplyScalar(glow[ph] ?? 0);
        slotInst.setColorAt(k, slotCol);
      });
      if (slotInst.instanceColor) slotInst.instanceColor.needsUpdate = true;
      rotor.rotation.x = f.rotorMech;
      pmGroup.visible = s.motor === 'pm';
      imGroup.visible = s.motor === 'im';
      barMat.opacity = fade * Math.min(s.barCurrentA / 2600, 1);
      const len = (G.statorBoreR - 0.004) * Math.min(f.strength, 1.15);
      fieldArrow.set(f.poleMech, len);
      fieldArrow.material.opacity = a;
      rotorArrow.set(f.rotorMech, G.rotorOuterR * 0.8);
      rotorArrow.material.opacity = fade * (ctx.ui.onlyPhaseA ? 0.5 : 1);
      arc.set(f.rotorMech, f.rotorMech + angleDiff(f.poleMech, f.rotorMech), 0.03);
      arc.material.opacity = a * (ctx.ui.onlyPhaseA ? 0 : 1);
      gap.set(f.thetaElec, f.p, f.strength, a);
      flux.set(f.p, f.poleMech, f.strength, ctx.angles.tDisplay * 0.6, a * 0.45);
    },
  };
}
