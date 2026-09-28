/**
 * Field visuals orchestration (TECH_SPEC §9 Field row, §10.1–10.2).
 *   In the motor, on the non-drive end face of the stack and drawn through the machine ("x-ray"):
 *     field arrow, rotor d-axis arrow, load-angle arc, 54 gap arrows, flux-line ribbons.
 *   Above the motor: the hologram (field lens).
 * Follow mode sets how much shows (400 ms fades): All → the field arrow at 60 %; Field →
 * everything plus the hologram; Power/Heat → nothing. Every effect reads the same FieldView.
 */
import { Group, Vector3, type Camera } from 'three';
import { GEOMETRY } from '@/config/motor';
import { THEME } from '@/config/theme';
import { angleDiff, createAngleArc, createFieldArrow, type FxOptions } from '@/scene/fx/fieldArrow';
import { fieldView } from '@/scene/fx/fieldState';
import { createFluxLines } from '@/scene/fx/fluxLines';
import { createGapArrows } from '@/scene/fx/gapArrows';
import { createHologram } from '@/scene/fx/hologram';
import type { FrameContext, SceneModule } from '@/scene/module';
import { MOTOR_POS } from '@/scene/motor/motor';
import type { Rig } from '@/scene/rig';
import { approach } from '@/util/math';

const G = GEOMETRY;
const XRAY: FxOptions = { xray: true, renderOrder: 12 };
const FADE_TAU = 0.13; // ≈ 400 ms to settle

export function createFieldFx(rig: Rig, camera: Camera): SceneModule<Group> {
  const group = new Group();
  group.name = 'fieldFx';

  // in-motor set, motor-local, on the non-drive end face of the stack
  const inMotor = new Group();
  inMotor.position.x = -G.stackLength / 2 - 0.004;
  const flux = createFluxLines({ rCenter: 0.068, bMin: 0.012, bMax: 0.037, width: 0.0011 }, XRAY);
  const gap = createGapArrows(G.statorBoreR, 0.011, 0.0032, XRAY);
  const fieldArrow = createFieldArrow(THEME.field, 0.0055, XRAY, 2.0);
  const rotorArrow = createFieldArrow('#ffffff', 0.0028, XRAY, 1.3);
  const arc = createAngleArc(XRAY);
  inMotor.add(flux.object3d, gap.object3d, fieldArrow.object3d, rotorArrow.object3d, arc.object3d);
  rig.motor.object3d.add(inMotor);

  const holo = createHologram(
    new Vector3(MOTOR_POS[0] + 0.02, MOTOR_POS[1] + 0.5, MOTOR_POS[2] - 0.06),
    1.9,
  );
  rig.object3d.add(holo.object3d);

  const level = { arrow: 0, full: 0, holo: 0 };
  return {
    object3d: group,
    update(ctx: FrameContext) {
      const f = fieldView(ctx);
      const follow = ctx.ui.follow;
      const k = approach(ctx.dt, FADE_TAU);
      level.arrow += ((follow === 'all' ? 0.6 : follow === 'field' ? 1 : 0) - level.arrow) * k;
      level.full += ((follow === 'field' ? 1 : 0) - level.full) * k;
      level.holo += ((follow === 'field' ? 1 : 0) - level.holo) * k;

      const len = (G.rotorOuterR - 0.004) * Math.min(f.strength, 1.15);
      fieldArrow.set(f.poleMech, len);
      fieldArrow.material.opacity = level.arrow * f.visible;
      fieldArrow.object3d.visible = fieldArrow.material.opacity > 0.01 && len > 1e-4;
      rotorArrow.set(f.rotorMech, G.rotorOuterR * 0.7);
      rotorArrow.material.opacity = level.full * (ctx.realTime ? 0 : 0.9);
      rotorArrow.object3d.visible = rotorArrow.material.opacity > 0.01;
      arc.set(f.rotorMech, f.rotorMech + angleDiff(f.poleMech, f.rotorMech), 0.026);
      arc.material.opacity = level.full * f.visible * (ctx.ui.onlyPhaseA ? 0 : 1);
      arc.object3d.visible = arc.material.opacity > 0.01;
      gap.set(f.thetaElec, f.p, f.strength, level.full * f.visible);
      flux.set(
        f.p,
        f.poleMech,
        f.strength,
        ctx.angles.tDisplay * 0.6,
        level.full * f.visible * 0.8,
      );

      holo.update(ctx, f, level.holo, camera);
    },
    dispose() {},
  };
}
