/**
 * SiC switch modules and their gate-driver LEDs (TECH_SPEC §5.4, §6.7, §15).
 *  - 6 dark tiles with gold terminals (3 half-bridge legs × upper/lower), one instanced draw.
 *  - One LED per switch on the gate-driver board, in its leg's phase colour.
 *  - Slow-mo ≥ ×1000: the LEDs follow the PWM switch states (visible flicker at ×10000,
 *    each 10 kHz carrier period lasting 1 s). Below ×1000: averaged glow = duty cycle, no strobe.
 *  - Reduced motion: the flicker is sampled at most 3 times per second.
 */
import {
  BoxGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  SphereGeometry,
} from 'three';
import { PALETTE, PHASE_COLORS } from '@/config/theme';
import { makeMaterial } from '@/scene/materials';
import type { FrameContext } from '@/scene/module';
import { FLOOR_Y, LEG_X, SWITCH_Z } from '@/scene/inverter/busbars';
import { prefersReducedMotion } from '@/util/easing';

const FLICKER_MIN_SLOWMO = 1000;
const REDUCED_MAX_HZ = 3;

export interface Switches {
  readonly object3d: Group;
  readonly boardY: number;
  update(ctx: FrameContext): void;
}

export function createSwitches(): Switches {
  const group = new Group();
  group.name = 'switches';
  const m = new Matrix4();
  const tiles = new InstancedMesh(
    new BoxGeometry(0.036, 0.008, 0.05),
    makeMaterial({ color: PALETTE.sic, roughness: 0.55, metalness: 0.3 }, 'power'),
    6,
  );
  const terms = new InstancedMesh(
    new BoxGeometry(0.006, 0.004, 0.012),
    makeMaterial({ color: PALETTE.gold, roughness: 0.3, metalness: 1 }, 'power'),
    18,
  );
  let k = 0;
  let t = 0;
  for (let leg = 0; leg < 3; leg++) {
    for (let s = 0; s < 2; s++) {
      const x = LEG_X[leg] ?? 0;
      const z = SWITCH_Z[s] ?? 0;
      tiles.setMatrixAt(k++, m.makeTranslation(x, FLOOR_Y + 0.008, z));
      for (const dx of [-0.012, 0, 0.012])
        terms.setMatrixAt(t++, m.makeTranslation(x + dx, FLOOR_Y + 0.012, z + 0.026));
    }
  }
  group.add(tiles, terms);

  // gate-driver PCB above the switches with 6 LEDs
  const boardY = FLOOR_Y + 0.05;
  const board = new InstancedMesh(
    new BoxGeometry(0.17, 0.002, 0.14),
    makeMaterial({ color: PALETTE.pcb, roughness: 0.6, metalness: 0.1 }, 'power'),
    1,
  );
  board.setMatrixAt(0, m.makeTranslation(0.06, boardY, 0));
  group.add(board);
  const ledMat = new MeshBasicMaterial({ toneMapped: false });
  const leds = new InstancedMesh(new SphereGeometry(0.0045, 10, 8), ledMat, 6);
  k = 0;
  for (let leg = 0; leg < 3; leg++) {
    for (let s = 0; s < 2; s++) {
      leds.setMatrixAt(
        k,
        m.makeTranslation((LEG_X[leg] ?? 0) - 0.012, boardY + 0.004, (SWITCH_Z[s] ?? 0) * 0.7),
      );
      leds.setColorAt(k, new Color(PHASE_COLORS[leg]));
      k++;
    }
  }
  group.add(leds);

  const base = PHASE_COLORS.map((c) => new Color(c));
  const tmp = new Color();
  const reduced = prefersReducedMotion();
  let sampleT = 0;
  const held: boolean[] = [false, true, false, true, false, true];

  return {
    object3d: group,
    boardY,
    update(ctx: FrameContext) {
      const a = ctx.angles;
      const flicker = a.slowMo >= FLICKER_MIN_SLOWMO;
      sampleT += ctx.dt;
      if (!reduced || sampleT >= 1 / REDUCED_MAX_HZ) {
        sampleT = 0;
        a.switchStates.forEach((on, i) => (held[i] = on));
      }
      const active = Math.abs(ctx.snapshot.tMotor) > 0.5 || ctx.snapshot.iPeak > 1;
      for (let i = 0; i < 6; i++) {
        const leg = Math.floor(i / 2);
        const upper = i % 2 === 0;
        const duty = a.duty[leg] ?? 0.5;
        let level: number;
        if (!active) level = 0.05;
        else if (flicker) level = held[i] ? 1 : 0.04;
        else level = upper ? duty : 1 - duty;
        tmp.copy(base[leg] ?? base[0]!).multiplyScalar(0.15 + 3.2 * level);
        leds.setColorAt(i, tmp);
      }
      if (leds.instanceColor) leds.instanceColor.needsUpdate = true;
    },
  };
}
