/**
 * Cast-aluminium motor housing (TECH_SPEC §4.3, §5.1, §8): four quarter shells with longitudinal
 * cooling ribs (28 in total), a non-drive end cap with the bearing boss and the oil inlet on top,
 * a drive-end flange towards the gearbox, an oil outlet underneath, and two bearings.
 * The quarters are separate meshes so the Exploded view can push them out radially; the
 * cutaway clips the upper-front wedge (materials use the shared cut planes).
 */
import { BoxGeometry, CylinderGeometry, DoubleSide, Group, Mesh, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GEOMETRY } from '@/config/motor';
import { PALETTE } from '@/config/theme';
import { mergeStatic } from '@/scene/mergeStatic';
import { makeMaterial } from '@/scene/materials';
import { disposeTree, type SceneModule } from '@/scene/module';
import { annulusShape, extrudeAxial } from '@/scene/motor/profile';

const G = GEOMETRY;
const HALF = G.housingLength / 2;
const R_IN = G.statorOuterR;
const R_WALL = G.housingOuterR - 0.009;

export interface Housing extends SceneModule<Group> {
  /** the four quarter shells, index q covers φ ∈ [q·90°, (q+1)·90°) */
  readonly quarters: readonly Group[];
  readonly endCap: Group;
  readonly driveFlange: Group;
}

function quarterGeometry(q: number): BufferGeometry {
  const phi0 = (q * Math.PI) / 2;
  const phi1 = phi0 + Math.PI / 2;
  const parts: BufferGeometry[] = [
    extrudeAxial(annulusShape(R_IN, R_WALL, phi0, phi1), G.housingLength, 32),
  ];
  const ribs = G.finCount / 4;
  for (let i = 0; i < ribs; i++) {
    const phi = phi0 + ((i + 0.5) * (Math.PI / 2)) / ribs;
    const rib = new BoxGeometry(G.housingLength - 0.02, G.housingOuterR - R_WALL + 0.002, 0.005);
    rib.translate(0, (G.housingOuterR + R_WALL) / 2, 0);
    rib.rotateX(phi);
    parts.push(rib);
  }
  parts.forEach((g) => g.deleteAttribute('uv'));
  const merged = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
  parts.forEach((g) => g.dispose());
  return merged;
}

export function createHousing(): Housing {
  const group = new Group();
  group.name = 'housing';
  const alu = makeMaterial(
    { color: PALETTE.aluminium, metalness: 0.85, roughness: 0.45, side: DoubleSide },
    'structure',
    { cut: true },
  );
  const quarters: Group[] = [];
  for (let q = 0; q < 4; q++) {
    const g = new Group();
    const mesh = new Mesh(quarterGeometry(q), alu);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
    g.userData.phiMid = (q + 0.5) * (Math.PI / 2);
    quarters.push(g);
    group.add(g);
  }

  // non-drive end cap with bearing boss and oil inlet
  const endCap = new Group();
  endCap.position.x = -HALF - 0.005;
  const cap = new Mesh(
    extrudeAxial(annulusShape(G.shaftR + 0.012, G.housingOuterR - 0.004), 0.01, 96),
    alu,
  );
  cap.castShadow = true;
  const boss = new Mesh(
    extrudeAxial(annulusShape(G.shaftR + 0.002, G.shaftR + 0.02), 0.03, 48),
    alu,
  );
  boss.position.x = -0.012;
  const inlet = new Mesh(new CylinderGeometry(0.009, 0.009, 0.05, 16), alu);
  inlet.position.set(-0.004, G.housingOuterR - 0.02, -0.035);
  const inletFlange = new Mesh(new CylinderGeometry(0.014, 0.014, 0.006, 16), alu);
  inletFlange.position.set(-0.004, G.housingOuterR + 0.004, -0.035);
  endCap.add(cap, boss, inlet, inletFlange);
  group.add(endCap);

  // drive-end flange (bridges to the gearbox casing)
  const driveFlange = new Group();
  driveFlange.position.x = HALF + 0.004;
  const flange = new Mesh(
    extrudeAxial(annulusShape(G.shaftR + 0.01, G.housingOuterR), 0.008, 96),
    alu,
  );
  flange.castShadow = true;
  driveFlange.add(flange);
  group.add(driveFlange);

  // oil outlet underneath
  const outlet = new Mesh(new CylinderGeometry(0.01, 0.01, 0.04, 16), alu);
  outlet.position.set(0.03, -G.housingOuterR - 0.012, 0);
  group.add(outlet);

  // bearings (outer races, stationary)
  const bearingMat = makeMaterial(
    { color: '#c9ced6', metalness: 0.95, roughness: 0.2, side: DoubleSide },
    'structure',
    {
      cut: true,
    },
  );
  const bearingGeo = extrudeAxial(annulusShape(G.shaftR + 0.001, G.shaftR + 0.017), 0.018, 48);
  for (const x of [-HALF + 0.006, HALF - 0.004]) {
    const b = new Mesh(bearingGeo, bearingMat);
    b.position.x = x;
    group.add(b);
  }

  mergeStatic(endCap);
  mergeStatic(group, [...quarters, endCap, driveFlange]);
  return {
    object3d: group,
    quarters,
    endCap,
    driveFlange,
    update() {
      // quarters, end cap and flange are placed by scene/views.ts
    },
    dispose: () => disposeTree(group),
  };
}
