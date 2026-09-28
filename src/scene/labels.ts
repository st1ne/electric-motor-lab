/**
 * 3D-pinned labels (TECH_SPEC §3.7): HTML pills projected from 3D anchors every frame.
 *
 *   visibility  each label decides from Follow / View / motor; anchors behind the camera or off
 *               screen are hidden
 *   occlusion   a ray from the camera to the anchor against coarse invisible proxies (housing,
 *               gearbox, wheels), one sixth of the labels per frame
 *   collisions  greedy by priority: try the anchor height, then one step up, then one down, then
 *               the same on the left of the anchor; a label that still overlaps another label or
 *               a UI panel is dropped; at most 9 are shown (5 on phones)
 *   motion      positions follow the anchor every frame (rounded to pixels); vertical nudges
 *               ease so labels never jump; fades are a 200 ms CSS transition
 * Values are re-rendered at 10 Hz and only written when their text changes.
 */
import { Group, Raycaster, Vector3, type Mesh, type Object3D, type PerspectiveCamera } from 'three';
import type { FrameContext, SceneModule } from '@/scene/module';
import type { UiState } from '@/state/uiState';
import { approach } from '@/util/math';
import { createThrottle, RATE_HZ } from '@/util/throttle';

export const MAX_LABELS = 9;
/** phones (< 900 px) show at most this many (§15) */
export const MAX_LABELS_MOBILE = 5;
/** UI elements labels must not hide under */
const PANEL_SELECTOR = '.glass, .title-block, .chip, .corner-btn, .toast';
export const OCCLUSION_EVERY = 6;
const DOT_GAP_PX = 10;
const NUDGE_TAU_S = 0.08;
/** a hit this close to the anchor (world units) does not count as occluding it */
const OCCLUSION_SLACK = 0.004;

export type LabelTone =
  'field' | 'phase-a' | 'phase-b' | 'phase-c' | 'power' | 'regen' | 'heat' | 'structure';

export interface LabelSpec {
  readonly id: string;
  readonly name: string;
  /** a fixed tone, or one chosen per frame (e.g. amber while driving, green in regen) */
  readonly tone: LabelTone | ((ctx: FrameContext) => LabelTone);
  /** higher wins collisions */
  readonly priority: number;
  /** write the anchor's world position into `out` */
  anchor(out: Vector3, ctx: FrameContext): void;
  value(ctx: FrameContext): string;
  visible(ctx: FrameContext): boolean;
  /** proxies this label's anchor sits in or on (never occluded by them) */
  readonly ignore?: readonly Object3D[];
}

export interface OcclusionProxy {
  readonly mesh: Mesh;
  /** whether the proxy blocks view right now (e.g. the housing only in Whole view) */
  active(ui: Readonly<UiState>): boolean;
}

interface Slot {
  readonly spec: LabelSpec;
  readonly el: HTMLElement;
  readonly valueEl: HTMLElement;
  tone: LabelTone | null;
  width: number;
  height: number;
  text: string;
  shown: boolean;
  occluded: boolean;
  nudge: number;
  flip: boolean;
}

export interface Labels extends SceneModule<Group> {
  /** ids currently shown, highest priority first (tests, dev) */
  readonly shownIds: readonly string[];
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Axis-aligned rectangle overlap. */
export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** A label placement: vertical nudge in px, and whether the pill sits left of its dot. */
export interface Placement {
  readonly dy: number;
  readonly flip: boolean;
}

/**
 * Greedy placement (§3.7): candidates sorted by priority; each tries dy = 0, −step, +step to
 * the right of its anchor, then the same to the left, and is dropped when every option overlaps
 * an already placed label or an obstacle. `rects` are right-side boxes whose x is the anchor.
 * Returns the placement per index (null = dropped). Pure, for tests.
 */
export function placeLabels(
  rects: readonly Rect[],
  max = MAX_LABELS,
  gap = 4,
  obstacles: readonly Rect[] = [],
): (Placement | null)[] {
  const placed: Rect[] = [];
  return rects.map((r) => {
    if (placed.length >= max) return null;
    for (const flip of [false, true]) {
      for (const dy of [0, -(r.h + gap), r.h + gap]) {
        const c = { ...r, x: flip ? r.x - r.w : r.x, y: r.y + dy };
        if (!placed.some((p) => overlaps(c, p)) && !obstacles.some((o) => overlaps(c, o))) {
          placed.push(c);
          return { dy, flip };
        }
      }
    }
    return null;
  });
}

/** Rectangles just outside the viewport, so labels flip or nudge instead of running off it. */
export function offscreen(w: number, h: number): Rect[] {
  const big = 1e5;
  return [
    { x: w, y: -big, w: big, h: 2 * big },
    { x: -big, y: -big, w: big, h: 2 * big },
    { x: -big, y: -big, w: 2 * big, h: big },
    { x: -big, y: h, w: 2 * big, h: big },
  ];
}

export function createLabels(
  host: HTMLElement,
  camera: PerspectiveCamera,
  specs: readonly LabelSpec[],
  proxies: readonly OcclusionProxy[],
): Labels {
  const layer = document.createElement('div');
  layer.className = 'labels';
  layer.setAttribute('aria-hidden', 'true');
  host.prepend(layer);

  const slots: Slot[] = specs.map((spec) => {
    const el = document.createElement('div');
    el.className = 'label';
    const dot = document.createElement('i');
    const name = document.createElement('b');
    name.textContent = spec.name;
    const valueEl = document.createElement('span');
    valueEl.className = 'mono';
    el.append(dot, name, valueEl);
    layer.append(el);
    return {
      spec,
      el,
      valueEl,
      tone: null,
      width: 0,
      height: 0,
      text: '',
      shown: false,
      occluded: false,
      nudge: 0,
      flip: false,
    };
  });

  const ray = new Raycaster();
  const world = new Vector3();
  const view = new Vector3();
  const ndc = new Vector3();
  const dir = new Vector3();
  const text = createThrottle(RATE_HZ.text);
  // UI panels are obstacles: labels never slide underneath them (re-measured at 2 Hz)
  const measure = createThrottle(2);
  const mobile = typeof matchMedia === 'function' ? matchMedia('(max-width: 899px)') : null;
  let panels: Rect[] = [];
  let frame = 0;
  let shownIds: string[] = [];

  function setShown(slot: Slot, on: boolean): void {
    if (slot.shown === on) return;
    slot.shown = on;
    slot.el.classList.toggle('on', on);
  }

  return {
    object3d: new Group(),
    get shownIds() {
      return shownIds;
    },
    update(ctx: FrameContext) {
      const { ui, dt } = ctx;
      frame++;
      const refreshText = text.ready(dt);
      if (measure.ready(dt)) {
        panels = [...host.querySelectorAll<HTMLElement>(PANEL_SELECTOR)]
          .filter((el) => !el.hidden && el.offsetParent !== null)
          .map((el) => {
            const r = el.getBoundingClientRect();
            return { x: r.left, y: r.top, w: r.width, h: r.height };
          });
      }
      const w = host.clientWidth || window.innerWidth;
      const h = host.clientHeight || window.innerHeight;
      camera.updateMatrixWorld();
      const blockers = proxies.filter((p) => p.active(ui)).map((p) => p.mesh);

      const candidates: { slot: Slot; x: number; y: number }[] = [];
      slots.forEach((slot, i) => {
        const spec = slot.spec;
        if (!spec.visible(ctx)) return;
        spec.anchor(world, ctx);
        view.copy(world).applyMatrix4(camera.matrixWorldInverse);
        if (view.z >= -camera.near) return; // behind the camera
        ndc.copy(world).project(camera);
        if (Math.abs(ndc.x) > 1.02 || Math.abs(ndc.y) > 1.02) return;

        if (i % OCCLUSION_EVERY === frame % OCCLUSION_EVERY || !slot.shown) {
          const dist = camera.position.distanceTo(world);
          dir.copy(world).sub(camera.position).normalize();
          ray.set(camera.position, dir);
          ray.far = dist;
          const hits = ray.intersectObjects(
            spec.ignore ? blockers.filter((b) => !spec.ignore?.includes(b)) : blockers,
            false,
          );
          slot.occluded = hits.some((hit) => hit.distance < dist - OCCLUSION_SLACK);
        }
        if (slot.occluded) return;

        const tone = typeof spec.tone === 'function' ? spec.tone(ctx) : spec.tone;
        if (tone !== slot.tone) {
          if (slot.tone) slot.el.classList.remove(`tone-${slot.tone}`);
          slot.el.classList.add(`tone-${tone}`);
          slot.tone = tone;
        }
        if (refreshText || slot.text === '') {
          const t = spec.value(ctx);
          if (t !== slot.text) {
            slot.text = t;
            slot.valueEl.textContent = t;
            slot.width = slot.el.offsetWidth;
            slot.height = slot.el.offsetHeight;
          }
        }
        candidates.push({ slot, x: (ndc.x * 0.5 + 0.5) * w, y: (-ndc.y * 0.5 + 0.5) * h });
      });

      candidates.sort((a, b) => b.slot.spec.priority - a.slot.spec.priority);
      const places = placeLabels(
        candidates.map((c) => ({
          x: c.x - DOT_GAP_PX / 2,
          y: c.y - c.slot.height / 2,
          w: c.slot.width + DOT_GAP_PX,
          h: c.slot.height,
        })),
        mobile?.matches ? MAX_LABELS_MOBILE : MAX_LABELS,
        4,
        [...panels, ...offscreen(w, h)],
      );
      const keep = new Set<Slot>();
      candidates.forEach((c, k) => {
        const place = places[k];
        if (!place) return;
        const slot = c.slot;
        keep.add(slot);
        if (place.flip !== slot.flip) {
          slot.flip = place.flip;
          slot.el.classList.toggle('flip', place.flip);
        }
        // a label that just appeared starts at its slot; moving ones ease between slots
        slot.nudge = slot.shown
          ? slot.nudge + (place.dy - slot.nudge) * approach(dt, NUDGE_TAU_S)
          : place.dy;
        // the dot sits on the anchor: at the pill's left end, or its right end when flipped
        const x = Math.round(place.flip ? c.x - slot.width + 4 : c.x - 4);
        const y = Math.round(c.y - slot.height / 2 + slot.nudge);
        slot.el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        setShown(slot, true);
      });
      for (const slot of slots) if (!keep.has(slot)) setShown(slot, false);
      shownIds = candidates.filter((c) => keep.has(c.slot)).map((c) => c.slot.spec.id);
    },
    dispose() {
      layer.remove();
    },
  };
}
