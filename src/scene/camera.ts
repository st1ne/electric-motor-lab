/**
 * Camera and orbit controls (TECH_SPEC §4.5): fov 35; OrbitControls with
 * damping 0.08, polar 15°–85°, distance limits fitted to the bench, target clamped to a box.
 */
import { PerspectiveCamera, Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ENVIRONMENT } from '@/config/environment';

const DEG = Math.PI / 180;
const C = ENVIRONMENT.camera;

export function createCamera(aspect: number): PerspectiveCamera {
  const camera = new PerspectiveCamera(C.fov, aspect, C.near, C.far);
  camera.position.set(...C.position);
  camera.lookAt(new Vector3(...C.target));
  return camera;
}

export function createControls(camera: PerspectiveCamera, dom: HTMLElement): OrbitControls {
  const controls = new OrbitControls(camera, dom);
  controls.target.set(...C.target);
  controls.enableDamping = true;
  controls.dampingFactor = C.damping;
  controls.minPolarAngle = C.minPolarDeg * DEG;
  controls.maxPolarAngle = C.maxPolarDeg * DEG;
  controls.minDistance = C.minDistance;
  controls.maxDistance = C.maxDistance;
  controls.zoomSpeed = 0.8;
  controls.rotateSpeed = 0.6;
  controls.panSpeed = 0.7;
  const lo = new Vector3(...C.panMin);
  const hi = new Vector3(...C.panMax);
  const before = new Vector3();
  controls.addEventListener('change', () => {
    // Clamp panning: move camera and target together so the view doesn't jump.
    before.copy(controls.target);
    controls.target.clamp(lo, hi);
    camera.position.add(before.sub(controls.target).negate());
  });
  controls.update();
  return controls;
}
