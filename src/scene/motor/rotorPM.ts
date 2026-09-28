/**
 * Interior permanent-magnet rotor (TECH_SPEC §5.3): laminated stack Ø148.6 mm with V-shaped
 * magnet pockets (6 poles × 2 magnets), 12 instanced nickel-plated magnets with a violet N/S
 * tint, end plates, and a bright d-axis notch on the non-drive end plate so the rotor angle reads.
 * Pole 0 (north) is centred on the rotor's local φ = 0, i.e. the d-axis.
 */
import {
  BoxGeometry,
  Color,
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
import { GEOMETRY, PM } from '@/config/motor';
import { PALETTE, THEME } from '@/config/theme';
import { makeLaminationMaterial, makeMaterial } from '@/scene/materials';
import { mergeStatic } from '@/scene/mergeStatic';
import { disposeTree, type FrameContext, type SceneModule } from '@/scene/module';
import { annulusShape, extrudeAxial } from '@/scene/motor/profile';

const G = GEOMETRY;
const [MAG_T, MAG_W] = [G.magnetSize[0], G.magnetSize[1]];
const MAG_L = G.magnetSize[2];
const V_HALF = (25 * Math.PI) / 180; // tilt of each magnet from the tangent
const R_MAG = 0.0575;
const TANG_OFF = 0.0105;

export interface MagnetPose {
  /** shape-plane centre */
  c: [number, number];
  /** long-side direction in the shape plane */
  w: [number, number];
  north: boolean;
}

/** The 12 magnet poses in the cross-section. */
export function magnetPoses(): MagnetPose[] {
  const poses: MagnetPose[] = [];
  const poles = 2 * PM.polePairs;
  for (let n = 0; n < poles; n++) {
    const phi = (n * 2 * Math.PI) / poles;
    const u: [number, number] = [Math.cos(phi), Math.sin(phi)];
    const t: [number, number] = [-Math.sin(phi), Math.cos(phi)];
    for (const s of [-1, 1]) {
      const c: [number, number] = [
        R_MAG * u[0] + s * TANG_OFF * t[0],
        R_MAG * u[1] + s * TANG_OFF * t[1],
      ];
      const w: [number, number] = [
        s * Math.cos(V_HALF) * t[0] + Math.sin(V_HALF) * u[0],
        s * Math.cos(V_HALF) * t[1] + Math.sin(V_HALF) * u[1],
      ];
      poses.push({ c, w, north: n % 2 === 0 });
    }
  }
  return poses;
}

function pocket(p: MagnetPose, grow: number): Path {
  const [wx, wy] = p.w;
  const [nx, ny] = [-wy, wx];
  const hw = MAG_W / 2 + grow * 2.2; // flux barriers at the ends
  const ht = MAG_T / 2 + grow;
  const path = new Path();
  const corners: [number, number][] = [
    [-hw, -ht],
    [hw, -ht],
    [hw, ht],
    [-hw, ht],
  ];
  corners.forEach(([a, b], i) => {
    const x = p.c[0] + a * wx + b * nx;
    const y = p.c[1] + a * wy + b * ny;
    if (i === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  });
  path.closePath();
  return path;
}

export interface Rotor extends SceneModule<Group> {
  /** materials that fade during the rotor swap */
  readonly fadeMaterials: readonly MeshStandardMaterial[];
}

export function createRotorPM(): Rotor {
  const group = new Group();
  group.name = 'rotorPM';
  const poses = magnetPoses();

  const shape = new Shape();
  shape.absarc(0, 0, G.rotorOuterR, 0, 2 * Math.PI, false);
  const bore = new Path();
  bore.absarc(0, 0, G.shaftR, 0, 2 * Math.PI, true);
  shape.holes.push(bore);
  poses.forEach((p) => shape.holes.push(pocket(p, 0.0006)));
  const lamMat = makeLaminationMaterial(
    PALETTE.lamination,
    PALETTE.laminationLine,
    0.002,
    'field',
    { cut: true },
  );
  lamMat.side = DoubleSide;
  const stack = new Mesh(extrudeAxial(shape, G.stackLength, 128), lamMat);
  stack.castShadow = true;
  stack.receiveShadow = true;
  group.add(stack);

  // magnets: north and south poles in two instanced meshes (different field tint)
  const magGeo = new BoxGeometry(MAG_L, MAG_W, MAG_T);
  const m = new Matrix4();
  const fieldTint = new Color(THEME.field);
  const magMats = [true, false].map((north) =>
    makeMaterial(
      {
        color: PALETTE.magnet,
        metalness: 0.9,
        roughness: 0.28,
        emissive: north ? fieldTint : fieldTint.clone().multiplyScalar(0.35),
        emissiveIntensity: 0,
      },
      'field',
      { cut: true },
    ),
  );
  for (const north of [true, false]) {
    const list = poses.filter((p) => p.north === north);
    const inst = new InstancedMesh(magGeo, magMats[north ? 0 : 1], list.length);
    list.forEach((p, i) => {
      const alpha = Math.atan2(p.w[1], p.w[0]);
      m.makeRotationX(alpha).setPosition(0, p.c[0], p.c[1]);
      inst.setMatrixAt(i, m);
    });
    inst.castShadow = true;
    group.add(inst);
  }

  // end plates and the d-axis notch
  const plateMat = makeMaterial(
    { color: PALETTE.darkSteel, roughness: 0.45, metalness: 0.8 },
    'structure',
    { cut: true },
  );
  const plateGeo = extrudeAxial(annulusShape(G.shaftR, G.rotorOuterR - 0.004), 0.004, 96);
  for (const sx of [-1, 1]) {
    const plate = new Mesh(plateGeo, plateMat);
    plate.position.x = sx * (G.stackLength / 2 + 0.002);
    group.add(plate);
  }
  const notchMat = new MeshBasicMaterial({
    color: new Color('#ffffff').multiplyScalar(2.2),
    toneMapped: false,
  });
  const notch = new Mesh(new BoxGeometry(0.003, 0.014, 0.005), notchMat);
  notch.position.set(-G.stackLength / 2 - 0.0055, G.rotorOuterR - 0.012, 0);
  group.add(notch);

  mergeStatic(group);
  return {
    object3d: group,
    fadeMaterials: [lamMat, plateMat, ...magMats],
    update(ctx: FrameContext) {
      const fieldMode = ctx.ui.follow === 'field' ? 1 : 0.35;
      magMats.forEach((mm) => (mm.emissiveIntensity = 0.35 * fieldMode));
    },
    dispose: () => disposeTree(group),
  };
}
