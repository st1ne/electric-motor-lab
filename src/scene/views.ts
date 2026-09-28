/**
 * Views: Whole / Cutaway / Exploded (TECH_SPEC §8).
 *   Cut (Cutaway and Exploded): the two planes through the motor axis slide in over 0.9 s
 *     (easeInOutCubic); the non-drive end cap, the inverter lid and the gearbox cover come off.
 *     Section caps and the violet edge come from the cut materials (materials.ts).
 *   Exploded: 1.1 s easeInOutCubic with a 60 ms stagger: housing quarters move out radially by
 *     40 % of the housing radius, the rotor slides out axially (through the non-drive end: the
 *     gearbox fills the output side), the inverter lifts, the gearbox casing slides off along the
 *     axle and the stage-2 pinion spreads along its shaft. Dashed guide lines join each moved part
 *     to its home. The rotor and field keep animating throughout.
 * Everything is driven by two progress values, so views can change at any moment without pops.
 */
import {
  BufferAttribute,
  BufferGeometry,
  LineDashedMaterial,
  LineSegments,
  Vector3,
  type Object3D,
} from 'three';
import { GEOMETRY } from '@/config/motor';
import { THEME } from '@/config/theme';
import { setCut } from '@/scene/materials';
import type { FrameContext, SceneModule } from '@/scene/module';
import { MOTOR_POS } from '@/scene/motor/motor';
import type { Rig } from '@/scene/rig';
import { toModel } from '@/scene/units';
import { easeInOutCubic, prefersReducedMotion } from '@/util/easing';
import { clamp } from '@/util/math';

const CUT_S = 0.9;
const EXPLODE_S = 1.1;
const STAGGER_S = 0.06;

interface Part {
  obj: Object3D;
  home: Vector3;
  /** full-explode offset in the object's parent frame */
  offset: Vector3;
  order: number;
  guide: boolean;
}

export interface Views extends SceneModule<LineSegments> {
  /** 0 = closed, 1 = fully cut */
  readonly cut: number;
  /** 0 = assembled, 1 = fully exploded */
  readonly explode: number;
}

export function createViews(rig: Rig): Views {
  const reduced = prefersReducedMotion();
  const { housing, rotors } = rig.motor;
  const inv = rig.inverter;
  const red = rig.reduction;
  const R = GEOMETRY.housingOuterR;

  const parts: Part[] = [];
  const add = (obj: Object3D, offset: Vector3, order: number, guide = true): void => {
    parts.push({ obj, home: obj.position.clone(), offset, order, guide });
  };
  housing.quarters.forEach((q) => {
    const phi = (q.userData.phiMid as number) ?? 0;
    add(q, new Vector3(0, Math.cos(phi), Math.sin(phi)).multiplyScalar(0.4 * R), 0);
  });
  add(housing.endCap, new Vector3(-0.16, 0, 0), 1);
  add(rotors.object3d, new Vector3(-1.7 * GEOMETRY.stackLength, 0, 0), 2);
  add(inv.object3d, new Vector3(0, 0.24, 0), 3);
  add(red.perimeter, new Vector3(0.24, 0, 0), 4);
  add(red.gears.z3, new Vector3(0.05, 0, 0), 5);
  const lidHome = inv.lid.position.clone();
  const endCapHome = housing.endCap.position.clone();
  const coverHome = red.cover.position.clone();

  // dashed guide lines (world space, the scene root)
  const guideParts = parts.filter((p) => p.guide);
  const pos = new Float32Array(guideParts.length * 6);
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  const lines = new LineSegments(
    geo,
    new LineDashedMaterial({
      color: THEME.field,
      dashSize: 0.006,
      gapSize: 0.005,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
  );
  lines.frustumCulled = false;
  lines.name = 'explodeGuides';
  const homesWorld: Vector3[] = [];
  const tmp = new Vector3();

  const axisY = toModel(MOTOR_POS[1]);
  const axisZ = toModel(MOTOR_POS[2]);
  let cutT = 0;
  let explodeT = 0;
  let cut = 0;
  let explode = 0;
  let first = true;

  return {
    object3d: lines,
    get cut() {
      return cut;
    },
    get explode() {
      return explode;
    },
    update(ctx: FrameContext) {
      const ui = ctx.ui;
      if (first) {
        // homes in world space for the guide lines (the rig is static)
        guideParts.forEach((p) => homesWorld.push(p.obj.getWorldPosition(new Vector3())));
      }
      const wantCut = ui.view !== 'whole' ? 1 : 0;
      const wantExplode = ui.view === 'exploded' ? 1 : 0;
      const step = (t: number, want: number, dur: number): number =>
        first || reduced ? want * dur : clamp(t + (want ? 1 : -1) * ctx.dt, 0, dur);
      cutT = step(cutT, wantCut, CUT_S);
      const maxStagger = STAGGER_S * 5;
      explodeT = step(explodeT, wantExplode, EXPLODE_S + maxStagger);
      first = false;
      cut = easeInOutCubic(cutT / CUT_S);
      explode = clamp(explodeT / EXPLODE_S, 0, 1);

      setCut(axisY, axisZ, cut < 0.002 ? 0 : cut);

      // parts that simply come off in the cut views
      housing.endCap.visible = cut < 0.995 || explode > 0;
      inv.lid.position.set(lidHome.x, lidHome.y + 0.16 * cut, lidHome.z);
      inv.lid.visible = cut < 0.98;
      red.cover.position.set(coverHome.x + 0.2 * cut, coverHome.y, coverHome.z);
      red.cover.visible = cut < 0.98 && !ui.debugHousing;
      red.perimeter.visible = !ui.debugHousing;
      red.backPlate.visible = !ui.debugHousing;
      housing.object3d.visible = !ui.debugHousing;

      for (const p of parts) {
        const k = easeInOutCubic(clamp((explodeT - p.order * STAGGER_S) / EXPLODE_S, 0, 1));
        p.obj.position.copy(p.home).addScaledVector(p.offset, k);
      }
      // the end cap also slides away while the cut opens
      const ec = parts.find((p) => p.obj === housing.endCap);
      if (ec) {
        const k = easeInOutCubic(clamp((explodeT - ec.order * STAGGER_S) / EXPLODE_S, 0, 1));
        housing.endCap.position.x = endCapHome.x - 0.25 * cut + ec.offset.x * k;
      }

      // guide lines
      const mat = lines.material as LineDashedMaterial;
      mat.opacity = 0.7 * explode;
      lines.visible = explode > 0.01;
      if (lines.visible) {
        guideParts.forEach((p, i) => {
          const home = homesWorld[i];
          if (!home) return;
          p.obj.getWorldPosition(tmp);
          pos.set([home.x, home.y, home.z, tmp.x, tmp.y, tmp.z], i * 6);
        });
        geo.attributes.position!.needsUpdate = true;
        lines.computeLineDistances();
      }
    },
    dispose() {
      geo.dispose();
      (lines.material as LineDashedMaterial).dispose();
    },
  };
}
