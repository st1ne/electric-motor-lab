/**
 * Common contract for scene modules (TECH_SPEC §17):
 * every create…() returns { object3d, update(snapshot, angles, ui, dt), dispose() }.
 */
import type { Object3D } from 'three';
import type { DisplayAngles, SimSnapshot } from '@/physics/types';
import type { UiState } from '@/state/uiState';

export interface FrameContext {
  snapshot: SimSnapshot;
  angles: DisplayAngles;
  ui: UiState;
  /** real frame time, s */
  dt: number;
  /** true in Real slow-mo: motor-side parts use the visual speed cap (§5.5) */
  realTime: boolean;
  /**
   * Visual rotor angle (rad, mechanical). Equals angles.thetaMech in slow motion; in Real mode it
   * integrates the capped speed (≤ 2.5 rev/s) so nothing strobes. Every drivetrain part derives
   * its angle from this one by its ratio, so gears always mesh.
   */
  mechAngle: number;
  /** 0…1 strength of the motion-blur discs (Real mode above the cap) */
  spinBlur: number;
}

export interface SceneModule<T extends Object3D = Object3D> {
  readonly object3d: T;
  update(ctx: FrameContext): void;
  dispose(): void;
}

/** Dispose all geometries and materials under an object. */
export function disposeTree(root: Object3D): void {
  root.traverse((o) => {
    const m = o as Object3D & {
      geometry?: { dispose(): void };
      material?: { dispose(): void } | { dispose(): void }[];
    };
    m.geometry?.dispose();
    if (Array.isArray(m.material)) m.material.forEach((x) => x.dispose());
    else m.material?.dispose();
  });
}
