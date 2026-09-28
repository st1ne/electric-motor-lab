/**
 * Gear geometry generator (TECH_SPEC §5.5, shared with the wind lab): ExtrudeGeometry from a 2D gear outline with
 * trapezoid teeth (fine at this scale). Pitch radius = module · teeth / 2, addendum = module,
 * dedendum = 1.25 module. Tooth k is centred on angle k · 2π/Z (for internal gears, the inward
 * tooth is centred there). The gear is centred on its face width along the chosen axis.
 */
import { ExtrudeGeometry, Path, Shape, type BufferGeometry } from 'three';

export interface GearOptions {
  teeth: number;
  moduleM: number;
  faceWidthM: number;
  /** internal (ring) gear: teeth point inward, outer rim radius = rimRadiusM */
  internal?: boolean;
  /** bore radius for external gears, or outer rim radius for internal gears */
  boreRadiusM?: number;
  rimRadiusM?: number;
  axis?: 'x' | 'y' | 'z';
}

export function pitchRadius(teeth: number, moduleM: number): number {
  return (teeth * moduleM) / 2;
}

/** Closed toothed outline; `outward` teeth grow outward from rf to ra. */
function toothedPoints(teeth: number, rf: number, ra: number): [number, number][] {
  const p = (2 * Math.PI) / teeth;
  const pts: [number, number][] = [];
  for (let k = 0; k < teeth; k++) {
    const th = k * p;
    for (const [r, a] of [
      [rf, th - 0.3 * p],
      [ra, th - 0.12 * p],
      [ra, th + 0.12 * p],
      [rf, th + 0.3 * p],
    ] as const) {
      pts.push([r * Math.cos(a), r * Math.sin(a)]);
    }
  }
  return pts;
}

export function createGearGeometry(opts: GearOptions): BufferGeometry {
  const { teeth, moduleM: m, faceWidthM } = opts;
  const rp = pitchRadius(teeth, m);
  let shape: Shape;
  if (!opts.internal) {
    const pts = toothedPoints(teeth, rp - 1.25 * m, rp + m);
    shape = new Shape();
    pts.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
    shape.closePath();
    const bore = opts.boreRadiusM ?? 0;
    if (bore > 0) {
      const hole = new Path();
      hole.absarc(0, 0, bore, 0, Math.PI * 2, true);
      shape.holes.push(hole);
    }
  } else {
    const rim = opts.rimRadiusM ?? rp + 4 * m;
    shape = new Shape();
    shape.absarc(0, 0, rim, 0, Math.PI * 2, false);
    // internal teeth: roots outside the pitch circle, tips inside
    const pts = toothedPoints(teeth, rp + 1.25 * m, rp - m);
    const hole = new Path();
    [...pts].reverse().forEach(([x, y], i) => (i === 0 ? hole.moveTo(x, y) : hole.lineTo(x, y)));
    hole.closePath();
    shape.holes.push(hole);
  }
  const g = new ExtrudeGeometry(shape, {
    depth: faceWidthM,
    bevelEnabled: false,
    curveSegments: Math.max(24, teeth),
  });
  g.translate(0, 0, -faceWidthM / 2);
  switch (opts.axis ?? 'x') {
    case 'x':
      g.rotateY(Math.PI / 2);
      break;
    case 'y':
      g.rotateX(-Math.PI / 2);
      break;
    case 'z':
      break;
  }
  g.computeVertexNormals();
  return g;
}
