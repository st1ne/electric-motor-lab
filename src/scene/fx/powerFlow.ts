/**
 * Power flow (TECH_SPEC §9 Power): pulses along the energy path
 *   battery → HV cable → inverter → AC bars → coils → shaft → pinion → intermediate shaft →
 *   ring gear → differential → both half-shafts → wheels,
 * amber and forward while driving, green and reversed in regen; count and speed ∝ |P|.
 * Loss "leaks": small orange puffs rising from each component at a rate ∝ its loss.
 * Follow Power shows everything; All shows the pulses at 40 %; Field and Heat hide it (400 ms).
 * Built in rig metres and added to the rig group; drawn over the machine ("x-ray").
 */
import {
  AdditiveBlending,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { BATTERY } from '@/config/battery';
import { RIG } from '@/config/environment';
import { THEME } from '@/config/theme';
import { batteryTerminal, hvCableCurve } from '@/scene/environment/battery';
import { DIFF_CENTER_X } from '@/scene/drivetrain/differential';
import { AXLE, INTERMEDIATE, MOTOR_AXIS } from '@/scene/drivetrain/reduction';
import { INV, acTerminalLocal } from '@/scene/inverter/busbars';
import { disposeTree, type FrameContext, type SceneModule } from '@/scene/module';
import { MOTOR_POS } from '@/scene/motor/motor';
import { approach, mulberry32 } from '@/util/math';

const FADE_TAU = 0.13;
const MAX_PULSES = 64;
const MAX_PUFFS = 90;
/** |P| at which the flow is at full count and speed */
const P_FULL_W = 150e3;
const PUFF_LIFE_S = 0.9;

/** A polyline with cumulative arc length, sampled by fraction 0…1. */
class Path {
  private readonly pts: Vector3[];
  private readonly cum: number[] = [0];
  readonly length: number;
  constructor(points: Vector3[]) {
    this.pts = points;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1] as Vector3;
      const b = points[i] as Vector3;
      this.cum.push((this.cum[i - 1] ?? 0) + a.distanceTo(b));
    }
    this.length = this.cum[this.cum.length - 1] ?? 1;
  }
  at(u: number, out: Vector3): Vector3 {
    const d = u * this.length;
    let i = 1;
    while (i < this.cum.length - 1 && (this.cum[i] ?? 0) < d) i++;
    const d0 = this.cum[i - 1] ?? 0;
    const d1 = this.cum[i] ?? d0;
    const t = d1 > d0 ? (d - d0) / (d1 - d0) : 0;
    return out.lerpVectors(this.pts[i - 1] as Vector3, this.pts[i] as Vector3, t);
  }
}

/** The two power paths (to the left and right wheel) in rig metres. */
export function powerPaths(): [Path, Path] {
  const [mx, my, mz] = MOTOR_POS;
  const v = (x: number, y: number, z: number): Vector3 => new Vector3(x, y, z);
  const pts: Vector3[] = [batteryTerminal()];
  pts.push(...hvCableCurve(0).getPoints(28).slice(1));
  const invC = v(mx, my + INV.offsetY, mz);
  pts.push(invC);
  const ac = acTerminalLocal(1);
  const acTerm = v(mx + ac.x, my + INV.offsetY + ac.y, mz + ac.z);
  pts.push(acTerm);
  // down the winding lead to the end turns, into the stator and across the gap to the shaft
  pts.push(v(mx + 0.09, my + 0.09, mz));
  pts.push(v(mx + 0.02, my + 0.085, mz));
  pts.push(v(mx, my + 0.05, mz));
  pts.push(v(mx, MOTOR_AXIS[0], MOTOR_AXIS[1]));
  // along the rotor shaft to the stage-1 pinion, over to the intermediate shaft
  pts.push(v(RIG.stage1X, MOTOR_AXIS[0], MOTOR_AXIS[1]));
  pts.push(v(RIG.stage1X, INTERMEDIATE[0], INTERMEDIATE[1]));
  pts.push(v(RIG.stage2X, INTERMEDIATE[0], INTERMEDIATE[1]));
  pts.push(v(RIG.stage2X, AXLE[0], AXLE[1]));
  pts.push(v(DIFF_CENTER_X, AXLE[0], AXLE[1]));
  const side = (s: number): Path =>
    new Path([...pts, v(s * RIG.trackHalf, AXLE[0], AXLE[1])].map((p) => p.clone()));
  return [side(-1), side(1)];
}

interface Puff {
  pos: Vector3;
  age: number;
  life: number;
  drift: Vector3;
}

export function createPowerFlow(): SceneModule<Group> {
  const group = new Group();
  group.name = 'powerFlow';
  const paths = powerPaths();

  const pulseMat = new MeshBasicMaterial({
    color: new Color(THEME.power),
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    blending: AdditiveBlending,
  });
  const pulses = new InstancedMesh(new SphereGeometry(0.014, 10, 8), pulseMat, MAX_PULSES);
  pulses.frustumCulled = false;
  pulses.renderOrder = 13;
  group.add(pulses);

  const puffMat = new MeshBasicMaterial({
    color: new Color(THEME.heat),
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    blending: AdditiveBlending,
  });
  const puffMesh = new InstancedMesh(new SphereGeometry(0.012, 8, 6), puffMat, MAX_PUFFS);
  puffMesh.frustumCulled = false;
  puffMesh.renderOrder = 13;
  group.add(puffMesh);

  // loss sources: position (rig metres) and a reader for the loss in W
  const [mx, my, mz] = MOTOR_POS;
  const B = RIG.battery;
  const sources: { at: Vector3; spread: number; loss: (c: FrameContext) => number }[] = [
    {
      at: new Vector3(mx, my + INV.offsetY + 0.06, mz),
      spread: 0.08,
      loss: (c) => c.snapshot.losses.invW,
    },
    {
      at: new Vector3(mx + 0.09, my + 0.1, mz),
      spread: 0.04,
      loss: (c) => c.snapshot.losses.cuW / 2,
    },
    {
      at: new Vector3(mx - 0.09, my + 0.1, mz),
      spread: 0.04,
      loss: (c) => c.snapshot.losses.cuW / 2,
    },
    { at: new Vector3(mx, my + 0.13, mz), spread: 0.06, loss: (c) => c.snapshot.losses.feW },
    {
      at: new Vector3(mx, my + 0.07, mz),
      spread: 0.05,
      loss: (c) => c.snapshot.losses.rcuW + c.snapshot.losses.magW,
    },
    {
      at: new Vector3(mx - 0.12, my + 0.03, mz),
      spread: 0.02,
      loss: (c) => c.snapshot.losses.mechW / 2,
    },
    {
      at: new Vector3(mx + 0.12, my + 0.03, mz),
      spread: 0.02,
      loss: (c) => c.snapshot.losses.mechW / 2,
    },
    {
      at: new Vector3(
        RIG.gearboxX,
        (MOTOR_AXIS[0] + AXLE[0]) / 2 + 0.12,
        (MOTOR_AXIS[1] + AXLE[1]) / 2,
      ),
      spread: 0.06,
      loss: (c) => c.snapshot.losses.gearW,
    },
    {
      at: new Vector3(B.x, B.standHeight + 0.14, B.z),
      spread: 0.25,
      loss: (c) => c.snapshot.iDc * c.snapshot.iDc * BATTERY.rPackOhm,
    },
  ];
  const acc = sources.map(() => 0);
  const puffs: Puff[] = [];
  const rand = mulberry32(7);

  const drive = new Color(THEME.power);
  const regen = new Color(THEME.regen);
  const phase = Array.from({ length: MAX_PULSES }, (_, i) => (i * 0.618) % 1);
  const m = new Matrix4();
  const p = new Vector3();
  let level = 0;
  let puffLevel = 0;
  let flow = 0;
  let dirSmooth = 1;

  return {
    object3d: group,
    update(ctx: FrameContext) {
      const s = ctx.snapshot;
      const follow = ctx.ui.follow;
      const k = approach(ctx.dt, FADE_TAU);
      level += ((follow === 'power' ? 1 : follow === 'all' ? 0.4 : 0) - level) * k;
      puffLevel += ((follow === 'power' ? 1 : 0) - puffLevel) * k;
      const dt = ctx.ui.frozen ? 0 : ctx.dt;

      // pulses: the direction follows the DC power sign (flips within a frame or two in regen)
      const pw = s.pDc;
      const target = Math.min(Math.abs(pw) / P_FULL_W, 1);
      flow += (target - flow) * approach(ctx.dt, 0.1);
      const dir = pw >= 0 ? 1 : -1;
      dirSmooth += (dir - dirSmooth) * approach(ctx.dt, 0.05);
      pulseMat.color.copy(dirSmooth >= 0 ? drive : regen);
      pulseMat.opacity = level * (0.35 + 0.65 * Math.min(flow * 3, 1));
      const count = Math.round(MAX_PULSES * Math.sqrt(flow));
      pulses.visible = level > 0.01 && count > 0;
      if (pulses.visible) {
        pulses.count = count;
        const speed = 0.05 + 0.3 * Math.sqrt(flow); // path fractions per second
        for (let i = 0; i < count; i++) {
          let u = (phase[i] ?? 0) + Math.sign(dirSmooth) * speed * dt;
          u -= Math.floor(u);
          phase[i] = u;
          (paths[i % 2] as Path).at(u, p);
          const sc = 0.6 + 0.6 * Math.sqrt(flow);
          m.makeScale(sc, sc, sc).setPosition(p);
          pulses.setMatrixAt(i, m);
        }
        pulses.instanceMatrix.needsUpdate = true;
      }

      // loss puffs
      if (puffLevel > 0.01) {
        sources.forEach((src, i) => {
          const rate = Math.min(src.loss(ctx) / 600, 10); // puffs per second
          acc[i] = (acc[i] ?? 0) + rate * dt;
          while ((acc[i] ?? 0) >= 1 && puffs.length < MAX_PUFFS) {
            acc[i] = (acc[i] ?? 0) - 1;
            puffs.push({
              pos: src.at
                .clone()
                .add(
                  new Vector3(
                    (rand() - 0.5) * src.spread,
                    (rand() - 0.5) * 0.02,
                    (rand() - 0.5) * src.spread,
                  ),
                ),
              age: 0,
              life: PUFF_LIFE_S * (0.7 + 0.6 * rand()),
              drift: new Vector3(
                (rand() - 0.5) * 0.04,
                0.12 + 0.08 * rand(),
                (rand() - 0.5) * 0.04,
              ),
            });
          }
          if ((acc[i] ?? 0) > 1) acc[i] = 1;
        });
      }
      for (let i = puffs.length - 1; i >= 0; i--) {
        const pf = puffs[i] as Puff;
        pf.age += dt;
        pf.pos.addScaledVector(pf.drift, dt);
        if (pf.age >= pf.life) puffs.splice(i, 1);
      }
      puffMesh.visible = puffLevel > 0.01 && puffs.length > 0;
      if (puffMesh.visible) {
        puffMesh.count = puffs.length;
        puffs.forEach((pf, i) => {
          const t = pf.age / pf.life;
          const sc = (0.4 + 1.4 * t) * Math.sin(Math.PI * Math.min(t * 1.4, 1)) + 0.05;
          m.makeScale(sc, sc, sc).setPosition(pf.pos);
          puffMesh.setMatrixAt(i, m);
        });
        puffMesh.instanceMatrix.needsUpdate = true;
        puffMat.opacity = 0.55 * puffLevel;
      }
    },
    dispose: () => disposeTree(group),
  };
}
