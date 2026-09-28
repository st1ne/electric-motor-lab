/**
 * The TS port reproduces reference/vectors.json (TECH_SPEC §7.4, TODO Phase 1.4):
 * currents ±1 A, efficiency ±0.1 pp, torque envelope ±1 N·m.
 */
import { describe, expect, it } from 'vitest';
import { V_DC_NOM, voltageMaxV, type MotorKind } from '@/config/motor';
import { envelope } from '@/physics/envelope';
import { fullPoint, solve } from '@/physics/operatingPoint';
import {
  MAPS,
  MAPS_FILE,
  VECTORS,
  rpmToW,
  runCruise,
  runDerate,
  runLaunch,
  runRegen,
  runTopSpeed,
} from './helpers';

const V_MAX = voltageMaxV(V_DC_NOM);
const KINDS: MotorKind[] = ['pm', 'im'];

describe('reference vectors', () => {
  it('uses the same DC link and voltage limit', () => {
    expect(VECTORS.meta.v_dc_nom).toBe(V_DC_NOM);
    expect(VECTORS.meta.v_max).toBeCloseTo(V_MAX, 9);
  });

  for (const kind of KINDS) {
    it(`${kind}: torque envelopes within ±1 N·m`, () => {
      const e = VECTORS.envelopes[kind];
      e.rpm.forEach((rpm, i) => {
        expect(
          Math.abs((MAPS_FILE.motors[kind].tMax[i] ?? 0) - (e.t_max[i] ?? 0)),
        ).toBeLessThanOrEqual(1);
        expect(
          Math.abs((MAPS_FILE.motors[kind].tMin[i] ?? 0) - (e.t_min[i] ?? 0)),
        ).toBeLessThanOrEqual(1);
        expect(rpm).toBe(i * 250);
      });
    });

    it(`${kind}: §7.4 table (currents ±1 A, efficiency ±0.1 pp)`, () => {
      for (const row of VECTORS.table[kind]) {
        const w = rpmToW(row.rpm);
        const env = envelope(kind, w, V_MAX);
        expect(Math.abs(env.tMax - row.t_max)).toBeLessThanOrEqual(1);
        const t = row.t_req === 'max' ? env.tMax : row.t_req;
        const fp = fullPoint(kind, w, solve(kind, w, t, V_MAX, env.opMax, env.opMin));
        expect(Math.abs(fp.idA - row.i_d)).toBeLessThanOrEqual(1);
        expect(Math.abs(fp.iqA - row.i_q)).toBeLessThanOrEqual(1);
        expect(Math.abs(fp.eff - row.eff)).toBeLessThanOrEqual(0.001);
        expect(Math.abs(fp.slip - row.slip)).toBeLessThanOrEqual(1e-4);
      }
    });
  }

  it('map lookups match the Python lookups', () => {
    for (const l of VECTORS.lookups) {
      const p = MAPS[l.motor].lookup(l.rpm, l.t_req);
      expect(Math.abs(p.torqueNm - l.torque)).toBeLessThanOrEqual(1);
      expect(Math.abs(p.idA - l.i_d)).toBeLessThanOrEqual(1);
      expect(Math.abs(p.iqA - l.i_q)).toBeLessThanOrEqual(1);
      expect(Math.abs(p.eff - l.eff)).toBeLessThanOrEqual(0.001);
    }
  });

  for (const kind of KINDS) {
    it(`${kind}: scenarios match the Python sim`, () => {
      const ref = VECTORS.scenarios[kind];
      expect(runLaunch(kind).t100).toBeCloseTo(ref.launch.t_0_100_s, 2);
      expect(runTopSpeed(kind).kmh).toBeCloseTo(ref.top.top_kmh, 1);
      expect(runCruise(kind).kwhPer100km).toBeCloseTo(ref.cruise.kwh_per_100km, 2);
      const r = runRegen(kind);
      expect(r.stopTime).toBeCloseTo(ref.regen.stop_time_s, 2);
      expect(r.pRegenMaxKw).toBeCloseTo(ref.regen.p_regen_max_kw, 1);
      const d = runDerate(kind);
      expect(d.first).toBe(ref.derate.first_derate_launch);
      expect(d.tWMax).toBeCloseTo(ref.derate.t_winding_max_c, 0);
    });
  }
});
