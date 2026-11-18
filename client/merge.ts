import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/**
 * Collapses static meshes below `root` into one mesh per material.
 *
 * Every first-person gun and remote operator is assembled from dozens of
 * boxes and cylinders. Rendering each of those as its own mesh costs draw
 * calls and makes raycasts walk far more objects than necessary. Baked local
 * transforms let us keep the exact silhouette while dropping a model down to
 * a handful of draw calls.
 *
 * Meshes listed in `keep` (and anything nested below them) are left intact so
 * animated parts such as slides, bolts, pumps, and muzzle flashes keep working.
 */
export function mergeStaticMeshes(
  root: THREE.Object3D,
  keep?: ReadonlySet<THREE.Object3D>,
): void {
  root.updateMatrixWorld(true);
  const rootInverse = new THREE.Matrix4()
    .copy(root.matrixWorld)
    .invert();

  const buckets = new Map<
    THREE.Material,
    { geometries: THREE.BufferGeometry[]; castShadow: boolean }
  >();
  const consumed: THREE.Mesh[] = [];

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }
    let current: THREE.Object3D | null = child;
    while (current) {
      if (keep?.has(current)) {
        return;
      }
      current = current.parent;
    }

    const geometry = child.geometry.clone();
    const relative = new THREE.Matrix4()
      .multiplyMatrices(rootInverse, child.matrixWorld);
    geometry.applyMatrix4(relative);

    const material = child.material as THREE.Material;
    const bucket = buckets.get(material);
    if (bucket) {
      bucket.geometries.push(geometry);
      bucket.castShadow ||= child.castShadow;
    } else {
      buckets.set(material, {
        geometries: [geometry],
        castShadow: child.castShadow,
      });
    }
    consumed.push(child);
  });

  for (const mesh of consumed) {
    mesh.parent?.remove(mesh);
    // Source geometry may be shared (remote operators reuse module-level box
    // and sphere geometries), so only the cloned merge inputs are disposed.
  }

  // Drop the now-empty arm/leg/sight groups left behind by the merge.
  const empty: THREE.Object3D[] = [];
  root.traverse((child) => {
    if (child === root || keep?.has(child)) {
      return;
    }
    if (child instanceof THREE.Group && child.children.length === 0) {
      empty.push(child);
    }
  });
  for (const group of empty) {
    group.parent?.remove(group);
  }

  for (const [material, bucket] of buckets) {
    const geometry = mergeGeometries(bucket.geometries, false);
    for (const source of bucket.geometries) {
      source.dispose();
    }
    if (!geometry) {
      continue;
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = bucket.castShadow;
    root.add(mesh);
  }
}
