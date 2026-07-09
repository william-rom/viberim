import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { mulberry32, smoothstep, clamp } from '../utils.js';

// Terrain: noise-displaced plane with a flattened city basin and snow-capped
// mountains ringing the distance. Exposes heightAt(x,z) so trees/city/cart can
// sit on the ground using the exact same field.
export class Terrain {
  constructor(scene, seed = 1337) {
    this.scene = scene;
    this.rng = mulberry32(seed);
    this.noise2D = createNoise2D(this.rng);

    // Tuning.
    this.size = 900;
    this.segs = 240;
    this.cityRadius = 42; // flat basin around origin
    this.mountainStart = 70;
    this.mountainFull = 220;
    this.amp = 120;
    this.baseHeight = 0;

    this._build();
  }

  // Fractal brownian motion in [-1,1].
  _fbm(x, z, octaves = 5, freq = 0.0045, persistence = 0.5) {
    let amp = 1,
      sum = 0,
      norm = 0,
      f = freq;
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.noise2D(x * f, z * f);
      norm += amp;
      amp *= persistence;
      f *= 2.0;
    }
    return sum / norm;
  }

  // Ridged noise for sharper mountain peaks, in [0,1].
  _ridged(x, z, octaves = 5, freq = 0.005, persistence = 0.5) {
    let amp = 1,
      sum = 0,
      norm = 0,
      f = freq;
    for (let i = 0; i < octaves; i++) {
      const n = 1 - Math.abs(this.noise2D(x * f, z * f));
      sum += amp * n * n;
      norm += amp;
      amp *= persistence;
      f *= 2.0;
    }
    return sum / norm;
  }

  heightAt(x, z) {
    const d = Math.sqrt(x * x + z * z);
    const mountain = smoothstep(this.mountainStart, this.mountainFull, d);
    const rolling = this._fbm(x, z, 4, 0.006, 0.5);
    const ridge = this._ridged(x, z, 5, 0.0045, 0.55);
    const farShape = ridge * 0.8 + rolling * 0.2;
    // Flatten terrain within the city basin for consistent ground level.
    if (d < this.cityRadius) {
      const blend = smoothstep(this.cityRadius - 8, this.cityRadius, d);
      const h = 0 * (1 - blend) + (rolling * 6) * blend + farShape * this.amp * mountain;
      return h;
    }
    const h = this.baseHeight + rolling * 6 * (1 - mountain) + farShape * this.amp * mountain;
    return h;
  }

  _build() {
    const geo = new THREE.PlaneGeometry(
      this.size,
      this.size,
      this.segs,
      this.segs
    );
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    const cSnow = new THREE.Color(0xeef3f7);
    const cRock = new THREE.Color(0x5b5247);
    const cGrass = new THREE.Color(0x4a5234);
    const cDirt = new THREE.Color(0x6b5a3c);
    const cCityGround = new THREE.Color(0x7a6a4a);

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = this.heightAt(x, z);
      pos.setY(i, h);

      // Vertex color by height + slope-ish proxy (use local height variance).
      const d = Math.sqrt(x * x + z * z);
      const mountain = smoothstep(this.mountainStart, this.mountainFull, d);

      const col = new THREE.Color();
      if (d < this.cityRadius) {
        col.copy(cCityGround);
      } else {
        // base grass/dirt blend by low-freq noise
        const low = this.noise2D(x * 0.01 + 10, z * 0.01 - 10);
        col.copy(cGrass).lerp(cDirt, smoothstep(-0.2, 0.4, low));
        // rocky slopes higher up
        col.lerp(cRock, smoothstep(20, 55, h));
        // snow caps on peaks
        col.lerp(cSnow, smoothstep(58, 92, h) * (0.4 + 0.6 * mountain));
      }
      // Slight per-vertex variation for richness.
      const v = 0.92 + 0.16 * (this.noise2D(x * 0.05, z * 0.05) * 0.5 + 0.5);
      colors[i * 3] = col.r * v;
      colors[i * 3 + 1] = col.g * v;
      colors[i * 3 + 2] = col.b * v;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.96,
      metalness: 0.0,
      flatShading: false,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
    this.mesh.name = 'terrain';
    this.scene.add(this.mesh);
  }
}
