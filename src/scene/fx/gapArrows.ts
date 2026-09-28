/**
 * Air-gap field ring (TECH_SPEC §6.6, §9): 54 small radial arrows at slot pitch, one instanced
 * draw. Each is scaled in the vertex shader by B(φ_k) = B̂ cos(p φ_k − θ_field): outward and
 * bright violet at a north pole, inward and dim at a south pole. Uniforms uTheta (electrical
 * field angle), uP (pole pairs) and uB (strength).
 */
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Shape,
  ShapeGeometry,
  ShaderMaterial,
} from 'three';
import { GEOMETRY } from '@/config/motor';
import { THEME } from '@/config/theme';
import type { FxOptions } from '@/scene/fx/fieldArrow';
import { SHAPE_TO_AXIAL } from '@/scene/motor/profile';

const COUNT = GEOMETRY.slots;

export interface GapArrows {
  readonly object3d: InstancedMesh;
  readonly material: ShaderMaterial;
  set(thetaElec: number, p: number, strength: number, opacity: number): void;
}

/**
 * @param radius ring radius (m, local units)
 * @param length arrow length at |B| = 1
 * @param width arrow width
 */
export function createGapArrows(
  radius: number,
  length: number,
  width: number,
  opts: FxOptions,
): GapArrows {
  // unit arrow along shape +x from −0.5 to +0.5 so it is centred on the ring
  const s = new Shape();
  s.moveTo(-0.5, -0.18);
  s.lineTo(0.15, -0.18);
  s.lineTo(0.15, -0.5);
  s.lineTo(0.5, 0);
  s.lineTo(0.15, 0.5);
  s.lineTo(0.15, 0.18);
  s.lineTo(-0.5, 0.18);
  s.closePath();
  const geo = new ShapeGeometry(s);
  geo.applyMatrix4(SHAPE_TO_AXIAL); // arrow along local +y (radial at φ = 0), width along z
  const phis = new Float32Array(COUNT);
  for (let k = 0; k < COUNT; k++) phis[k] = (k * 2 * Math.PI) / COUNT;
  geo.setAttribute('aPhi', new InstancedBufferAttribute(phis, 1));

  const material = new ShaderMaterial({
    uniforms: {
      uTheta: { value: 0 },
      uP: { value: 3 },
      uB: { value: 1 },
      uLen: { value: length },
      uWidth: { value: width },
      uRadius: { value: radius },
      uOpacity: { value: 1 },
      uColor: { value: new Color(THEME.field) },
    },
    vertexShader: /* glsl */ `
      attribute float aPhi;
      uniform float uTheta, uP, uB, uLen, uWidth, uRadius;
      varying float vB;
      void main() {
        float b = uB * cos(uP * aPhi - uTheta);
        vB = b;
        vec3 p = position;
        p.y *= uLen * b;          // flips inward for a south pole
        p.z *= uWidth;
        p.y += uRadius;
        float c = cos(aPhi), s = sin(aPhi);
        vec3 r = vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(r, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vB;
      void main() {
        float north = step(0.0, vB);
        vec3 col = uColor * mix(0.45, 1.8, north) * (0.35 + 0.65 * min(abs(vB), 1.2));
        gl_FragColor = vec4(col, uOpacity * (0.35 + 0.65 * min(abs(vB), 1.0)));
      }`,
    transparent: true,
    side: DoubleSide,
    depthTest: !opts.xray,
    depthWrite: false,
    blending: opts.additive ? AdditiveBlending : undefined,
  });
  const mesh = new InstancedMesh(geo, material, COUNT);
  const identity = new Matrix4();
  for (let k = 0; k < COUNT; k++) mesh.setMatrixAt(k, identity); // placement is in the shader
  mesh.frustumCulled = false;
  mesh.renderOrder = opts.renderOrder ?? 10;
  const u = material.uniforms;
  return {
    object3d: mesh,
    material,
    set(thetaElec, p, strength, opacity) {
      u.uTheta!.value = thetaElec;
      u.uP!.value = p;
      u.uB!.value = strength;
      u.uOpacity!.value = opacity;
      mesh.visible = opacity > 0.01;
    },
  };
}
