/**
 * Dark lab room (TECH_SPEC §4.1): walls, floor and emissive ceiling light strips (bloom).
 */
import {
  BackSide,
  BoxGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
} from 'three';
import { ENVIRONMENT } from '@/config/environment';
import { PALETTE } from '@/config/theme';
import { makeMaterial } from '@/scene/materials';
import { disposeTree, type SceneModule } from '@/scene/module';

export function createRoom(): SceneModule<Group> {
  const group = new Group();
  group.name = 'room';
  const R = ENVIRONMENT.room;

  const walls = new Mesh(
    new BoxGeometry(R.halfX * 2, R.height, R.halfZ * 2),
    makeMaterial(
      { color: PALETTE.room, roughness: 0.92, metalness: 0, side: BackSide },
      'environment',
    ),
  );
  walls.position.set(0, R.floorY + R.height / 2 - 0.001, R.backZ + R.halfZ);
  group.add(walls);

  // back wall panel close behind the bench (the screens and tool rack hang on it)
  const back = new Mesh(
    new PlaneGeometry(4.2, R.height),
    makeMaterial({ color: '#141824', roughness: 0.85, metalness: 0.05 }, 'environment'),
  );
  back.position.set(0, R.floorY + R.height / 2, R.backZ);
  back.receiveShadow = true;
  group.add(back);

  const floorGeo = new PlaneGeometry(R.halfX * 2, R.halfZ * 2);
  floorGeo.rotateX(-Math.PI / 2);
  const floor = new Mesh(
    floorGeo,
    makeMaterial({ color: PALETTE.roomFloor, roughness: 0.55, metalness: 0.2 }, 'environment'),
  );
  floor.position.set(0, R.floorY, R.backZ + R.halfZ);
  floor.receiveShadow = true;
  group.add(floor);

  const strips = new InstancedMesh(
    new BoxGeometry(2.4, 0.025, 0.06),
    new MeshBasicMaterial({ color: new Color(PALETTE.lightStrip).multiplyScalar(2.2) }),
    4,
  );
  const m = new Matrix4();
  let k = 0;
  for (const x of [-1.4, 1.4]) {
    for (const z of [-0.2, 1.2])
      strips.setMatrixAt(k++, m.makeTranslation(x, R.floorY + R.height - 0.05, z));
  }
  group.add(strips);

  return { object3d: group, update() {}, dispose: () => disposeTree(group) };
}
