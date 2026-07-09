import * as THREE from 'three';
import { radialTexture } from '../utils.js';

export class Sky {
  constructor(scene, sunDirection) {
    this.scene = scene;
    this.sunDirection = sunDirection.clone().normalize();

    // Gradient sky dome.
    const geo = new THREE.SphereGeometry(600, 32, 16);
    this.mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x2a4a6b) },
        midColor: { value: new THREE.Color(0xb98a5e) },
        bottomColor: { value: new THREE.Color(0xd9b48a) },
        offset: { value: 33.0 },
        exponent: { value: 0.7 },
        sunDir: { value: this.sunDirection },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorldPosition;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPosition = wp.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 topColor;
        uniform vec3 midColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        uniform vec3 sunDir;
        varying vec3 vWorldPosition;
        void main() {
          vec3 dir = normalize(vWorldPosition + vec3(0.0, offset, 0.0));
          float h = dir.y;
          float t = pow(clamp(h, 0.0, 1.0), exponent);
          vec3 col = mix(bottomColor, midColor, smoothstep(-0.1, 0.25, h));
          col = mix(col, topColor, t);
          // sun glow near horizon
          float s = max(dot(normalize(vWorldPosition), sunDir), 0.0);
          col += vec3(1.0, 0.85, 0.6) * pow(s, 64.0) * 0.5;
          col += vec3(1.0, 0.75, 0.5) * pow(s, 8.0) * 0.18;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.dome = new THREE.Mesh(geo, this.mat);
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    // Sun disc / glow sprite (picks up bloom).
    const tex = radialTexture('rgba(255,247,225,1)', 'rgba(255,220,170,0)');
    this.sunSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: tex,
        color: 0xfff0d0,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      })
    );
    this.sunSprite.scale.setScalar(120);
    this.sunSprite.position.copy(this.sunDirection).multiplyScalar(520);
    scene.add(this.sunSprite);
  }
}
