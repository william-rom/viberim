import * as THREE from 'three';
import { Renderer } from './Renderer.js';
import { Sky } from '../world/Sky.js';
import { Terrain } from '../world/Terrain.js';
import { Vegetation } from '../world/Vegetation.js';
import { City } from '../world/City.js';
import { Particles } from '../world/Particles.js';
import { CartSequence } from '../phases/CartSequence.js';
import { CityExplore } from '../phases/CityExplore.js';
import { ExecutionSequence } from '../phases/ExecutionSequence.js';
import { Voice } from '../audio/Voice.js';
import { Ambient } from '../audio/Ambient.js';

const SUN_DIR = new THREE.Vector3(-0.55, 0.32, -0.78).normalize();
const BLOCK = new THREE.Vector3(4, 0, 12);

export class Game {
  constructor() {
    this.renderer = new Renderer();
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      62,
      window.innerWidth / window.innerHeight,
      0.1,
      1200
    );
    this.clock = new THREE.Clock();
    this.elapsed = 0;
    this.state = 'BOOT';
    this._update = null;

    this.voice = new Voice();
    this.ambient = new Ambient();
  }

  async init() {
    this._setupLights();
    this.terrain = new Terrain(this.scene, 1337);
    this.sky = new Sky(this.scene, SUN_DIR);
    this.vegetation = new Vegetation(this.scene, this.terrain, { seed: 991 });
    this.city = new City(this.scene, this.terrain);
    this.particles = new Particles(this.scene, this.camera);
    // Forge smoke + embers from the blacksmith chimney (convert local→world).
    if (this.city.forge && this.city.forge.userData.smokeOrigin) {
      this.scene.updateMatrixWorld(true);
      const origin = this.city.forge.userData.smokeOrigin.clone();
      this.city.forge.localToWorld(origin);
      this.particles.addForgeSmoke(origin);
    }

    this.scene.fog = new THREE.FogExp2(0x8a9098, 0.0019);

    this.renderer.setup(this.scene, this.camera);

    // Build the cart and place it at the start (not yet moving).
    const canvas = this.renderer.renderer.domElement;
    this.cartSequence = new CartSequence(this.scene, this.terrain, this.camera, canvas);
    this.cartSequence.reset();
    this.cartSequence.onComplete = () => this._onCartArrived();
    // Animate gate doors opening as the cart approaches.
    this.cartSequence.onGateProgress = (t) => {
      this.city.setGateOpen(t);
    };

    // Park the camera in the cart for the start screen backdrop.
    this._frameCartStatic();

    document.getElementById('loading').style.display = 'none';
    this._showStartScreen();
    this._loop();
  }

  _setupLights() {
    const hemi = new THREE.HemisphereLight(0xc8d8e8, 0x4a3a22, 0.7);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffd9a0, 3.0);
    sun.position.copy(SUN_DIR).multiplyScalar(180);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 420;
    const s = 120;
    sun.shadow.camera.left = -s;
    sun.shadow.camera.right = s;
    sun.shadow.camera.top = s;
    sun.shadow.camera.bottom = -s;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    this.sun = sun;
    this.scene.add(sun);
    this.scene.add(sun.target);
  }

  // --- Start screen ---

  _frameCartStatic() {
    // Position camera in the cart without starting the ride.
    this.cartSequence.elapsed = 0;
    this.cartSequence._placeCart(0);
    this.cartSequence.cart.update(0, 0);
    // Manually seat the camera using rotation (sideways on the left bench).
    const cs = this.cartSequence;
    cs._tmpPos.copy(cs.camBase).applyQuaternion(cs._cartQuat).add(cs._cartPos);
    this.camera.position.copy(cs._tmpPos);
    const cartYaw = Math.atan2(-cs._fwd.x, -cs._fwd.z);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(0, cartYaw + cs.camYawOffset, 0);
  }

  _showStartScreen() {
    this.state = 'START';
    const start = document.getElementById('start');
    start.hidden = false;
    // Gentle camera drift behind the start overlay for life.
    let t = 0;
    this._update = (dt) => {
      t += dt;
      const cs = this.cartSequence;
      cs._tmpPos.copy(cs.camBase);
      cs._tmpPos.x += Math.sin(t * 1.4) * 0.02;
      cs._tmpPos.y += Math.sin(t * 2.0) * 0.012;
      cs._tmpPos.applyQuaternion(cs._cartQuat).add(cs._cartPos);
      this.camera.position.copy(cs._tmpPos);
      // Subtle look drift via rotation.
      const cartYaw = Math.atan2(-cs._fwd.x, -cs._fwd.z);
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.y = cartYaw + cs.camYawOffset + Math.sin(t * 0.5) * 0.04;
      this.camera.rotation.x = Math.sin(t * 2.0) * 0.012;
      // Idle cart/horse subtle motion.
      cs.cart.update(t, 0.0);
    };

    start.addEventListener('click', () => this._beginIntro(), { once: true });
  }

  async _beginIntro() {
    this.state = 'INTRO';
    const start = document.getElementById('start');
    start.style.transition = 'opacity 0.6s ease';
    start.style.opacity = '0';
    setTimeout(() => { start.style.display = 'none'; }, 650);

    // Start ambient soundscape (user gesture unlocks audio).
    this.ambient.start();

    // Kick off the cart ride.
    this.cartSequence.reset();
    // Request pointer lock so the player can look around (user gesture = start click).
    this.cartSequence.requestLook();

    // Slow fade in from black (5s CSS transition).
    const fade = document.getElementById('fade');
    fade.style.transition = 'opacity 5s ease-in-out';
    fade.style.opacity = '0';
    setTimeout(() => { fade.style.display = 'none'; }, 5500);

    // Show a brief "move mouse to look around" hint.
    const hud = document.getElementById('hud');
    const hint = hud.querySelector('.hint');
    const origHint = hint.textContent;
    hint.textContent = 'Move mouse to look around';
    hud.style.opacity = '1';
    setTimeout(() => {
      hint.textContent = origHint;
      hud.style.opacity = '0';
    }, 6000);

    const sub = document.getElementById('subtitle');
    const subName = sub.querySelector('.name');
    const subLine = sub.querySelector('.line');

    // Full Skyrim opening dialogue. Each line is spoken by a character with
    // a distinct voice profile. Lines chain sequentially via TTS callbacks.
    const dialogue = [
      { who: 'ralof',   name: 'Ralof',            text: "Hey, you. You're finally awake." },
      { who: 'ralof',   name: 'Ralof',            text: "You were trying to cross the border, right? Walked right into that Imperial ambush, same as us, and that thief over there." },
      { who: 'lokir',   name: 'Lokir',            text: "Damn you Stormcloaks. Skyrim was fine until you came along. Empire was nice and lazy." },
      { who: 'lokir',   name: 'Lokir',            text: "If they hadn't been looking for you, I could've stolen that horse and been half way to Hammerfell." },
      { who: 'lokir',   name: 'Lokir',            text: "You there. You and me, we shouldn't be here. It's these Stormcloaks the Empire wants." },
      { who: 'ralof',   name: 'Ralof',            text: "We're all brothers and sisters in binds now, thief." },
      { who: 'soldier', name: 'Imperial Soldier', text: "Shut up back there!" },
      { who: 'lokir',   name: 'Lokir',            text: "And what's wrong with him?" },
      { who: 'ralof',   name: 'Ralof',            text: "Watch your tongue! You're speaking to Ulfric Stormcloak, the true High King." },
      { who: 'lokir',   name: 'Lokir',            text: "Ulfric? The Jarl of Windhelm? You're the leader of the rebellion." },
      { who: 'lokir',   name: 'Lokir',            text: "But if they captured you... Oh gods, where are they taking us?" },
      { who: 'ralof',   name: 'Ralof',            text: "I don't know where we're going, but Sovngarde awaits." },
      { who: 'lokir',   name: 'Lokir',            text: "No, this can't be happening. This isn't happening." },
      { who: 'ralof',   name: 'Ralof',            text: "Hey, what village are you from, horse thief?" },
      { who: 'lokir',   name: 'Lokir',            text: "Why do you care?" },
      { who: 'ralof',   name: 'Ralof',            text: "A Nord's last thoughts should be of home." },
      { who: 'lokir',   name: 'Lokir',            text: "Rorikstead. I'm... I'm from Rorikstead." },
      { who: 'soldier', name: 'Imperial Soldier', text: "General Tullius, sir! The headsman is waiting!" },
      { who: 'tullius', name: 'General Tullius',  text: "Good. Let's get this over with." },
      { who: 'lokir',   name: 'Lokir',            text: "Shor, Mara, Dibella, Kynareth, Akatosh. Divines, please help me." },
    ];

    let lineIdx = 0;
    let speaking = false;
    const PAUSE = 400; // ms between lines

    const showSub = (name, text) => {
      subName.textContent = name;
      subLine.textContent = text;
      sub.style.opacity = '1';
    };
    const hideSub = () => { sub.style.opacity = '0'; };

    const speakNext = () => {
      if (lineIdx >= dialogue.length) {
        speaking = false;
        this.cartSequence.cart.setSpeaker(null);
        return;
      }
      speaking = true;
      const line = dialogue[lineIdx];
      showSub(line.name, line.text);
      // Make other passengers look at the speaker.
      this.cartSequence.cart.setSpeaker(line.who);
      this.voice.speakAs(line.who, line.text).then(() => {
        setTimeout(() => {
          hideSub();
          lineIdx++;
          speakNext();
        }, PAUSE);
      });
    };

    this._update = (dt) => {
      this.cartSequence.update(dt);
      // Start dialogue after a brief beat (let the fade begin).
      if (!speaking && lineIdx === 0 && this.cartSequence.elapsed >= 1.5) {
        speakNext();
      }
    };
  }

  _onCartArrived() {
    this.state = 'EXECUTION';
    document.getElementById('subtitle').style.opacity = '0';

    // Close the gate behind the cart.
    this.city.setGateOpen(0);

    // Start the execution sequence.
    const canvas = this.renderer.renderer.domElement;
    this.execSequence = new ExecutionSequence(
      this.scene, this.terrain, this.camera,
      this.cartSequence, this.city, this.voice, canvas
    );
    this.execSequence.onComplete = () => this._onExecutionDone();

    this._update = (dt) => {
      this.execSequence.update(dt);
      // Keep cart passengers (driver) animated.
      this.cartSequence.cart.update(this.cartSequence.elapsed, 0, dt);
    };
  }

  _onExecutionDone() {
    this.state = 'CITY_EXPLORE';
    const canvas = this.renderer.renderer.domElement;

    // Clean up cart input.
    if (this.cartSequence) this.cartSequence.destroy();

    // Force-hide overlays.
    for (const id of ['fade', 'start', 'loading', 'title-card', 'explore-prompt']) {
      const el = document.getElementById(id);
      if (el) { el.style.display = 'none'; el.style.opacity = '0'; }
    }

    this.cityExplore = new CityExplore(
      this.scene, this.terrain, this.camera, this.city, canvas
    );

    // Spawn near the execution block (where the player was kneeling).
    this.cityExplore.spawn(BLOCK.x + 0.5, BLOCK.z - 1, Math.PI);
    this.cityExplore.input.requestLock();

    const hud = document.getElementById('hud');
    hud.style.opacity = '1';

    canvas.addEventListener('click', () => {
      if (this.state === 'CITY_EXPLORE' && !this.cityExplore.input.locked) {
        this.cityExplore.input.requestLock();
      }
    });

    this._update = (dt) => {
      this.cityExplore.update(dt);
    };
  }

  _showTitleCard(onDone) {
    let card = document.getElementById('title-card');
    if (!card) {
      card = document.createElement('div');
      card.id = 'title-card';
      card.style.cssText = [
        'position:fixed','inset:0','z-index:28',
        'display:flex','align-items:center','justify-content:center',
        'pointer-events:none',
        'font-family:Georgia,serif',
      ].join(';');
      card.innerHTML =
        '<h1 style="font-size:clamp(3rem,9vw,7rem);letter-spacing:0.15em;font-weight:400;' +
        'color:#f4ead0;text-shadow:0 0 30px rgba(0,0,0,0.95),0 0 8px rgba(0,0,0,0.9);' +
        'opacity:0;transition:opacity 1.4s ease">VIBERIM</h1>';
      document.body.appendChild(card);
    }
    const h1 = card.querySelector('h1');
    card.style.display = 'flex';
    // Fade in.
    requestAnimationFrame(() => { h1.style.opacity = '1'; });
    // Hold, then fade out.
    setTimeout(() => { h1.style.opacity = '0'; }, 2600);
    setTimeout(() => { card.style.display = 'none'; onDone(); }, 4200);
  }

  _showExplorePrompt() {
    // Create a lightweight "click to explore" overlay (also acts as the
    // pointer-lock user gesture).
    let prompt = document.getElementById('explore-prompt');
    if (!prompt) {
      prompt = document.createElement('div');
      prompt.id = 'explore-prompt';
      prompt.style.cssText = [
        'position:fixed','inset:0','z-index:30',
        'display:flex','flex-direction:column','align-items:center','justify-content:center',
        'background:radial-gradient(ellipse at center,rgba(20,18,14,0.15) 0%,rgba(0,0,0,0.4) 75%)',
        'cursor:pointer','user-select:none',
        'font-family:Georgia,serif','color:#efe6cf','text-align:center',
      ].join(';');
      prompt.innerHTML =
        '<div style="font-size:clamp(1.4rem,3vw,2.2rem);letter-spacing:0.08em;margin-bottom:0.6rem">You have arrived.</div>' +
        '<div style="font-size:clamp(0.8rem,1.4vw,1rem);letter-spacing:0.25em;text-transform:uppercase;opacity:0.65;animation:pulse 2.4s ease-in-out infinite">Click to explore</div>';
      document.body.appendChild(prompt);
    }
    prompt.style.display = 'flex';
    prompt.style.opacity = '1';
    prompt.style.transition = 'opacity 0.5s ease';

    const enter = () => {
      prompt.style.opacity = '0';
      setTimeout(() => { prompt.style.display = 'none'; }, 500);
      this._enterCityExplore();
    };
    prompt.addEventListener('click', enter, { once: true });
  }

  _enterCityExplore() {
    this.state = 'CITY_EXPLORE';
    const canvas = this.renderer.renderer.domElement;

    // Clean up the cart's input/pointer-lock so it doesn't conflict with city controls.
    if (this.cartSequence) this.cartSequence.destroy();

    // Force-hide ALL overlays to rule out any covering the canvas.
    for (const id of ['fade', 'start', 'loading', 'title-card', 'explore-prompt']) {
      const el = document.getElementById(id);
      if (el) { el.style.display = 'none'; el.style.opacity = '0'; }
    }

    this.cityExplore = new CityExplore(
      this.scene, this.terrain, this.camera, this.city, canvas
    );

    // Capture the cart's final camera pose BEFORE spawn moves the camera.
    const fromPos = this.camera.position.clone();
    const fromLook = new THREE.Vector3();
    this.camera.getWorldDirection(fromLook);
    fromLook.multiplyScalar(5).add(fromPos);

    // Spawn the player in the square, facing back toward the gate.
    this.cityExplore.spawn(2, 12, Math.PI * 0.85);
    this.cityExplore.beginTransition(fromPos, fromLook, 1.8);

    console.log('[CityExplore] spawned at', this.cityExplore.position,
      'camera at', this.camera.position);

    // Request pointer lock (this click is the user gesture).
    this.cityExplore.input.requestLock();

    // Show the HUD.
    const hud = document.getElementById('hud');
    hud.style.opacity = '1';

    // Re-lock on click if the user pressed Esc.
    canvas.addEventListener('click', () => {
      if (this.state === 'CITY_EXPLORE' && !this.cityExplore.input.locked) {
        this.cityExplore.input.requestLock();
      }
    });

    this._update = (dt) => {
      this.cityExplore.update(dt);
    };
  }

  _loop() {
    requestAnimationFrame(() => this._loop());
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.elapsed += dt;
    if (this._update) {
      try {
        this._update(dt);
      } catch (err) {
        console.error('[Game] update error:', err);
        this._update = null;
      }
    }
    // City is always alive once built.
    if (this.city) {
      try { this.city.update(this.elapsed); } catch (e) { console.error('[City]', e); }
    }
    if (this.particles) {
      try { this.particles.update(this.elapsed, dt); } catch (e) { console.error('[Particles]', e); }
    }
    this.renderer.render(dt);
  }
}
