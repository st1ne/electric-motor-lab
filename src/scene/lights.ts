/**
 * Lighting (TECH_SPEC §4.2):
 *   key  warm directional #ffd9a8 × 2.0 from front-left, PCFSoft 2048², fitted to the bench
 *   fill cool hemisphere #6f8cff / #15110d × 0.35
 *   rim  violet spot #b794ff × 1.2 behind the motor
 *   environment: RoomEnvironment through PMREM, intensity 0.3
 */
import {
  DirectionalLight,
  Group,
  HemisphereLight,
  PMREMGenerator,
  SpotLight,
  type Scene,
  type WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { PALETTE } from '@/config/theme';
import type { SceneModule } from '@/scene/module';

export interface Lights extends SceneModule<Group> {
  readonly key: DirectionalLight;
}

export function createLights(renderer: WebGLRenderer, scene: Scene): Lights {
  const group = new Group();
  group.name = 'lights';

  const key = new DirectionalLight(PALETTE.keyLight, 2.0);
  key.position.set(-1.1, 1.6, 1.2);
  key.target.position.set(0, 0.1, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.0015;
  const sc = key.shadow.camera;
  sc.left = -0.95;
  sc.right = 0.95;
  sc.top = 0.8;
  sc.bottom = -0.6;
  sc.near = 0.4;
  sc.far = 4.5;
  group.add(key, key.target);

  group.add(new HemisphereLight(PALETTE.fillSky, PALETTE.fillGround, 0.35));

  const rim = new SpotLight(PALETTE.rimLight, 1.2, 4, Math.PI / 6, 0.6, 1.2);
  rim.position.set(0.3, 0.75, -0.9);
  rim.target.position.set(-0.05, 0.2, 0.05);
  group.add(rim, rim.target);

  const pmrem = new PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.3;
  pmrem.dispose();

  return {
    object3d: group,
    key,
    update() {},
    dispose() {
      envRT.dispose();
      key.shadow.map?.dispose();
    },
  };
}
