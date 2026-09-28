/**
 * Induction (squirrel-cage) rotor (TECH_SPEC §5.3): laminated stack with 50 bar holes, 50 copper
 * bars skewed by one rotor-slot pitch over the stack (instanced; the stack is twisted by the
 * same function so holes and bars match), two copper end rings and a d-axis notch.
 * Bars glow orange ∝ the (display-scaled) bar current (§6.3).
 */
import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Path,
  Shape,
  type MeshStandardMaterial,
} from 'three';
import { GEOMETRY } from '@/config/motor';
import { PALETTE, THEME } from '@/config/theme';
import { makeLaminationMaterial, makeMaterial } from '@/scene/materials';
import { disposeTree, type FrameContext, type SceneModule } from '@/scene/module';
import { annulusShape, extrudeAxial, polar, twistAboutX } from '@/scene/motor/profile';

const G = GEOMETRY;
const BAR_PITCH = (2 * Math.PI) / G.imBars;
const R_BAR = 0.0676;
/** skew: one bar pitch over the stack length */
const TWIST = BAR_PITCH / G.stackLength;
const BAR_CURRENT_FULL = 2600;

export interface RotorIM extends SceneModule<Group> {
  /** materials that fade during the rotor swap */
  readonly fadeMaterials: readonly MeshStandardMaterial[];
  /** materials the Heat mode tints with the rotor temperature */
  readonly heatMaterials: readonly MeshStandardMaterial[];
}

export function createRotorIM(): RotorIM {
  const group = new Group();
  group.name = 'rotorIM';

  const shape = new Shape();
  shape.absarc(0, 0, G.rotorOuterR, 0, 2 * Math.PI, false);
  const bore = new Path();
  bore.absarc(0, 0, G.shaftR, 0, 2 * Math.PI, true);
  shape.holes.push(bore);
  for (let k = 0; k < G.imBars; k++) {
    const [x, y] = polar(R_BAR, k * BAR_PITCH);
    const h = new Path();
    h.absarc(x, y, G.imBarR + 0.0003, 0, 2 * Math.PI, true);
    shape.holes.push(h);
  }
  const stackGeo = twistAboutX(extrudeAxial(shape, G.stackLength, 48), TWIST);
  const lamMat = makeLaminationMaterial(
    PALETTE.lamination,
    PALETTE.laminationLine,
    0.002,
    'field',
    { cut: true },
  );
  lamMat.side = DoubleSide;
  const stack = new Mesh(stackGeo, lamMat);
  stack.castShadow = true;
  stack.receiveShadow = true;
  group.add(stack);

  const barLen = G.stackLength + 2 * G.imEndRingWidth;
  const barGeo = new CylinderGeometry(G.imBarR, G.imBarR, barLen, 10, 12);
  barGeo.rotateZ(Math.PI / 2);
  barGeo.translate(0, R_BAR, 0);
  twistAboutX(barGeo, TWIST);
  const copperMat = makeMaterial(
    {
      color: PALETTE.copper,
      metalness: 1,
      roughness: 0.32,
      emissive: new Color(THEME.heat),
      emissiveIntensity: 0,
    },
    'field',
    { cut: true },
  );
  const bars = new InstancedMesh(barGeo, copperMat, G.imBars);
  const m = new Matrix4();
  for (let k = 0; k < G.imBars; k++) bars.setMatrixAt(k, m.makeRotationX(k * BAR_PITCH));
  bars.castShadow = true;
  group.add(bars);

  const ringGeo = extrudeAxial(annulusShape(0.058, R_BAR + G.imBarR + 0.002), G.imEndRingWidth, 96);
  for (const sx of [-1, 1]) {
    const ring = new Mesh(ringGeo, copperMat);
    // the skew rotates the bar ends by ±half a pitch; the ring is rotationally symmetric anyway
    ring.position.x = sx * (G.stackLength / 2 + G.imEndRingWidth / 2);
    ring.castShadow = true;
    group.add(ring);
  }

  const notch = new Mesh(
    new BoxGeometry(0.003, 0.012, 0.005),
    new MeshBasicMaterial({ color: new Color('#ffffff').multiplyScalar(2.2), toneMapped: false }),
  );
  notch.position.set(-G.stackLength / 2 - G.imEndRingWidth - 0.0016, 0.052, 0);
  group.add(notch);
  const hub = new Mesh(
    extrudeAxial(annulusShape(G.shaftR, 0.052), 0.004, 64),
    makeMaterial({ color: PALETTE.darkSteel, roughness: 0.45, metalness: 0.8 }, 'structure', {
      cut: true,
    }),
  );
  hub.position.x = -G.stackLength / 2 - 0.002;
  group.add(hub);

  return {
    object3d: group,
    fadeMaterials: [lamMat, copperMat],
    heatMaterials: [copperMat],
    update(ctx: FrameContext) {
      const s = ctx.snapshot;
      const k = s.motor === 'im' ? Math.min(s.barCurrentA / BAR_CURRENT_FULL, 1.2) : 0;
      copperMat.emissiveIntensity = 1.8 * k;
    },
    dispose: () => disposeTree(group),
  };
}
