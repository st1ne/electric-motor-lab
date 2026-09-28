/**
 * Help overlay (TECH_SPEC §3.9, §6, §12, §19): hotkeys and the model's assumptions — peak vs RMS,
 * the stylized field, the generic drive unit, the 380 V maps, audio in real time — plus the
 * history note on Nikola Tesla's 1888 induction-motor patent. Esc or H closes it.
 */
import type { Actions } from '@/state/actions';
import type { Store } from '@/state/store';
import type { UiState } from '@/state/uiState';
import { h } from '@/ui/dom';

const KEYS: [string, string][] = [
  ['1 2 3 4', 'Follow: All / Field / Power / Heat'],
  ['Q W E R T', 'Launch / Cruise / Top speed / Regen / Coast'],
  ['↑ ↓', 'Throttle ±5 %'],
  ['S (hold)', 'Brake'],
  ['M', 'Magnet ↔ Induction'],
  ['O', 'Only phase A (pulsating vs rotating field)'],
  [', .', 'Slow-mo slower / faster'],
  ['Space', 'Freeze the field visuals (the car keeps going)'],
  ['V', 'Cycle view'],
  ['C', 'Cycle chart'],
  ['Enter', 'Guided tour'],
  ['N', 'Sound'],
  ['H or ?', 'Help'],
];

export function createHelp(store: Store<UiState>, actions: Actions): HTMLElement {
  const close = h(
    'button.icon-btn.help-close',
    { type: 'button', 'aria-label': 'Close help' },
    '×',
  );
  close.addEventListener('click', () => actions.setHelp(false));
  const keys = h(
    'table.keys',
    {},
    h('caption.sr-only', {}, 'Keyboard shortcuts'),
    h(
      'tbody',
      {},
      ...KEYS.map(([k, d]) => h('tr', {}, h('th.mono', { scope: 'row' }, k), h('td', {}, d))),
    ),
  );
  const notes = h('div.help-notes');
  notes.innerHTML = `
    <h3>How honest is this?</h3>
    <ul>
      <li><strong>Every number comes from a physics model.</strong> A dq model of an interior
        permanent-magnet motor and of a rotor-flux-oriented induction motor, with copper, iron,
        magnet, inverter, bearing and gearbox losses, picks the lowest-loss currents for every
        speed and torque within the current and voltage limits.</li>
      <li><strong>Currents are peak values</strong> (A pk), the amplitude of each phase's sine
        wave. The RMS value is 0.71 × peak.</li>
      <li><strong>The field picture is stylized:</strong> an analytic air-gap field, not a
        finite-element solution. The dq numbers behind it are exact for the model.</li>
      <li><strong>Induction bar current</strong> is an approximate display scale of the rotor
        current.</li>
      <li>The inverter maps assume a <strong>380 V</strong> DC link; battery sag changes the DC
        current, not the torque limit.</li>
      <li>Sound follows <strong>real time</strong>, not the slowed-down picture.</li>
      <li>The drive unit is a <strong>generic 200 kW class EV rear drive unit</strong>, not any
        manufacturer's product.</li>
    </ul>
    <h3>A bit of history</h3>
    <p>In 1888 Nikola Tesla patented the "Electro-Magnetic Motor" (US 381,968): several
      alternating currents, out of step with each other, create a magnetic field that rotates
      and drags a rotor with it. That rotating field is exactly what you see here. More than a
      century later, Tesla's first cars used induction motors built on the same idea.</p>`;
  const dialog = h(
    'div.help.glass',
    { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'help-title' },
    close,
    h('h2', { id: 'help-title' }, 'Help'),
    h('div.help-cols', {}, keys, notes),
  );
  const backdrop = h('div.help-backdrop', { hidden: true }, dialog);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) actions.setHelp(false);
  });
  let lastFocus: Element | null = null;
  store.subscribe(
    (s) => s.helpOpen,
    (open) => {
      backdrop.hidden = !open;
      if (open) {
        lastFocus = document.activeElement;
        close.focus();
      } else if (lastFocus instanceof HTMLElement) {
        lastFocus.focus();
      }
    },
  );
  return backdrop;
}
