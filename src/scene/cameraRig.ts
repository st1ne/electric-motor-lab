/**
 * Camera rig (TECH_SPEC §3.8, §4.5, §4.6): idle drift and fly-to presets.
 *   Idle drift: after 8 s without input, a ±4° azimuth sine (period 40 s); stops on input.
 *   flyTo: 1.2 s easeInOutCubic on position and target; a cut under reduced motion.
 */
import { Spherical, Vector3, type PerspectiveCamera } from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ENVIRONMENT, RIG } from '@/config/environment';
import { toModel } from '@/scene/units';
import { easeInOutCubic, prefersReducedMotion } from '@/util/easing';

const DEG = Math.PI / 180;
const C = ENVIRONMENT.camera;

export type CameraPreset = 'default' | 'stator' | 'rotor' | 'inverter' | 'wheels' | 'wide';

/** Motor centre in scene units. */
export const MOTOR_CENTER = [
  toModel(RIG.motorX),
  toModel(RIG.axleY + RIG.motorOffset[0]),
  toModel(RIG.axleZ + RIG.motorOffset[1]),
] as const;

const [mx, my, mz] = MOTOR_CENTER;

/** Camera presets: [position, target] in scene units. */
export const CAMERA_PRESETS: Record<CameraPreset, readonly [readonly number[], readonly number[]]> =
  {
    default: [C.position, C.target],
    // along the motor axis from the non-drive end, slightly above: the cut stator reads as a ring
    stator: [
      [mx - 0.42, my + 0.2, mz + 0.26],
      [mx, my, mz],
    ],
    // 3/4 from the front, low, so the exploded rotor is visible
    rotor: [
      [mx + 0.12, my + 0.16, mz + 0.5],
      [mx - 0.03, my, mz],
    ],
    inverter: [
      [mx + 0.05, my + 0.34, mz + 0.34],
      [mx, my + toModel(0.2), mz],
    ],
    wheels: [
      [0.95, 0.28, 0.72],
      [0.05, 0.12, 0],
    ],
    wide: [
      [1.35, 0.75, 1.55],
      [0, 0.15, 0],
    ],
  };

export interface CameraRig {
  flyTo(preset: CameraPreset, durationS?: number): void;
  readonly flying: boolean;
  onUserInput(cb: () => void): void;
  update(dt: number): void;
  dispose(): void;
}

export function createCameraRig(camera: PerspectiveCamera, controls: OrbitControls): CameraRig {
  const reduced = prefersReducedMotion();
  let idleS = 0;
  let driftT = 0;
  let driftOffset = 0;
  let flight: {
    t: number;
    dur: number;
    p0: Vector3;
    p1: Vector3;
    t0: Vector3;
    t1: Vector3;
  } | null = null;
  const listeners: (() => void)[] = [];
  const offset = new Vector3();
  const sph = new Spherical();

  const onStart = (): void => {
    idleS = 0;
    driftT = 0;
    driftOffset = 0;
    flight = null;
    listeners.forEach((cb) => cb());
  };
  controls.addEventListener('start', onStart);

  function rotateAzimuth(delta: number): void {
    offset.subVectors(camera.position, controls.target);
    sph.setFromVector3(offset);
    sph.theta += delta;
    offset.setFromSpherical(sph);
    camera.position.copy(controls.target).add(offset);
  }

  return {
    get flying() {
      return flight !== null;
    },
    flyTo(preset, durationS = 1.2) {
      const [p, t] = CAMERA_PRESETS[preset];
      const p1 = new Vector3(p[0], p[1], p[2]);
      const t1 = new Vector3(t[0], t[1], t[2]);
      idleS = 0;
      driftT = 0;
      driftOffset = 0;
      if (reduced || durationS <= 0) {
        camera.position.copy(p1);
        controls.target.copy(t1);
        controls.update();
        flight = null;
        return;
      }
      flight = {
        t: 0,
        dur: durationS,
        p0: camera.position.clone(),
        p1,
        t0: controls.target.clone(),
        t1,
      };
    },
    onUserInput(cb) {
      listeners.push(cb);
    },
    update(dt) {
      if (flight) {
        flight.t += dt;
        const k = easeInOutCubic(Math.min(flight.t / flight.dur, 1));
        camera.position.lerpVectors(flight.p0, flight.p1, k);
        controls.target.lerpVectors(flight.t0, flight.t1, k);
        if (flight.t >= flight.dur) flight = null;
      } else if (!reduced) {
        idleS += dt;
        if (idleS > C.idleDelayS) {
          driftT += dt;
          const next = C.idleAmplitudeDeg * DEG * Math.sin((2 * Math.PI * driftT) / C.idlePeriodS);
          rotateAzimuth(next - driftOffset);
          driftOffset = next;
        }
      }
      controls.update();
    },
    dispose() {
      controls.removeEventListener('start', onStart);
    },
  };
}
