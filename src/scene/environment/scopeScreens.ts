/**
 * Two wall-mounted screens as CanvasTextures, redrawn at 10 Hz (TECH_SPEC §4.1, §3.6).
 * They mirror the chart card: left the scope, right the torque–speed map, drawn by the same
 * chart views with the screen theme (texture resolution, opaque background).
 */
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { ENVIRONMENT } from '@/config/environment';
import { createCanvasTexture } from '@/scene/canvasTexture';
import { makeMaterial } from '@/scene/materials';
import { disposeTree, type SceneModule } from '@/scene/module';
import { createChartCanvas, SCREEN_THEME } from '@/ui/charts/chartBase';
import type { ChartView } from '@/ui/charts/types';

const W = 768;
const H = 450;

/** The two views the screens mirror (the chart card's instances, so trails match). */
export interface ScreenViews {
  scope: ChartView;
  map: ChartView;
}

export function createScopeScreens(views: ScreenViews): SceneModule<Group> {
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

  const charts = texes.map((t) => {
    const c = createChartCanvas(t.canvas, SCREEN_THEME);
    c.resize(W, H, 1);
    return c;
  });
  let timer = 1;
  return {
    object3d: group,
    update(ctx) {
      timer += ctx.dt;
      if (timer < 0.1) return;
      timer = 0;
      const input = {
        s: ctx.snapshot,
        angles: ctx.angles,
        ui: ctx.ui,
        nowS: performance.now() / 1000,
      };
      [views.scope, views.map].forEach((v, i) => {
        const c = charts[i];
        if (c) v.draw(c, input);
      });
      texes[0].texture.needsUpdate = true;
      texes[1].texture.needsUpdate = true;
    },
    dispose() {
      disposeTree(group);
      texes.forEach((t) => t.texture.dispose());
    },
  };
}
