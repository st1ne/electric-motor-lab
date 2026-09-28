/**
 * Build-time efficiency/operating-point maps and the runtime bilinear lookup (TECH_SPEC §6.5).
 * Grid: 0…16,000 rpm step 250 (65) × −420…+420 N·m step 5 (169), per motor.
 * Cells outside the envelope store the clamped envelope point, so bilinear interpolation stays
 * continuous; the lookup clamps the torque to [T_min(rpm), T_max(rpm)] first.
 * Values are quantized to 4 significant digits. Fields that are zero everywhere for a machine
 * (IPM rotor copper and slip, IM magnet loss) are omitted from the JSON.
 * Source: reference build_map(), MapLookup.
 */
import { MAP_GRID, type MotorKind } from '@/config/motor';
import { envelope } from '@/physics/envelope';
import { fullPoint, solve } from '@/physics/operatingPoint';

export const MAP_FIELDS = [
  'id',
  'iq',
  'vd',
  'vq',
  'cu',
  'rcu',
  'fe',
  'mag',
  'inv',
  'eff',
  'slip',
] as const;
export type MapField = (typeof MAP_FIELDS)[number];

export interface MotorMap {
  tMax: number[];
  tMin: number[];
  /** row-major [rpmIndex * torqueCount + torqueIndex]; missing fields are all zero */
  fields: Partial<Record<MapField, number[]>>;
}

export interface MapsFile {
  grid: typeof MAP_GRID;
  vDcNom: number;
  vMax: number;
  tRefC: number;
  motors: Record<MotorKind, MotorMap>;
}

export interface MapPoint {
  torqueNm: number;
  idA: number;
  iqA: number;
  vdV: number;
  vqV: number;
  cuW: number;
  rcuW: number;
  feW: number;
  magW: number;
  invW: number;
  eff: number;
  slip: number;
  /** torque was clamped to the envelope */
  limited: boolean;
}

export function emptyMapPoint(): MapPoint {
  return {
    torqueNm: 0,
    idA: 0,
    iqA: 0,
    vdV: 0,
    vqV: 0,
    cuW: 0,
    rcuW: 0,
    feW: 0,
    magW: 0,
    invW: 0,
    eff: 0,
    slip: 0,
    limited: false,
  };
}

/** Quantize to 4 significant digits (the stored precision). */
export function sig4(x: number): number {
  if (x === 0 || !Number.isFinite(x)) return 0;
  return Number(x.toPrecision(4));
}

export function gridRpm(i: number): number {
  return MAP_GRID.rpmStart + i * MAP_GRID.rpmStep;
}

export function gridTorque(j: number): number {
  return MAP_GRID.torqueStart + j * MAP_GRID.torqueStep;
}

/** Build one motor's map (used by scripts/build-maps.ts). Unquantized. */
export function buildMotorMap(kind: MotorKind, vMax: number): MotorMap {
  const { rpmCount: nR, torqueCount: nT } = MAP_GRID;
  const fields: Record<MapField, number[]> = Object.fromEntries(
    MAP_FIELDS.map((f) => [f, new Array<number>(nR * nT).fill(0)]),
  ) as Record<MapField, number[]>;
  const tMax: number[] = [];
  const tMin: number[] = [];
  for (let i = 0; i < nR; i++) {
    const w = (gridRpm(i) * Math.PI) / 30;
    const env = envelope(kind, w, vMax);
    tMax.push(env.tMax);
    tMin.push(env.tMin);
    for (let j = 0; j < nT; j++) {
      const tc = Math.min(Math.max(gridTorque(j), env.tMin), env.tMax);
      const fp = fullPoint(kind, w, solve(kind, w, tc, vMax, env.opMax, env.opMin));
      const k = i * nT + j;
      fields.id[k] = fp.idA;
      fields.iq[k] = fp.iqA;
      fields.vd[k] = fp.vdV;
      fields.vq[k] = fp.vqV;
      fields.cu[k] = fp.cuW;
      fields.rcu[k] = fp.rcuW;
      fields.fe[k] = fp.feW;
      fields.mag[k] = fp.magW;
      fields.inv[k] = fp.invW;
      fields.eff[k] = fp.eff;
      fields.slip[k] = fp.slip;
    }
  }
  return { tMax, tMin, fields };
}

/** Quantize and drop all-zero fields. */
export function packMotorMap(m: MotorMap): MotorMap {
  const fields: MotorMap['fields'] = {};
  for (const f of MAP_FIELDS) {
    const arr = m.fields[f];
    if (!arr || arr.every((x) => x === 0)) continue;
    fields[f] = arr.map(sig4);
  }
  return { tMax: m.tMax.map(sig4), tMin: m.tMin.map(sig4), fields };
}

function interpRpm(arr: readonly number[], rpm: number): number {
  const fi = (rpm - MAP_GRID.rpmStart) / MAP_GRID.rpmStep;
  if (fi <= 0) return arr[0] ?? 0;
  const n = MAP_GRID.rpmCount - 1;
  if (fi >= n) return arr[n] ?? 0;
  const i0 = Math.floor(fi);
  const u = fi - i0;
  return (arr[i0] ?? 0) * (1 - u) + (arr[i0 + 1] ?? 0) * u;
}

export interface MapLookup {
  readonly map: MotorMap;
  tMax(rpm: number): number;
  tMin(rpm: number): number;
  /** Bilinear lookup at (rpm, T) with T clamped to the envelope; writes into `out`. */
  lookup(rpm: number, torqueNm: number, out?: MapPoint): MapPoint;
}

export function createMapLookup(map: MotorMap): MapLookup {
  const nT = MAP_GRID.torqueCount;
  const zero = new Array<number>(MAP_GRID.rpmCount * nT).fill(0);
  const f = (name: MapField): number[] => map.fields[name] ?? zero;
  const cols = {
    id: f('id'),
    iq: f('iq'),
    vd: f('vd'),
    vq: f('vq'),
    cu: f('cu'),
    rcu: f('rcu'),
    fe: f('fe'),
    mag: f('mag'),
    inv: f('inv'),
    eff: f('eff'),
    slip: f('slip'),
  };
  const tMax = (rpm: number): number => interpRpm(map.tMax, rpm);
  const tMin = (rpm: number): number => interpRpm(map.tMin, rpm);
  return {
    map,
    tMax,
    tMin,
    lookup(rpmIn, torqueNm, out = emptyMapPoint()) {
      const rpm = Math.min(Math.max(rpmIn, MAP_GRID.rpmStart), gridRpm(MAP_GRID.rpmCount - 1));
      const hiT = tMax(rpm);
      const loT = tMin(rpm);
      const tq = Math.min(Math.max(torqueNm, loT), hiT);
      const fi = (rpm - MAP_GRID.rpmStart) / MAP_GRID.rpmStep;
      const fj = (tq - MAP_GRID.torqueStart) / MAP_GRID.torqueStep;
      const i0 = Math.min(Math.floor(fi), MAP_GRID.rpmCount - 2);
      const j0 = Math.min(Math.max(Math.floor(fj), 0), nT - 2);
      const u = fi - i0;
      const v = fj - j0;
      const k00 = i0 * nT + j0;
      const k10 = k00 + nT;
      const w00 = (1 - u) * (1 - v);
      const w10 = u * (1 - v);
      const w01 = (1 - u) * v;
      const w11 = u * v;
      const bl = (a: number[]): number =>
        (a[k00] ?? 0) * w00 +
        (a[k10] ?? 0) * w10 +
        (a[k00 + 1] ?? 0) * w01 +
        (a[k10 + 1] ?? 0) * w11;
      out.torqueNm = tq;
      out.idA = bl(cols.id);
      out.iqA = bl(cols.iq);
      out.vdV = bl(cols.vd);
      out.vqV = bl(cols.vq);
      out.cuW = bl(cols.cu);
      out.rcuW = bl(cols.rcu);
      out.feW = bl(cols.fe);
      out.magW = bl(cols.mag);
      out.invW = bl(cols.inv);
      out.eff = bl(cols.eff);
      out.slip = bl(cols.slip);
      out.limited = torqueNm > hiT + 1e-9 || torqueNm < loT - 1e-9;
      return out;
    },
  };
}
