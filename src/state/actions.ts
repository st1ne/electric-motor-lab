/**
 * Every user intent goes through here (control panel, hotkeys, chips, tour, URL), so the store
 * and the sim never disagree (TECH_SPEC §3.4, §3.9, §13.3).
 */
import type { MotorKind } from '@/config/motor';
import { SLOW_MO_STEPS, type SlowMoSetting } from '@/physics/kinematics';
import type { Sim } from '@/physics/sim';
import type { Preset } from '@/physics/types';
import type { CameraPreset, CameraRig } from '@/scene/cameraRig';
import type { Store } from '@/state/store';
import type { ChartTab, FollowMode, UiState, ViewMode } from '@/state/uiState';

export const VIEWS: readonly ViewMode[] = ['whole', 'cutaway', 'exploded'];
export const CHARTS: readonly ChartTab[] = ['map', 'scope', 'losses', 'run'];
export const FOLLOWS: readonly FollowMode[] = ['all', 'field', 'power', 'heat'];

export interface Actions {
  setPreset(p: Preset): void;
  setThrottle(u: number): void;
  nudgeThrottle(delta: number): void;
  setBrake(b: number): void;
  setMotor(m: MotorKind): void;
  toggleMotor(): void;
  setSlowMo(s: SlowMoSetting): void;
  /** dir +1: slower (more slow motion), −1: faster */
  stepSlowMo(dir: 1 | -1): void;
  setView(v: ViewMode): void;
  cycleView(): void;
  setFollow(f: FollowMode): void;
  setChart(c: ChartTab): void;
  cycleChart(): void;
  toggleFreeze(): void;
  toggleOnlyPhaseA(): void;
  toggleSound(): void;
  setHelp(open: boolean): void;
  flyTo(cam: CameraPreset): void;
}

export function createActions(store: Store<UiState>, sim: Sim, rig: CameraRig): Actions {
  const clamp01 = (x: number): number => Math.min(Math.max(x, 0), 1);
  const a: Actions = {
    setPreset(p) {
      store.set({ preset: p, throttle: 0 });
      sim.setPreset(p);
    },
    setThrottle(u) {
      // moving the throttle cancels any preset (§3.4)
      store.set({ throttle: clamp01(u), preset: 'none' });
      sim.setPreset('none');
    },
    nudgeThrottle(delta) {
      const s = store.get();
      const base = s.preset === 'none' ? s.throttle : sim.snapshot().throttle;
      a.setThrottle(Math.round((base + delta) * 20) / 20);
    },
    setBrake(b) {
      store.set({ brake: clamp01(b) });
    },
    setMotor(m) {
      store.set({ motor: m });
    },
    toggleMotor() {
      a.setMotor(store.get().motor === 'pm' ? 'im' : 'pm');
    },
    setSlowMo(s) {
      store.set({ slowMo: s });
    },
    stepSlowMo(dir) {
      const i = SLOW_MO_STEPS.indexOf(store.get().slowMo);
      const next = Math.min(Math.max(i + dir, 0), SLOW_MO_STEPS.length - 1);
      a.setSlowMo(SLOW_MO_STEPS[next] ?? 'auto');
    },
    setView(v) {
      store.set({ view: v });
    },
    cycleView() {
      const i = VIEWS.indexOf(store.get().view);
      a.setView(VIEWS[(i + 1) % VIEWS.length] ?? 'cutaway');
    },
    setFollow(f) {
      store.set({ follow: f });
    },
    setChart(c) {
      store.set({ chart: c });
    },
    cycleChart() {
      const i = CHARTS.indexOf(store.get().chart);
      a.setChart(CHARTS[(i + 1) % CHARTS.length] ?? 'scope');
    },
    toggleFreeze() {
      store.set({ frozen: !store.get().frozen });
    },
    toggleOnlyPhaseA() {
      store.set({ onlyPhaseA: !store.get().onlyPhaseA });
    },
    toggleSound() {
      store.set({ sound: !store.get().sound });
    },
    setHelp(open) {
      store.set({ helpOpen: open });
    },
    flyTo(cam) {
      rig.flyTo(cam);
    },
  };
  return a;
}
