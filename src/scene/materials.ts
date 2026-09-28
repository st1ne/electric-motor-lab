/**
 * Material factory (TECH_SPEC §4.3, §8, §9).
 *  - Every material gets the shared uDim uniform of its system via onBeforeCompile: dimmed meshes
 *    desaturate toward luminance and multiply by 0.35. Follow modes animate DIM[system].value.
 *  - Cut materials share the two quarter-cutaway clipping planes (clipIntersection: only the
 *    90° wedge where BOTH planes clip is removed). Views move the planes; parking them far away
 *    disables the cut without recompiling shaders.
 *  - Lamination steel gets a procedural stripe every 2 mm (full scale) along the motor axis.
 */
import {
  Color,
  DoubleSide,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Plane,
  Vector3,
  type MeshPhysicalMaterialParameters,
  type MeshStandardMaterialParameters,
  type WebGLProgramParametersWithUniforms,
} from 'three';

export type SystemTag = 'field' | 'power' | 'heat' | 'structure' | 'environment';

export const DIM: Record<SystemTag, { value: number }> = {
  field: { value: 0 },
  power: { value: 0 },
  heat: { value: 0 },
  structure: { value: 0 },
  environment: { value: 0 },
};

const DIM_CHUNK = /* glsl */ `
  {
    float dimLum = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));
    gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(dimLum) * 0.35, uDim);
  }
  #include <dithering_fragment>`;

export function injectDim(shader: WebGLProgramParametersWithUniforms, system: SystemTag): void {
  shader.uniforms.uDim = DIM[system];
  shader.fragmentShader = shader.fragmentShader
    .replace('void main() {', 'uniform float uDim;\nvoid main() {')
    .replace('#include <dithering_fragment>', DIM_CHUNK);
}

/**
 * Quarter-cutaway planes (world space). Plane A clips y > axisY, plane B clips z > axisZ;
 * with clipIntersection the wedge above and in front of the motor axis disappears.
 */
export const CUT_PLANES = [
  new Plane(new Vector3(0, -1, 0), 0),
  new Plane(new Vector3(0, 0, -1), 0),
];
const PARKED = 1e3;

/** Place the cut through a world-space axis point, or park it (open = 0) to disable. */
export function setCut(axisY: number, axisZ: number, open: number): void {
  const [a, b] = CUT_PLANES as [Plane, Plane];
  // open 0…1 slides the planes from outside the object into the axis
  const off = open <= 0 ? PARKED : (1 - open) * 0.25;
  a.constant = axisY + off;
  b.constant = axisZ + off;
}
setCut(0, 0, 0);

export interface MaterialOptions {
  /** part of the quarter cutaway */
  cut?: boolean;
}

/**
 * Section caps (§8) without a stencil pass: cut materials render double-sided, and a back face
 * can only be seen through the cut opening of a closed mesh, so back faces are painted as the
 * cap: a dark screen-space hatch. Front faces within CAP_EDGE of a cut plane (on the removed
 * side of the other plane) get the violet edge line. s_i > 0 means "clipped by plane i", exactly
 * as three.js's clipping_planes_fragment tests it.
 */
export const CAP_EDGE = 0.0005;
const CAP_CHUNK = /* glsl */ `
  #if NUM_CLIPPING_PLANES == 2 && UNION_CLIPPING_PLANES == 0
  {
    float sA = dot(vClipPosition, clippingPlanes[0].xyz) - clippingPlanes[0].w;
    float sB = dot(vClipPosition, clippingPlanes[1].xyz) - clippingPlanes[1].w;
    if (!gl_FrontFacing) {
      float stripe = step(mod(gl_FragCoord.x + gl_FragCoord.y, 9.0), 1.6);
      gl_FragColor = vec4(mix(vec3(0.075, 0.085, 0.11), vec3(0.2, 0.22, 0.28), stripe), 1.0);
    }
    float onA = (1.0 - smoothstep(0.0, ${CAP_EDGE.toFixed(5)}, abs(sA))) * step(-${CAP_EDGE.toFixed(5)}, sB);
    float onB = (1.0 - smoothstep(0.0, ${CAP_EDGE.toFixed(5)}, abs(sB))) * step(-${CAP_EDGE.toFixed(5)}, sA);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.72, 0.58, 1.0) * 0.95, max(onA, onB));
  }
  #endif
  #include <dithering_fragment>`;

function finish<T extends MeshStandardMaterial>(m: T, system: SystemTag, o: MaterialOptions): T {
  const prev = m.onBeforeCompile.bind(m);
  m.onBeforeCompile = (shader, renderer) => {
    prev(shader, renderer);
    if (o.cut)
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        CAP_CHUNK,
      );
    injectDim(shader, system);
  };
  m.userData.system = system;
  if (o.cut) {
    m.clippingPlanes = CUT_PLANES;
    m.clipIntersection = true;
    m.clipShadows = true;
    m.side = DoubleSide;
  }
  return m;
}

export function makeMaterial(
  opts: MeshStandardMaterialParameters,
  system: SystemTag,
  o: MaterialOptions = {},
): MeshStandardMaterial {
  return finish(new MeshStandardMaterial(opts), system, o);
}

export function makePhysicalMaterial(
  opts: MeshPhysicalMaterialParameters,
  system: SystemTag,
  o: MaterialOptions = {},
): MeshPhysicalMaterial {
  return finish(new MeshPhysicalMaterial(opts), system, o);
}

/**
 * Lamination steel: a thin lighter line every `pitch` metres of object-space x (the motor axis),
 * so the stack reads as laminated sheets. Pitch is in object units (full-scale metres).
 */
export function makeLaminationMaterial(
  color: string,
  lineColor: string,
  pitch: number,
  system: SystemTag,
  o: MaterialOptions = {},
): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ color, metalness: 0.7, roughness: 0.42 });
  const uLine = { value: new Color(lineColor) };
  const uPitch = { value: pitch };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uLineColor = uLine;
    shader.uniforms.uPitch = uPitch;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying float vAxial;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAxial = position.x;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        'uniform vec3 uLineColor;\nuniform float uPitch;\nvarying float vAxial;\nvoid main() {',
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        {
          float f = fract(vAxial / uPitch);
          float w = fwidth(vAxial / uPitch);
          float line = 1.0 - smoothstep(0.0, max(w * 1.5, 0.08), min(f, 1.0 - f));
          diffuseColor.rgb = mix(diffuseColor.rgb, uLineColor, line * 0.55);
        }`,
      );
  };
  m.customProgramCacheKey = () => 'lamination';
  return finish(m, system, o);
}
