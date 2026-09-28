/**
 * Two-stage helical reduction, 19:57 × 23:69 = 9.0 : 1 (TECH_SPEC §5.5), and its casing.
 *   stage 1: pinion z1 on the rotor shaft → z2 on the intermediate shaft
 *   stage 2: z3 on the intermediate shaft → z4, the ring gear on the differential carrier
 * Modules follow from the shaft positions (RIG): m = 2a / (z_a + z_b). Every gear derives its
 * angle from the visual rotor angle through the tooth ratios, with a per-gear offset chosen so
 * the teeth interleave at the contact point (see meshOffset). Helix angle 20° via a twist.
 */
import { DoubleSide, Group, Mesh, Path, Shape, type BufferGeometry } from 'three';
import { RIG } from '@/config/environment';
import { GEAR_TEETH } from '@/config/vehicle';
import { PALETTE } from '@/config/theme';
import { makeMaterial } from '@/scene/materials';
import { disposeTree, type FrameContext, type SceneModule } from '@/scene/module';
import { createGearGeometry, pitchRadius } from '@/scene/drivetrain/gears';
import { annulusShape, extrudeAxial, twistAboutX } from '@/scene/motor/profile';

const HELIX = (20 * Math.PI) / 180;
const Z = GEAR_TEETH;

/** Axis positions (y, z) in rig coordinates. */
export const AXLE: [number, number] = [RIG.axleY, RIG.axleZ];
export const INTERMEDIATE: [number, number] = [
  RIG.axleY + RIG.intermediateOffset[0],
  RIG.axleZ + RIG.intermediateOffset[1],
];
export const MOTOR_AXIS: [number, number] = [
  RIG.axleY + RIG.motorOffset[0],
  RIG.axleZ + RIG.motorOffset[1],
];

const dist = (a: [number, number], b: [number, number]): number =>
  Math.hypot(a[0] - b[0], a[1] - b[1]);
/** φ of the direction from a to b (φ = 0 is +y, towards +z). */
const dirPhi = (a: [number, number], b: [number, number]): number =>
  Math.atan2(b[1] - a[1], b[0] - a[0]);

export const MODULE_1 = (2 * dist(MOTOR_AXIS, INTERMEDIATE)) / (Z.z1 + Z.z2);
export const MODULE_2 = (2 * dist(INTERMEDIATE, AXLE)) / (Z.z3 + Z.z4);

/** Angle ratios relative to the rotor (sign: each external mesh reverses the direction). */
export const RATIO_INTERMEDIATE = -Z.z1 / Z.z2;
export const RATIO_OUTPUT = (Z.z1 / Z.z2) * (Z.z3 / Z.z4);

/**
 * Offset c_b for a driven gear so teeth interleave: with the driver at θa = k_a θ + c_a, the
 * driven gear turns θb = −(z_a/z_b) θa + c_b. At the instant the driver has a tooth centred on the
 * line of centres, the driven gear must show a gap there. Unrotated gear teeth sit at φ = k·p − π/2
 * (gears.ts builds them in its shape plane, rotated onto the x axis).
 */
export function meshOffset(phiAB: number, za: number, zb: number): number {
  const pb = (2 * Math.PI) / zb;
  const thetaA = phiAB + Math.PI / 2; // driver tooth 0 on the line of centres
  const thetaB = phiAB + Math.PI + Math.PI / 2 - pb / 2; // driven gap on the line of centres
  return thetaB + (za / zb) * thetaA;
}

/** Convex hull of circles (y, z, r) grown by `grow`, as a polygon in the (y, z) shape plane. */
function hullPoints(
  circles: readonly [number, number, number][],
  grow: number,
): [number, number][] {
  const pts: [number, number][] = [];
  for (const [y, z, r] of circles) {
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * 2 * Math.PI;
      pts.push([y + (r + grow) * Math.cos(a), z + (r + grow) * Math.sin(a)]);
    }
  }
  // Andrew's monotone chain
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]): number =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0)
      lower.pop();
    lower.push(p);
  }
  const upper: [number, number][] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0)
      upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function hullShape(circles: readonly [number, number, number][], grow: number): Shape {
  const s = new Shape();
  hullPoints(circles, grow).forEach(([y, z], i) => (i === 0 ? s.moveTo(y, z) : s.lineTo(y, z)));
  s.closePath();
  return s;
}

function hullPath(circles: readonly [number, number, number][], grow: number): Path {
  const p = new Path();
  hullPoints(circles, grow).forEach(([y, z], i) => (i === 0 ? p.moveTo(y, z) : p.lineTo(y, z)));
  p.closePath();
  return p;
}

function helical(
  teeth: number,
  module: number,
  face: number,
  bore: number,
  sign: 1 | -1,
): BufferGeometry {
  const g = createGearGeometry({
    teeth,
    moduleM: module,
    faceWidthM: face,
    boreRadiusM: bore,
    axis: 'x',
  });
  return twistAboutX(g, (sign * Math.tan(HELIX)) / pitchRadius(teeth, module));
}

export interface Reduction extends SceneModule<Group> {
  /** front cover of the casing (hidden in the cutaway) */
  readonly cover: Mesh;
  /** current ring-gear (differential carrier) angle, rad */
  readonly ringAngle: number;
  readonly gears: { z1: Mesh; z2: Mesh; z3: Mesh; z4: Mesh };
}

export function createReduction(): Reduction {
  const group = new Group();
  group.name = 'reduction';
  const gearMat = makeMaterial({ color: '#aab3be', metalness: 0.95, roughness: 0.32 }, 'power');
  const shaftMat = makeMaterial({ color: PALETTE.steel, metalness: 0.95, roughness: 0.3 }, 'power');
  const face1 = 0.03;
  const face2 = 0.036;

  const z1 = new Mesh(helical(Z.z1, MODULE_1, face1, 0.0, 1), gearMat);
  z1.position.set(RIG.stage1X, MOTOR_AXIS[0], MOTOR_AXIS[1]);
  const z2 = new Mesh(helical(Z.z2, MODULE_1, face1, 0.018, -1), gearMat);
  z2.position.set(RIG.stage1X, INTERMEDIATE[0], INTERMEDIATE[1]);
  const z3 = new Mesh(helical(Z.z3, MODULE_2, face2, 0.0, 1), gearMat);
  z3.position.set(RIG.stage2X, INTERMEDIATE[0], INTERMEDIATE[1]);
  const z4 = new Mesh(helical(Z.z4, MODULE_2, face2, 0.05, -1), gearMat);
  z4.position.set(RIG.stage2X, AXLE[0], AXLE[1]);
  for (const g of [z1, z2, z3, z4]) {
    g.castShadow = true;
    g.receiveShadow = true;
    group.add(g);
  }
  // intermediate shaft
  const iShaft = new Mesh(
    extrudeAxial(annulusShape(0.0, 0.016), RIG.stage2X - RIG.stage1X + 0.07, 24),
    shaftMat,
  );
  iShaft.position.set((RIG.stage1X + RIG.stage2X) / 2, INTERMEDIATE[0], INTERMEDIATE[1]);
  z2.userData.shaft = iShaft;
  group.add(iShaft);

  const off2 = meshOffset(dirPhi(MOTOR_AXIS, INTERMEDIATE), Z.z1, Z.z2);
  const off3 = 0;
  // z3 shares the intermediate shaft angle (off3 = 0), so z4 meshes with that actual angle
  const off4 = meshOffset(dirPhi(INTERMEDIATE, AXLE), Z.z3, Z.z4);

  // casing: a hull around the three shafts, a perimeter wall and two side plates. The output-side
  // plate (+x, facing the default camera) is removed in the Cutaway.
  const casingMat = makeMaterial(
    { color: PALETTE.aluminium, metalness: 0.85, roughness: 0.45, side: DoubleSide },
    'structure',
  );
  const circles: [number, number, number][] = [
    [MOTOR_AXIS[0], MOTOR_AXIS[1], pitchRadius(Z.z1, MODULE_1) + 0.035],
    [INTERMEDIATE[0], INTERMEDIATE[1], pitchRadius(Z.z2, MODULE_1) + 0.018],
    [AXLE[0], AXLE[1], pitchRadius(Z.z4, MODULE_2) + 0.018],
  ];
  const W = RIG.gearboxWidth;
  const wallT = 0.007;
  const outer = hullShape(circles, 0);
  outer.holes.push(hullPath(circles, -wallT));
  const perimeter = new Mesh(extrudeAxial(outer, W, 12), casingMat);
  perimeter.position.x = RIG.gearboxX;
  perimeter.castShadow = true;
  perimeter.receiveShadow = true;
  group.add(perimeter);
  const plateGeo = extrudeAxial(hullShape(circles, 0), wallT, 12);
  const backPlate = new Mesh(plateGeo, casingMat);
  backPlate.position.x = RIG.gearboxX - W / 2 + wallT / 2;
  backPlate.castShadow = true;
  group.add(backPlate);
  const cover = new Mesh(plateGeo, casingMat);
  cover.position.x = RIG.gearboxX + W / 2 - wallT / 2;
  cover.castShadow = true;
  group.add(cover);

  return {
    object3d: group,
    cover,
    gears: { z1, z2, z3, z4 },
    get ringAngle() {
      return z4.rotation.x;
    },
    update(ctx: FrameContext) {
      const th = ctx.mechAngle;
      z1.rotation.x = th;
      const th2 = RATIO_INTERMEDIATE * th + off2;
      z2.rotation.x = th2;
      z3.rotation.x = th2 + off3;
      iShaft.rotation.x = th2;
      z4.rotation.x = -(Z.z3 / Z.z4) * th2 + off4;
      cover.visible = ctx.ui.view === 'whole' && !ctx.ui.debugHousing;
      perimeter.visible = !ctx.ui.debugHousing;
      backPlate.visible = !ctx.ui.debugHousing;
    },
    dispose: () => disposeTree(group),
  };
}

/** Output (carrier/wheel) angle for a visual rotor angle, including the ring gear's offset. */
export function outputAngle(mechAngle: number): number {
  return RATIO_OUTPUT * mechAngle;
}
