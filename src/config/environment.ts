/**
 * Lab layout (TECH_SPEC §4.1, §4.5). Two coordinate systems:
 *   scene: model metres. Bench top at y = 0, the car's lateral axis (motor and axle) along x,
 *          +z towards the default camera.
 *   rig:   full-scale metres inside the 1:3 rig group (drive unit, wheels, dyno, battery).
 *          Its origin sits on the bench top; `toModel()` in scene/units.ts converts.
 */
import { MODEL_SCALE } from '@/config/motor';

/** Rig layout in FULL-SCALE metres (§5). */
export const RIG = {
  wheelRadius: 0.35,
  wheelWidth: 0.235,
  /** wheel centre x (± for left/right) */
  trackHalf: 0.78,
  rollerRadius: 0.1,
  /** roller axes at z = ±rollerSpacing under each wheel */
  rollerSpacing: 0.2,
  rollerLength: 0.42,
  rollerY: 0.14,
  /** axle (differential) centre */
  axleY: 0.14 + Math.sqrt((0.35 + 0.1) ** 2 - 0.2 ** 2),
  axleZ: 0,
  /** reduction: intermediate and motor axes relative to the axle (y, z) */
  intermediateOffset: [0.08, 0.14] as const,
  motorOffset: [0.11, 0.25] as const,
  /** motor stack centre along x; the output side is +x */
  motorX: -0.17,
  /** gearbox casing centre and width along x; stage planes and the differential inside it */
  gearboxX: 0.075,
  gearboxWidth: 0.14,
  stage1X: 0.035,
  stage2X: 0.097,
  diffX: 0.097,
  /** inverter box on top of the motor housing (centre offset from the motor axis) */
  inverter: { size: [0.3, 0.1, 0.24] as const, offsetY: 0.196 },
  battery: { x: -1.5, z: -0.3, standHeight: 0.3 },
  /** flywheel on the rear roller line; it stands in for the car inertia */
  flywheel: { x: 1.2, radius: 0.13, width: 0.12 },
} as const;

export const ENVIRONMENT = {
  modelScale: MODEL_SCALE,
  bench: {
    topY: 0,
    xMin: -0.78,
    xMax: 0.78,
    depth: 0.72,
    thickness: 0.05,
    legHeight: 0.86,
  },
  room: { floorY: -0.91, halfX: 5, halfZ: 5, height: 3.6, backZ: -0.95 },
  ruler: { z: 0.33, fromCm: -70, toCm: 70 },
  screens: {
    width: 0.46,
    height: 0.27,
    y: 0.62,
    z: -0.9,
    xs: [-0.3, 0.3] as const,
  },
  camera: {
    fov: 35,
    near: 0.01,
    far: 40,
    /** 3/4 view of the motor from the output side, wheels behind (§4.5) */
    position: [0.62, 0.42, 0.78] as const,
    target: [-0.02, 0.17, 0.02] as const,
    minPolarDeg: 15,
    maxPolarDeg: 85,
    minDistance: 0.18,
    maxDistance: 3.2,
    panMin: [-0.7, 0.0, -0.5] as const,
    panMax: [0.7, 0.5, 0.5] as const,
    damping: 0.08,
    idleDelayS: 8,
    idleAmplitudeDeg: 4,
    idlePeriodS: 40,
  },
} as const;
