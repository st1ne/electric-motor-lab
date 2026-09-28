/**
 * Two wall-mounted screens as CanvasTextures, redrawn at 10 Hz (TECH_SPEC §4.1).
 * Left: oscilloscope (phase currents i_a, i_b, i_c over two electrical periods of display time,
 * cursor at the current angle). Right: torque–speed map (drive/regen envelopes and a live dot).
 * Phase 2 placeholder content; Phase 10 mirrors the real chart canvases here.
 */
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { ENVIRONMENT } from '@/config/environment';
import { MAP_GRID } from '@/config/motor';
import { PALETTE, PHASE_COLORS, THEME } from '@/config/theme';
import type { MotorMaps } from '@/physics/sim';
import { createCanvasTexture, MONO_FONT, type CanvasTex } from '@/scene/canvasTexture';
import { makeMaterial } from '@/scene/materials';
import { disposeTree, type FrameContext, type SceneModule } from '@/scene/module';

const W = 768;
const H = 450;
const TAU = 2 * Math.PI;

function frame(ctx: CanvasRenderingContext2D, title: string): void {
  ctx.fillStyle = PALETTE.screenBg;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(120,140,180,0.16)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= 10; x++) {
    ctx.beginPath();
    ctx.moveTo(40 + (x * (W - 80)) / 10, 50);
    ctx.lineTo(40 + (x * (W - 80)) / 10, H - 30);
    ctx.stroke();
  }
  for (let y = 0; y <= 8; y++) {
    ctx.beginPath();
    ctx.moveTo(40, 50 + (y * (H - 80)) / 8);
    ctx.lineTo(W - 40, 50 + (y * (H - 80)) / 8);
    ctx.stroke();
  }
  ctx.fillStyle = THEME.textMuted;
  ctx.font = `500 22px ${MONO_FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText(title, 40, 34);
}

function drawScope(t: CanvasTex, c: FrameContext): void {
  const { ctx } = t;
  const s = c.snapshot;
  const a = c.angles;
  frame(ctx, 'SCOPE  i_a  i_b  i_c');
  const iMag = Math.hypot(s.id, s.iq);
  const scale = (H - 80) / 2 / 900;
  const y0 = 50 + (H - 80) / 2;
  const x0 = 40;
  const x1 = W - 40;
  // two electrical periods ending at the present angle; the cursor sits at the right edge
  for (let ph = 0; ph < 3; ph++) {
    ctx.strokeStyle = PHASE_COLORS[ph] ?? '#fff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i <= 200; i++) {
      const th = a.thetaCurrent - 2 * TAU * (1 - i / 200) - (ph * TAU) / 3;
      const y = y0 - iMag * Math.cos(th) * scale;
      const x = x0 + ((x1 - x0) * i) / 200;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = THEME.field;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x1 - 1, 50);
  ctx.lineTo(x1 - 1, H - 30);
  ctx.stroke();
  ctx.fillStyle = THEME.text;
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.round(iMag)} A pk`, W - 40, 34);
}

function drawMap(t: CanvasTex, c: FrameContext, maps: MotorMaps): void {
  const { ctx } = t;
  const s = c.snapshot;
  const mp = maps[s.motor];
  frame(ctx, `TORQUE–SPEED  ${s.motor === 'pm' ? 'MAGNET' : 'INDUCTION'}`);
  const xOf = (rpm: number): number => 40 + ((W - 80) * rpm) / 16000;
  const yOf = (tq: number): number => 50 + ((H - 80) * (420 - tq)) / 840;
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath();
  ctx.moveTo(40, yOf(0));
  ctx.lineTo(W - 40, yOf(0));
  ctx.stroke();
  for (const env of [mp.map.tMax, mp.map.tMin]) {
    ctx.strokeStyle = '#e8ecf5';
    ctx.lineWidth = 3;
    ctx.beginPath();
    env.forEach((tq, i) => {
      const x = xOf(i * MAP_GRID.rpmStep);
      if (i === 0) ctx.moveTo(x, yOf(tq));
      else ctx.lineTo(x, yOf(tq));
    });
    ctx.stroke();
  }
  ctx.fillStyle = s.pDc < 0 ? THEME.regen : THEME.power;
  ctx.beginPath();
  ctx.arc(xOf(s.rpm), yOf(s.tMotor), 9, 0, TAU);
  ctx.fill();
}

export function createScopeScreens(maps: MotorMaps): SceneModule<Group> {
  const group = new Group();
  group.name = 'scopeScreens';
  const S = ENVIRONMENT.screens;
  const bezelMat = makeMaterial(
    { color: '#1a1e27', roughness: 0.5, metalness: 0.5 },
    'environment',
  );
  const texes = [createCanvasTexture(W, H), createCanvasTexture(W, H)] as const;
  S.xs.forEach((x, i) => {
    const bezel = new Mesh(new BoxGeometry(S.width + 0.03, S.height + 0.03, 0.025), bezelMat);
    bezel.position.set(x, S.y, S.z);
    const face = new Mesh(
      new BoxGeometry(S.width, S.height, 0.002),
      new MeshBasicMaterial({ map: texes[i]?.texture, toneMapped: false }),
    );
    face.position.z = 0.0135;
    bezel.add(face);
    group.add(bezel);
  });
  // wall arms
  const arm = new Mesh(new BoxGeometry(0.02, 0.02, 0.05), bezelMat);
  arm.position.set(0, S.y, S.z - 0.03);
  group.add(arm);

  let timer = 1;
  return {
    object3d: group,
    update(ctx) {
      timer += ctx.dt;
      if (timer < 0.1) return;
      timer = 0;
      drawScope(texes[0], ctx);
      drawMap(texes[1], ctx, maps);
      texes[0].texture.needsUpdate = true;
      texes[1].texture.needsUpdate = true;
    },
    dispose() {
      disposeTree(group);
      texes.forEach((t) => t.texture.dispose());
    },
  };
}
