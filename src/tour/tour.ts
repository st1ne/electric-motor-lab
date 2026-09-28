/**
 * Guided tour runner (TECH_SPEC §11): plays TOUR_STEPS with a caption bar above the camera chips
 * (step count, title, sentence, progress dots). Any user input (a control, a hotkey, orbiting
 * the camera) pauses it and shows a Resume pill; Enter, ▶ or × stops it. The tour's own writes
 * are marked so they don't count as input; nor does the sim ending a preset by itself.
 * Steps run in real time.
 */
import type { Sim } from '@/physics/sim';
import type { Actions } from '@/state/actions';
import type { Store } from '@/state/store';
import type { UiState } from '@/state/uiState';
import { TOUR_STEPS, type TourStep } from '@/tour/steps';
import { h } from '@/ui/dom';

export interface TourDeps {
  readonly store: Store<UiState>;
  readonly sim: Sim;
  readonly actions: Actions;
  /** register a callback for camera input (orbit, zoom, pan) */
  onCameraInput(cb: () => void): void;
  readonly host: HTMLElement;
  readonly steps?: readonly TourStep[];
}

export interface Tour {
  readonly running: boolean;
  readonly paused: boolean;
  readonly step: number;
  start(): void;
  stop(): void;
  toggle(): void;
  resume(): void;
  update(dt: number): void;
}

/** Store keys the sim or the frame loop change on their own (never user input). */
const PASSIVE: readonly (keyof UiState)[] = ['preset', 'tourStep', 'cam'];

export function createTour(deps: TourDeps): Tour {
  const { store, sim, actions } = deps;
  const steps = deps.steps ?? TOUR_STEPS;

  const count = h('span.tour-count.mono');
  const title = h('b.tour-title');
  const caption = h('p.tour-caption', { 'aria-live': 'polite' });
  const dots = h('div.tour-dots', { 'aria-hidden': 'true' });
  const dotEls = steps.map(() => {
    const d = h('i', {}, h('span'));
    dots.append(d);
    return d;
  });
  const resumeBtn = h('button.tour-resume', { type: 'button', hidden: true }, 'Resume');
  const closeBtn = h(
    'button.icon-btn.tour-close',
    { type: 'button', 'aria-label': 'Stop the tour' },
    '×',
  );
  const bar = h(
    'section.tour-bar.glass',
    { hidden: true, 'aria-label': 'Guided tour' },
    h('div.tour-text', {}, h('div.tour-head', {}, count, title), caption),
    h('div.tour-side', {}, dots, resumeBtn, closeBtn),
  );
  deps.host.append(bar);

  let running = false;
  let paused = false;
  let index = -1;
  let t = 0;
  let applying = false;

  const quietly = (fn: () => void): void => {
    applying = true;
    try {
      fn();
    } finally {
      applying = false;
    }
  };

  function show(i: number): void {
    const step = steps[i] as TourStep;
    count.textContent = `${i + 1} / ${steps.length}`;
    title.textContent = step.title;
    caption.textContent = step.caption;
    dotEls.forEach((d, k) => {
      d.classList.toggle('done', k < i);
      d.classList.toggle('on', k === i);
    });
  }

  function enter(i: number): void {
    const step = steps[i] as TourStep;
    index = i;
    t = 0;
    quietly(() => {
      actions.flyTo(step.camera);
      store.set({ ...step.state, tourStep: i, throttle: 0, brake: 0 });
      if (step.speedKmh !== undefined) sim.setSpeedKmh(step.speedKmh);
      if (step.preset) actions.setPreset(step.preset, step.cruiseKmh);
    });
    show(i);
  }

  function setPaused(p: boolean): void {
    paused = p;
    resumeBtn.hidden = !p;
    bar.classList.toggle('paused', p);
  }

  const onInput = (): void => {
    if (running && !paused && !applying) setPaused(true);
  };
  // any change to a user-facing field pauses; the passive ones don't
  store.subscribe(
    (s) =>
      (Object.keys(s) as (keyof UiState)[])
        .filter((k) => !PASSIVE.includes(k))
        .map((k) => s[k])
        .join('|'),
    onInput,
  );
  deps.onCameraInput(onInput);

  const api: Tour = {
    get running() {
      return running;
    },
    get paused() {
      return paused;
    },
    get step() {
      return index;
    },
    start() {
      if (running) return;
      running = true;
      bar.hidden = false;
      setPaused(false);
      enter(0);
    },
    stop() {
      if (!running) return;
      running = false;
      index = -1;
      setPaused(false);
      bar.hidden = true;
      quietly(() => store.set({ tourStep: null, onlyPhaseA: false }));
    },
    toggle() {
      if (running) api.stop();
      else api.start();
    },
    resume() {
      if (!running || !paused) return;
      setPaused(false);
      // pick the step back up where it was, camera included
      quietly(() => actions.flyTo((steps[index] as TourStep).camera));
    },
    update(dt) {
      if (!running || paused) return;
      t += dt;
      const step = steps[index] as TourStep;
      const fill = dotEls[index]?.firstElementChild as HTMLElement | null;
      if (fill) fill.style.transform = `scaleX(${Math.min(t / step.durationS, 1)})`;
      if (t < step.durationS) return;
      if (index + 1 < steps.length) enter(index + 1);
      else api.stop();
    },
  };
  resumeBtn.addEventListener('click', () => api.resume());
  closeBtn.addEventListener('click', () => api.stop());
  return api;
}
