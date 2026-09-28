/**
 * Heat mode temperature ramp (TECH_SPEC §9 Heat): windings take the winding temperature and the
 * magnets / cage the rotor temperature, 40 → 160 °C mapped blue → orange → white on the emissive.
 * While the torque is derated the windings pulse in the alarm colour.
 * The owners (windings, rotors) set their own emissive every frame first; this module runs after
 * them and blends towards the heat colour by the Heat level (400 ms fades), so nothing fights.
 */
import { Color, Group, type MeshStandardMaterial } from 'three';
import { THEME } from '@/config/theme';
import type { FrameContext, SceneModule } from '@/scene/module';
import { approach, clamp } from '@/util/math';

export const HEAT_T_MIN = 40;
export const HEAT_T_MAX = 160;
const FADE_TAU = 0.13;

const STOPS: [number, Color][] = [
  [0, new Color('#2f6bff')],
  [0.5, new Color(THEME.heat)],
  [1, new Color('#fff4e6')],
];

/** Ramp colour for a temperature (°C). */
export function heatColor(tC: number, out = new Color()): Color {
  const u = clamp((tC - HEAT_T_MIN) / (HEAT_T_MAX - HEAT_T_MIN), 0, 1);
  for (let i = 1; i < STOPS.length; i++) {
    const [u1, c1] = STOPS[i] as [number, Color];
    if (u <= u1 || i === STOPS.length - 1) {
      const [u0, c0] = STOPS[i - 1] as [number, Color];
      return out.lerpColors(c0, c1, (u - u0) / (u1 - u0));
    }
  }
  return out;
}

interface Target {
  mat: MeshStandardMaterial;
  base: Color;
}

export function createHeat(
  windings: readonly MeshStandardMaterial[],
  rotor: readonly MeshStandardMaterial[],
): SceneModule<Group> {
  const wrap = (m: MeshStandardMaterial): Target => ({ mat: m, base: m.emissive.clone() });
  const wTargets = windings.map(wrap);
  const rTargets = rotor.map(wrap);
  const alarm = new Color(THEME.alarm);
  const cw = new Color();
  const cr = new Color();
  let level = 0;
  let t = 0;
  let blended = false;

  const apply = (list: Target[], c: Color, intensity: number): void => {
    for (const { mat, base } of list) {
      mat.emissive.copy(base).lerp(c, level);
      mat.emissiveIntensity += (intensity - mat.emissiveIntensity) * level;
    }
  };

  return {
    object3d: new Group(),
    update(ctx: FrameContext) {
      const s = ctx.snapshot;
      level += ((ctx.ui.follow === 'heat' ? 1 : 0) - level) * approach(ctx.dt, FADE_TAU);
      if (level < 0.002) {
        if (blended) {
          // restore the owners' colours once the fade is over
          for (const { mat, base } of [...wTargets, ...rTargets]) mat.emissive.copy(base);
          blended = false;
        }
        return;
      }
      blended = true;
      t += ctx.dt;
      const uw = clamp((s.tWinding - HEAT_T_MIN) / (HEAT_T_MAX - HEAT_T_MIN), 0, 1);
      const ur = clamp((s.tRotor - HEAT_T_MIN) / (HEAT_T_MAX - HEAT_T_MIN), 0, 1);
      heatColor(s.tWinding, cw);
      if (s.derate < 1) cw.lerp(alarm, 0.5 + 0.5 * Math.sin(t * 8));
      heatColor(s.tRotor, cr);
      apply(wTargets, cw, 0.5 + 1.8 * uw);
      apply(rTargets, cr, 0.4 + 1.6 * ur);
    },
    dispose() {},
  };
}
