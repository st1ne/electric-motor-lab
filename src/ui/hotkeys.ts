/**
 * Keyboard bindings (TECH_SPEC §3.9). Ignored while typing in a text field; arrow keys are left to
 * a focused range input so the slider still works by keyboard. Esc closes help.
 */
import type { Actions } from '@/state/actions';
import { FOLLOWS } from '@/state/actions';
import type { Store } from '@/state/store';
import type { UiState } from '@/state/uiState';
import type { HoldButton } from '@/ui/holdButton';
import type { Preset } from '@/physics/types';

const PRESETS: Record<string, Preset> = {
  q: 'launch',
  w: 'cruise',
  e: 'top',
  r: 'regen',
  t: 'coast',
};

export function installHotkeys(
  store: Store<UiState>,
  actions: Actions,
  brake: HoldButton,
  extra: Record<string, () => void> = {},
): void {
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    const tag = target?.tagName;
    if (tag === 'TEXTAREA' || (tag === 'INPUT' && (target as HTMLInputElement).type !== 'range'))
      return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (store.get().helpOpen && k !== 'Escape' && k !== 'h' && k !== '?') return;

    const preset = PRESETS[k];
    if (preset && !e.repeat) {
      actions.setPreset(preset);
      return;
    }
    if (k === 'ArrowUp' || k === 'ArrowDown') {
      if (tag === 'INPUT') return; // the focused slider handles its own arrows
      actions.nudgeThrottle(k === 'ArrowUp' ? 0.05 : -0.05);
      e.preventDefault();
      return;
    }
    if (e.repeat) return;
    const idx = ['1', '2', '3', '4'].indexOf(k);
    if (idx >= 0) {
      actions.setFollow(FOLLOWS[idx] ?? 'all');
      return;
    }
    switch (k) {
      case 's':
        brake.press();
        break;
      case 'm':
        actions.toggleMotor();
        break;
      case 'o':
        actions.toggleOnlyPhaseA();
        break;
      case ',':
        actions.stepSlowMo(1);
        break;
      case '.':
        actions.stepSlowMo(-1);
        break;
      case ' ':
        if (tag === 'BUTTON') return; // Space activates the focused button
        actions.toggleFreeze();
        e.preventDefault();
        break;
      case 'v':
        actions.cycleView();
        break;
      case 'c':
        actions.cycleChart();
        break;
      case 'n':
        actions.toggleSound();
        break;
      case 'h':
      case '?':
        actions.setHelp(!store.get().helpOpen);
        break;
      case 'Escape':
        actions.setHelp(false);
        break;
      default:
        extra[k]?.();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.key.toLowerCase() === 's') brake.release();
  });
  window.addEventListener('blur', () => brake.release());
}
