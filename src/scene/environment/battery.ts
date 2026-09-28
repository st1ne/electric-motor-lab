/**
 * Battery module on a side stand (TECH_SPEC §4.1, §5.6), full-scale metres inside the 1:3 rig:
 * 96 cylindrical cells (46 × 80 mm, one instanced draw), busbars, a case with a transparent lid,
 * an SoC fill bar and the orange HV cable pair to the inverter. Cell tops glow amber while
 * discharging and green while charging, in proportion to the DC power.
 */
import {
  BoxGeometry,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  TubeGeometry,
  Vector3,
} from 'three';
import { RIG } from '@/config/environment';
import { THEME, PALETTE } from '@/config/theme';
import { mergeStatic } from '@/scene/mergeStatic';
import { makeMaterial, makePhysicalMaterial } from '@/scene/materials';
import { disposeTree, type FrameContext, type SceneModule } from '@/scene/module';
import { approach } from '@/util/math';

const CELL_R = 0.023;
const CELL_H = 0.08;
const COLS = 12;
const ROWS = 8;
const PITCH = 0.05;

export function inverterDcInput(): Vector3 {
  const motorY = RIG.axleY + RIG.motorOffset[0];
  const motorZ = RIG.axleZ + RIG.motorOffset[1];
  return new Vector3(RIG.motorX - RIG.inverter.size[0] / 2, motorY + RIG.inverter.offsetY, motorZ);
}

export function createBattery(): SceneModule<Group> {
  const group = new Group();
  group.name = 'battery';
  const B = RIG.battery;
  const m = new Matrix4();
  const w = COLS * PITCH + 0.04;
  const d = ROWS * PITCH + 0.04;

  // stand: top plate + 4 legs
  const standMat = makeMaterial(
    { color: PALETTE.benchLeg, roughness: 0.6, metalness: 0.55 },
    'environment',
  );
  const plate = new Mesh(new BoxGeometry(w + 0.1, 0.025, d + 0.1), standMat);
  plate.position.set(B.x, B.standHeight - 0.0125, B.z);
  plate.castShadow = true;
  plate.receiveShadow = true;
  group.add(plate);
  const legs = new InstancedMesh(new BoxGeometry(0.035, B.standHeight - 0.025, 0.035), standMat, 4);
  let k = 0;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      legs.setMatrixAt(
        k++,
        m.makeTranslation(B.x + sx * (w / 2), (B.standHeight - 0.025) / 2, B.z + sz * (d / 2)),
      );
    }
  }
  legs.castShadow = true;
  group.add(legs);

  const y0 = B.standHeight;
  // module tray (open box: floor + walls; the lid is transparent)
  const trayMat = makeMaterial({ color: '#2a303b', roughness: 0.5, metalness: 0.6 }, 'power');
  const floor = new Mesh(new BoxGeometry(w, 0.012, d), trayMat);
  floor.position.set(B.x, y0 + 0.006, B.z);
  group.add(floor);
  const wallH = CELL_H + 0.03;
  const walls = new InstancedMesh(new BoxGeometry(1, 1, 1), trayMat, 4);
  const wallDefs: [number, number, number, number][] = [
    [B.x, B.z - d / 2, w, 0.01],
    [B.x, B.z + d / 2, w, 0.01],
    [B.x - w / 2, B.z, 0.01, d],
    [B.x + w / 2, B.z, 0.01, d],
  ];
  wallDefs.forEach(([x, z, sx, sz], i) => {
    m.makeScale(sx, wallH, sz).setPosition(x, y0 + wallH / 2, z);
    walls.setMatrixAt(i, m);
  });
  walls.castShadow = true;
  group.add(walls);

  // cells: body + glowing top cap (two instanced draws for 96 cells)
  const cellGeo = new CylinderGeometry(CELL_R, CELL_R, CELL_H, 20);
  const cells = new InstancedMesh(
    cellGeo,
    makeMaterial({ color: PALETTE.cell, roughness: 0.35, metalness: 0.5 }, 'power'),
    COLS * ROWS,
  );
  const capGeo = new CylinderGeometry(CELL_R * 0.72, CELL_R * 0.72, 0.004, 20);
  const capMat = new MeshBasicMaterial({ color: new Color('#3a3f48') });
  const caps = new InstancedMesh(capGeo, capMat, COLS * ROWS);
  k = 0;
  for (let i = 0; i < COLS; i++) {
    for (let j = 0; j < ROWS; j++) {
      const x = B.x - ((COLS - 1) * PITCH) / 2 + i * PITCH;
      const z = B.z - ((ROWS - 1) * PITCH) / 2 + j * PITCH;
      cells.setMatrixAt(k, m.makeTranslation(x, y0 + 0.012 + CELL_H / 2, z));
      caps.setMatrixAt(k, m.makeTranslation(x, y0 + 0.012 + CELL_H + 0.002, z));
      k++;
    }
  }
  cells.castShadow = true;
  group.add(cells, caps);

  // nickel busbars across each row of cells
  const bars = new InstancedMesh(
    new BoxGeometry(COLS * PITCH, 0.003, 0.012),
    makeMaterial({ color: '#c7ccd3', roughness: 0.3, metalness: 0.95 }, 'power'),
    ROWS,
  );
  for (let j = 0; j < ROWS; j++) {
    bars.setMatrixAt(
      j,
      m.makeTranslation(
        B.x,
        y0 + 0.012 + CELL_H + 0.006,
        B.z - ((ROWS - 1) * PITCH) / 2 + j * PITCH,
      ),
    );
  }
  group.add(bars);

  // transparent lid
  const lid = new Mesh(
    new BoxGeometry(w, 0.008, d),
    makePhysicalMaterial(
      { color: '#9fb4d6', roughness: 0.08, metalness: 0, transparent: true, opacity: 0.22 },
      'power',
    ),
  );
  lid.position.set(B.x, y0 + wallH + 0.004, B.z);
  group.add(lid);

  // SoC fill bar on the front wall
  const barBg = new Mesh(
    new BoxGeometry(w * 0.8, 0.028, 0.004),
    new MeshBasicMaterial({ color: '#10141c' }),
  );
  barBg.position.set(B.x, y0 + wallH * 0.5, B.z + d / 2 + 0.007);
  group.add(barBg);
  const fillMat = new MeshBasicMaterial({ color: new Color(THEME.regen), toneMapped: false });
  const fillGeo = new BoxGeometry(1, 0.02, 0.004);
  fillGeo.translate(0.5, 0, 0);
  const fill = new Mesh(fillGeo, fillMat);
  fill.position.set(B.x - w * 0.4 + 0.004, y0 + wallH * 0.5, B.z + d / 2 + 0.01);
  group.add(fill);

  // HV cable pair (orange) from the module terminals to the inverter DC input
  const end = inverterDcInput();
  const cableMat = makeMaterial(
    { color: PALETTE.hvOrange, roughness: 0.45, metalness: 0.05 },
    'power',
  );
  for (const dz of [-0.03, 0.03]) {
    const start = new Vector3(B.x + w / 2 + 0.02, y0 + 0.07, B.z + dz);
    const curve = new CatmullRomCurve3([
      start,
      new Vector3(start.x + 0.14, y0 + 0.08, B.z + 0.04 + dz),
      new Vector3(-0.85, end.y - 0.12, 0.05 + dz),
      new Vector3(end.x - 0.12, end.y, end.z + dz),
      new Vector3(end.x, end.y, end.z + dz),
    ]);
    const cable = new Mesh(new TubeGeometry(curve, 64, 0.011, 10, false), cableMat);
    cable.castShadow = true;
    group.add(cable);
  }
  // terminal posts
  const posts = new InstancedMesh(
    new CylinderGeometry(0.012, 0.012, 0.03, 12),
    makeMaterial({ color: '#b87333', roughness: 0.3, metalness: 1 }, 'power'),
    2,
  );
  posts.setMatrixAt(
    0,
    m.makeRotationZ(Math.PI / 2).setPosition(B.x + w / 2 + 0.012, y0 + 0.07, B.z - 0.03),
  );
  posts.setMatrixAt(
    1,
    m.makeRotationZ(Math.PI / 2).setPosition(B.x + w / 2 + 0.012, y0 + 0.07, B.z + 0.03),
  );
  group.add(posts);

  mergeStatic(group, [fill]);
  const idle = new Color('#3a3f48');
  const amber = new Color(THEME.power);
  const green = new Color(THEME.regen);
  const cur = new Color();
  let glow = 0;
  return {
    object3d: group,
    update(ctx: FrameContext) {
      const s = ctx.snapshot;
      const target = Math.min(Math.abs(s.pDc) / 150e3, 1);
      glow += (target - glow) * approach(ctx.dt, 0.08);
      cur.copy(idle).lerp(s.pDc >= 0 ? amber : green, Math.min(glow * 1.6, 1));
      capMat.color.copy(cur).multiplyScalar(1 + 2.2 * glow);
      fill.scale.x = Math.max(s.soc, 0.001) * (w * 0.8 - 0.008);
      fillMat.color.copy(s.soc < 0.15 ? new Color(THEME.alarm) : green);
    },
    dispose: () => disposeTree(group),
  };
}
