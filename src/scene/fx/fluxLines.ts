/**
 * Stylized flux lines (TECH_SPEC §9): 2p bundles × 6 ribbons. Each ribbon loops from a north pole
 * across the air gap, around through the stator yoke, back in at the neighbouring south pole and
 * home through the rotor: a nested family of ellipses in (φ, r). A precomputed template per pole
 * count, rotated with the field (group.rotation.x = θ_field / p). A dash runs along each loop in
 * the flux direction (display time). Stylized, not FEM: help says so.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  ShaderMaterial,
} from 'three';
import { IM, PM } from '@/config/motor';
import { THEME } from '@/config/theme';
import type { FxOptions } from '@/scene/fx/fieldArrow';
import { SHAPE_TO_AXIAL } from '@/scene/motor/profile';

const RIBBONS = 6;
const SEG = 72;

export interface FluxDims {
  /** loop centre radius, the innermost/outermost radial half-heights, ribbon width (m) */
  rCenter: number;
  bMin: number;
  bMax: number;
  width: number;
}

function buildTemplate(p: number, d: FluxDims): BufferGeometry {
  const bundles = 2 * p;
  const quadCount = bundles * RIBBONS * SEG;
  const pos = new Float32Array(quadCount * 6 * 3);
  const tAttr = new Float32Array(quadCount * 6);
  const dirAttr = new Float32Array(quadCount * 6);
  let v = 0;
  const pt = (phiC: number, a: number, b: number, u: number): [number, number] => {
    const phi = phiC - a * Math.cos(u);
    const r = d.rCenter + b * Math.sin(u);
    return [r * Math.cos(phi), r * Math.sin(phi)];
  };
  for (let j = 0; j < bundles; j++) {
    const phiC = (j + 0.5) * (Math.PI / p);
    const dir = j % 2 === 0 ? 1 : -1; // bundle j starts at a north pole when j is even
    for (let k = 0; k < RIBBONS; k++) {
      const f = k / (RIBBONS - 1);
      const a = (Math.PI / (2 * p)) * (0.22 + 0.62 * f);
      const b = d.bMin + (d.bMax - d.bMin) * f;
      for (let i = 0; i < SEG; i++) {
        const u0 = (i / SEG) * 2 * Math.PI;
        const u1 = ((i + 1) / SEG) * 2 * Math.PI;
        const p0 = pt(phiC, a, b, u0);
        const p1 = pt(phiC, a, b, u1);
        const tx = p1[0] - p0[0];
        const ty = p1[1] - p0[1];
        const len = Math.hypot(tx, ty) || 1;
        const nx = (-ty / len) * (d.width / 2);
        const ny = (tx / len) * (d.width / 2);
        const quad: [number, number][] = [
          [p0[0] - nx, p0[1] - ny],
          [p0[0] + nx, p0[1] + ny],
          [p1[0] + nx, p1[1] + ny],
          [p0[0] - nx, p0[1] - ny],
          [p1[0] + nx, p1[1] + ny],
          [p1[0] - nx, p1[1] - ny],
        ];
        const ts = [i, i, i + 1, i, i + 1, i + 1].map((x) => x / SEG);
        quad.forEach(([x, y], q) => {
          pos[v * 3] = x;
          pos[v * 3 + 1] = y;
          pos[v * 3 + 2] = 0;
          tAttr[v] = ts[q] ?? 0;
          dirAttr[v] = dir;
          v++;
        });
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('aT', new BufferAttribute(tAttr, 1));
  g.setAttribute('aDir', new BufferAttribute(dirAttr, 1));
  g.applyMatrix4(SHAPE_TO_AXIAL);
  return g;
}

export interface FluxLines {
  readonly object3d: Group;
  set(p: number, poleMech: number, strength: number, timeS: number, opacity: number): void;
}

export function createFluxLines(dims: FluxDims, opts: FxOptions): FluxLines {
  const material = new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uB: { value: 1 },
      uOpacity: { value: 1 },
      uColor: { value: new Color(THEME.field) },
    },
    vertexShader: /* glsl */ `
      attribute float aT;
      attribute float aDir;
      varying float vT;
      varying float vDir;
      void main() {
        vT = aT;
        vDir = aDir;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uB, uOpacity;
      uniform vec3 uColor;
      varying float vT;
      varying float vDir;
      void main() {
        float d = fract(vT * 6.0 - uTime * vDir);
        float dash = smoothstep(0.0, 0.15, d) * (1.0 - smoothstep(0.35, 0.6, d));
        float a = uOpacity * min(uB, 1.2) * (0.18 + 0.82 * dash);
        gl_FragColor = vec4(uColor * (0.7 + 1.1 * dash), a);
      }`,
    transparent: true,
    side: DoubleSide,
    depthTest: !opts.xray,
    depthWrite: false,
    blending: opts.additive ? AdditiveBlending : undefined,
  });
  const group = new Group();
  const meshes = new Map<number, Mesh>();
  for (const p of [PM.polePairs, IM.polePairs]) {
    const m = new Mesh(buildTemplate(p, dims), material);
    m.renderOrder = opts.renderOrder ?? 9;
    m.frustumCulled = false;
    meshes.set(p, m);
    group.add(m);
  }
  const u = material.uniforms;
  return {
    object3d: group,
    set(p, poleMech, strength, timeS, opacity) {
      meshes.forEach((m, pp) => (m.visible = pp === p));
      group.rotation.x = poleMech;
      u.uB!.value = strength;
      u.uTime!.value = timeS;
      u.uOpacity!.value = opacity;
      group.visible = opacity > 0.01 && strength > 0.01;
    },
  };
}
