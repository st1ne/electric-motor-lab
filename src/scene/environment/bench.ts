/**
 * Steel workbench with legs and the brass plate (TECH_SPEC §4.1):
 * "{BRAND domain} / electric-motor · 200 kW class · 1:3".
 */
import { BoxGeometry, Group, InstancedMesh, Matrix4, Mesh } from 'three';
import { BRAND } from '@/config/brand';
import { ENVIRONMENT } from '@/config/environment';
import { PALETTE } from '@/config/theme';
import { createCanvasTexture, MONO_FONT, UI_FONT } from '@/scene/canvasTexture';
import { makeMaterial } from '@/scene/materials';
import { disposeTree, type SceneModule } from '@/scene/module';

const B = ENVIRONMENT.bench;

export function createBench(): SceneModule<Group> {
  const group = new Group();
  group.name = 'bench';
  const length = B.xMax - B.xMin;
  const cx = (B.xMin + B.xMax) / 2;

  const top = new Mesh(
    new BoxGeometry(length, B.thickness, B.depth),
    makeMaterial({ color: PALETTE.benchTop, roughness: 0.62, metalness: 0.35 }, 'environment'),
  );
  top.position.set(cx, B.topY - B.thickness / 2, 0);
  top.receiveShadow = true;
  group.add(top);

  const m = new Matrix4();
  const trims = new InstancedMesh(
    new BoxGeometry(length + 0.016, B.thickness + 0.01, 0.01),
    makeMaterial({ color: PALETTE.benchEdge, roughness: 0.35, metalness: 0.8 }, 'environment'),
    2,
  );
  trims.setMatrixAt(0, m.makeTranslation(cx, B.topY - B.thickness / 2, B.depth / 2 + 0.005));
  trims.setMatrixAt(1, m.makeTranslation(cx, B.topY - B.thickness / 2, -B.depth / 2 - 0.005));
  group.add(trims);

  const legs = new InstancedMesh(
    new BoxGeometry(0.055, B.legHeight, 0.055),
    makeMaterial({ color: PALETTE.benchLeg, roughness: 0.6, metalness: 0.5 }, 'environment'),
    4,
  );
  const legY = B.topY - B.thickness - B.legHeight / 2;
  let k = 0;
  for (const x of [B.xMin + 0.08, B.xMax - 0.08]) {
    for (const z of [-B.depth / 2 + 0.07, B.depth / 2 - 0.07])
      legs.setMatrixAt(k++, m.makeTranslation(x, legY, z));
  }
  legs.castShadow = true;
  group.add(legs);

  const plate = createCanvasTexture(1024, 256);
  const { ctx } = plate;
  ctx.fillStyle = '#6e5424';
  ctx.fillRect(0, 0, 1024, 256);
  ctx.strokeStyle = '#e8cf8d';
  ctx.lineWidth = 8;
  ctx.strokeRect(14, 14, 996, 228);
  ctx.fillStyle = '#f3dea0';
  ctx.textAlign = 'center';
  ctx.font = `600 54px ${UI_FONT}`;
  ctx.fillText(`${BRAND.handle} / electric-motor`, 512, 112);
  ctx.font = `500 40px ${MONO_FONT}`;
  ctx.fillText('200 kW class · 1:3', 512, 184);
  plate.texture.needsUpdate = true;
  const plateMesh = new Mesh(
    new BoxGeometry(0.14, 0.004, 0.035),
    makeMaterial(
      { color: PALETTE.brass, map: plate.texture, roughness: 0.35, metalness: 0.85 },
      'environment',
    ),
  );
  plateMesh.position.set(0.56, B.topY + 0.002, 0.3);
  plateMesh.rotation.y = -0.1;
  plateMesh.castShadow = true;
  group.add(plateMesh);

  return {
    object3d: group,
    update() {},
    dispose() {
      disposeTree(group);
      plate.texture.dispose();
    },
  };
}
