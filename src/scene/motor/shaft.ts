/**
 * Hollow rotor shaft Ø40 mm with a Ø22 mm oil bore (TECH_SPEC §5.1), carrying the first-stage
 * pinion on the drive side (added by the reduction). Turns with the rotor.
 */
import { DoubleSide, Group, Mesh } from 'three';
import { GEOMETRY } from '@/config/motor';
import { PALETTE } from '@/config/theme';
import { makeMaterial } from '@/scene/materials';
import { disposeTree, type FrameContext, type SceneModule } from '@/scene/module';
import { annulusShape, extrudeAxial } from '@/scene/motor/profile';

/** Shaft extent along x in motor coordinates. */
export const SHAFT_X0 = -0.19;
export const SHAFT_X1 = SHAFT_X0 + GEOMETRY.shaftLength;

export function createShaft(): SceneModule<Group> {
  const group = new Group();
  group.name = 'shaft';
  const geo = extrudeAxial(
    annulusShape(GEOMETRY.shaftBoreR, GEOMETRY.shaftR),
    GEOMETRY.shaftLength,
    48,
  );
  const mat = makeMaterial(
    { color: PALETTE.steel, roughness: 0.3, metalness: 0.95, side: DoubleSide },
    'structure',
    {
      cut: true,
    },
  );
  const shaft = new Mesh(geo, mat);
  shaft.position.x = (SHAFT_X0 + SHAFT_X1) / 2;
  shaft.castShadow = true;
  group.add(shaft);
  return {
    object3d: group,
    update(ctx: FrameContext) {
      group.rotation.x = ctx.mechAngle;
    },
    dispose: () => disposeTree(group),
  };
}
