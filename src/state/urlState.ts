/**
 * URL state (TECH_SPEC §16): query params `motor`, `view`, `follow`, `preset`, `thr` (0–100 %),
 * `slow` (auto | 100 | 1000 | 10000 | real), `chart`, `cam` (camera chip) and `sound`.
 * Read on load; written with history.replaceState, debounced 500 ms. Only values that differ
 * from the defaults are written, so a fresh visit has a clean URL. Anything malformed is ignored.
 */
import type { SlowMoSetting } from '@/physics/kinematics';
import type { Preset } from '@/physics/types';
import type { Store } from '@/state/store';
import {
  defaultUiState,
  type CamChip,
  type ChartTab,
  type FollowMode,
  type UiState,
  type ViewMode,
} from '@/state/uiState';

export const URL_DEBOUNCE_MS = 500;

const MOTORS = ['pm', 'im'] as const;
const VIEWS: readonly ViewMode[] = ['whole', 'cutaway', 'exploded'];
const FOLLOWS: readonly FollowMode[] = ['all', 'field', 'power', 'heat'];
const PRESETS: readonly Preset[] = ['none', 'launch', 'cruise', 'top', 'regen', 'coast'];
const CHARTS: readonly ChartTab[] = ['map', 'scope', 'losses', 'run'];
const CHIPS: readonly CamChip[] = ['stator', 'rotor', 'inverter', 'wheels'];
const SLOW: Record<string, SlowMoSetting> = {
  auto: 'auto',
  '100': 100,
  '1000': 1000,
  '10000': 10000,
  real: 1,
};

export type UrlState = Partial<
  Pick<
    UiState,
    'motor' | 'view' | 'follow' | 'preset' | 'throttle' | 'slowMo' | 'chart' | 'cam' | 'sound'
  >
>;

function pick<T extends string>(v: string | null, allowed: readonly T[]): T | undefined {
  return allowed.find((a) => a === v);
}

/** Parse a query string into the UI fields it sets (unknown or invalid values dropped). */
export function readUrlState(search: string): UrlState {
  const q = new URLSearchParams(search);
  const out: UrlState = {};
  const motor = pick(q.get('motor'), MOTORS);
  if (motor) out.motor = motor;
  const view = pick(q.get('view'), VIEWS);
  if (view) out.view = view;
  const follow = pick(q.get('follow'), FOLLOWS);
  if (follow) out.follow = follow;
  const preset = pick(q.get('preset'), PRESETS);
  if (preset) out.preset = preset;
  const thr = q.get('thr');
  if (thr !== null && thr.trim() !== '' && Number.isFinite(Number(thr))) {
    out.throttle = Math.round(Math.min(Math.max(Number(thr), 0), 100) / 5) / 20;
    if (!preset) out.preset = 'none';
  }
  const slow = q.get('slow');
  if (slow !== null && slow in SLOW) out.slowMo = SLOW[slow];
  const chart = pick(q.get('chart'), CHARTS);
  if (chart) out.chart = chart;
  const cam = pick(q.get('cam'), CHIPS);
  if (cam) out.cam = cam;
  const sound = q.get('sound');
  if (sound === '1' || sound === '0') out.sound = sound === '1';
  return out;
}

/** Query string (with leading "?", or "" when everything is default) for a UI state. */
export function writeUrlState(ui: Readonly<UiState>): string {
  const d = defaultUiState();
  const q = new URLSearchParams();
  if (ui.motor !== d.motor) q.set('motor', ui.motor);
  if (ui.view !== d.view) q.set('view', ui.view);
  if (ui.follow !== d.follow) q.set('follow', ui.follow);
  if (ui.preset !== d.preset) q.set('preset', ui.preset);
  if (ui.preset === 'none' && ui.throttle > 0) q.set('thr', String(Math.round(ui.throttle * 100)));
  if (ui.slowMo !== d.slowMo) q.set('slow', ui.slowMo === 1 ? 'real' : String(ui.slowMo));
  if (ui.chart !== d.chart) q.set('chart', ui.chart);
  if (ui.cam) q.set('cam', ui.cam);
  if (ui.sound) q.set('sound', '1');
  const s = q.toString();
  return s ? `?${s}` : '';
}

export interface UrlSync {
  /** write the URL now (before sharing) and return it */
  flush(): string;
  dispose(): void;
}

/** Keep the address bar in sync with the store (debounced replaceState). */
export function installUrlSync(store: Store<UiState>): UrlSync {
  let timer = 0;
  const write = (): string => {
    window.clearTimeout(timer);
    timer = 0;
    const search = writeUrlState(store.get());
    const url = `${location.pathname}${search}${location.hash}`;
    if (url !== `${location.pathname}${location.search}${location.hash}`) {
      history.replaceState(history.state, '', url);
    }
    return location.href;
  };
  const off = store.subscribe(
    (s) => writeUrlState(s),
    () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(write, URL_DEBOUNCE_MS);
    },
  );
  return {
    flush: write,
    dispose() {
      off();
      window.clearTimeout(timer);
    },
  };
}
