/**
 * Entry point (TECH_SPEC §13.3, §13.4): input → uiState → sim.step(dtReal) → kinematics
 * (frameDt / S) → scene.update → composer. Phases 0–4: physics, scene shell, motor, inverter and
 * drivetrain; the UI of Phase 5 is replaced by temporary dev hotkeys (see README).
 */
import './ui/styles.css';
import { Color, FogExp2, Scene } from 'three';
import type { MapsFile } from '@/physics/maps';
import mapsJson from '@/physics/maps.generated.json';
import { THEME } from '@/config/theme';
import { createKinematics, SLOW_MO_STEPS } from '@/physics/kinematics';
import { createMapLookup } from '@/physics/maps';
import { createSim } from '@/physics/sim';
import type { Preset, SimInputs } from '@/physics/types';
import { createCamera, createControls } from '@/scene/camera';
import { createCameraRig, type CameraPreset } from '@/scene/cameraRig';
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
import { defaultUiState, type ViewMode } from '@/state/uiState';
import { createDevOverlay } from '@/ui/devOverlay';
import { approach, smoothstep } from '@/util/math';
import { createRafLoop } from '@/util/rafLoop';

/** Visual speed cap in Real slow-mo (§5.5): 2.5 rev/s. */
const VISUAL_CAP_RAD = 2.5 * 2 * Math.PI;

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui-root') as HTMLElement;

const mapsFile = mapsJson as unknown as MapsFile;
const maps = { pm: createMapLookup(mapsFile.motors.pm), im: createMapLookup(mapsFile.motors.im) };
const ui = defaultUiState();
const sim = createSim(maps);
sim.setSpeedKmh(60);
sim.setPreset('cruise');
const kin = createKinematics();

const renderer = createRenderer(canvas);
renderer.info.autoReset = false;
const scene = new Scene();
scene.background = new Color(THEME.bg);
scene.fog = new FogExp2(THEME.bg, 0.12);

const camera = createCamera(window.innerWidth / window.innerHeight);
const controls = createControls(camera, canvas);
const rig = createCameraRig(camera, controls);
const post = createPost(renderer, scene, camera);
const lights = createLights(renderer, scene);
scene.add(lights.object3d);

const driveRig = createRig(ui.motor);
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
let cutOpen = ui.view === 'whole' ? 0 : 1;
setCut(AXIS_Y, AXIS_Z, cutOpen);

const inputs: SimInputs = { motor: ui.motor, throttle: 0, brake: 0 };
const dev = import.meta.env.DEV ? createDevOverlay(uiRoot) : null;

// ---- temporary dev hotkeys until the Phase 5 UI (§3.9 bindings where they exist) ----
const PRESET_KEYS: Record<string, Preset> = {
  q: 'launch',
  w: 'cruise',
  e: 'top',
  r: 'regen',
  t: 'coast',
};
const VIEWS: ViewMode[] = ['whole', 'cutaway', 'exploded'];
const CAMS: CameraPreset[] = ['default', 'stator', 'rotor', 'inverter', 'wheels', 'wide'];
let camIdx = 0;
window.addEventListener('keydown', (e) => {
  if (e.repeat && e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
  const k = e.key.toLowerCase();
  const preset = PRESET_KEYS[k];
  if (preset) {
    ui.preset = preset;
    sim.setPreset(preset);
  } else if (k === 'arrowup' || k === 'arrowdown') {
    ui.throttle = Math.min(Math.max(ui.throttle + (k === 'arrowup' ? 0.05 : -0.05), 0), 1);
    ui.preset = 'none';
    sim.setPreset('none');
    e.preventDefault();
  } else if (k === 's') {
    ui.brake = 1;
  } else if (k === 'm') {
    ui.motor = ui.motor === 'pm' ? 'im' : 'pm';
  } else if (k === 'v') {
    ui.view = VIEWS[(VIEWS.indexOf(ui.view) + 1) % VIEWS.length] ?? 'cutaway';
  } else if (k === ',' || k === '.') {
    const i = SLOW_MO_STEPS.indexOf(ui.slowMo);
    const next = i + (k === ',' ? 1 : -1);
    ui.slowMo = SLOW_MO_STEPS[Math.min(Math.max(next, 0), SLOW_MO_STEPS.length - 1)] ?? 'auto';
  } else if (k === ' ') {
    ui.frozen = !ui.frozen;
    e.preventDefault();
  } else if (k === 'o') {
    ui.onlyPhaseA = !ui.onlyPhaseA;
  } else if (k === 'b') {
    ui.debugHousing = !ui.debugHousing; // "bare" motor: housing hidden (Phase 3 debug view)
  } else if (k === 'c') {
    camIdx = (camIdx + 1) % CAMS.length;
    rig.flyTo(CAMS[camIdx] ?? 'default');
  } else if (k === '1' || k === '2' || k === '3' || k === '4') {
    ui.follow = (['all', 'field', 'power', 'heat'] as const)[Number(k) - 1] ?? 'all';
  }
});
window.addEventListener('keyup', (e) => {
  if (e.key.toLowerCase() === 's') ui.brake = 0;
});
sim.onPresetEnded(() => (ui.preset = 'none'));
sim.onLaunchTime((s) => console.info(`0–100 km/h in ${s.toFixed(1)} s`));

if (import.meta.env.DEV) {
  Object.assign(window, {
    __lab: { sim, kin, scene, camera, controls, renderer, rig, ui, driveRig, maps },
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

let mechAngle = 0;
const ctx = { ui, dt: 0, realTime: false, mechAngle: 0, spinBlur: 0 } as FrameContext;

const loop = createRafLoop((dt) => {
  inputs.motor = ui.motor;
  inputs.throttle = ui.throttle;
  inputs.brake = ui.brake;
  sim.step(dt, inputs);
  const snapshot = sim.snapshot();
  const angles = kin.advance(dt, snapshot, ui.slowMo, ui.frozen);

  // visual rotor angle: the true display-time angle in slow motion, capped in Real mode
  const realTime = ui.slowMo === 1;
  if (realTime) {
    const w = snapshot.omegaM;
    if (!ui.frozen) mechAngle += Math.sign(w) * Math.min(Math.abs(w), VISUAL_CAP_RAD) * dt;
  } else {
    mechAngle = angles.thetaMech;
  }
  ctx.snapshot = snapshot;
  ctx.angles = angles;
  ctx.dt = dt;
  ctx.realTime = realTime;
  ctx.mechAngle = mechAngle;
  ctx.spinBlur = realTime
    ? smoothstep(VISUAL_CAP_RAD, 4 * VISUAL_CAP_RAD, Math.abs(snapshot.omegaM))
    : 0;

  const cutTarget = ui.view === 'whole' ? 0 : 1;
  cutOpen += (cutTarget - cutOpen) * approach(dt, 0.25);
  setCut(AXIS_Y, AXIS_Z, cutOpen < 0.002 ? 0 : cutOpen);

  rig.update(dt);
  for (const m of modules) m.update(ctx);
  renderer.info.reset();
  post.render(dt);
  dev?.frame(dt, renderer, snapshot, angles, kin.slowMoLabel);
});
loop.start();
