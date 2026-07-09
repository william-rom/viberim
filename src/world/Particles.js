import * as THREE from 'three';
import { mulberry32 } from '../utils.js';

// GPU-friendly particle systems: a drifting snow field that follows the
// camera, plus forge smoke + embers from a fixed world origin.
export class Particles {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this._buildSnow();
  }

  _buildSnow() {
    const count = 1800;
    const area = 70;
    const height = 40;

    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const speeds = new Float32Array(count);
    const phases = new Float32Array(count);

    const rng = mulberry32(42);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (rng() - 0.5) * area;
      positions[i * 3 + 1] = rng() * height;
      positions[i * 3 + 2] = (rng() - 0.5) * area;
      sizes[i] = 0.04 + rng() * 0.12;
      speeds[i] = 0.6 + rng() * 1.2;
      phases[i] = rng() * Math.PI * 2;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        pixelRatio: { value: Math.min(window.devicePixelRatio, 1.75) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      fog: false,
      vertexShader: /* glsl */ `
        attribute float size;
        uniform float time;
        uniform float pixelRatio;
        varying float vAlpha;
        void main() {
          vec3 p = position;
          // drift handled on CPU via update; here we just add tiny flutter.
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = size * 300.0 * pixelRatio / -mv.z;
          gl_Position = projectionMatrix * mv;
          vAlpha = clamp(1.0 - (-mv.z) / 60.0, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.0, d) * vAlpha * 0.85;
          gl_FragColor = vec4(0.92, 0.94, 0.98, a);
        }
      `,
    });

    this.snow = new THREE.Points(geo, mat);
    this.snow.frustumCulled = false;
    this.snow.userData = { speeds, phases, area, height, count };
    this.scene.add(this.snow);
  }

  // Forge smoke + embers from a world-space origin.
  addForgeSmoke(origin, opts = {}) {
    const smokeCount = opts.smokeCount ?? 60;
    const emberCount = opts.emberCount ?? 40;

    // Smoke: soft grey points rising and expanding.
    const sPos = new Float32Array(smokeCount * 3);
    const sSize = new Float32Array(smokeCount);
    const sLife = new Float32Array(smokeCount);
    for (let i = 0; i < smokeCount; i++) {
      sLife[i] = Math.random();
      sSize[i] = 0.5 + Math.random() * 1.0;
    }
    const sGeo = new THREE.BufferGeometry();
    sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
    sGeo.setAttribute('size', new THREE.BufferAttribute(sSize, 1));
    sGeo.setAttribute('life', new THREE.BufferAttribute(sLife, 1));
    const sMat = new THREE.ShaderMaterial({
      uniforms: { pixelRatio: { value: Math.min(window.devicePixelRatio, 1.75) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      vertexShader: /* glsl */ `
        attribute float size;
        attribute float life;
        uniform float pixelRatio;
        varying float vLife;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (40.0 + life * 160.0) * pixelRatio / -mv.z;
          gl_Position = projectionMatrix * mv;
          vLife = life;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vLife;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.0, d) * (1.0 - vLife) * 0.25;
          vec3 col = mix(vec3(0.25,0.22,0.20), vec3(0.5,0.48,0.45), vLife);
          gl_FragColor = vec4(col, a);
        }
      `,
    });
    const smoke = new THREE.Points(sGeo, sMat);
    smoke.frustumCulled = false;
    this.scene.add(smoke);

    // Embers: bright glowing points, pick up bloom.
    const ePos = new Float32Array(emberCount * 3);
    const eSize = new Float32Array(emberCount);
    const eLife = new Float32Array(emberCount);
    for (let i = 0; i < emberCount; i++) {
      eLife[i] = Math.random();
      eSize[i] = 0.06 + Math.random() * 0.1;
    }
    const eGeo = new THREE.BufferGeometry();
    eGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3));
    eGeo.setAttribute('size', new THREE.BufferAttribute(eSize, 1));
    eGeo.setAttribute('life', new THREE.BufferAttribute(eLife, 1));
    const eMat = new THREE.ShaderMaterial({
      uniforms: { pixelRatio: { value: Math.min(window.devicePixelRatio, 1.75) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute float size;
        attribute float life;
        uniform float pixelRatio;
        varying float vLife;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * 120.0 * pixelRatio / -mv.z;
          gl_Position = projectionMatrix * mv;
          vLife = life;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vLife;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.0, d) * (1.0 - vLife);
          vec3 col = mix(vec3(1.0,0.5,0.1), vec3(1.0,0.85,0.4), 1.0 - vLife);
          gl_FragColor = vec4(col, a);
        }
      `,
    });
    const embers = new THREE.Points(eGeo, eMat);
    embers.frustumCulled = false;
    this.scene.add(embers);

    this._forge = { origin: origin.clone(), smoke, embers, smokeCount, emberCount };
  }

  update(t, dt) {
    // --- Snow: follow camera, drift down, wrap. ---
    if (this.snow) {
      const ud = this.snow.userData;
      const pos = this.snow.geometry.attributes.position.array;
      const camX = this.camera.position.x;
      const camZ = this.camera.position.z;
      for (let i = 0; i < ud.count; i++) {
        const ix = i * 3;
        // drift down
        pos[ix + 1] -= ud.speeds[i] * dt;
        // wind flutter
        pos[ix] += Math.sin(t * 0.7 + ud.phases[i]) * dt * 0.3;
        pos[ix + 2] += Math.cos(t * 0.5 + ud.phases[i]) * dt * 0.2;
        // wrap vertically
        if (pos[ix + 1] < -2) {
          pos[ix + 1] = ud.height;
          pos[ix] = camX + (Math.random() - 0.5) * ud.area;
          pos[ix + 2] = camZ + (Math.random() - 0.5) * ud.area;
        }
        // wrap horizontally around camera
        const dx = pos[ix] - camX;
        const dz = pos[ix + 2] - camZ;
        if (dx > ud.area / 2) pos[ix] -= ud.area;
        else if (dx < -ud.area / 2) pos[ix] += ud.area;
        if (dz > ud.area / 2) pos[ix + 2] -= ud.area;
        else if (dz < -ud.area / 2) pos[ix + 2] += ud.area;
      }
      this.snow.geometry.attributes.position.needsUpdate = true;
      this.snow.material.uniforms.time.value = t;
    }

    // --- Forge smoke + embers. ---
    if (this._forge) {
      const f = this._forge;
      const sPos = f.smoke.geometry.attributes.position.array;
      const sLife = f.smoke.geometry.attributes.life.array;
      for (let i = 0; i < f.smokeCount; i++) {
        sLife[i] += dt * 0.18;
        if (sLife[i] >= 1) {
          sLife[i] = 0;
          sPos[i * 3] = f.origin.x + (Math.random() - 0.5) * 0.4;
          sPos[i * 3 + 1] = f.origin.y;
          sPos[i * 3 + 2] = f.origin.z + (Math.random() - 0.5) * 0.4;
        }
        sPos[i * 3] += Math.sin(t + i) * dt * 0.2;
        sPos[i * 3 + 1] += dt * 1.1;
        sPos[i * 3 + 2] += Math.cos(t + i) * dt * 0.15;
      }
      f.smoke.geometry.attributes.position.needsUpdate = true;
      f.smoke.geometry.attributes.life.needsUpdate = true;

      const ePos = f.embers.geometry.attributes.position.array;
      const eLife = f.embers.geometry.attributes.life.array;
      for (let i = 0; i < f.emberCount; i++) {
        eLife[i] += dt * 0.5;
        if (eLife[i] >= 1) {
          eLife[i] = 0;
          ePos[i * 3] = f.origin.x + (Math.random() - 0.5) * 0.3;
          ePos[i * 3 + 1] = f.origin.y;
          ePos[i * 3 + 2] = f.origin.z + (Math.random() - 0.5) * 0.3;
        }
        ePos[i * 3] += (Math.random() - 0.5) * dt * 0.8;
        ePos[i * 3 + 1] += dt * (1.5 + Math.random());
        ePos[i * 3 + 2] += (Math.random() - 0.5) * dt * 0.8;
      }
      f.embers.geometry.attributes.position.needsUpdate = true;
      f.embers.geometry.attributes.life.needsUpdate = true;
    }
  }
}
