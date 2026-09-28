/**
 * Open differential (TECH_SPEC §5.5): a carrier bolted to the ring gear with a cross pin, two
 * spider (bevel) gears on the pin and two side gears on the half-shaft ends. The carrier turns
 * with the ring gear; the spiders spin about their pin only if the wheels turn at different
 * speeds: ω_spider = (ω_L − ω_R)/2 · z_side/z_spider (wired in, zero on the dyno).
 */
import { CylinderGeometry, Group, Mesh } from 'three';
import { RIG } from '@/config/environment';
import { mergeStatic } from '@/scene/mergeStatic';
import { makeMaterial } from '@/scene/materials';
import { disposeTree, type FrameContext, type SceneModule } from '@/scene/module';
import { annulusShape, extrudeAxial } from '@/scene/motor/profile';

/** Carrier centre (rig x): the case sits on the −x side of the ring gear. */
export const DIFF_CENTER_X = RIG.diffX - 0.045;
const SIDE_TEETH = 16;
const SPIDER_TEETH = 10;

export interface Differential extends SceneModule<Group> {
  /** wheel angles (left, right), rad; equal on the dyno */
  setWheelAngles(left: number, right: number): void;
}

export function createDifferential(ringAngle: () => number): Differential {
  const group = new Group();
  group.name = 'differential';
  group.position.set(DIFF_CENTER_X, RIG.axleY, RIG.axleZ);
  const caseMat = makeMaterial({ color: '#7d8691', metalness: 0.9, roughness: 0.38 }, 'power');
  const gearMat = makeMaterial({ color: '#b4bcc6', metalness: 0.95, roughness: 0.3 }, 'power');

  const carrier = new Group();
  const flangeGeo = extrudeAxial(annulusShape(0.016, 0.058), 0.008, 64);
  for (const sx of [-1, 1]) {
    const f = new Mesh(flangeGeo, caseMat);
    f.position.x = sx * 0.05;
    f.castShadow = true;
    carrier.add(f);
  }
  const barGeo = new CylinderGeometry(0.008, 0.008, 0.1, 10);
  barGeo.rotateZ(Math.PI / 2);
  for (const phi of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) {
    const b = new Mesh(barGeo, caseMat);
    b.position.set(0, 0.05 * Math.cos(phi), 0.05 * Math.sin(phi));
    carrier.add(b);
  }
  const pin = new Mesh(new CylinderGeometry(0.006, 0.006, 0.1, 12), caseMat);
  carrier.add(pin);

  // spider gears on the cross pin (axis along the carrier's y), tips pointing inward
  const spiderGeo = new CylinderGeometry(0.011, 0.021, 0.016, SPIDER_TEETH * 2);
  const spiders: Mesh[] = [];
  for (const sy of [-1, 1]) {
    const sp = new Mesh(spiderGeo, gearMat);
    sp.position.y = sy * 0.03;
    if (sy < 0) sp.rotation.z = Math.PI;
    sp.castShadow = true;
    carrier.add(sp);
    spiders.push(sp);
  }
  mergeStatic(carrier, spiders);
  group.add(carrier);

  // side gears on the half-shaft ends (axis x), tips pointing inward
  const sideGeo = new CylinderGeometry(0.02, 0.032, 0.02, SIDE_TEETH * 2);
  sideGeo.rotateZ(Math.PI / 2);
  const sides: Mesh[] = [];
  for (const sx of [-1, 1]) {
    const sg = new Mesh(sideGeo, gearMat);
    sg.position.x = sx * 0.03;
    if (sx > 0) sg.rotation.y = Math.PI;
    sg.castShadow = true;
    group.add(sg);
    sides.push(sg);
  }

  let left = 0;
  let right = 0;
  return {
    object3d: group,
    setWheelAngles(l, r) {
      left = l;
      right = r;
    },
    update(_ctx: FrameContext) {
      carrier.rotation.x = ringAngle();
      const [sl, sr] = sides;
      if (sl) sl.rotation.x = left;
      if (sr) sr.rotation.x = right;
      // spiders turn relative to the carrier by the wheel difference (zero here)
      const spin = ((left - right) / 2) * (SIDE_TEETH / SPIDER_TEETH);
      spiders.forEach((s, i) => (s.rotation.y = (i === 0 ? 1 : -1) * spin));
    },
    dispose: () => disposeTree(group),
  };
}
