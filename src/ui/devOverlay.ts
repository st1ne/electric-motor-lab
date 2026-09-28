/**
 * Dev-only overlay (TODO Phases 2 and 6), toggled with the backtick key: fps, frame time, draw
 * calls, triangles, the live SimSnapshot and the display angles.
 */
import type { WebGLRenderer } from 'three';
import type { DisplayAngles, SimSnapshot } from '@/physics/types';

export interface DevOverlay {
  frame(
    dt: number,
    renderer: WebGLRenderer,
    s: SimSnapshot,
    a: DisplayAngles,
    slowMoLabel: number,
  ): void;
}

const round = (v: unknown): unknown => (typeof v === 'number' ? +v.toFixed(3) : v);

export function createDevOverlay(root: HTMLElement): DevOverlay {
  const el = document.createElement('pre');
  el.setAttribute('aria-hidden', 'true');
  Object.assign(el.style, {
    position: 'fixed',
    left: '8px',
    bottom: '8px',
    maxHeight: 'calc(100vh - 16px)',
    overflow: 'hidden',
    margin: '0',
    padding: '8px 10px',
    font: '11px/1.35 "JetBrains Mono", ui-monospace, monospace',
    color: '#c9b8ff',
    background: 'rgba(0,0,0,0.62)',
    borderRadius: '6px',
    pointerEvents: 'none',
    zIndex: '99',
    display: 'none',
    whiteSpace: 'pre',
  } satisfies Partial<CSSStyleDeclaration>);
  root.appendChild(el);
  let visible = false;
  window.addEventListener('keydown', (e) => {
    if (e.key === '`') {
      visible = !visible;
      el.style.display = visible ? 'block' : 'none';
    }
  });

  let acc = 0;
  let frames = 0;
  return {
    frame(dt, renderer, s, a, slowMoLabel) {
      acc += dt;
      frames++;
      if (acc < 0.5) return;
      const fps = frames / acc;
      const ms = (acc / frames) * 1000;
      acc = 0;
      frames = 0;
      if (!visible) return;
      const info = renderer.info.render;
      const { losses, ...rest } = s;
      const snap = Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, round(v)]));
      const ang = Object.fromEntries(
        Object.entries(a)
          .filter(([, v]) => typeof v === 'number')
          .map(([k, v]) => [k, round(v)]),
      );
      el.textContent =
        `${fps.toFixed(0)} fps  ${ms.toFixed(1)} ms  dpr ${renderer.getPixelRatio()}  slow-mo ×${slowMoLabel}\n` +
        `draw calls ${info.calls}  triangles ${info.triangles.toLocaleString('en-US')}\n` +
        `losses ${JSON.stringify(Object.fromEntries(Object.entries(losses).map(([k, v]) => [k, Math.round(v)])))}\n` +
        JSON.stringify({ ...snap, ...ang }, null, 1)
          .replace(/[{}"]/g, '')
          .replace(/\n\s*\n/g, '\n');
    },
  };
}
