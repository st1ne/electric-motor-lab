/**
 * Inverter bus bars (TECH_SPEC §5.4): the DC bars from the orange HV input across the DC-link
 * capacitor to the three half-bridge legs, and the three AC bars in phase colours that drop
 * through the inverter floor to the winding leads. Positions in the inverter's local frame
 * (origin at the box centre, rig metres).
 */
import { BoxGeometry, Color, Group, Mesh, Vector3 } from 'three';
import { RIG } from '@/config/environment';
import { PHASE_COLORS } from '@/config/theme';
import { makeMaterial } from '@/scene/materials';

export const INV = RIG.inverter;
const [SX, SY] = INV.size;

/** Leg centre x positions (A, B, C) and the switch row z positions (upper, lower). */
export const LEG_X = [0.005, 0.06, 0.115] as const;
export const SWITCH_Z = [-0.045, 0.045] as const;
export const FLOOR_Y = -SY / 2 + 0.006;

/** Where each AC bar leaves the inverter floor (local frame). */
export function acTerminalLocal(phase: number): Vector3 {
  return new Vector3(0.095, -SY / 2 - 0.004, -0.035 + phase * 0.035);
}

export function createBusbars(): Group {
  const group = new Group();
  group.name = 'busbars';
  const copper = makeMaterial({ color: '#c97a45', metalness: 1, roughness: 0.3 }, 'power');
  // DC+ / DC− bars from the input (−x side) across the capacitor to the legs
  for (const [dy, dz] of [
    [0.012, -0.004],
    [0.02, 0.004],
  ] as const) {
    const bar = new Mesh(new BoxGeometry(SX * 0.72, 0.003, 0.012), copper);
    bar.position.set(-0.02, FLOOR_Y + 0.038 + dy, dz);
    group.add(bar);
  }
  // AC bars in phase colours: from each leg's midpoint down through the floor
  PHASE_COLORS.forEach((c, ph) => {
    const mat = makeMaterial(
      {
        color: c,
        metalness: 0.6,
        roughness: 0.35,
        emissive: new Color(c),
        emissiveIntensity: 0.25,
      },
      'power',
    );
    const legX = LEG_X[ph] ?? 0;
    const term = acTerminalLocal(ph);
    const top = FLOOR_Y + 0.03;
    const run = new Mesh(new BoxGeometry(Math.abs(term.x - legX) + 0.01, 0.003, 0.01), mat);
    run.position.set((legX + term.x) / 2, top, term.z);
    const drop = new Mesh(new BoxGeometry(0.01, top - term.y, 0.003), mat);
    drop.position.set(term.x, (top + term.y) / 2, term.z);
    group.add(run, drop);
  });
  return group;
}

/** Motor-local AC terminal positions for the winding leads. */
export function acTerminalsMotorLocal(): Vector3[] {
  return [0, 1, 2].map((ph) => acTerminalLocal(ph).add(new Vector3(0, INV.offsetY, 0)));
}
