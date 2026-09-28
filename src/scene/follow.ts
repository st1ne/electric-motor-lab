/**
 * Follow modes All / Field / Power / Heat (TECH_SPEC §9): animate the shared uDim uniform of each
 * mesh system over 400 ms so the systems the mode is about stand out. The forced charts per mode
 * live in state/actions.ts (setFollow).
 */
import { Group } from 'three';
import type { FollowMode } from '@/state/uiState';
import { DIM, type SystemTag } from '@/scene/materials';
import type { FrameContext, SceneModule } from '@/scene/module';

const TRANSITION_S = 0.4;

/** Systems dimmed in each mode. */
export const DIMMED: Record<FollowMode, readonly SystemTag[]> = {
  all: [],
  field: ['power', 'structure', 'environment'],
  power: ['field', 'structure'],
  heat: ['power', 'structure'],
};

const SYSTEMS = Object.keys(DIM) as SystemTag[];

export function createFollow(): SceneModule<Group> {
  return {
    object3d: new Group(),
    update(ctx: FrameContext) {
      const dimmed = DIMMED[ctx.ui.follow];
      const step = ctx.dt / TRANSITION_S;
      for (const sys of SYSTEMS) {
        const target = dimmed.includes(sys) ? 1 : 0;
        const u = DIM[sys];
        u.value =
          target > u.value ? Math.min(u.value + step, target) : Math.max(u.value - step, target);
      }
    },
    dispose() {},
  };
}
