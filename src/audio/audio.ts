/**
 * Sound (TECH_SPEC §12): WebAudio synthesis, no files, off by default, and started only from a
 * user gesture (browsers keep an AudioContext suspended until then). Everything follows real
 * time, not slow-mo: the car on the dyno always runs in real time.
 *
 *   motor whine   sines at 6·f_e and 12·f_e (the stylized slot-ripple orders of 54 slots /
 *                 6 poles), level ∝ |T| / T_max plus a faint floor ∝ speed
 *   inverter      band-passed noise at f_sw = 10 kHz, a slight hiss only while |T| > 0
 *   gear whine    sine at the stage-1 tooth-mesh frequency z₁ · f_m, level ∝ |T|
 *   rumble        low-passed noise ∝ road speed (tyres on the rollers)
 *   master        gain → limiter (compressor at −6 dB, 20:1) → speakers
 * Parameters glide with setTargetAtTime so nothing clicks.
 */
import { F_SW_HZ, IM, PM } from '@/config/motor';
import { GEAR_TEETH } from '@/config/vehicle';
import type { SimSnapshot } from '@/physics/types';

const GLIDE_S = 0.06;
const MASTER = 0.5;
/** audible ceiling: harmonics above this are faded out rather than aliased */
const F_CEIL_HZ = 16000;

// ---- pure mappings (tested)

/** Electrical frequency, Hz. */
export function electricalHz(s: Pick<SimSnapshot, 'omegaE'>): number {
  return Math.abs(s.omegaE) / (2 * Math.PI);
}

/** Stage-1 tooth-mesh frequency z₁ · f_m, Hz. */
export function gearMeshHz(rpm: number): number {
  return (GEAR_TEETH.z1 * Math.abs(rpm)) / 60;
}

/** Whine level 0…1: torque over the machine's peak torque, plus a floor that grows with speed. */
export function whineLevel(s: Pick<SimSnapshot, 'tMotor' | 'motor' | 'rpm'>): number {
  const tPeak = s.motor === 'pm' ? 420 : 380; // §7.1 peak torques
  const load = Math.min(Math.abs(s.tMotor) / tPeak, 1);
  return Math.min(0.08 * Math.min(Math.abs(s.rpm) / 12000, 1) + 0.92 * load, 1);
}

/** Fade a tone out as it approaches the audible ceiling. */
export function ceilingFade(hz: number): number {
  return Math.min(Math.max((F_CEIL_HZ - hz) / 3000, 0), 1);
}

export interface Audio {
  setEnabled(on: boolean): void;
  update(s: SimSnapshot): void;
  /** current state, for the dev overlay and tests */
  inspect(): { context: string; master: number; whineHz: number; gearHz: number };
  dispose(): void;
}

function noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

interface Graph {
  ctx: AudioContext;
  master: GainNode;
  w6: OscillatorNode;
  w12: OscillatorNode;
  g6: GainNode;
  g12: GainNode;
  hiss: GainNode;
  gear: OscillatorNode;
  gearGain: GainNode;
  rumble: GainNode;
  rumbleFilter: BiquadFilterNode;
}

function buildGraph(): Graph {
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = 0;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.1;
  master.connect(limiter).connect(ctx.destination);

  const gain = (): GainNode => {
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(master);
    return g;
  };
  const osc = (to: AudioNode, type: OscillatorType = 'sine'): OscillatorNode => {
    const o = ctx.createOscillator();
    o.type = type;
    o.connect(to);
    o.start();
    return o;
  };
  const white = noiseBuffer(ctx, 2);
  const noise = (): AudioBufferSourceNode => {
    const src = ctx.createBufferSource();
    src.buffer = white;
    src.loop = true;
    src.start();
    return src;
  };

  const g6 = gain();
  const g12 = gain();
  const w6 = osc(g6);
  const w12 = osc(g12);

  const hiss = gain();
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = Math.min(F_SW_HZ, ctx.sampleRate / 2 - 500);
  bp.Q.value = 6;
  noise().connect(bp).connect(hiss);

  const gearGain = gain();
  const gear = osc(gearGain, 'triangle');

  const rumble = gain();
  const rumbleFilter = ctx.createBiquadFilter();
  rumbleFilter.type = 'lowpass';
  rumbleFilter.frequency.value = 120;
  rumbleFilter.Q.value = 0.7;
  noise().connect(rumbleFilter).connect(rumble);

  return { ctx, master, w6, w12, g6, g12, hiss, gear, gearGain, rumble, rumbleFilter };
}

export function createAudio(): Audio {
  let g: Graph | null = null;
  let enabled = false;

  const unlock = (): void => {
    if (g && enabled && g.ctx.state === 'suspended') void g.ctx.resume();
  };
  const onVisibility = (): void => {
    if (!g) return;
    if (document.hidden) void g.ctx.suspend();
    else if (enabled) void g.ctx.resume();
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  document.addEventListener('visibilitychange', onVisibility);

  // the first update after the graph is built jumps straight to the targets (no glide from 440 Hz)
  let fresh = true;
  const set = (p: AudioParam, v: number): void => {
    if (!g) return;
    if (fresh) p.setValueAtTime(v, g.ctx.currentTime);
    else p.setTargetAtTime(v, g.ctx.currentTime, GLIDE_S);
  };
  const applyMaster = (): void => {
    if (g) g.master.gain.setTargetAtTime(enabled ? MASTER : 0, g.ctx.currentTime, GLIDE_S);
  };

  return {
    setEnabled(on) {
      enabled = on;
      if (on && !g) g = buildGraph(); // normally the first call comes from a click or key press
      if (g && on) void g.ctx.resume();
      applyMaster();
    },
    update(s) {
      if (!g || !enabled) return;
      const fe = Math.max(electricalHz(s), 1);
      const lvl = whineLevel(s);
      set(g.w6.frequency, Math.min(6 * fe, F_CEIL_HZ));
      set(g.w12.frequency, Math.min(12 * fe, F_CEIL_HZ));
      set(g.g6.gain, 0.16 * lvl * ceilingFade(6 * fe) * Math.min(fe / 8, 1));
      set(g.g12.gain, 0.07 * lvl * ceilingFade(12 * fe) * Math.min(fe / 8, 1));
      const iMax = s.motor === 'pm' ? PM.currentMaxA : IM.currentMaxA;
      set(g.hiss.gain, Math.abs(s.tMotor) > 1 ? 0.02 + 0.05 * Math.min(s.iPeak / iMax, 1) : 0);
      const fg = Math.max(gearMeshHz(s.rpm), 1);
      set(g.gear.frequency, Math.min(fg, F_CEIL_HZ));
      set(g.gearGain.gain, 0.05 * Math.min(Math.abs(s.tMotor) / 300, 1) * ceilingFade(fg));
      const v = Math.min(s.kmh / 200, 1);
      set(g.rumble.gain, 0.25 * v);
      set(g.rumbleFilter.frequency, 80 + 260 * v);
      fresh = false;
    },
    inspect() {
      return {
        context: g ? g.ctx.state : 'none',
        master: g ? g.master.gain.value : 0,
        whineHz: g ? g.w6.frequency.value : 0,
        gearHz: g ? g.gear.frequency.value : 0,
      };
    },
    dispose() {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      document.removeEventListener('visibilitychange', onVisibility);
      void g?.ctx.close();
      g = null;
    },
  };
}
