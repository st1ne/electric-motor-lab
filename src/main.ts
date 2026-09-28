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
import { createLabelDefs } from '@/scene/labelDefs';
import { createLabels } from '@/scene/labels';
import { createLights } from '@/scene/lights';
import type { FrameContext, SceneModule } from '@/scene/module';
import { createPost } from '@/scene/post';
import { createRenderer, MAX_DPR } from '@/scene/renderer';
import { createFieldFx } from '@/scene/fx/fieldFx';
import { createHeat } from '@/scene/fx/heat';
import { createOilJets } from '@/scene/fx/oilJets';
import { createPowerFlow } from '@/scene/fx/powerFlow';
import { createFollow } from '@/scene/follow';
import { createRig } from '@/scene/rig';
import { createViews } from '@/scene/views';
import { createActions } from '@/state/actions';
import { createStore } from '@/state/store';
import { defaultUiState } from '@/state/uiState';
import { installUrlSync, readUrlState } from '@/state/urlState';
import { createTour } from '@/tour/tour';
import { createChartCard } from '@/ui/chartCard';
import { createDevOverlay } from '@/ui/devOverlay';
import { installHotkeys } from '@/ui/hotkeys';
import { createLayout } from '@/ui/layout';
import { setShareUrlProvider } from '@/ui/share';
import { smoothstep } from '@/util/math';
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
const fromUrl = readUrlState(window.location.search);
const store = createStore({ ...defaultUiState(), ...fromUrl });
const sim = createSim(maps);
sim.setSpeedKmh(START_KMH);
const startPreset = store.get().preset;
sim.setPreset(startPreset, startPreset === 'cruise' ? START_KMH : undefined);
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
  driveRig,
];
modules.forEach((m) => scene.add(m.object3d));

const views = createViews(driveRig);
scene.add(views.object3d);
const fieldFx = createFieldFx(driveRig, camera);
const powerFlow = createPowerFlow();
driveRig.object3d.add(powerFlow.object3d);
const oilJets = createOilJets();
driveRig.motor.object3d.add(oilJets.object3d);
// heat runs after the rig: it blends over the emissive the windings and rotors just set
const heat = createHeat(driveRig.motor.windings.materials, driveRig.motor.rotorHeatMaterials);
modules.push(fieldFx, powerFlow, oilJets, heat, createFollow());

// ---- UI ----
const actions = createActions(store, sim, cameraRig);
const layout = createLayout(uiRoot, store, actions);
const chartCard = createChartCard(store, maps);
layout.column.append(chartCard.el);
const screens = createScopeScreens(chartCard.views);
scene.add(screens.object3d);
modules.push(screens);
const labelDefs = createLabelDefs(driveRig);
const labels = createLabels(uiRoot, camera, labelDefs.specs, labelDefs.proxies);
const devKeys: Record<string, () => void> = import.meta.env.DEV
  ? { b: () => store.set({ debugHousing: !store.get().debugHousing }) }
  : {};
installHotkeys(store, actions, layout.panel.brake, devKeys);
const urlSync = installUrlSync(store);
setShareUrlProvider(urlSync.flush);
cameraRig.onUserInput(() => store.set({ cam: null }));
const startCam = store.get().cam;
if (startCam) cameraRig.flyTo(startCam, 0);
const tour = createTour({
  store,
  sim,
  actions,
  onCameraInput: (cb) => cameraRig.onUserInput(cb),
  host: uiRoot,
});
actions.bindTour(tour.toggle);
sim.onPresetEnded(() => store.set({ preset: 'none' }));
let derated = false;
sim.onLaunchTime((t) => layout.toast.show(`0–100 km/h in <strong>${fmt(t, 1)} s</strong>`));
const dev = import.meta.env.DEV ? createDevOverlay(uiRoot) : null;
declare global {
  interface Window {
    __lab?: unknown;
  }
}
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
      labels,
      chartCard,
      tour,
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
  chartCard.resize(Math.min(window.devicePixelRatio || 1, 2));
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// ---- frame loop (§13.4) ----
const inputs: SimInputs = { motor: 'pm', throttle: 0, brake: 0 };
let mechAngle = 0;
let firstFrame = true;
const ctx = { dt: 0, realTime: false, mechAngle: 0, spinBlur: 0 } as FrameContext;

function frame(dt: number): void {
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

  tour.update(dt);
  views.update(ctx);
  cameraRig.update(dt);
  for (const m of modules) m.update(ctx);
  labels.update(ctx);
  renderer.info.reset();
  post.render(dt);
  layout.update(dt, snapshot, kin.slowMoLabel, angles.lapsGained);
  chartCard.update(snapshot, angles, ui, dt, performance.now() / 1000);
  if (snapshot.derate < 1 !== derated) {
    derated = snapshot.derate < 1;
    if (derated)
      layout.toast.show(
        `Windings at <strong>${fmt(snapshot.tWinding, 0)} °C</strong>: torque derated`,
      );
  }
  dev?.frame(dt, renderer, snapshot, angles, kin.slowMoLabel);
  if (firstFrame) {
    firstFrame = false;
    layout.loader.done();
  }
}

const loop = createRafLoop(frame);
loop.start();
if (import.meta.env.DEV) {
  // step frames by hand (the loop pauses while the page is hidden)
  Object.assign(window.__lab as object, {
    tick: (dt = 1 / 60, n = 1) => {
      for (let i = 0; i < n; i++) frame(dt);
    },
  });
}
