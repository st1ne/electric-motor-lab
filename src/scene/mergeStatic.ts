/**
 * Draw-call reduction (TECH_SPEC §14): merge every plain Mesh under `root` that shares a material
 * into one mesh, in root's local frame. InstancedMeshes, skinned/transparent-sorted objects and
 * anything in `keep` (and its subtree) stay untouched. Call once after building a static group,
 * or on a subgroup that moves as one rigid body (e.g. a wheel).
 */
import { Matrix4, Mesh, type BufferGeometry, type Material, type Object3D } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function mergeStatic(root: Object3D, keep: readonly Object3D[] = []): void {
  root.updateMatrixWorld(true);
  const inv = new Matrix4().copy(root.matrixWorld).invert();
  const keepSet = new Set<Object3D>();
  keep.forEach((k) => k.traverse((o) => keepSet.add(o)));
  const buckets = new Map<
    string,
    { material: Material; meshes: Mesh[]; shadow: boolean; receive: boolean }
  >();
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh || (o as { isInstancedMesh?: boolean }).isInstancedMesh || keepSet.has(o))
      return;
    if (Array.isArray(mesh.material) || mesh.children.length > 0) return;
    const mat = mesh.material as Material & { map?: unknown; bumpMap?: unknown };
    if (mat.map || mat.bumpMap || mat.transparent) return; // textured/transparent parts keep their uvs and sort order
    const key = `${mat.uuid}|${mesh.castShadow}|${mesh.receiveShadow}`;
    let b = buckets.get(key);
    if (!b) {
      b = { material: mat, meshes: [], shadow: mesh.castShadow, receive: mesh.receiveShadow };
      buckets.set(key, b);
    }
    b.meshes.push(mesh);
  });
  const m = new Matrix4();
  for (const b of buckets.values()) {
    if (b.meshes.length < 2) continue;
    const geos: BufferGeometry[] = b.meshes.map((mesh) => {
      m.multiplyMatrices(inv, mesh.matrixWorld);
      let g = mesh.geometry.clone();
      if (g.index) g = g.toNonIndexed();
      g.applyMatrix4(m);
      for (const name of Object.keys(g.attributes)) {
        if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
      }
      return g;
    });
    const merged = mergeGeometries(geos);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    for (const mesh of b.meshes) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
    }
    const out = new Mesh(merged, b.material);
    out.castShadow = b.shadow;
    out.receiveShadow = b.receive;
    out.name = 'merged';
    root.add(out);
  }
}
