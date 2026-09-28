/**
 * Field arrow, rotor d-axis arrow and load-angle arc (TECH_SPEC §9 Field, §10.1).
 * Flat shapes in the machine cross-section (motor-local YZ plane, axis x), built so that
 * `rotation.x = φ` points them at mechanical angle φ (profile.ts convention).
 *   Field arrow: violet, from the centre towards a north pole at θ_field / p, length ∝ |B̂|.
 *   Rotor arrow: white, along the rotor d-axis (magnet north pole / cage marker).
 *   Load-angle arc: violet arc from the rotor arrow to the field arrow.
 * `xray` draws them on top of the machine (depthTest off) so they read through the rotor.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  Shape,
  ShapeGeometry,
} from 'three';
import { THEME } from '@/config/theme';
import { SHAPE_TO_AXIAL } from '@/scene/motor/profile';

export interface FxOptions {
  /** draw over everything (inside the motor) */
  xray: boolean;
  /** additive glow (hologram) */
  additive?: boolean;
  renderOrder?: number;
}

/** Arrow along the shape +x axis (→ mechanical φ = 0), unit length, base at the origin. */
function arrowShape(width: number, headLen: number, headWidth: number): Shape {
  const s = new Shape();
  const w = width / 2;
  const hw = headWidth / 2;
  s.moveTo(0, -w);
  s.lineTo(1 - headLen, -w);
  s.lineTo(1 - headLen, -hw);
  s.lineTo(1, 0);
  s.lineTo(1 - headLen, hw);
  s.lineTo(1 - headLen, w);
  s.lineTo(0, w);
  s.closePath();
  return s;
}

export function fxMaterial(color: string, opts: FxOptions, opacity = 1): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color: new Color(color),
    transparent: true,
    opacity,
    depthTest: !opts.xray,
    depthWrite: false,
    toneMapped: false,
    side: DoubleSide,
    blending: opts.additive ? AdditiveBlending : undefined,
  });
}

export interface ArrowFx {
  readonly object3d: Group;
  readonly material: MeshBasicMaterial;
  /** point at mechanical angle φ with the given length (m) */
  set(phi: number, length: number): void;
}

/** A flat arrow in the cross-section plane; its length scales along the arrow only. */
export function createFieldArrow(
  color: string,
  thickness: number,
  opts: FxOptions,
  brightness = 1.6,
): ArrowFx {
  const g = new ShapeGeometry(arrowShape(1, 0.22, 2.4));
  g.applyMatrix4(SHAPE_TO_AXIAL);
  const material = fxMaterial(color, opts);
  material.color.multiplyScalar(brightness);
  const mesh = new Mesh(g, material);
  mesh.renderOrder = opts.renderOrder ?? 10;
  mesh.frustumCulled = false;
  const object3d = new Group();
  object3d.add(mesh);
  return {
    object3d,
    material,
    set(phi, length) {
      object3d.rotation.x = phi;
      const L = Math.max(length, 1e-4);
      // arrow along local +y after SHAPE_TO_AXIAL; width along z scales with thickness
      mesh.scale.set(1, L, thickness);
      object3d.visible = length > 1e-4;
    },
  };
}

export interface ArcFx {
  readonly object3d: Line;
  readonly material: LineBasicMaterial;
  set(phi0: number, phi1: number, radius: number): void;
}

const ARC_POINTS = 48;

/** Arc between two mechanical angles at a radius (the load angle). */
export function createAngleArc(opts: FxOptions): ArcFx {
  const pos = new Float32Array((ARC_POINTS + 1) * 3);
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  const material = new LineBasicMaterial({
    color: new Color(THEME.field).multiplyScalar(1.4),
    transparent: true,
    depthTest: !opts.xray,
    depthWrite: false,
    toneMapped: false,
  });
  const line = new Line(geo, material);
  line.renderOrder = (opts.renderOrder ?? 10) + 1;
  line.frustumCulled = false;
  return {
    object3d: line,
    material,
    set(phi0, phi1, radius) {
      for (let i = 0; i <= ARC_POINTS; i++) {
        const phi = phi0 + ((phi1 - phi0) * i) / ARC_POINTS;
        pos[i * 3] = 0;
        pos[i * 3 + 1] = radius * Math.cos(phi);
        pos[i * 3 + 2] = radius * Math.sin(phi);
      }
      geo.attributes.position!.needsUpdate = true;
    },
  };
}

/** Shortest signed difference a − b, wrapped to (−π, π]. */
export function angleDiff(a: number, b: number): number {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}
