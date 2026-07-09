import * as THREE from 'three';
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  BloomEffect,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
  NoiseEffect,
  SMAAEffect,
  KernelSize,
} from 'postprocessing';
import { clamp } from '../utils.js';

export class Renderer {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Tone mapping is handled by the ToneMappingEffect in the composer.
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    const canvas = this.renderer.domElement;
    canvas.style.position = 'fixed';
    canvas.style.inset = '0';
    document.getElementById('app').appendChild(canvas);

    this.composer = null;
    this.bloom = null;
    this.vignette = null;
    this._scene = null;
    this._camera = null;

    window.addEventListener('resize', () => this.resize());
  }

  setup(scene, camera) {
    this._scene = scene;
    this._camera = camera;

    this.composer = new EffectComposer(this.renderer, {
      frameBufferType: THREE.HalfFloatType,
    });
    this.composer.setSize(window.innerWidth, window.innerHeight);

    this.composer.addPass(new RenderPass(scene, camera));

    this.bloom = new BloomEffect({
      intensity: 1.15,
      luminanceThreshold: 0.5,
      luminanceSmoothing: 0.3,
      mipmapBlur: true,
      kernelSize: KernelSize.LARGE,
      radius: 0.7,
    });

    const tone = new ToneMappingEffect({
      mode: ToneMappingMode.ACES_FILMIC,
      whitePoint: 4.0,
      middleGrey: 0.6,
    });

    this.vignette = new VignetteEffect({
      darkness: 0.7,
      offset: 0.28,
    });

    const noise = new NoiseEffect({ premultiply: true });
    noise.blendMode.opacity.value = 0.035;

    const smaa = new SMAAEffect();

    this.composer.addPass(
      new EffectPass(camera, this.bloom, tone, this.vignette, noise, smaa)
    );
  }

  setBloomIntensity(v) {
    if (this.bloom) this.bloom.intensity = v;
  }

  setVignette(darkness, offset) {
    if (this.vignette) {
      this.vignette.darkness = darkness;
      this.vignette.offset = offset;
    }
  }

  render(deltaTime) {
    if (this.composer) this.composer.render(deltaTime);
    else this.renderer.render(this._scene, this._camera);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    if (this._camera) {
      this._camera.aspect = w / h;
      this._camera.updateProjectionMatrix();
    }
    if (this.composer) this.composer.setSize(w, h);
  }

  get aspect() {
    return window.innerWidth / window.innerHeight;
  }
}
