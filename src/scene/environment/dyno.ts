/**
 * Chassis dynamometer (TECH_SPEC §4.1, §5.6), built in full-scale metres inside the 1:3 rig:
 * two knurled rollers under each wheel, a flywheel with a red index mark on the rear roller line
 * (it stands in for the car's inertia) and an LED km/h readout. The rollers only visualize the
 * road speed: roller angle = wheel angle · r_wheel / r_roller, opposite direction.
 */
import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  RepeatWrapping,
} from 'three';
import { RIG } from '@/config/environment';
import { PALETTE } from '@/config/theme';
import { VEHICLE } from '@/config/vehicle';
import { createCanvasTexture, MONO_FONT } from '@/scene/canvasTexture';
import { mergeStatic } from '@/scene/mergeStatic';
import { makeMaterial } from '@/scene/materials';
import { disposeTree, type FrameContext, type SceneModule } from '@/scene/module';

const ROLLER_RATIO = RIG.wheelRadius / RIG.rollerRadius;

/** Knurl pattern as a bump/roughness texture (diagonal cross-hatch). */
function knurlTexture() {
  const t = createCanvasTexture(128, 128, false);
  const { ctx } = t;
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = '#2a2a2a';
  ctx.lineWidth = 3;
  for (let k = -128; k < 256; k += 16) {
    ctx.beginPath();
    ctx.moveTo(k, 0);
    ctx.lineTo(k + 128, 128);
    ctx.moveTo(k + 128, 0);
    ctx.lineTo(k, 128);
    ctx.stroke();
  }
  t.texture.wrapS = RepeatWrapping;
  t.texture.wrapT = RepeatWrapping;
  t.texture.repeat.set(10, 3);
  t.texture.needsUpdate = true;
  return t;
}

export function createDyno(): SceneModule<Group> {
  const group = new Group();
  group.name = 'dyno';
  const frameMat = makeMaterial(
    { color: PALETTE.dynoFrame, roughness: 0.55, metalness: 0.6 },
    'environment',
  );
  const m = new Matrix4();

  // base frame: one long plate plus a cradle (two side cheeks) per wheel
  const base = new Mesh(new BoxGeometry(2.75, 0.04, 0.72), frameMat);
  base.position.set(0.12, 0.02, 0);
  base.receiveShadow = true;
  base.castShadow = true;
  group.add(base);
  const cheeks = new InstancedMesh(new BoxGeometry(0.03, 0.2, 0.6), frameMat, 4);
  let k = 0;
  for (const side of [-1, 1]) {
    for (const dx of [-1, 1]) {
      const x = side * RIG.trackHalf + dx * (RIG.rollerLength / 2 + 0.03);
      cheeks.setMatrixAt(k++, m.makeTranslation(x, 0.1, 0));
    }
  }
  cheeks.castShadow = true;
  group.add(cheeks);

  // rollers: instanced, the matrices are rewritten each frame with the roller angle
  const knurl = knurlTexture();
  const rollerGeo = new CylinderGeometry(
    RIG.rollerRadius,
    RIG.rollerRadius,
    RIG.rollerLength,
    48,
    1,
  );
  rollerGeo.rotateZ(Math.PI / 2);
  const rollers = new InstancedMesh(
    rollerGeo,
    makeMaterial(
      {
        color: PALETTE.roller,
        roughness: 0.38,
        metalness: 0.9,
        bumpMap: knurl.texture,
        bumpScale: 1.2,
      },
      'environment',
    ),
    4,
  );
  rollers.castShadow = true;
  rollers.receiveShadow = true;
  group.add(rollers);
  const rollerPos: [number, number][] = [];
  for (const side of [-1, 1])
    for (const dz of [-1, 1]) rollerPos.push([side * RIG.trackHalf, dz * RIG.rollerSpacing]);

  // shaft from the right rear roller to the flywheel, and the flywheel with its index mark
  const fw = new Group();
  fw.position.set(RIG.flywheel.x, RIG.rollerY, -RIG.rollerSpacing);
  const shaftLen = RIG.flywheel.x - (RIG.trackHalf + RIG.rollerLength / 2);
  const shaft = new Mesh(new CylinderGeometry(0.02, 0.02, shaftLen, 16), frameMat);
  shaft.rotation.z = Math.PI / 2;
  shaft.position.set(-shaftLen / 2, 0, 0);
  fw.add(shaft);
  const wheel = new Group();
  const disc = new Mesh(
    new CylinderGeometry(RIG.flywheel.radius, RIG.flywheel.radius, RIG.flywheel.width, 64),
    makeMaterial({ color: PALETTE.flywheel, roughness: 0.4, metalness: 0.85 }, 'environment'),
  );
  disc.rotation.z = Math.PI / 2;
  disc.castShadow = true;
  wheel.add(disc);
  const mark = new Mesh(
    new BoxGeometry(0.004, 0.05, 0.016),
    makeMaterial(
      { color: PALETTE.indexMark, emissive: PALETTE.indexMark, emissiveIntensity: 0.6 },
      'environment',
    ),
  );
  mark.position.set(RIG.flywheel.width / 2 + 0.002, RIG.flywheel.radius - 0.035, 0);
  wheel.add(mark);
  fw.add(wheel);
  group.add(fw);
  // pedestal bearing under the flywheel
  const ped = new Mesh(new BoxGeometry(0.05, RIG.rollerY - 0.02, 0.12), frameMat);
  ped.position.set(
    RIG.flywheel.x - RIG.flywheel.width / 2 - 0.05,
    (RIG.rollerY - 0.02) / 2 + 0.02,
    -RIG.rollerSpacing,
  );
  group.add(ped);

  // LED km/h readout on the right cradle, facing the camera
  const led = createCanvasTexture(256, 96);
  const ledMat = new MeshBasicMaterial({ map: led.texture, toneMapped: false });
  const ledBox = new Mesh(new BoxGeometry(0.26, 0.1, 0.05), frameMat);
  ledBox.position.set(RIG.trackHalf, 0.1, 0.33);
  const ledFace = new Mesh(new BoxGeometry(0.22, 0.075, 0.002), ledMat);
  ledFace.position.set(0, 0, 0.026);
  ledBox.add(ledFace);
  group.add(ledBox);

  let shown = -1;
  let ledTimer = 0;
  function drawLed(kmh: number): void {
    const { ctx } = led;
    ctx.fillStyle = PALETTE.ledBg;
    ctx.fillRect(0, 0, 256, 96);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffb547';
    ctx.font = `600 64px ${MONO_FONT}`;
    ctx.fillText(Math.round(kmh).toString().padStart(3, ' '), 178, 52);
    ctx.font = `500 22px ${MONO_FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText('km/h', 186, 66);
    led.texture.needsUpdate = true;
  }
  drawLed(0);

  mergeStatic(group, [wheel]);
  const dummy = new Object3D();
  return {
    object3d: group,
    update(ctx: FrameContext) {
      const wheelAngle = ctx.mechAngle / VEHICLE.gearRatio;
      // the rollers turn against the wheel
      const rollerAngle = -wheelAngle * ROLLER_RATIO;
      rollerPos.forEach(([x, z], i) => {
        dummy.position.set(x, RIG.rollerY, z);
        dummy.rotation.set(rollerAngle, 0, 0);
        dummy.updateMatrix();
        rollers.setMatrixAt(i, dummy.matrix);
      });
      rollers.instanceMatrix.needsUpdate = true;
      wheel.rotation.x = rollerAngle;
      ledTimer += ctx.dt;
      const kmh = Math.round(ctx.snapshot.kmh);
      if (ledTimer >= 0.1 && kmh !== shown) {
        ledTimer = 0;
        shown = kmh;
        drawLed(kmh);
      }
    },
    dispose() {
      disposeTree(group);
      knurl.texture.dispose();
      led.texture.dispose();
    },
  };
}
