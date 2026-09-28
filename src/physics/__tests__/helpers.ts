/** Test helpers: generated maps, the Python vectors, and ports of the reference scenarios. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DRIVER, SIM_DT } from '@/config/vehicle';
import type { MotorKind } from '@/config/motor';
import { createDriverState, cruisePi } from '@/physics/driver';
import { createMapLookup, type MapsFile } from '@/physics/maps';
import { createSimState, emptyStepResult, physicsStep, type MotorMaps } from '@/physics/sim';
import { MASS_EFF_KG } from '@/physics/vehicle';

const read = (p: string): string =>
  readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');

export const MAPS_FILE = JSON.parse(read('../maps.generated.json')) as MapsFile;
export const MAPS: MotorMaps = {
  pm: createMapLookup(MAPS_FILE.motors.pm),
  im: createMapLookup(MAPS_FILE.motors.im),
};

export interface RefRow {
  rpm: number;
  t_req: number | 'max';
  t_max: number;
  t_min: number;
  i_d: number;
  i_q: number;
  torque: number;
  v_mag: number;
  eff: number;
  slip: number;
  cu: number;
  rcu: number;
  fe: number;
  mag: number;
  mech: number;
  inv: number;
}

export interface RefLookup {
  motor: MotorKind;
  rpm: number;
  t_req: number;
  torque: number;
  i_d: number;
  i_q: number;
  v_d: number;
  v_q: number;
  cu: number;
  fe: number;
  inv: number;
  eff: number;
  slip: number;
}

export interface RefScenarios {
  launch: { t_0_100_s: number; energy_error_rel: number; t_winding_end_c: number };
  top: { top_kmh: number; top_rpm: number };
  cruise: { kmh: number; kwh_per_100km: number; t_em: number; slip: number };
  regen: { stop_time_s: number; soc_gain: number; p_regen_max_kw: number };
  coast: { rpm: number; drag_w: number };
  derate: { first_derate_launch: number | null; t_winding_max_c: number; t_rotor_max_c: number };
}

export interface Vectors {
  meta: { v_dc_nom: number; v_max: number; t_ref_c: number };
  envelopes: Record<MotorKind, { rpm: number[]; t_max: number[]; t_min: number[] }>;
  table: Record<MotorKind, RefRow[]>;
  lookups: RefLookup[];
  scenarios: Record<MotorKind, RefScenarios>;
}

export const VECTORS = JSON.parse(read('../../../reference/vectors.json')) as Vectors;

export const rpmToW = (rpm: number): number => (rpm * Math.PI) / 30;

// ---- scenario runners (ports of the reference scenario_* functions) ----

export function runLaunch(kind: MotorKind, soc = 1) {
  const st = createSimState(soc);
  const res = emptyStepResult();
  const socs = [st.soc];
  let t100: number | null = null;
  let nan = false;
  while (st.t < 20) {
    physicsStep(st, MAPS, kind, 1, 0, res);
    socs.push(st.soc);
    if (!Number.isFinite(st.v) || !Number.isFinite(res.pDc)) nan = true;
    if (st.v * 3.6 >= DRIVER.launchReleaseKmh) {
      t100 = st.t;
      break;
    }
  }
  const ke = 0.5 * MASS_EFF_KG * st.v * st.v;
  const rhs = ke + st.eRoad + st.eLoss + st.eFric;
  return {
    t100,
    nan,
    socMonotonic: socs.every((s, i) => i === 0 || s <= (socs[i - 1] ?? Infinity)),
    energyErrorRel: Math.abs(st.eDc - rhs) / st.eDc,
    tWindingEnd: st.tW,
  };
}

export function runTopSpeed(kind: MotorKind) {
  const st = createSimState(1);
  const res = emptyStepResult();
  while (st.t < 120) physicsStep(st, MAPS, kind, 1, 0, res);
  return { kmh: st.v * 3.6, rpm: res.rpm };
}

export function runCruise(kind: MotorKind) {
  const st = createSimState(0.8);
  st.v = DRIVER.cruiseKmh / 3.6;
  const d = createDriverState();
  const res = emptyStepResult();
  let e0 = 0;
  let dist = 0;
  const n30 = Math.floor(30 / SIM_DT);
  for (let n = 0; n < Math.floor(90 / SIM_DT); n++) {
    const u = cruisePi(d, st.v * 3.6, DRIVER.cruiseKmh);
    physicsStep(st, MAPS, kind, u, 0, res);
    if (n === n30) e0 = st.eDc;
    if (n > n30) dist += st.v * SIM_DT;
  }
  return {
    kmh: st.v * 3.6,
    kwhPer100km: (st.eDc - e0) / 3.6e6 / (dist / 1e5),
    tEm: res.tEm,
    slip: res.pt.slip,
  };
}

export function runRegen(kind: MotorKind) {
  const st = createSimState(0.7);
  st.v = DRIVER.regenStartKmh / 3.6;
  const brake = DRIVER.regenDecelG / DRIVER.brakeMaxG;
  const res = emptyStepResult();
  const soc0 = st.soc;
  let pRegenMax = 0;
  let fricBelow = 0;
  let fricAbove = 0;
  let vPrev = st.v;
  let overshoot = false;
  while (st.t < 30 && st.v > 0) {
    physicsStep(st, MAPS, kind, 0, brake, res);
    pRegenMax = Math.max(pRegenMax, -res.pDc);
    if (res.kmh < DRIVER.regenFadeKmh) fricBelow = Math.max(fricBelow, res.fFric);
    else fricAbove = Math.max(fricAbove, res.fFric);
    if (st.v > vPrev + 1e-12) overshoot = true;
    vPrev = st.v;
  }
  return {
    stopTime: st.t,
    socGain: st.soc - soc0,
    pRegenMaxKw: pRegenMax / 1e3,
    fricBelow,
    fricAbove,
    vEnd: st.v,
    overshoot,
  };
}

export function runDerate(kind: MotorKind, n = 10) {
  const st = createSimState(0.9);
  const res = emptyStepResult();
  const brake = DRIVER.regenDecelG / DRIVER.brakeMaxG;
  let first: number | null = null;
  let tWMax = st.tW;
  let tRMax = st.tR;
  let tMaxMin = Infinity;
  for (let k = 0; k < n; k++) {
    while (st.v * 3.6 < DRIVER.launchReleaseKmh && st.t < 1e4) {
      physicsStep(st, MAPS, kind, 1, 0, res);
      if (first === null && res.derate < 1) first = k + 1;
      tMaxMin = Math.min(tMaxMin, res.tMax / Math.max(MAPS[kind].tMax(res.rpm), 1e-9));
    }
    while (st.v > 0) {
      physicsStep(st, MAPS, kind, 0, brake, res);
      if (first === null && res.derate < 1) first = k + 1;
    }
    tWMax = Math.max(tWMax, st.tW);
    tRMax = Math.max(tRMax, st.tR);
  }
  return { first, tWMax, tRMax, derateMin: tMaxMin };
}
