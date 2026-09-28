/**
 * Oil jets (TECH_SPEC §9 Heat): oil fed through the hollow shaft leaves radial holes just outside
 * the stack on both ends and sprays onto the end turns. Particles start at the bore radius, fly
 * out to the end-turn radius, carried round with the shaft, and fade. Motor-local, x-ray drawn.
 * Heat mode only (400 ms fades). The flow looks the same at any speed; the swirl follows the shaft.
 */
import {
  AdditiveBlending,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  SphereGeometry,
} from 'three';
import { GEOMETRY } from '@/config/motor';
import { PALETTE } from '@/config/theme';
import { disposeTree, type FrameContext, type SceneModule } from '@/scene/module';
import { prefersReducedMotion } from '@/util/easing';
import { approach } from '@/util/math';

const G = GEOMETRY;
const HOLES = 8;
/** §4.6: half the particles under reduced motion */
const PER_HOLE = prefersReducedMotion() ? 3 : 6;
const ENDS = [-0.075, 0.075] as const;
const R0 = G.shaftBoreR;
const R1 = 0.085;
const FLIGHT_S = 0.55;
const FADE_TAU = 0.13;

export function createOilJets(): SceneModule<Group> {
  const group = new Group();
  group.name = 'oilJets';
  const mat = new MeshBasicMaterial({
    color: new Color(PALETTE.coolant),
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    blending: AdditiveBlending,
  });
  const n = ENDS.length * HOLES * PER_HOLE;
  const mesh = new InstancedMesh(new SphereGeometry(0.0028, 8, 6), mat, n);
  mesh.frustumCulled = false;
  mesh.renderOrder = 12;
  group.add(mesh);
  const age = Array.from({ length: n }, (_, i) => ((i % PER_HOLE) / PER_HOLE) * FLIGHT_S);
  // each particle keeps the shaft angle at which it left the hole
  const launch = new Float32Array(n);
  const m = new Matrix4();
  let level = 0;

  return {
    object3d: group,
    update(ctx: FrameContext) {
      level += ((ctx.ui.follow === 'heat' ? 1 : 0) - level) * approach(ctx.dt, FADE_TAU);
      mesh.visible = level > 0.01;
      if (!mesh.visible) return;
      mat.opacity = 0.85 * level;
      const dt = ctx.ui.frozen ? 0 : ctx.dt;
      let i = 0;
      for (const [e, x0] of ENDS.entries()) {
        for (let h = 0; h < HOLES; h++) {
          const phi0 = (h / HOLES) * 2 * Math.PI + e * 0.2;
          for (let k = 0; k < PER_HOLE; k++, i++) {
            let a = (age[i] ?? 0) + dt;
            if (a >= FLIGHT_S) {
              a -= FLIGHT_S;
              launch[i] = ctx.mechAngle;
            }
            age[i] = a;
            const t = a / FLIGHT_S;
            const r = R0 + (R1 - R0) * t;
            // the oil lags the shaft slightly as it flies out (Coriolis-like trail)
            const phi = phi0 + (launch[i] ?? 0) - 0.5 * t;
            const x = x0 + Math.sign(x0) * 0.012 * t * t;
            const sc = 0.7 + 0.8 * t;
            m.makeScale(sc, sc, sc).setPosition(x, r * Math.cos(phi), r * Math.sin(phi));
            mesh.setMatrixAt(i, m);
          }
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose: () => disposeTree(group),
  };
}
