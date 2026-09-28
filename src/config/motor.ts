/**
 * Frozen motor parameters (TECH_SPEC §6.2–6.4, tuned in Phase 1 to the §7.1 targets).
 * Source of truth: reference/motor_model_reference.py. Keep both in sync; the reference test
 * (src/physics/__tests__/reference.test.ts) fails if they drift.
 *
 * Conventions: dq currents and voltages are PEAK values (amplitude-invariant transform).
 */

/** Interior permanent-magnet synchronous machine (§6.2). */
export const PM = {
  polePairs: 3,
  /** magnet flux linkage, Wb (peak) */
  psiM: 0.0736,
  lD: 0.125e-3,
  lQ: 0.245e-3,
  rS20: 7.0e-3,
  currentMaxA: 860,
  /** AC-resistance corner frequency of the hairpin winding */
  fAcHz: 1200,
  /** iron loss: P = (kH f + kE f²) ψs² */
  kH: 190,
  kE: 0.36,
  /** magnet eddy: P = kMag f² |i|² */
  kMag: 2.0e-9,
} as const;

/** Induction machine with rotor-flux-oriented control (§6.3). */
export const IM = {
  polePairs: 2,
  lM: 1.2e-3,
  lLs: 0.035e-3,
  lLr: 0.035e-3,
  rS20: 12.0e-3,
  rR: 8.5e-3,
  currentMaxA: 690,
  /** rated (saturation-limited) magnetizing current; i_d,min = 5 % of it */
  idRatedA: 166,
  fAcHz: 1200,
  kH: 250,
  kE: 0.65,
  /** display-only factor from referred rotor current to physical bar current (§6.3) */
  kBar: 4.0,
} as const;

export type MotorKind = 'pm' | 'im';

/** Inverter and DC link (§6.2, §6.4). The maps are built at V_DC_NOM (§7.1 "battery at 380 V"). */
export const V_DC_NOM = 380;
export const MODULATION_MAX = 0.95;
export const F_SW_HZ = 10e3;
export const INVERTER = { rOnEffOhm: 1.5e-3, kSw: 3.0e-10 } as const;

/** Mechanical losses (bearings + windage), both machines: P = cB ω + cW ω³ (§6.4). */
export const MECH = { cB: 0.07, cW: 1.1e-7 } as const;

/** Winding temperature the maps are built at; runtime copper loss rescales from here. */
export const T_REF_C = 70;
export const ALPHA_CU = 0.00393;

/** Solver resolution; identical to the Python reference. */
export const SOLVER = {
  samples: 200,
  envelopeSamples: 400,
  goldenIters: 32,
  bisectIters: 44,
} as const;

/** Voltage limit (peak phase) for a DC-link voltage: m_max · V_dc / √3. */
export function voltageMaxV(vDc: number): number {
  return (MODULATION_MAX * vDc) / Math.sqrt(3);
}

/** Map grid (§6.5). */
export const MAP_GRID = {
  rpmStart: 0,
  rpmStep: 250,
  rpmCount: 65,
  torqueStart: -420,
  torqueStep: 5,
  torqueCount: 169,
} as const;

/**
 * Geometry of a generic 200 kW class IPM drive unit, full scale in metres (§5.1).
 * The scene scales the whole drive-unit group by MODEL_SCALE.
 */
export const GEOMETRY = {
  statorOuterR: 0.225 / 2,
  statorBoreR: 0.15 / 2,
  stackLength: 0.135,
  slots: 54,
  slotDepth: 0.019,
  slotWidth: 0.0048,
  hairpinLayers: 4,
  endTurnReach: 0.034,
  rotorOuterR: 0.1486 / 2,
  airGap: 0.0007,
  shaftR: 0.02,
  shaftBoreR: 0.011,
  shaftLength: 0.44,
  magnetsPerPole: 2,
  magnetSize: [0.0045, 0.019, 0.13] as const,
  imBars: 50,
  imBarR: 0.0032,
  imEndRingWidth: 0.012,
  housingOuterR: 0.142,
  housingLength: 0.235,
  finCount: 28,
  maxRpm: 16000,
  /** the gearbox sits at +z (output side), the inverter on top */
  gearboxOffsetZ: 0.19,
} as const;

/** Physical model scale of the drive unit on the bench (§4.1): 1 : 3. */
export const MODEL_SCALE = 1 / 3;
