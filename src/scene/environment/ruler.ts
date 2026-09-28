/**
 * Engraved ruler along the bench front edge in real centimetres of the model (TECH_SPEC §4.1).
 * 0 cm is the drive-unit centre line; the wheels sit at ±26 cm.
 */
import { Group, Mesh, PlaneGeometry } from 'three';
import { ENVIRONMENT } from '@/config/environment';
import { createCanvasTexture, MONO_FONT } from '@/scene/canvasTexture';
import { makeMaterial } from '@/scene/materials';
import { disposeTree, type SceneModule } from '@/scene/module';

const WIDTH = 0.026;

export function createRuler(): SceneModule<Group> {
  const group = new Group();
  group.name = 'ruler';
  const { fromCm, toCm, z } = ENVIRONMENT.ruler;
  const x0 = fromCm / 100;
  const x1 = toCm / 100;
  const length = x1 - x0;

  const W = 4096;
  const H = Math.round((W * WIDTH) / length);
  const tex = createCanvasTexture(W, H);
  const { ctx } = tex;
  const px = (cm: number): number => ((cm - fromCm) / (toCm - fromCm)) * W;
  ctx.fillStyle = '#1d222c';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#aeb6c4';
  ctx.fillStyle = '#c9d0dc';
  ctx.textBaseline = 'bottom';
  ctx.font = `500 ${Math.round(H * 0.36)}px ${MONO_FONT}`;
  for (let cm: number = fromCm; cm <= toCm; cm++) {
    const major = cm % 10 === 0;
    const mid = cm % 5 === 0;
    const x = Math.round(px(cm)) + 0.5;
    ctx.lineWidth = major ? 3 : 1.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H * (major ? 0.45 : mid ? 0.32 : 0.2));
    ctx.stroke();
    if (major && cm > fromCm && cm < toCm) {
      ctx.textAlign = 'center';
      ctx.fillText(cm === 0 ? '0 cm' : `${cm}`, x, H - 2);
    }
  }
  tex.texture.needsUpdate = true;

  const geo = new PlaneGeometry(length, WIDTH);
  geo.rotateX(-Math.PI / 2);
  const mesh = new Mesh(
    geo,
    makeMaterial({ map: tex.texture, roughness: 0.4, metalness: 0.6 }, 'environment'),
  );
  mesh.position.set((x0 + x1) / 2, ENVIRONMENT.bench.topY + 0.001, z);
  mesh.receiveShadow = true;
  group.add(mesh);

  return {
    object3d: group,
    update() {},
    dispose() {
      disposeTree(group);
      tex.texture.dispose();
    },
  };
}
