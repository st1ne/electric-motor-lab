/**
 * Stator lamination stack (TECH_SPEC §5.2): one extruded cross-section with 54 open rectangular
 * hairpin slots, Ø225/Ø150 mm, 135 mm long, with the procedural 2 mm lamination stripe.
 */
import { Group, Mesh, Path, Shape, DoubleSide } from 'three';
import { GEOMETRY } from '@/config/motor';
import { PALETTE } from '@/config/theme';
import { makeLaminationMaterial } from '@/scene/materials';
import { disposeTree, type SceneModule } from '@/scene/module';
import { extrudeAxial, polar, slotAngle } from '@/scene/motor/profile';

/** Bore outline with the 54 slots cut outward (clockwise hole path). */
function borePath(): Path {
  const G = GEOMETRY;
  const half = G.slotWidth / 2;
  const rB = G.statorBoreR;
  const rS = rB + G.slotDepth;
  const pts: [number, number][] = [];
  for (let k = 0; k < G.slots; k++) {
    const phi = slotAngle(k);
    const u: [number, number] = [Math.cos(phi), Math.sin(phi)];
    const n: [number, number] = [-Math.sin(phi), Math.cos(phi)];
    const rEdge = Math.sqrt(rB * rB - half * half);
    const at = (r: number, side: number): [number, number] => [
      r * u[0] + side * half * n[0],
      r * u[1] + side * half * n[1],
    ];
    // bore arc from the previous slot edge to this slot's first edge
    const prevPhi = slotAngle(k - 1) + half / rB;
    const startPhi = phi - half / rB;
    for (let j = 1; j <= 3; j++) pts.push(polar(rB, prevPhi + ((startPhi - prevPhi) * j) / 4));
    pts.push(at(rEdge, -1), at(rS, -1), at(rS, 1), at(rEdge, 1));
  }
  const p = new Path();
  pts.forEach(([x, y], i) => (i === 0 ? p.moveTo(x, y) : p.lineTo(x, y)));
  p.closePath();
  return p;
}

export function createStator(): SceneModule<Group> {
  const group = new Group();
  group.name = 'stator';
  const shape = new Shape();
  shape.absarc(0, 0, GEOMETRY.statorOuterR, 0, 2 * Math.PI, false);
  shape.holes.push(borePath());
  const mat = makeLaminationMaterial(PALETTE.lamination, PALETTE.laminationLine, 0.002, 'field', {
    cut: true,
  });
  mat.side = DoubleSide;
  const stack = new Mesh(extrudeAxial(shape, GEOMETRY.stackLength, 160), mat);
  stack.castShadow = true;
  stack.receiveShadow = true;
  group.add(stack);
  return { object3d: group, update() {}, dispose: () => disposeTree(group) };
}
