/**
 * Entry point (TECH_SPEC §13.3, §13.4):
 *   input (UI / hotkeys / chips) → actions → store ─┐
 *                                                   ├→ sim.step(dtReal) → SimSnapshot
 *   driver presets ─────────────────────────────────┘        │
 *        kinematics.advance(frameDt / S) → DisplayAngles ◄───┤
 *        scene.update(ctx)  ·  UI (text 10 Hz, cards tweened)  ·  wall screens 10 Hz
 * Slow motion and Freeze only touch the display clock; the car always runs in real time.
 */
import './ui/styles.css';
import './ui/ui.css';
import { Color, FogExp2, Scene } from 'three';
import { THEME } from '@/config/theme';
import { fmt } from '@/physics/format';
import { createKinematics } from '@/physics/kinematics';
import { createMapLookup, type MapsFile } from '@/physics/maps';
import mapsJson from '@/physics/maps.generated.json';
import { createSim } from '@/physics/sim';
import type { SimInputs } from '@/physics/types';
import { createCamera, createControls } from '@/scene/camera';
import { createCameraRig } from '@/scene/cameraRig';
import { createBench } from '@/scene/environment/bench';
import { createProps } from '@/scene/environment/props';
import { createRoom } from '@/scene/environment/room';
import { createRuler } from '@/scene/environment/ruler';
import { createScopeScreens } from '@/scene/environment/scopeScreens';
import { createLights } from '@/scene/lights';
import { setCut } from '@/scene/materials';
import type { FrameContext, SceneModule } from '@/scene/module';
import { MOTOR_POS } from '@/scene/motor/motor';
import { createPost } from '@/scene/post';
import { createRenderer, MAX_DPR } from '@/scene/renderer';
import { createRig } from '@/scene/rig';
import { toModel } from '@/scene/units';
import { createActions } from '@/state/actions';
import { createStore } from '@/state/store';
import { defaultUiState } from '@/state/uiState';
import { createDevOverlay } from '@/ui/devOverlay';
import { installHotkeys } from '@/ui/hotkeys';
import { createLayout } from '@/ui/layout';
import { approach, smoothstep } from '@/util/math';
import { createRafLoop } from '@/util/rafLoop';

/** Visual speed cap in Real slow-mo (§5.5): 2.5 rev/s. */
const VISUAL_CAP_RAD = 2.5 * 2 * Math.PI;
/** Default state (§2): Cruise at 60 km/h, Magnet, Cutaway, slow-mo Auto. */
const START_KMH = 60;

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui-root') as HTMLElement;

// ---- physics ----
const mapsFile = mapsJson as unknown as MapsFile;
const maps = { pm: createMapLookup(mapsFile.motors.pm), im: createMapLookup(mapsFile.motors.im) };
const store = createStore(defaultUiState());
const sim = createSim(maps);
sim.setSpeedKmh(START_KMH);
sim.setPreset('cruise', START_KMH);
const kin = createKinematics();

// ---- scene ----
const renderer = createRenderer(canvas);
renderer.info.autoReset = false;
const scene = new Scene();
scene.background = new Color(THEME.bg);
scene.fog = new FogExp2(THEME.bg, 0.12);
const camera = createCamera(window.innerWidth / window.innerHeight);
const controls = createControls(camera, canvas);
const cameraRig = createCameraRig(camera, controls);
const post = createPost(renderer, scene, camera);
const lights = createLights(renderer, scene);
scene.add(lights.object3d);
const driveRig = createRig(store.get().motor);
const modules: SceneModule[] = [
  createRoom(),
  createBench(),
  createRuler(),
  createProps(),
  createScopeScreens(maps),
  driveRig,
];
modules.forEach((m) => scene.add(m.object3d));

// quarter cutaway through the motor axis (world units)
const AXIS_Y = toModel(MOTOR_POS[1]);
const AXIS_Z = toModel(MOTOR_POS[2]);
let cutOpen = store.get().view === 'whole' ? 0 : 1;
setCut(AXIS_Y, AXIS_Z, cutOpen);

// ---- UI ----
const actions = createActions(store, sim, cameraRig);
const layout = createLayout(uiRoot, store, actions);
const devKeys: Record<string, () => void> = import.meta.env.DEV
  ? { b: () => store.set({ debugHousing: !store.get().debugHousing }) }
  : {};
installHotkeys(store, actions, layout.panel.brake, devKeys);
sim.onPresetEnded(() => store.set({ preset: 'none' }));
sim.onLaunchTime((t) => layout.toast.show(`0–100 km/h in <strong>${fmt(t, 1)} s</strong>`));
const dev = import.meta.env.DEV ? createDevOverlay(uiRoot) : null;
if (import.meta.env.DEV) {
  Object.assign(window, {
    __lab: {
      sim,
      kin,
      scene,
      camera,
      controls,
      renderer,
      rig: cameraRig,
      store,
      actions,
      driveRig,
      maps,
    },
  });
}

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  post.resize(w, h, dpr);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// ---- frame loop (§13.4) ----
const inputs: SimInputs = { motor: 'pm', throttle: 0, brake: 0 };
let mechAngle = 0;
let firstFrame = true;
const ctx = { dt: 0, realTime: false, mechAngle: 0, spinBlur: 0 } as FrameContext;

const loop = createRafLoop((dt) => {
  const ui = store.get();
  inputs.motor = ui.motor;
  inputs.throttle = ui.throttle;
  inputs.brake = ui.brake;
  sim.step(dt, inputs);
  const snapshot = sim.snapshot();
  const angles = kin.advance(dt, snapshot, ui.slowMo, ui.frozen);

  // visual rotor angle: the display-time angle in slow motion, capped in Real mode (§5.5)
  const realTime = ui.slowMo === 1;
  if (realTime) {
    const w = snapshot.omegaM;
    if (!ui.frozen) mechAngle += Math.sign(w) * Math.min(Math.abs(w), VISUAL_CAP_RAD) * dt;
  } else {
    mechAngle = angles.thetaMech;
  }
  ctx.snapshot = snapshot;
  ctx.angles = angles;
  ctx.ui = ui;
  ctx.dt = dt;
  ctx.realTime = realTime;
  ctx.mechAngle = mechAngle;
  ctx.spinBlur = realTime
    ? smoothstep(VISUAL_CAP_RAD, 4 * VISUAL_CAP_RAD, Math.abs(snapshot.omegaM))
    : 0;

  const cutTarget = ui.view === 'whole' ? 0 : 1;
  cutOpen += (cutTarget - cutOpen) * approach(dt, 0.25);
  setCut(AXIS_Y, AXIS_Z, cutOpen < 0.002 ? 0 : cutOpen);

  cameraRig.update(dt);
  for (const m of modules) m.update(ctx);
  renderer.info.reset();
  post.render(dt);
  layout.update(dt, snapshot, kin.slowMoLabel);
  dev?.frame(dt, renderer, snapshot, angles, kin.slowMoLabel);
  if (firstFrame) {
    firstFrame = false;
    layout.loader.done();
  }
});
loop.start();
