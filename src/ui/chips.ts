/**
 * Camera chips, bottom centre (TECH_SPEC §3.8). Each flies the camera (1.2 s easeInOutCubic)
 * and sets Follow/View: Stator → Field + Cutaway, Rotor → Field + Exploded, Inverter → Power,
 * Wheels → All + Whole.
 */
import type { CameraPreset } from '@/scene/cameraRig';
import type { Actions } from '@/state/actions';
import type { FollowMode, ViewMode } from '@/state/uiState';
import { h } from '@/ui/dom';

interface Chip {
  cam: CameraPreset;
  name: string;
  sub: string;
  follow?: FollowMode;
  view?: ViewMode;
}

const CHIPS: Chip[] = [
  { cam: 'stator', name: 'Stator', sub: 'three phases', follow: 'field', view: 'cutaway' },
  { cam: 'rotor', name: 'Rotor', sub: 'magnets or cage', follow: 'field', view: 'exploded' },
  { cam: 'inverter', name: 'Inverter', sub: 'DC to AC', follow: 'power' },
  { cam: 'wheels', name: 'Wheels', sub: 'on the rollers', follow: 'all', view: 'whole' },
];

export function createChips(actions: Actions): HTMLElement {
  return h(
    'nav.chips',
    { 'aria-label': 'Camera' },
    ...CHIPS.map((c) => {
      const b = h(
        'button.chip.glass',
        { type: 'button', 'aria-label': `Camera: ${c.name}, ${c.sub}` },
        h('strong', {}, c.name),
        h('span', {}, ` · ${c.sub}`),
      );
      b.addEventListener('click', () => {
        actions.flyTo(c.cam);
        if (c.follow) actions.setFollow(c.follow);
        if (c.view) actions.setView(c.view);
      });
      return b;
    }),
  );
}
