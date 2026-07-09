import * as THREE from 'three';
import { mulberry32 } from '../utils.js';

// Instanced pine forest + scattered rocks. Uses terrain.heightAt to place on
// the ground, and avoids the city basin and the cart path corridor.
export class Vegetation {
  constructor(scene, terrain, opts = {}) {
    this.scene = scene;
    this.terrain = terrain;
    this.cityRadius = opts.cityRadius ?? 42;
    this.count = opts.count ?? 2600;
    this.rockCount = opts.rockCount ?? 180;
    this.area = opts.area ?? 420;
    this.rng = mulberry32(opts.seed ?? 991);

    this._buildPines();
    this._buildRocks();
  }

  _buildPines() {
    // Trunk.
    const trunkGeo = new THREE.CylinderGeometry(0.12, 0.18, 1.6, 6);
    trunkGeo.translate(0, 0.8, 0);
    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x3a2a1a, roughness: 0.95,
    });

    // Foliage: 3 stacked cones merged into one geometry.
    const foliageGeo = new THREE.BufferGeometry();
    const cones = [];
    const c1 = new THREE.ConeGeometry(1.4, 2.4, 8);
    c1.translate(0, 2.2, 0);
    cones.push(c1);
    const c2 = new THREE.ConeGeometry(1.1, 2.0, 8);
    c2.translate(0, 3.3, 0);
    cones.push(c2);
    const c3 = new THREE.ConeGeometry(0.7, 1.6, 8);
    c3.translate(0, 4.3, 0);
    cones.push(c3);
    const merged = mergeGeometries(cones);
    const foliageMat = new THREE.MeshStandardMaterial({
      color: 0x2d4a2a, roughness: 0.9, flatShading: true,
    });

    // We instance foliage + trunk as two InstancedMesh sharing transforms.
    const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, this.count);
    const folMesh = new THREE.InstancedMesh(merged, foliageMat, this.count);
    trunkMesh.castShadow = true;
    folMesh.castShadow = true;
    trunkMesh.receiveShadow = true;
    folMesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    let placed = 0;
    let tries = 0;
    while (placed < this.count && tries < this.count * 4) {
      tries++;
      const x = (this.rng() - 0.5) * this.area * 2;
      const z = (this.rng() - 0.5) * this.area * 2;
      const d = Math.sqrt(x * x + z * z);
      // Skip city basin.
      if (d < this.cityRadius + 4) continue;
      // Skip the cart path corridor (roughly along -Z approaching the city).
      // Path winds from NE; avoid a band near z in [-130, 5] and x in [-40, 45].
      if (z < 5 && z > -135 && x > -50 && x < 55) continue;

      const y = this.terrain.heightAt(x, z);
      // Don't place on steep peaks or underwater-ish.
      if (y < -2) continue;

      const scale = 0.7 + this.rng() * 1.3;
      const rot = this.rng() * Math.PI * 2;
      const lean = (this.rng() - 0.5) * 0.12;

      dummy.position.set(x, y, z);
      dummy.rotation.set(lean, rot, lean * 0.5);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      trunkMesh.setMatrixAt(placed, dummy.matrix);
      folMesh.setMatrixAt(placed, dummy.matrix);

      // Per-instance color variation (green to blue-green, snow dust on big ones).
      const g = 0.28 + this.rng() * 0.18;
      const r = 0.16 + this.rng() * 0.1;
      const b = 0.18 + this.rng() * 0.12;
      color.setRGB(r, g, b);
      if (y > 45 && this.rng() > 0.4) color.lerp(new THREE.Color(0xd8dde2), 0.5);
      folMesh.setColorAt(placed, color);

      placed++;
    }
    trunkMesh.count = placed;
    folMesh.count = placed;
    trunkMesh.instanceMatrix.needsUpdate = true;
    folMesh.instanceMatrix.needsUpdate = true;
    if (folMesh.instanceColor) folMesh.instanceColor.needsUpdate = true;

    this.scene.add(trunkMesh, folMesh);
    this.trunkMesh = trunkMesh;
    this.folMesh = folMesh;
  }

  _buildRocks() {
    const geo = new THREE.DodecahedronGeometry(1, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x6a6258, roughness: 0.95, flatShading: true,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, this.rockCount);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    let placed = 0;
    let tries = 0;
    while (placed < this.rockCount && tries < this.rockCount * 5) {
      tries++;
      const x = (this.rng() - 0.5) * this.area * 2;
      const z = (this.rng() - 0.5) * this.area * 2;
      const d = Math.sqrt(x * x + z * z);
      if (d < this.cityRadius) continue;
      const y = this.terrain.heightAt(x, z);
      const s = 0.4 + this.rng() * 2.2;
      dummy.position.set(x, y + s * 0.2, z);
      dummy.rotation.set(this.rng() * 3, this.rng() * 3, this.rng() * 3);
      dummy.scale.set(s, s * (0.7 + this.rng() * 0.5), s * (0.8 + this.rng() * 0.4));
      dummy.updateMatrix();
      mesh.setMatrixAt(placed, dummy.matrix);
      const shade = 0.4 + this.rng() * 0.3;
      color.setRGB(shade, shade * 0.96, shade * 0.9);
      if (y > 50) color.lerp(new THREE.Color(0xd8dde2), 0.45);
      mesh.setColorAt(placed, color);
      placed++;
    }
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.scene.add(mesh);
  }
}

// Minimal geometry merge (avoids pulling in BufferGeometryUtils for one call).
function mergeGeometries(geometries) {
  let vertexCount = 0;
  let indexCount = 0;
  for (const g of geometries) {
    vertexCount += g.attributes.position.count;
    if (g.index) indexCount += g.index.count;
    else indexCount += g.attributes.position.count;
  }
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const indices = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
  let vOff = 0, iOff = 0;
  for (const g of geometries) {
    const pos = g.attributes.position.array;
    const nor = g.attributes.normal ? g.attributes.normal.array : null;
    positions.set(pos, vOff * 3);
    if (nor) normals.set(nor, vOff * 3);
    const cnt = g.attributes.position.count;
    if (g.index) {
      const idx = g.index.array;
      for (let i = 0; i < idx.length; i++) indices[iOff++] = idx[i] + vOff;
    } else {
      for (let i = 0; i < cnt; i++) indices[iOff++] = vOff + i;
    }
    vOff += cnt;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setIndex(new THREE.BufferAttribute(indices, 1));
  return merged;
}
