/**
 * The §3.7 label table: anchors, live values (all from the snapshot via format.ts), the Follow /
 * View / motor rules, and the coarse occlusion proxies (housing and gearbox in Whole view, the
 * wheels always).
 *
 * | Name          | Value             | Visible in                 |
 * | Phase A/B/C   | +412 A            | All, Field                 |
 * | Field         | turning 471 Hz    | All, Field                 |
 * | Rotor         | 9,420 rpm         | All, Field                 |
 * | Load angle    | 118°              | Field                      |
 * | Bar current   | 2,300 A           | Field (Induction)          |
 * | Air gap       | 0.7 mm            | Cutaway, Exploded          |
 * | Inverter      | SiC · 10 kHz      | All, Power                 |
 * | Battery       | 368 V · 520 A     | Power                      |
 * | Reduction     | 9.0 : 1           | Cutaway, Exploded, Power   |
 * | Differential  | open              | Exploded                   |
 * | Wheel         | 1,047 rpm         | All                        |
 * | Cooling       | oil 70 °C         | Heat                       |
 * | Winding       | 118 °C            | Heat                       |
 * | Magnets       | 92 °C             | Heat (Magnet)              |
 */
import {
  BoxGeometry,
  CylinderGeometry,
  Mesh,
  MeshBasicMaterial,
  Vector3,
  type BufferGeometry,
  type Object3D,
} from 'three';
import { RIG } from '@/config/environment';
import { F_SW_HZ, GEOMETRY } from '@/config/motor';
import { THERMAL } from '@/config/thermal';
import { fmt, fmtC, fmtRpm, fmtSigned } from '@/physics/format';
import { DIFF_CENTER_X } from '@/scene/drivetrain/differential';
import { AXLE, INTERMEDIATE, MOTOR_AXIS, RATIO_OUTPUT } from '@/scene/drivetrain/reduction';
import { angleDiff } from '@/scene/fx/fieldArrow';
import { fieldView } from '@/scene/fx/fieldState';
import type { LabelSpec, LabelTone, OcclusionProxy } from '@/scene/labels';
import type { FrameContext } from '@/scene/module';
import { MOTOR_POS } from '@/scene/motor/motor';
import { slotAngle, slotPhase } from '@/scene/motor/profile';
import { layerRadius } from '@/scene/motor/windings';
import type { Rig } from '@/scene/rig';
import type { FollowMode, ViewMode } from '@/state/uiState';

const G = GEOMETRY;
const HALF_L = G.stackLength / 2;
const DEG = Math.PI / 180;
/** field-lens plane on the non-drive end face of the stack (fieldFx.ts) */
const FX_X = -HALF_L - 0.004;

const inFollow = (ctx: FrameContext, ...modes: FollowMode[]): boolean =>
  modes.includes(ctx.ui.follow);
const inView = (ctx: FrameContext, ...views: ViewMode[]): boolean => views.includes(ctx.ui.view);
const flowTone = (ctx: FrameContext): LabelTone => (ctx.snapshot.pDc < 0 ? 'regen' : 'power');

/** The phase's slot inside the cutaway quadrant (φ 0…90°) closest to `targetDeg`. */
export function phaseSlot(phase: number, targetDeg: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let k = 0; k < G.slots; k++) {
    if (slotPhase(k).phase !== phase) continue;
    const phi = angleDiff(slotAngle(k), 0);
    if (phi < 5 * DEG || phi > 85 * DEG) continue;
    const d = Math.abs(phi - targetDeg * DEG);
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  return best;
}

export interface LabelSetup {
  readonly specs: LabelSpec[];
  readonly proxies: OcclusionProxy[];
  dispose(): void;
}

export function createLabelDefs(rig: Rig): LabelSetup {
  const motor = rig.motor.object3d;
  const rotors = rig.motor.rotors.object3d;
  const root = rig.object3d;

  // ---- occlusion proxies (invisible; raycasts ignore visibility)
  const geos: BufferGeometry[] = [];
  const mat = new MeshBasicMaterial();
  const proxy = (geo: BufferGeometry, parent: Object3D, name: string): Mesh => {
    geos.push(geo);
    const m = new Mesh(geo, mat);
    m.name = `proxy-${name}`;
    m.visible = false;
    parent.add(m);
    return m;
  };
  const housingGeo = new CylinderGeometry(G.housingOuterR, G.housingOuterR, G.housingLength, 16);
  housingGeo.rotateZ(Math.PI / 2);
  const housing = proxy(housingGeo, motor, 'housing');
  const gbH = MOTOR_AXIS[0] - AXLE[0] + 0.2;
  const gbD = MOTOR_AXIS[1] - AXLE[1] + 0.2;
  const gearbox = proxy(new BoxGeometry(RIG.gearboxWidth, gbH, gbD), root, 'gearbox');
  gearbox.position.set(RIG.gearboxX, (MOTOR_AXIS[0] + AXLE[0]) / 2, (MOTOR_AXIS[1] + AXLE[1]) / 2);
  const wheelGeo = new CylinderGeometry(RIG.wheelRadius, RIG.wheelRadius, RIG.wheelWidth, 16);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [-1, 1].map((sx) => {
    const m = proxy(wheelGeo, root, 'wheel');
    m.position.set(sx * RIG.trackHalf, AXLE[0], AXLE[1]);
    return m;
  });
  const whole = (ui: { view: ViewMode }): boolean => ui.view === 'whole';
  const proxies: OcclusionProxy[] = [
    { mesh: housing, active: whole },
    { mesh: gearbox, active: whole },
    ...wheels.map((mesh) => ({ mesh, active: () => true })),
  ];

  const inMotor = (out: Vector3, x: number, r: number, phi: number): Vector3 =>
    motor.localToWorld(out.set(x, r * Math.cos(phi), r * Math.sin(phi)));
  const inRig = (out: Vector3, x: number, y: number, z: number): Vector3 =>
    root.localToWorld(out.set(x, y, z));

  const endTurnX = -HALF_L - G.endTurnReach * 0.75;
  const phaseSpec = (ph: 0 | 1 | 2, targetDeg: number, priority: number): LabelSpec => {
    const phi = slotAngle(phaseSlot(ph, targetDeg)) + (4.5 * (2 * Math.PI)) / G.slots;
    const key = (['ia', 'ib', 'ic'] as const)[ph];
    return {
      id: `phase-${'abc'[ph]}`,
      name: `Phase ${'ABC'[ph]}`,
      tone: (['phase-a', 'phase-b', 'phase-c'] as const)[ph],
      priority,
      anchor: (out) => inMotor(out, endTurnX, layerRadius(4) + 0.004, phi),
      value: (ctx) =>
        ctx.realTime ? `${fmt(ctx.snapshot.iPeak)} A pk` : `${fmtSigned(ctx.angles[key])} A`,
      visible: (ctx) => inFollow(ctx, 'all', 'field') && (!ctx.ui.onlyPhaseA || ph === 0),
    };
  };

  const specs: LabelSpec[] = [
    {
      id: 'field',
      name: 'Field',
      tone: 'field',
      priority: 10,
      anchor(out, ctx) {
        const f = fieldView(ctx);
        const len = (G.rotorOuterR - 0.004) * Math.min(Math.max(f.strength, 0.3), 1.15);
        return inMotor(out, FX_X, len, f.poleMech);
      },
      value: (ctx) =>
        ctx.ui.onlyPhaseA
          ? 'pulsating'
          : `turning ${fmt(Math.abs(ctx.snapshot.omegaE) / (2 * Math.PI))} Hz`,
      visible: (ctx) =>
        inFollow(ctx, 'all', 'field') &&
        fieldView(ctx).visible > 0.5 &&
        fieldView(ctx).strength > 0.05,
      ignore: [housing],
    },
    {
      id: 'rotor',
      name: 'Rotor',
      tone: 'structure',
      priority: 9,
      anchor: (out, ctx) =>
        rotors.localToWorld(
          out.set(
            FX_X,
            G.rotorOuterR * 0.7 * Math.cos(ctx.mechAngle),
            G.rotorOuterR * 0.7 * Math.sin(ctx.mechAngle),
          ),
        ),
      value: (ctx) => fmtRpm(ctx.snapshot.rpm),
      visible: (ctx) => inFollow(ctx, 'all', 'field'),
    },
    phaseSpec(0, 78, 8),
    phaseSpec(1, 57, 7),
    phaseSpec(2, 37, 7),
    {
      id: 'load-angle',
      name: 'Load angle',
      tone: 'field',
      priority: 6,
      anchor(out, ctx) {
        const f = fieldView(ctx);
        const mid = f.rotorMech + angleDiff(f.poleMech, f.rotorMech) / 2;
        return inMotor(out, FX_X, 0.03, mid);
      },
      value: (ctx) => `${fmt(Math.abs(ctx.snapshot.loadAngle) / DEG)}°`,
      visible: (ctx) =>
        inFollow(ctx, 'field') &&
        !ctx.ui.onlyPhaseA &&
        !ctx.realTime &&
        Math.abs(ctx.snapshot.tMotor) > 1,
      ignore: [housing],
    },
    {
      id: 'bar-current',
      name: 'Bar current',
      tone: 'heat',
      priority: 6,
      anchor: (out) => rotors.localToWorld(out.set(HALF_L * 0.5, 0.047, 0.047)),
      value: (ctx) => `${fmt(ctx.snapshot.barCurrentA)} A`,
      visible: (ctx) => inFollow(ctx, 'field') && ctx.snapshot.motor === 'im',
    },
    {
      id: 'air-gap',
      name: 'Air gap',
      tone: 'structure',
      priority: 4,
      anchor: (out) => inMotor(out, HALF_L * 0.6, G.statorBoreR, 45 * DEG),
      value: () => `${fmt(G.airGap * 1000, 1)} mm`,
      visible: (ctx) => inView(ctx, 'cutaway', 'exploded') && !inFollow(ctx, 'power'),
    },
    {
      id: 'inverter',
      name: 'Inverter',
      tone: 'power',
      priority: 6,
      anchor: (out) =>
        inRig(
          out,
          MOTOR_POS[0] - 0.08,
          MOTOR_POS[1] + RIG.inverter.offsetY + 0.06,
          MOTOR_POS[2] + 0.08,
        ),
      value: () => `SiC · ${fmt(F_SW_HZ / 1000)} kHz`,
      visible: (ctx) => inFollow(ctx, 'all', 'power'),
      ignore: [housing],
    },
    {
      id: 'battery',
      name: 'Battery',
      tone: flowTone,
      priority: 6,
      anchor: (out) =>
        inRig(out, RIG.battery.x, RIG.battery.standHeight + 0.14, RIG.battery.z + 0.2),
      value: (ctx) => `${fmt(ctx.snapshot.vDc)} V · ${fmtSigned(ctx.snapshot.iDc)} A`,
      visible: (ctx) => inFollow(ctx, 'power'),
    },
    {
      id: 'reduction',
      name: 'Reduction',
      tone: 'structure',
      priority: 5,
      anchor: (out) => inRig(out, RIG.stage1X, INTERMEDIATE[0] + 0.08, INTERMEDIATE[1] + 0.05),
      value: () => `${fmt(1 / RATIO_OUTPUT, 1)} : 1`,
      visible: (ctx) => inView(ctx, 'cutaway', 'exploded') || inFollow(ctx, 'power'),
      ignore: [gearbox],
    },
    {
      id: 'differential',
      name: 'Differential',
      tone: 'structure',
      priority: 4,
      anchor: (out) => inRig(out, DIFF_CENTER_X, AXLE[0] + 0.07, AXLE[1] + 0.02),
      value: () => 'open',
      visible: (ctx) => inView(ctx, 'exploded'),
      ignore: [gearbox],
    },
    {
      id: 'wheel',
      name: 'Wheel',
      tone: flowTone,
      priority: 5,
      anchor: (out) => inRig(out, RIG.trackHalf, AXLE[0] + RIG.wheelRadius, AXLE[1]),
      value: (ctx) => fmtRpm(ctx.snapshot.wheelRpm),
      visible: (ctx) => inFollow(ctx, 'all', 'power'),
      ignore: wheels,
    },
    {
      id: 'cooling',
      name: 'Cooling',
      tone: 'heat',
      priority: 7,
      anchor: (out) => inMotor(out, HALF_L + 0.012, 0.05, 40 * DEG),
      value: () => `oil ${fmt(THERMAL.tOilC)} °C`,
      visible: (ctx) => inFollow(ctx, 'heat'),
    },
    {
      id: 'winding',
      name: 'Winding',
      tone: 'heat',
      priority: 9,
      anchor: (out) => inMotor(out, endTurnX, layerRadius(4) + 0.004, 60 * DEG),
      value: (ctx) => fmtC(ctx.snapshot.tWinding),
      visible: (ctx) => inFollow(ctx, 'heat'),
    },
    {
      id: 'magnets',
      name: 'Magnets',
      tone: 'heat',
      priority: 8,
      anchor: (out) => rotors.localToWorld(out.set(0, 0.045, 0.045)),
      value: (ctx) => fmtC(ctx.snapshot.tRotor),
      visible: (ctx) => inFollow(ctx, 'heat') && ctx.snapshot.motor === 'pm',
    },
  ];

  return {
    specs,
    proxies,
    dispose() {
      [housing, gearbox, ...wheels].forEach((m) => m.removeFromParent());
      geos.forEach((g) => g.dispose());
      mat.dispose();
    },
  };
}
