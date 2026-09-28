/**
 * The 1:3 rig on the bench (TECH_SPEC §4.1, §5): dyno, battery module, motor, inverter,
 * reduction, differential, half-shafts and wheels, all built in full-scale metres and scaled once
 * here. Every rotating part derives its angle from the visual rotor angle (FrameContext.mechAngle)
 * through the gear ratios, so the motor, gears, wheels and rollers always agree.
 */
import { Group } from 'three';
import { MODEL_SCALE, type MotorKind } from '@/config/motor';
import { createBattery } from '@/scene/environment/battery';
import { createDyno } from '@/scene/environment/dyno';
import { createDifferential } from '@/scene/drivetrain/differential';
import { createHalfShafts } from '@/scene/drivetrain/halfShafts';
import { createReduction, outputAngle } from '@/scene/drivetrain/reduction';
import { createWheels } from '@/scene/drivetrain/wheels';
import { createInverter } from '@/scene/inverter/inverter';
import { disposeTree, type FrameContext, type SceneModule } from '@/scene/module';
import { createMotor, type Motor } from '@/scene/motor/motor';

export interface Rig extends SceneModule<Group> {
  readonly motor: Motor;
}

export function createRig(initialMotor: MotorKind): Rig {
  const group = new Group();
  group.name = 'rig';
  group.scale.setScalar(MODEL_SCALE);
  const motor = createMotor(initialMotor);
  const reduction = createReduction();
  const differential = createDifferential(() => reduction.ringAngle);
  const halfShafts = createHalfShafts();
  const wheels = createWheels();
  const modules: SceneModule[] = [
    createDyno(),
    createBattery(),
    motor,
    createInverter(),
    reduction,
    differential,
    halfShafts,
    wheels,
  ];
  modules.forEach((m) => group.add(m.object3d));
  return {
    object3d: group,
    motor,
    update(ctx: FrameContext) {
      const wheelAngle = outputAngle(ctx.mechAngle);
      differential.setWheelAngles(wheelAngle, wheelAngle);
      halfShafts.setAngles(wheelAngle, wheelAngle);
      wheels.setAngles(wheelAngle, wheelAngle);
      for (const m of modules) m.update(ctx);
    },
    dispose() {
      modules.forEach((m) => m.dispose());
      disposeTree(group);
    },
  };
}
