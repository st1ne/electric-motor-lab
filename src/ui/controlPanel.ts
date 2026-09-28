/**
 * Control panel, top right (TECH_SPEC §3.4):
 *   1 Follow   All · Field · Power · Heat                     (1 2 3 4)
 *   2 Drive    Launch · Cruise · Top speed · Regen · Coast    (Q W E R T)
 *   3 Throttle slider 0–100 % (↑/↓, step 5) + hold-to-brake   (S)
 *   4 Motor (M) · Slow-mo (, .) · View (V)
 *   5 Tour (Enter) · Freeze field (Space) · Sound (N) · Help (H)
 * While a preset drives, the throttle thumb shows the preset's actual pedal.
 */
import type { SlowMoSetting } from '@/physics/kinematics';
import { fmt } from '@/physics/format';
import type { Preset, SimSnapshot } from '@/physics/types';
import type { Actions } from '@/state/actions';
import type { Store } from '@/state/store';
import type { FollowMode, UiState, ViewMode } from '@/state/uiState';
import { h, setText } from '@/ui/dom';
import { createHoldButton, type HoldButton } from '@/ui/holdButton';
import { createSegmented, rowHeader } from '@/ui/segmented';
import { createSlider } from '@/ui/slider';

const ICONS = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>',
  sound:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9zM16 8.5a4.5 4.5 0 010 7M18.5 6a8 8 0 010 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M4 9v6h4l5 4V5L8 9z"/></svg>',
  mute: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  help: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.2 9a2.9 2.9 0 115.1 1.9c-.9.9-2.3 1.5-2.3 3.1" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="18" r="1.4"/></svg>',
};

export interface ControlPanel {
  readonly el: HTMLElement;
  readonly brake: HoldButton;
  update(dt: number, s: SimSnapshot, slowMoLabel: number): void;
}

function iconButton(
  label: string,
  hint: string,
  svg: string,
  onClick: () => void,
): HTMLButtonElement {
  const b = h('button.icon-btn', {
    type: 'button',
    'aria-label': label,
    title: `${label} (${hint})`,
  });
  b.innerHTML = svg;
  b.addEventListener('click', onClick);
  return b;
}

export function createControlPanel(store: Store<UiState>, actions: Actions): ControlPanel {
  const s0 = store.get();

  const follow = createSegmented<FollowMode>({
    label: 'Follow',
    hint: '1 2 3 4',
    options: [
      { value: 'all', label: 'All' },
      { value: 'field', label: 'Field' },
      { value: 'power', label: 'Power' },
      { value: 'heat', label: 'Heat' },
    ],
    value: s0.follow,
    onSelect: actions.setFollow,
  });

  const drive = createSegmented<Preset>({
    label: 'Drive',
    hint: 'Q W E R T',
    options: [
      { value: 'launch', label: 'Launch', title: 'Full throttle from standstill, 0–100 km/h' },
      { value: 'cruise', label: 'Cruise', title: 'Hold 110 km/h' },
      { value: 'top', label: 'Top speed', title: 'Full throttle to the limiter' },
      { value: 'regen', label: 'Regen', title: 'Brake at 0.25 g with the motor' },
      { value: 'coast', label: 'Coast', title: 'No throttle, no brake' },
    ],
    value: s0.preset,
    onSelect: actions.setPreset,
  });

  const throttle = createSlider({
    label: 'Throttle',
    min: 0,
    max: 100,
    step: 5,
    value: s0.throttle * 100,
    format: (v) => `${fmt(v)} %`,
    valueText: (v) => `throttle ${fmt(v)} percent`,
    onInput: (v) => actions.setThrottle(v / 100),
  });
  const brake = createHoldButton({ label: 'Brake', onChange: actions.setBrake });
  const pedals = h(
    'div.row',
    {},
    rowHeader('Throttle', '↑ ↓'),
    h(
      'div.pedals',
      {},
      throttle.el,
      h('div.brake-wrap', {}, brake.el, h('span.hint.mono', { 'aria-hidden': 'true' }, 'S')),
    ),
  );

  const motor = createSegmented({
    label: 'Motor',
    hint: 'M',
    options: [
      { value: 'pm' as const, label: 'Magnet' },
      { value: 'im' as const, label: 'Induction' },
    ],
    value: s0.motor,
    onSelect: actions.setMotor,
    className: 'compact',
  });
  const slowReadout = h('span.readout.mono', { 'aria-live': 'off' });
  const slow = createSegmented<SlowMoSetting>({
    label: 'Slow-mo',
    hint: ', .',
    options: [
      { value: 'auto', label: 'Auto', title: 'Field turns at about 0.4 rev/s' },
      { value: 100, label: '×100' },
      { value: 1000, label: '×1000' },
      { value: 10000, label: '×10k', title: '×10,000: PWM switching becomes visible' },
      { value: 1, label: 'Real' },
    ],
    value: s0.slowMo,
    onSelect: actions.setSlowMo,
    className: 'compact',
  });
  slow.el.querySelector('.row-head')?.append(slowReadout);
  const view = createSegmented<ViewMode>({
    label: 'View',
    hint: 'V',
    options: [
      { value: 'whole', label: 'Whole' },
      { value: 'cutaway', label: 'Cutaway' },
      { value: 'exploded', label: 'Exploded' },
    ],
    value: s0.view,
    onSelect: actions.setView,
    className: 'compact',
  });
  const row4 = h('div.row-split', {}, motor.el, slow.el, view.el);

  const tourBtn = iconButton('Guided tour', 'Enter', ICONS.play, actions.toggleTour);
  const freezeBtn = iconButton('Freeze field', 'Space', ICONS.pause, actions.toggleFreeze);
  const soundBtn = iconButton('Sound', 'N', ICONS.mute, actions.toggleSound);
  const helpBtn = iconButton('Help', 'H', ICONS.help, () => actions.setHelp(!store.get().helpOpen));
  const icons = h('div.icon-row', {}, tourBtn, freezeBtn, soundBtn, helpBtn);

  // < 900 px the panel is a bottom sheet (§15): the peek shows presets, throttle and brake; the
  // handle opens the rest
  const handle = h(
    'button.sheet-handle',
    { type: 'button', 'aria-expanded': 'false', 'aria-label': 'More controls' },
    h('span', { 'aria-hidden': 'true' }),
  );
  follow.el.classList.add('sheet-more');
  row4.classList.add('sheet-more');
  icons.classList.add('sheet-more');
  const el = h(
    'section.panel.glass.control-panel',
    { 'aria-label': 'Controls' },
    handle,
    follow.el,
    drive.el,
    pedals,
    row4,
    icons,
  );
  handle.addEventListener('click', () => {
    const open = !el.classList.contains('expanded');
    el.classList.toggle('expanded', open);
    handle.setAttribute('aria-expanded', String(open));
  });

  store.subscribe((s) => s.follow, follow.set);
  store.subscribe((s) => s.preset, drive.set);
  store.subscribe((s) => s.motor, motor.set);
  store.subscribe((s) => s.slowMo, slow.set);
  store.subscribe((s) => s.view, view.set);
  store.subscribe(
    (s) => s.frozen,
    (f) => {
      freezeBtn.classList.toggle('on', f);
      freezeBtn.setAttribute('aria-pressed', String(f));
      freezeBtn.innerHTML = f ? ICONS.play : ICONS.pause;
      freezeBtn.setAttribute('aria-label', f ? 'Resume field' : 'Freeze field');
    },
    true,
  );
  store.subscribe(
    (s) => s.sound,
    (on) => {
      soundBtn.classList.toggle('on', on);
      soundBtn.setAttribute('aria-pressed', String(on));
      soundBtn.innerHTML = on ? ICONS.sound : ICONS.mute;
    },
    true,
  );
  store.subscribe(
    (s) => s.helpOpen,
    (open) => helpBtn.setAttribute('aria-expanded', String(open)),
    true,
  );

  return {
    el,
    brake,
    update(dt, s, slowMoLabel) {
      brake.update(dt);
      throttle.set(Math.round(s.throttle * 100));
      setText(slowReadout, slowMoLabel <= 1 ? 'real time' : `×${fmt(slowMoLabel)}`);
    },
  };
}
