/**
 * Low-poly props for warmth (TECH_SPEC §4.1): a wall tool rack, a coolant reservoir on the bench,
 * a trolley jack on the floor and a small potted plant. Scene (model) units.
 */
import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  Quaternion,
  TorusGeometry,
  Vector3,
} from 'three';
import { ENVIRONMENT } from '@/config/environment';
import { PALETTE } from '@/config/theme';
import { mergeStatic } from '@/scene/mergeStatic';
import { makeMaterial, makePhysicalMaterial } from '@/scene/materials';
import { disposeTree, type SceneModule } from '@/scene/module';
import { mulberry32 } from '@/util/math';

export function createProps(): SceneModule<Group> {
  const group = new Group();
  group.name = 'props';
  const floorY = ENVIRONMENT.room.floorY;
  const backZ = ENVIRONMENT.room.backZ;
  const m = new Matrix4();
  const q = new Quaternion();
  const steel = makeMaterial(
    { color: PALETTE.steel, roughness: 0.35, metalness: 0.9 },
    'environment',
  );

  // tool rack: pegboard with wrenches and screwdrivers
  const rack = new Group();
  rack.position.set(-1.05, 0.55, backZ + 0.012);
  const board = new Mesh(
    new BoxGeometry(0.62, 0.42, 0.015),
    makeMaterial({ color: '#2b2f38', roughness: 0.8, metalness: 0.1 }, 'environment'),
  );
  rack.add(board);
  const wrenches = new InstancedMesh(new BoxGeometry(0.018, 0.2, 0.006), steel, 7);
  for (let i = 0; i < 7; i++) {
    const len = 0.6 + 0.06 * i;
    m.compose(new Vector3(-0.24 + i * 0.045, 0.06, 0.012), q.identity(), new Vector3(1, len, 1));
    wrenches.setMatrixAt(i, m);
  }
  rack.add(wrenches);
  const handles = new InstancedMesh(
    new CylinderGeometry(0.012, 0.012, 0.09, 8),
    makeMaterial({ color: PALETTE.toolRed, roughness: 0.5, metalness: 0.05 }, 'environment'),
    4,
  );
  for (let i = 0; i < 4; i++)
    handles.setMatrixAt(i, m.makeTranslation(0.1 + i * 0.045, -0.08, 0.02));
  rack.add(handles);
  group.add(rack);

  // coolant reservoir on the bench (translucent tank with green coolant)
  const tank = new Group();
  tank.position.set(0.58, 0, -0.22);
  const shell = new Mesh(
    new BoxGeometry(0.08, 0.1, 0.06),
    makePhysicalMaterial(
      { color: '#e8f0ff', roughness: 0.15, transparent: true, opacity: 0.3 },
      'environment',
    ),
  );
  shell.position.y = 0.05;
  const coolant = new Mesh(
    new BoxGeometry(0.074, 0.06, 0.054),
    makeMaterial(
      {
        color: PALETTE.coolant,
        roughness: 0.2,
        emissive: PALETTE.coolant,
        emissiveIntensity: 0.15,
      },
      'environment',
    ),
  );
  coolant.position.y = 0.033;
  const cap = new Mesh(
    new CylinderGeometry(0.014, 0.014, 0.014, 16),
    makeMaterial({ color: '#f2c14e', roughness: 0.4 }, 'environment'),
  );
  cap.position.set(0.02, 0.107, 0);
  tank.add(shell, coolant, cap);
  group.add(tank);

  // trolley jack on the floor in front of the bench
  const jack = new Group();
  jack.position.set(0.95, floorY, 0.55);
  jack.rotation.y = -0.7;
  const red = makeMaterial({ color: '#b3261e', roughness: 0.45, metalness: 0.35 }, 'environment');
  const chassis = new Mesh(new BoxGeometry(0.16, 0.05, 0.42), red);
  chassis.position.y = 0.06;
  const arm = new Mesh(new BoxGeometry(0.06, 0.03, 0.26), red);
  arm.position.set(0, 0.12, -0.12);
  arm.rotation.x = 0.35;
  const handle = new Mesh(new CylinderGeometry(0.012, 0.012, 0.8, 8), steel);
  handle.position.set(0, 0.35, 0.42);
  handle.rotation.x = -0.9;
  const wheels = new InstancedMesh(
    new CylinderGeometry(0.035, 0.035, 0.025, 16),
    makeMaterial({ color: PALETTE.rubber, roughness: 0.9 }, 'environment'),
    4,
  );
  let k = 0;
  for (const x of [-0.09, 0.09]) {
    for (const z of [-0.17, 0.17]) {
      m.compose(
        new Vector3(x, 0.035, z),
        q.setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2),
        new Vector3(1, 1, 1),
      );
      wheels.setMatrixAt(k++, m);
    }
  }
  jack.add(chassis, arm, handle, wheels);
  jack.traverse((o) => (o.castShadow = true));
  group.add(jack);

  // potted plant on the back-left corner of the bench
  const plant = new Group();
  plant.position.set(-0.66, 0, -0.26);
  const pot = new Mesh(
    new CylinderGeometry(0.045, 0.035, 0.08, 20),
    makeMaterial({ color: PALETTE.pot, roughness: 0.85 }, 'environment'),
  );
  pot.position.y = 0.04;
  const soil = new Mesh(
    new CylinderGeometry(0.041, 0.041, 0.006, 20),
    makeMaterial({ color: '#3b2b20', roughness: 1 }, 'environment'),
  );
  soil.position.y = 0.078;
  const rnd = mulberry32(3);
  const leaves = new InstancedMesh(
    new IcosahedronGeometry(0.03, 0),
    makeMaterial({ color: PALETTE.plant, roughness: 0.7, flatShading: true }, 'environment'),
    14,
  );
  for (let i = 0; i < 14; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 0.01 + rnd() * 0.035;
    const y = 0.1 + rnd() * 0.11;
    m.compose(
      new Vector3(Math.cos(a) * r, y, Math.sin(a) * r),
      q.setFromAxisAngle(new Vector3(rnd(), rnd(), rnd()).normalize(), rnd() * 3),
      new Vector3(0.7 + rnd() * 0.6, 1.3 + rnd() * 0.8, 0.5),
    );
    leaves.setMatrixAt(i, m);
  }
  plant.add(pot, soil, leaves);
  plant.traverse((o) => (o.castShadow = true));
  group.add(plant);

  // a coil of spare cable hanging on the rack (reads as "lab")
  const coil = new Mesh(
    new TorusGeometry(0.06, 0.008, 8, 32),
    makeMaterial({ color: PALETTE.hvOrange, roughness: 0.5 }, 'environment'),
  );
  coil.position.set(-0.85, 0.45, backZ + 0.03);
  group.add(coil);

  mergeStatic(group);
  return { object3d: group, update() {}, dispose: () => disposeTree(group) };
}
