/**
 * Wheels on the rollers (TECH_SPEC §5.6): Ø700 mm tyre (lathe profile, 45-series sidewall) with
 * instanced tread blocks, and a generic 5-spoke rim (not any brand's design) with a hub and
 * lug nuts. A motion-blur disc fades in over the rim above the visual speed cap (§5.5).
 */
import {
  BoxGeometry,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Vector2,
} from 'three';
import { RIG } from '@/config/environment';
import { PALETTE } from '@/config/theme';
import { mergeStatic } from '@/scene/mergeStatic';
import { makeMaterial } from '@/scene/materials';
import { disposeTree, type FrameContext, type SceneModule } from '@/scene/module';

const R = RIG.wheelRadius;
const W = RIG.wheelWidth;
const RIM_R = 0.24; // 19" rim ≈ 0.241 m bead radius
const TREAD_BLOCKS = 64;

/** Tyre cross-section in (radius, axial) and revolved around the wheel axis (x after rotation). */
function tyreGeometry(): LatheGeometry {
  const pts: Vector2[] = [];
  const h = W / 2;
  const n = 14;
  // inner bead → sidewall → shoulder → crown → mirror
  const profile: [number, number][] = [
    [RIM_R, -h * 0.86],
    [RIM_R + 0.03, -h * 0.98],
    [R - 0.05, -h * 1.0],
  ];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * (Math.PI / 2);
    profile.push([R - 0.05 + 0.04 * Math.sin(a), -h + 0.05 * (1 - Math.cos(a)) + 0.0]);
  }
  const half = profile.slice();
  const mirrored = half
    .slice()
    .reverse()
    .map(([r, x]) => [r, -x] as [number, number]);
  for (const [r, x] of [...half, ...mirrored]) pts.push(new Vector2(r, x));
  const g = new LatheGeometry(pts, 96);
  // lathe revolves around y; turn it so the wheel axis is x
  g.rotateZ(Math.PI / 2);
  return g;
}

export interface Wheels extends SceneModule<Group> {
  setAngles(left: number, right: number): void;
}

export function createWheels(): Wheels {
  const group = new Group();
  group.name = 'wheels';
  const rubber = makeMaterial({ color: PALETTE.rubber, roughness: 0.88, metalness: 0 }, 'power');
  const rimMat = makeMaterial({ color: PALETTE.rim, metalness: 0.9, roughness: 0.28 }, 'power');
  const darkMat = makeMaterial({ color: '#2b3038', metalness: 0.7, roughness: 0.4 }, 'power');
  const tyreGeo = tyreGeometry();
  const treadGeo = new BoxGeometry(W * 0.26, 0.012, 0.022);
  const m = new Matrix4();
  const blurMat = new MeshBasicMaterial({
    color: '#7d8590',
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: DoubleSide,
  });
  const wheels: Group[] = [];

  for (const side of [-1, 1]) {
    const wheel = new Group();
    wheel.position.set(side * RIG.trackHalf, RIG.axleY, RIG.axleZ);
    const spin = new Group();
    const tyre = new Mesh(tyreGeo, rubber);
    tyre.castShadow = true;
    tyre.receiveShadow = true;
    spin.add(tyre);
    // tread: 3 rows of blocks, the middle row offset by half a pitch
    const tread = new InstancedMesh(treadGeo, rubber, TREAD_BLOCKS * 3);
    let k = 0;
    for (let row = -1; row <= 1; row++) {
      for (let i = 0; i < TREAD_BLOCKS; i++) {
        const phi = ((i + (row === 0 ? 0.5 : 0)) * 2 * Math.PI) / TREAD_BLOCKS;
        m.makeRotationX(phi).multiply(new Matrix4().makeTranslation(row * W * 0.3, R - 0.004, 0));
        tread.setMatrixAt(k++, m);
      }
    }
    tread.castShadow = true;
    spin.add(tread);

    // rim: barrel, face disc, 5 spokes, hub, lug nuts
    const barrel = new Mesh(new CylinderGeometry(RIM_R, RIM_R, W * 0.86, 64, 1, true), rimMat);
    barrel.rotation.z = Math.PI / 2;
    spin.add(barrel);
    const face = side * (W * 0.34);
    const lip = new Mesh(
      new CylinderGeometry(RIM_R + 0.012, RIM_R + 0.012, 0.018, 64, 1, true),
      rimMat,
    );
    lip.rotation.z = Math.PI / 2;
    lip.position.x = face;
    spin.add(lip);
    const hub = new Mesh(new CylinderGeometry(0.075, 0.08, 0.05, 32), rimMat);
    hub.rotation.z = Math.PI / 2;
    hub.position.x = face - side * 0.01;
    spin.add(hub);
    const cap = new Mesh(new CylinderGeometry(0.03, 0.03, 0.012, 24), darkMat);
    cap.rotation.z = Math.PI / 2;
    cap.position.x = face + side * 0.018;
    spin.add(cap);
    for (let s = 0; s < 5; s++) {
      const phi = (s * 2 * Math.PI) / 5;
      const spoke = new Mesh(new BoxGeometry(0.03, RIM_R - 0.07, 0.045), rimMat);
      spoke.geometry.translate(0, 0.07 + (RIM_R - 0.07) / 2, 0);
      spoke.rotation.x = phi;
      spoke.position.x = face - side * 0.012;
      spoke.castShadow = true;
      spin.add(spoke);
    }
    const nuts = new InstancedMesh(new CylinderGeometry(0.009, 0.009, 0.014, 6), darkMat, 5);
    for (let s = 0; s < 5; s++) {
      const phi = ((s + 0.5) * 2 * Math.PI) / 5;
      nuts.setMatrixAt(
        s,
        m
          .makeRotationZ(Math.PI / 2)
          .setPosition(face + side * 0.014, 0.05 * Math.cos(phi), 0.05 * Math.sin(phi)),
      );
    }
    spin.add(nuts);
    // brake disc behind the spokes (reads through the rim)
    const disc = new Mesh(
      new CylinderGeometry(0.17, 0.17, 0.026, 48),
      makeMaterial({ color: '#6c737c', metalness: 0.9, roughness: 0.45 }, 'power'),
    );
    disc.rotation.z = Math.PI / 2;
    disc.position.x = -side * 0.02;
    spin.add(disc);

    mergeStatic(spin);
    wheel.add(spin);
    const blur = new Mesh(new CircleGeometry(RIM_R, 48), blurMat);
    blur.rotation.y = (side * Math.PI) / 2;
    blur.position.x = face + side * 0.02;
    wheel.add(blur);
    wheels.push(spin);
    group.add(wheel);
  }

  return {
    object3d: group,
    setAngles(left, right) {
      const [l, r] = wheels;
      if (l) l.rotation.x = left;
      if (r) r.rotation.x = right;
    },
    update(ctx: FrameContext) {
      blurMat.opacity = 0.32 * ctx.spinBlur;
    },
    dispose: () => disposeTree(group),
  };
}
