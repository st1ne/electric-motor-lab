/**
 * Screen regions (TECH_SPEC §3.1): brand and title block, stat cards, explanation panel and
 * the chart card (mounted by main.ts) in the left column; the control panel top right; camera chips
 * bottom centre; share and "Follow" bottom left; help, toasts and the loader on top.
 */
import { BRAND } from '@/config/brand';
import type { SimSnapshot } from '@/physics/types';
import type { Actions } from '@/state/actions';
import type { Store } from '@/state/store';
import type { UiState } from '@/state/uiState';
import { createChips } from '@/ui/chips';
import { createControlPanel, type ControlPanel } from '@/ui/controlPanel';
import { h } from '@/ui/dom';
import { createExplainer } from '@/ui/explainer';
import { createHelp } from '@/ui/help';
import { createLoader, type Loader } from '@/ui/loader';
import { createStatCards } from '@/ui/statCards';
import { createToaster, type Toaster } from '@/ui/toast';

export interface Layout {
  readonly panel: ControlPanel;
  readonly toast: Toaster;
  readonly loader: Loader;
  /** the left column; main.ts mounts the chart card here */
  readonly column: HTMLElement;
  update(dt: number, s: SimSnapshot, slowMoLabel: number, laps: number): void;
}

export function createLayout(root: HTMLElement, store: Store<UiState>, actions: Actions): Layout {
  const loader = createLoader();
  const toast = createToaster();
  const title = h(
    'header.title-block',
    {},
    h('div.brand', {}, BRAND.name),
    h('div.overline.mono', {}, 'ELECTRIC MOTOR LAB'),
    h('h1.headline', {}, 'WHY THE ROTOR', h('br'), 'CHASES THE FIELD'),
    h(
      'p.intro',
      {},
      'Every EV has one. Almost nobody has seen the invisible magnet spinning inside it. Slow time ' +
        'down 1,000× and watch three sine waves of current drag the rotor around.',
    ),
  );
  const stats = createStatCards();
  const explainer = createExplainer();
  const column = h('div.left-col', {}, title, stats.el, explainer.el);
  const panel = createControlPanel(store, actions);

  // Share reposts the launch post on X; Follow opens the profile
  const shareBtn = h(
    'a.corner-btn.glass',
    { href: BRAND.shareUrl, target: '_blank', rel: 'noopener', 'aria-label': 'Share: repost on X' },
    'Share ↗',
  );
  const follow = h(
    'a.corner-btn.glass',
    { href: BRAND.handleUrl, target: '_blank', rel: 'noopener' },
    `Follow ${BRAND.handle}`,
  );
  const corner = h('div.corner', {}, shareBtn, follow);

  root.append(
    column,
    panel.el,
    createChips(actions),
    corner,
    toast.el,
    createHelp(store, actions),
    loader.el,
  );

  return {
    panel,
    toast,
    loader,
    column,
    update(dt, s, slowMoLabel, laps) {
      panel.update(dt, s, slowMoLabel);
      stats.update(dt, s);
      explainer.update(dt, s, slowMoLabel, laps);
    },
  };
}
