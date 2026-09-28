/**
 * Rotor swap (TECH_SPEC §3.4, §5.3): Magnet ↔ Induction over 0.8 s. The current rotor slides
 * out axially through the non-drive end (by 1.5 × the stack length) and fades; the other slides
 * in and fades up, overlapping by 0.2 s. Both rotors turn with the visual rotor angle throughout.
 */
import { Group, type MeshStandardMaterial } from 'three';
import { GEOMETRY, type MotorKind } from '@/config/motor';
import type { FrameContext, SceneModule } from '@/scene/module';
import { easeInOutCubic, prefersReducedMotion } from '@/util/easing';

export const SWAP_S = 0.8;
const OUT_S = 0.5;
const IN_START_S = 0.3;
const TRAVEL = -1.5 * GEOMETRY.stackLength;

export interface RotorLike extends SceneModule<Group> {
  readonly fadeMaterials: readonly MeshStandardMaterial[];
}

export interface RotorSwap extends SceneModule<Group> {
  /** 0…1 while a swap is running, null otherwise */
  readonly progress: number | null;
  readonly shown: MotorKind;
}

function setOpacity(r: RotorLike, opacity: number): void {
  const fading = opacity < 0.999;
  r.object3d.visible = opacity > 0.001;
  for (const m of r.fadeMaterials) {
    if (m.transparent !== fading) {
      m.transparent = fading;
      m.needsUpdate = true;
    }
    m.opacity = opacity;
    m.depthWrite = !fading;
  }
}

export function createRotorSwap(
  rotors: Record<MotorKind, RotorLike>,
  initial: MotorKind,
): RotorSwap {
  const group = new Group();
  group.name = 'rotors';
  group.add(rotors.pm.object3d, rotors.im.object3d);
  let shown: MotorKind = initial;
  let from: MotorKind = initial;
  let t: number | null = null;
  const reduced = prefersReducedMotion();
  const other = (k: MotorKind): MotorKind => (k === 'pm' ? 'im' : 'pm');
  setOpacity(rotors[other(initial)], 0);

  return {
    object3d: group,
    get progress() {
      return t === null ? null : Math.min(t / SWAP_S, 1);
    },
    get shown() {
      return shown;
    },
    update(ctx: FrameContext) {
      const want = ctx.ui.motor;
      if (want !== shown && t === null) {
        from = shown;
        shown = want;
        t = reduced ? SWAP_S : 0;
      }
      if (t !== null) {
        t += ctx.dt;
        const out = easeInOutCubic(Math.min(t / OUT_S, 1));
        const inn = easeInOutCubic(
          Math.min(Math.max((t - IN_START_S) / (SWAP_S - IN_START_S), 0), 1),
        );
        rotors[from].object3d.position.x = TRAVEL * out;
        setOpacity(rotors[from], 1 - out);
        rotors[shown].object3d.position.x = TRAVEL * (1 - inn);
        setOpacity(rotors[shown], inn);
        if (t >= SWAP_S) {
          t = null;
          rotors[from].object3d.position.x = 0;
          setOpacity(rotors[from], 0);
          rotors[shown].object3d.position.x = 0;
          setOpacity(rotors[shown], 1);
        }
      }
      for (const k of ['pm', 'im'] as const) {
        const r = rotors[k];
        if (!r.object3d.visible) continue;
        r.object3d.rotation.x = ctx.mechAngle;
        r.update(ctx);
      }
    },
    dispose() {
      rotors.pm.dispose();
      rotors.im.dispose();
    },
  };
}
