/**
 * Inverter on top of the motor (TECH_SPEC §5.4): an aluminium housing whose lid comes off in the
 * Cutaway, the DC-link film capacitor, three SiC half-bridge legs with the gate-driver board and
 * LEDs (switches.ts), the DC and AC bus bars (busbars.ts) and the DC input where the orange HV
 * cables arrive. Built in rig metres around the box centre.
 */
import { BoxGeometry, CylinderGeometry, Group, Mesh } from 'three';
import { RIG } from '@/config/environment';
import { PALETTE } from '@/config/theme';
import { mergeStatic } from '@/scene/mergeStatic';
import { makeMaterial } from '@/scene/materials';
import { disposeTree, type FrameContext, type SceneModule } from '@/scene/module';
import { createBusbars, FLOOR_Y, INV } from '@/scene/inverter/busbars';
import { createSwitches } from '@/scene/inverter/switches';
import { approach } from '@/util/math';

const [SX, SY, SZ] = INV.size;

export interface Inverter extends SceneModule<Group> {
  readonly lid: Mesh;
}

export function createInverter(): Inverter {
  const group = new Group();
  group.name = 'inverter';
  const motorY = RIG.axleY + RIG.motorOffset[0];
  const motorZ = RIG.axleZ + RIG.motorOffset[1];
  group.position.set(RIG.motorX, motorY + INV.offsetY, motorZ);

  const alu = makeMaterial(
    { color: PALETTE.aluminium, metalness: 0.85, roughness: 0.42 },
    'structure',
  );
  const t = 0.006;
  // tray: floor and four walls
  const parts: [number, number, number, number, number, number][] = [
    [0, -SY / 2 + t / 2, 0, SX, t, SZ],
    [0, 0, -SZ / 2 + t / 2, SX, SY, t],
    [0, 0, SZ / 2 - t / 2, SX, SY, t],
    [-SX / 2 + t / 2, 0, 0, t, SY, SZ],
    [SX / 2 - t / 2, 0, 0, t, SY, SZ],
  ];
  for (const [x, y, z, sx, sy, sz] of parts) {
    const w = new Mesh(new BoxGeometry(sx, sy, sz), alu);
    w.position.set(x, y, z);
    w.castShadow = true;
    w.receiveShadow = true;
    group.add(w);
  }
  const lid = new Mesh(new BoxGeometry(SX + 0.006, 0.008, SZ + 0.006), alu);
  lid.position.y = SY / 2 + 0.004;
  lid.castShadow = true;
  group.add(lid);
  // mounting feet onto the motor housing
  const feet = new Mesh(new BoxGeometry(SX * 0.7, 0.05, 0.05), alu);
  feet.position.set(0, -SY / 2 - 0.02, 0);
  group.add(feet);

  // DC-link film capacitor block on the input side
  const cap = new Mesh(
    new BoxGeometry(0.1, 0.05, 0.19),
    makeMaterial({ color: PALETTE.capacitor, roughness: 0.5, metalness: 0.2 }, 'power'),
  );
  cap.position.set(-0.08, FLOOR_Y + 0.027, 0);
  cap.castShadow = true;
  group.add(cap);
  // DC input connector where the HV cables arrive
  const conn = new Mesh(
    new CylinderGeometry(0.02, 0.02, 0.02, 20),
    makeMaterial({ color: PALETTE.hvOrange, roughness: 0.45 }, 'power'),
  );
  conn.rotation.z = Math.PI / 2;
  conn.position.set(-SX / 2 - 0.006, 0, 0);
  group.add(conn);

  group.add(createBusbars());
  const switches = createSwitches();
  group.add(switches.object3d);

  mergeStatic(group, [lid, switches.object3d]);
  let lidOpen = 1;
  return {
    object3d: group,
    lid,
    update(ctx: FrameContext) {
      switches.update(ctx);
      const target = ctx.ui.view === 'whole' && !ctx.ui.debugHousing ? 0 : 1;
      lidOpen += (target - lidOpen) * approach(ctx.dt, 0.15);
      lid.position.y = SY / 2 + 0.004 + lidOpen * 0.16;
      lid.visible = lidOpen < 0.98;
    },
    dispose: () => disposeTree(group),
  };
}
