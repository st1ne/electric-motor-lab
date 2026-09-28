/**
 * §7.1 targets, evaluated on the TypeScript model and maps. Scalar targets must be within ±5 %;
 * efficiency and slip windows are checked as given.
 */
import { describe, expect, it } from 'vitest';
import { PM, V_DC_NOM, voltageMaxV, type MotorKind } from '@/config/motor';
import { VEHICLE } from '@/config/vehicle';
import { envelope } from '@/physics/envelope';
import { mechLossW } from '@/physics/losses';
import { fullPoint, solve } from '@/physics/operatingPoint';
import { roadLoadN } from '@/physics/vehicle';
import { MAPS, MAPS_FILE, rpmToW, runCruise, runLaunch, runTopSpeed } from './helpers';

const V_MAX = voltageMaxV(V_DC_NOM);
const within = (x: number, target: number, tol = 0.05): boolean =>
  Math.abs(x - target) <= tol * target;

function machineTargets(kind: MotorKind) {
  const rpms: number[] = [];
  for (let r = 0; r <= 16000; r += 100) rpms.push(r);
  const envs = rpms.map((r) => envelope(kind, rpmToW(r), V_MAX));
  const tPeak = envs[10]?.tMax ?? 0; // 1,000 rpm
  let base = 0;
  envs.forEach((e, i) => {
    if (e.tMax >= 0.98 * tPeak) base = rpms[i] ?? 0;
  });
  const pShaft = envs.map((e, i) => fullPoint(kind, rpmToW(rpms[i] ?? 0), e.opMax).pShaftW);
  const pPeak = Math.max(...pShaft);
  const p15k = pShaft[150] ?? 0;
  // peak efficiency from the maps (motor + inverter)
  let effPeak = 0;
  const f = MAPS_FILE.motors[kind].fields;
  const { rpmCount, torqueCount } = MAPS_FILE.grid;
  for (let i = 4; i < rpmCount; i++) {
    for (let j = 0; j < torqueCount; j++) {
      const t = -420 + 5 * j;
      if (t < 20 || t > (MAPS_FILE.motors[kind].tMax[i] ?? 0)) continue;
      effPeak = Math.max(effPeak, f.eff?.[i * torqueCount + j] ?? 0);
    }
  }
  // cruise at 110 km/h: shaft torque balancing the road load
  const v = 110 / 3.6;
  const w = (v * VEHICLE.gearRatio) / VEHICLE.wheelRadiusM;
  const tShaft = (roadLoadN(v) * VEHICLE.wheelRadiusM) / (VEHICLE.gearRatio * VEHICLE.gearEff);
  const env = envelope(kind, w, V_MAX);
  let tEm = tShaft;
  let cruise = fullPoint(kind, w, solve(kind, w, tEm, V_MAX, env.opMax, env.opMin));
  for (let k = 0; k < 4; k++) {
    cruise = fullPoint(kind, w, solve(kind, w, tEm, V_MAX, env.opMax, env.opMin));
    tEm = tShaft + (cruise.feW + cruise.magW + cruise.mechW) / w;
  }
  const wb = rpmToW(base);
  const slipPeak = fullPoint(kind, wb, envelope(kind, wb, V_MAX).opMax).slip;
  const w100 = (100 / 3.6) * (VEHICLE.gearRatio / VEHICLE.wheelRadiusM);
  const coast = MAPS[kind].lookup((w100 * 30) / Math.PI, 0);
  return {
    tPeak,
    base,
    pPeakKw: pPeak / 1e3,
    p15kKw: p15k / 1e3,
    effPeak,
    effCruise: cruise.eff,
    slipPeak,
    slipCruise: cruise.slip,
    spinW: coast.feW + coast.magW + mechLossW(w100),
  };
}

describe('§7.1 machine targets', () => {
  const pm = machineTargets('pm');
  const im = machineTargets('im');

  it('Magnet (IPM)', () => {
    expect(within(pm.tPeak, 420)).toBe(true);
    expect(pm.base).toBeGreaterThanOrEqual(4000 * 0.95);
    expect(pm.base).toBeLessThanOrEqual(5000 * 1.05);
    expect(within(pm.pPeakKw, 200)).toBe(true);
    expect(pm.p15kKw).toBeGreaterThanOrEqual(140);
    expect(pm.effPeak).toBeGreaterThanOrEqual(0.965);
    expect(pm.effPeak).toBeLessThanOrEqual(0.975);
    expect(pm.effCruise).toBeGreaterThanOrEqual(0.93);
    expect(pm.spinW).toBeGreaterThanOrEqual(400);
    expect(pm.spinW).toBeLessThanOrEqual(700);
  });

  it('Magnet: no-load back-EMF reaches V_max at ≈ 9,000 rpm', () => {
    const rpm = (V_MAX / (PM.polePairs * PM.psiM)) * (30 / Math.PI);
    expect(within(rpm, 9000)).toBe(true);
  });

  it('Induction', () => {
    expect(within(im.tPeak, 380)).toBe(true);
    expect(im.base).toBeGreaterThanOrEqual(3500 * 0.95);
    expect(im.base).toBeLessThanOrEqual(4500 * 1.05);
    expect(within(im.pPeakKw, 180)).toBe(true);
    expect(im.p15kKw).toBeGreaterThanOrEqual(110);
    expect(im.effPeak).toBeGreaterThanOrEqual(0.93);
    expect(im.effPeak).toBeLessThanOrEqual(0.945);
    expect(im.effCruise).toBeGreaterThanOrEqual(0.88);
    expect(im.slipPeak).toBeGreaterThanOrEqual(0.015);
    expect(im.slipPeak).toBeLessThanOrEqual(0.03);
    expect(im.slipCruise).toBeGreaterThanOrEqual(0.005);
    expect(im.slipCruise).toBeLessThanOrEqual(0.015);
    expect(im.spinW).toBeGreaterThanOrEqual(60);
    expect(im.spinW).toBeLessThanOrEqual(120);
  });

  it('power stays within 10 % of peak up to 12,000 rpm (acceptance §18.4)', () => {
    const p12 = fullPoint('pm', rpmToW(12000), envelope('pm', rpmToW(12000), V_MAX).opMax).pShaftW;
    expect(p12 / 1e3).toBeGreaterThanOrEqual(0.9 * pm.pPeakKw);
  });
});

describe('§7.1 vehicle targets', () => {
  it('0–100 km/h: Magnet 5.8–6.4 s (±5 %), Induction 0.2–0.6 s slower', () => {
    const pm = runLaunch('pm').t100 ?? Infinity;
    const im = runLaunch('im').t100 ?? Infinity;
    expect(pm).toBeGreaterThanOrEqual(5.8 * 0.95);
    expect(pm).toBeLessThanOrEqual(6.4 * 1.05);
    expect(im - pm).toBeGreaterThanOrEqual(0.2);
    expect(im - pm).toBeLessThanOrEqual(0.6);
  });

  it('top speed 225 km/h at ≈ 15,300 rpm (Magnet)', () => {
    const top = runTopSpeed('pm');
    expect(within(top.kmh, 225)).toBe(true);
    expect(within(top.rpm, 15300)).toBe(true);
  });

  it('consumption at 110 km/h: 13–15 kWh/100 km', () => {
    for (const kind of ['pm', 'im'] as const) {
      const c = runCruise(kind);
      expect(c.kmh).toBeCloseTo(110, 0);
      expect(c.kwhPer100km).toBeGreaterThanOrEqual(13);
      expect(c.kwhPer100km).toBeLessThanOrEqual(15);
    }
  });

  it('road load at 110 km/h ≈ 449 N / 13.7 kW', () => {
    const v = 110 / 3.6;
    expect(within(roadLoadN(v), 449)).toBe(true);
    expect(within((roadLoadN(v) * v) / 1e3, 13.7)).toBe(true);
  });
});
