/**
 * Fixed-step simulation: vehicle + motor operating point + battery + thermal
 * (TECH_SPEC §6.8–6.11). dt = 1/240 s real time, at most 40 sub-steps per frame. Slow motion
 * never touches this loop; display angles are integrated separately (kinematics.ts).
 *
 * physicsStep() is a line-by-line port of reference sim_step():
 *   T_em = min(u · T_max(ω) · derate, T_trac)             (driving; limiter above 225 km/h)
 *   T_em = max(T_shaft,req + T_drag, T_min(ω))            (braking; regen fades below 8 km/h)
 *   T_shaft = T_em − (P_fe + P_mag + P_mech) / ω_m
 *   P_dc = T_em ω_m + P_cu(T_w) + P_rcu + P_inv
 *   (m + m_rot) dv/dt = F_motor − F_road − F_friction
 */
import { BATTERY } from '@/config/battery';
import { IM, PM, T_REF_C, V_DC_NOM, voltageMaxV, type MotorKind } from '@/config/motor';
import { THERMAL } from '@/config/thermal';
import { DRIVER, G0, SIM_DT, SIM_MAX_SUBSTEPS, VEHICLE } from '@/config/vehicle';
import { batteryCurrent, socStep } from '@/physics/battery';
import {
  createDriverState,
  driverCommand,
  startPreset,
  type DriverEvents,
  type DriverState,
} from '@/physics/driver';
import { IM_LR } from '@/physics/induction';
import { copperTempScale, mechLossW } from '@/physics/losses';
import { emptyMapPoint, type MapLookup, type MapPoint } from '@/physics/maps';
import { classifyRegime } from '@/physics/regime';
import { derateFactor, thermalRates } from '@/physics/thermal';
import type { Losses, Preset, SimInputs, SimSnapshot } from '@/physics/types';
import {
  MASS_EFF_KG,
  motorOmega,
  roadLoadN,
  tractionTorqueNm,
  wheelForceN,
  wheelRpm,
} from '@/physics/vehicle';

const RPM = 30 / Math.PI;

export type MotorMaps = Record<MotorKind, MapLookup>;

export interface SimState {
  t: number;
  v: number;
  soc: number;
  tW: number;
  tR: number;
  accel: number;
  /** energy book-keeping for §7.2 #9 */
  eDc: number;
  eRoad: number;
  eLoss: number;
  eFric: number;
}

export function createSimState(soc: number = BATTERY.socDefault): SimState {
  return {
    t: 0,
    v: 0,
    soc,
    tW: THERMAL.tStartC,
    tR: THERMAL.tStartC,
    accel: 0,
    eDc: 0,
    eRoad: 0,
    eLoss: 0,
    eFric: 0,
  };
}

/** Everything one physics step produced (read by the snapshot). */
export interface StepResult {
  kmh: number;
  rpm: number;
  omegaM: number;
  tCmd: number;
  tEm: number;
  tShaft: number;
  tMax: number;
  tMin: number;
  tTrac: number;
  tractionLimited: boolean;
  limited: boolean;
  pt: MapPoint;
  pDc: number;
  pShaft: number;
  pWheel: number;
  pDrag: number;
  pCu: number;
  pMech: number;
  pGear: number;
  iDc: number;
  vDc: number;
  derate: number;
  fFric: number;
  braking: boolean;
}

export function emptyStepResult(): StepResult {
  return {
    kmh: 0,
    rpm: 0,
    omegaM: 0,
    tCmd: 0,
    tEm: 0,
    tShaft: 0,
    tMax: 0,
    tMin: 0,
    tTrac: 0,
    tractionLimited: false,
    limited: false,
    pt: emptyMapPoint(),
    pDc: 0,
    pShaft: 0,
    pWheel: 0,
    pDrag: 0,
    pCu: 0,
    pMech: 0,
    pGear: 0,
    iDc: 0,
    vDc: V_DC_NOM,
    derate: 1,
    fFric: 0,
    braking: false,
  };
}

const scratchPt = emptyMapPoint();

/** One fixed step of vehicle + battery + thermal (reference sim_step). */
export function physicsStep(
  st: SimState,
  maps: MotorMaps,
  kind: MotorKind,
  throttle: number,
  brake: number,
  out: StepResult = emptyStepResult(),
  dt: number = SIM_DT,
): StepResult {
  const mp = maps[kind];
  const { gearRatio: gR, gearEff: eta, wheelRadiusM: rW } = VEHICLE;
  const v = st.v;
  const kmh = v * 3.6;
  const wM = motorOmega(v);
  const rpm = wM * RPM;
  const fRoad = roadLoadN(v);

  const derate = derateFactor(kind, st.tW, st.tR);
  const tMax = mp.tMax(rpm) * derate;
  const tMin = mp.tMin(rpm);
  const tTrac = tractionTorqueNm(st.accel);
  // spin-loss drag fades to 0 at standstill to avoid 0/0
  const fadeW = Math.min(wM / 1, 1);
  const pMech = mechLossW(wM);

  let pt: MapPoint;
  let tCmd: number;
  let tractionLimited = false;
  if (brake > 0) {
    const aReq = DRIVER.brakeMaxG * G0 * brake;
    const fNeed = v > 0 ? Math.max(MASS_EFF_KG * aReq - fRoad, 0) : 0;
    const regenFade = Math.min(kmh / DRIVER.regenFadeKmh, 1);
    const tShaftReq = (-fNeed * regenFade * rW * eta) / gR;
    // first guess of the drag from the zero-torque point, then one refinement at the target
    const pt0 = mp.lookup(rpm, 0, scratchPt);
    let tDrag = ((pt0.feW + pt0.magW + pMech) / Math.max(wM, 1)) * fadeW;
    let tEm = Math.max(Math.min(tShaftReq + tDrag, 0), tMin);
    pt = mp.lookup(rpm, tEm, out.pt);
    tDrag = ((pt.feW + pt.magW + pMech) / Math.max(wM, 1)) * fadeW;
    tEm = Math.max(Math.min(tShaftReq + tDrag, 0), tMin);
    pt = mp.lookup(rpm, tEm, out.pt);
    tCmd = tShaftReq + tDrag;
  } else {
    tCmd = throttle * tMax;
    if (kmh > VEHICLE.vMaxKmh) {
      tCmd *= Math.max(0, 1 - (kmh - VEHICLE.vMaxKmh) / VEHICLE.limiterBandKmh);
    }
    tractionLimited = tCmd > tTrac;
    pt = mp.lookup(rpm, Math.min(tCmd, tTrac), out.pt);
  }
  const tEm = pt.torqueNm;
  const pDrag = (pt.feW + pt.magW + pMech) * fadeW;
  const pEm = tEm * wM;
  const pShaft = pEm - pDrag;
  const tShaft = tEm - (wM > 1e-9 ? pDrag / wM : 0);
  const fMotor = wheelForceN(tShaft);
  const pWheel = fMotor * v;
  const pGear = Math.abs(pWheel - pShaft);

  let fFric = 0;
  if (brake > 0 && v > 0) {
    const aReq = DRIVER.brakeMaxG * G0 * brake;
    const fNeed = Math.max(MASS_EFF_KG * aReq - fRoad, 0);
    fFric = Math.max(fNeed + fMotor, 0); // fMotor is negative when regenerating
  }

  // copper loss at the actual winding temperature (the maps are built at T_REF_C)
  const pCu = pt.cuW * copperTempScale(st.tW, T_REF_C);
  const pDc = pEm + pCu + pt.rcuW + pt.invW;
  const { iDcA, vDcV } = batteryCurrent(pDc, st.soc);

  // vehicle: explicit Euler at 240 Hz
  const fNet = fMotor - fRoad - fFric;
  let a: number;
  let vNew: number;
  if (v <= 0 && fNet <= 0) {
    a = 0;
    vNew = 0;
  } else {
    a = fNet / MASS_EFF_KG;
    vNew = v + a * dt;
    if (vNew < 0) {
      vNew = 0;
      a = -v / dt;
    }
  }
  // energy book-keeping: DC energy = kinetic + road + friction brake + all losses
  const vAvg = 0.5 * (v + vNew);
  st.eDc += pDc * dt;
  st.eRoad += fRoad * vAvg * dt;
  st.eFric += fFric * vAvg * dt;
  st.eLoss += (pCu + pt.rcuW + pt.invW + pDrag + pGear) * dt;
  st.eLoss += fMotor * (v - vAvg) * dt; // Euler correction: motor work at the step-average speed

  // thermal (§6.10)
  const pFe = pt.feW * fadeW;
  const [dW, dR] = thermalRates(st.tW, st.tR, {
    cuW: pCu,
    feW: pFe,
    rcuW: pt.rcuW,
    magW: pt.magW * fadeW,
  });
  st.tW += dW * dt;
  st.tR += dR * dt;
  st.soc = socStep(st.soc, pDc, dt);
  st.v = vNew;
  st.accel = a;
  st.t += dt;

  out.kmh = kmh;
  out.rpm = rpm;
  out.omegaM = wM;
  out.tCmd = tCmd;
  out.tEm = tEm;
  out.tShaft = tShaft;
  out.tMax = tMax;
  out.tMin = tMin;
  out.tTrac = tTrac;
  out.tractionLimited = tractionLimited;
  out.limited = pt.limited || tractionLimited || derate < 1;
  out.pt = pt;
  out.pDc = pDc;
  out.pShaft = pShaft;
  out.pWheel = pWheel;
  out.pDrag = pDrag;
  out.pCu = pCu;
  out.pMech = pMech * fadeW;
  out.pGear = pGear;
  out.iDc = iDcA;
  out.vDc = vDcV;
  out.derate = derate;
  out.fFric = fFric;
  out.braking = brake > 0;
  return out;
}

// ---------------------------------------------------------------------------------------------
// Frame-level simulation with the driver model
// ---------------------------------------------------------------------------------------------

export interface Sim {
  readonly state: SimState;
  readonly driver: DriverState;
  /** advance by real time dtReal (fixed sub-steps, max 40 per call) */
  step(dtReal: number, inputs: SimInputs): void;
  setPreset(preset: Preset): void;
  /** jump the dyno to a speed (used by presets and the tour) */
  setSpeedKmh(kmh: number): void;
  snapshot(): SimSnapshot;
  /** called once when a launch records its 0–100 time */
  onLaunchTime(cb: (seconds: number) => void): void;
  onPresetEnded(cb: () => void): void;
}

export function createSim(maps: MotorMaps, soc: number = BATTERY.socDefault): Sim {
  const st = createSimState(soc);
  const driver = createDriverState();
  const res = emptyStepResult();
  const events: DriverEvents = { launchTime: null, presetEnded: false };
  const launchCbs: ((s: number) => void)[] = [];
  const endCbs: (() => void)[] = [];
  const dragPt = emptyMapPoint();
  let acc = 0;
  let motor: MotorKind = 'pm';
  let throttle = 0;
  let brake = 0;
  let launchTime: number | null = null;

  const sim: Sim = {
    state: st,
    driver,
    step(dtReal, inputs) {
      motor = inputs.motor;
      acc += dtReal;
      let n = 0;
      while (acc >= SIM_DT && n < SIM_MAX_SUBSTEPS) {
        const cmd = driverCommand(driver, st.t, st.v * 3.6, inputs.throttle, inputs.brake, events);
        throttle = cmd.throttle;
        brake = cmd.brake;
        physicsStep(st, maps, motor, cmd.throttle, cmd.brake, res);
        if (events.launchTime !== null) {
          launchTime = events.launchTime;
          launchCbs.forEach((cb) => cb(events.launchTime ?? 0));
        }
        if (events.presetEnded) endCbs.forEach((cb) => cb());
        acc -= SIM_DT;
        n++;
      }
      if (n === SIM_MAX_SUBSTEPS) acc = 0; // drop the backlog instead of spiralling
    },
    setPreset(preset) {
      const jump = startPreset(driver, preset, st.t, st.v * 3.6);
      if (jump !== null) sim.setSpeedKmh(jump);
    },
    setSpeedKmh(kmh) {
      st.v = Math.max(kmh, 0) / 3.6;
      st.accel = 0;
    },
    onLaunchTime(cb) {
      launchCbs.push(cb);
    },
    onPresetEnded(cb) {
      endCbs.push(cb);
    },
    snapshot() {
      return buildSnapshot(st, res, maps, motor, driver, throttle, brake, launchTime, dragPt);
    },
  };
  return sim;
}

function buildSnapshot(
  st: SimState,
  r: StepResult,
  maps: MotorMaps,
  motor: MotorKind,
  driver: DriverState,
  throttle: number,
  brake: number,
  launchTime: number | null,
  dragPt: MapPoint,
): SimSnapshot {
  const pt = r.pt;
  const vMax = voltageMaxV(V_DC_NOM);
  // speeds from the post-step state so rotor and field angles integrate consistently
  const omegaM = motorOmega(st.v);
  const omegaE =
    motor === 'pm'
      ? PM.polePairs * omegaM
      : IM.polePairs * omegaM + (pt.idA > 0 ? (IM.rR * pt.iqA) / (IM_LR * pt.idA) : 0);
  const vMag = Math.hypot(pt.vdV, pt.vqV);
  const iPeak = Math.hypot(pt.idA, pt.iqA);
  const losses: Losses = {
    cuW: r.pCu,
    rcuW: pt.rcuW,
    feW: r.omegaM >= 1 ? pt.feW : pt.feW * r.omegaM,
    magW: r.omegaM >= 1 ? pt.magW : pt.magW * r.omegaM,
    invW: pt.invW,
    mechW: r.pMech,
    gearW: r.pGear,
  };
  const lossTotal =
    losses.cuW + losses.rcuW + losses.feW + losses.magW + losses.invW + losses.mechW + losses.gearW;
  let eff = 0;
  if (r.pShaft > 0 && r.pDc > 0) eff = r.pShaft / r.pDc;
  else if (r.pShaft < 0 && r.pDc < 0) eff = r.pDc / r.pShaft;
  const rpm = r.rpm;
  const drag = (k: MotorKind): number => {
    const d = maps[k].lookup(rpm, 0, dragPt);
    return d.feW + d.magW + mechLossW(r.omegaM);
  };
  const voltageLimited = vMag >= 0.985 * vMax && Math.abs(pt.torqueNm) > 1;
  const kmh = st.v * 3.6;
  return {
    t: st.t,
    v: st.v,
    kmh,
    motor,
    preset: driver.preset,
    throttle,
    brake,
    omegaM,
    rpm: omegaM * RPM,
    wheelRpm: wheelRpm(st.v),
    tCmd: r.tCmd,
    tMotor: pt.torqueNm,
    tShaft: r.tShaft,
    tWheel: r.tShaft * VEHICLE.gearRatio * (r.tShaft >= 0 ? VEHICLE.gearEff : 1 / VEHICLE.gearEff),
    tMax: r.tMax,
    tMin: r.tMin,
    limited: r.limited,
    tractionLimited: r.tractionLimited,
    id: pt.idA,
    iq: pt.iqA,
    iPeak,
    vd: pt.vdV,
    vq: pt.vqV,
    vMag,
    vMax,
    emfNoLoad: motor === 'pm' ? PM.polePairs * omegaM * PM.psiM : 0,
    // IM: consistent with omegaE (the map's slip field is interpolated separately)
    slip: motor === 'im' && Math.abs(omegaE) > 1e-9 ? (omegaE - IM.polePairs * omegaM) / omegaE : 0,
    omegaE,
    barCurrentA: motor === 'im' ? IM.kBar * (IM.lM / IM_LR) * Math.abs(pt.iqA) : 0,
    losses,
    lossTotalW: lossTotal,
    pShaft: r.pShaft,
    pDc: r.pDc,
    pWheel: r.pWheel,
    eff,
    vDc: r.vDc,
    iDc: r.iDc,
    soc: st.soc,
    tWinding: st.tW,
    tRotor: st.tR,
    derate: r.derate,
    frictionBrakeW: r.fFric * st.v,
    regime: classifyRegime({
      motor,
      kmh,
      tMotor: pt.torqueNm,
      tMax: r.tMax,
      derate: r.derate,
      pDc: r.pDc,
      voltageLimited,
      braking: r.braking,
    }),
    launchTime,
    launchElapsed:
      driver.preset === 'launch' && driver.launchPhase === 'running'
        ? st.t - driver.launchStartT
        : null,
    loadAngle: Math.atan2(-pt.vdV, pt.vqV),
    currentAngle: iPeak > 1e-6 ? Math.atan2(pt.iqA, pt.idA) : 0,
    voltageLimited,
    dragPmW: drag('pm'),
    dragImW: drag('im'),
  };
}
