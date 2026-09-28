/**
 * Motor assembly (TECH_SPEC §5.1–5.3): housing, stator, hairpin winding, the two swappable rotors
 * and the shaft, placed on the motor axis inside the 1:3 rig. Motor-local x is the machine axis.
 */
import { Group } from 'three';
import { RIG } from '@/config/environment';
import type { MotorKind } from '@/config/motor';
import { disposeTree, type FrameContext, type SceneModule } from '@/scene/module';
import { acTerminalsMotorLocal } from '@/scene/inverter/busbars';
import { createHousing, type Housing } from '@/scene/motor/housing';
import { createRotorIM } from '@/scene/motor/rotorIM';
import { createRotorPM } from '@/scene/motor/rotorPM';
import { createRotorSwap, type RotorSwap } from '@/scene/motor/rotorSwap';
import { createShaft } from '@/scene/motor/shaft';
import { createStator } from '@/scene/motor/stator';
import { createWindings, type Windings } from '@/scene/motor/windings';

/** Motor centre in rig coordinates (full-scale metres). */
export const MOTOR_POS = [
  RIG.motorX,
  RIG.axleY + RIG.motorOffset[0],
  RIG.axleZ + RIG.motorOffset[1],
] as const;

export interface Motor extends SceneModule<Group> {
  readonly housing: Housing;
  readonly windings: Windings;
  readonly rotors: RotorSwap;
}

export function createMotor(initial: MotorKind): Motor {
  const group = new Group();
  group.name = 'motor';
  group.position.set(...MOTOR_POS);
  const housing = createHousing();
  const stator = createStator();
  const windings = createWindings(acTerminalsMotorLocal());
  const rotors = createRotorSwap({ pm: createRotorPM(), im: createRotorIM() }, initial);
  const shaft = createShaft();
  const parts: SceneModule[] = [housing, stator, windings, rotors, shaft];
  parts.forEach((p) => group.add(p.object3d));
  return {
    object3d: group,
    housing,
    windings,
    rotors,
    update(ctx: FrameContext) {
      housing.object3d.visible = !ctx.ui.debugHousing;
      parts.forEach((p) => p.update(ctx));
    },
    dispose() {
      parts.forEach((p) => p.dispose());
      disposeTree(group);
    },
  };
}
