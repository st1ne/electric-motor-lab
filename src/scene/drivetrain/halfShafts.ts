/**
 * Half-shafts with inner and outer CV joints and rubber boots (TECH_SPEC §5.5), from the
 * differential side gears to the wheel hubs along the axle. They turn with the wheels.
 */
import { CylinderGeometry, Group, Mesh, SphereGeometry } from 'three';
import { RIG } from '@/config/environment';
import { PALETTE } from '@/config/theme';
import { mergeStatic } from '@/scene/mergeStatic';
import { makeMaterial } from '@/scene/materials';
import { disposeTree, type SceneModule } from '@/scene/module';
import { DIFF_CENTER_X } from '@/scene/drivetrain/differential';

export interface HalfShafts extends SceneModule<Group> {
  setAngles(left: number, right: number): void;
}

export function createHalfShafts(): HalfShafts {
  const group = new Group();
  group.name = 'halfShafts';
  const steel = makeMaterial({ color: PALETTE.steel, metalness: 0.9, roughness: 0.35 }, 'power');
  const joint = makeMaterial({ color: '#8e97a2', metalness: 0.9, roughness: 0.3 }, 'power');
  const boot = makeMaterial({ color: PALETTE.rubber, metalness: 0, roughness: 0.75 }, 'power');
  const hubInner = RIG.trackHalf - RIG.wheelWidth / 2 - 0.03;
  const shafts: Group[] = [];
  for (const side of [-1, 1]) {
    const g = new Group();
    g.position.set(0, RIG.axleY, RIG.axleZ);
    const x0 = side < 0 ? DIFF_CENTER_X - 0.07 : DIFF_CENTER_X + 0.13;
    const x1 = side * hubInner;
    const len = Math.abs(x1 - x0);
    const shaft = new Mesh(new CylinderGeometry(0.013, 0.013, len - 0.12, 16), steel);
    shaft.rotation.z = Math.PI / 2;
    shaft.position.x = (x0 + x1) / 2;
    shaft.castShadow = true;
    g.add(shaft);
    for (const [x, dir] of [
      [x0, side],
      [x1, -side],
    ] as const) {
      const cv = new Mesh(new SphereGeometry(0.036, 20, 14), joint);
      cv.scale.set(0.9, 1, 1);
      cv.position.x = x;
      cv.castShadow = true;
      const bootGeo = new CylinderGeometry(0.016, 0.032, 0.07, 18, 3);
      bootGeo.rotateZ(dir > 0 ? -Math.PI / 2 : Math.PI / 2);
      const b = new Mesh(bootGeo, boot);
      b.position.x = x + dir * 0.055;
      b.castShadow = true;
      g.add(cv, b);
    }
    mergeStatic(g);
    shafts.push(g);
    group.add(g);
  }
  return {
    object3d: group,
    setAngles(left, right) {
      const [l, r] = shafts;
      if (l) l.rotation.x = left;
      if (r) r.rotation.x = right;
    },
    update() {},
    dispose: () => disposeTree(group),
  };
}
