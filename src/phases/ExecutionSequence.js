import * as THREE from 'three';
import { Humanoid } from '../world/Humanoid.js';
import { Dragon } from '../world/Dragon.js';
import { clamp } from '../utils.js';

// Cinematic execution sequence: cart stops → prisoners exit → Lokir flees →
// first execution → player called to block → dragon interrupts.
// Fully scripted camera + dialogue. No player control until free-roam.
const BLOCK = new THREE.Vector3(4, 0, 12);
const CART_STOP = new THREE.Vector3(10, 0, 0);
const LINE_POS = new THREE.Vector3(7, 0, 5);
const TOWER_POS = new THREE.Vector3(2, 0, 34);

const STATES = {
  CART_STOP:       { dur: 3.0 },
  EXIT_CART:       { dur: 2.5 },
  CAPTAIN_ORDERS:  { dur: 4.5 },
  LOKIR_FLEES:     { dur: 7.0 },
  RESUME:          { dur: 3.0 },
  FIRST_EXEC:      { dur: 8.0 },
  PLAYER_CALLED:   { dur: 3.5 },
  PLAYER_WALKS:    { dur: 5.0 },
  PLAYER_KNEELS:   { dur: 3.0 },
  PRE_DRAGON:      { dur: 3.5 },
  DRAGON_ARRIVES:  { dur: 7.0 },
  POST_DRAGON:     { dur: 4.0 },
};

export class ExecutionSequence {
  constructor(scene, terrain, camera, cartSequence, city, voice, domElement) {
    this.scene = scene;
    this.terrain = terrain;
    this.camera = camera;
    this.cart = cartSequence.cart;
    this.cartSeq = cartSequence;
    this.city = city;
    this.voice = voice;
    this.domElement = domElement;

    this.state = 'CART_STOP';
    this.stateTime = 0;
    this.elapsed = 0;
    this.done = false;
    this.onComplete = null;

    this._camPos = new THREE.Vector3();
    this._camLook = new THREE.Vector3();
    this._camFromPos = new THREE.Vector3();
    this._camFromLook = new THREE.Vector3();
    this._camToPos = new THREE.Vector3();
    this._camToLook = new THREE.Vector3();
    this._camTransT = 0;
    this._camTransDur = 1;
    this._shakeAmount = 0;

    this._characters = {};
    this._allHumanoids = [];

    this._buildExecutionArea();
    this._buildDragon();

    // Capture starting camera position for the first transition.
    this.camera.getWorldPosition(this._camFromPos);
    const fwd = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);
    this._camFromLook.copy(this._camFromPos).add(fwd.multiplyScalar(5));
  }

  _groundY(x, z) {
    return this.terrain.heightAt(x, z);
  }

  _buildExecutionArea() {
    // --- Chopping block ---
    const blockMat = new THREE.MeshStandardMaterial({ color: 0x3a2818, roughness: 0.95 });
    const block = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.4, 0.5, 8),
      blockMat
    );
    block.position.set(BLOCK.x, this._groundY(BLOCK.x, BLOCK.z) + 0.25, BLOCK.z);
    block.castShadow = true;
    block.receiveShadow = true;
    this.scene.add(block);
    // Blood stains.
    const stain = new THREE.Mesh(
      new THREE.CircleGeometry(0.6, 12),
      new THREE.MeshStandardMaterial({ color: 0x4a0a0a, roughness: 1.0 })
    );
    stain.rotation.x = -Math.PI / 2;
    stain.position.set(BLOCK.x, this._groundY(BLOCK.x, BLOCK.z) + 0.02, BLOCK.z);
    this.scene.add(stain);

    // --- Executioner ---
    const executioner = new Humanoid({
      shirt: 0x1a1a1a, pants: 0x0e0e0e, skin: 0xa87a5a, hair: 0x1a1208,
      hooded: true, height: 1.85,
    });
    executioner.group.position.set(BLOCK.x - 1.5, this._groundY(BLOCK.x - 1.5, BLOCK.z + 1), BLOCK.z + 1);
    executioner.group.rotation.y = Math.PI; // facing the line
    this.scene.add(executioner.group);
    this._characters.executioner = executioner;
    this._allHumanoids.push(executioner);

    // Executioner's axe.
    const axeMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3e, roughness: 0.4, metalness: 0.7 });
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 1.6, 6),
      new THREE.MeshStandardMaterial({ color: 0x3a2412, roughness: 0.9 })
    );
    handle.position.y = -0.8;
    const axeHead = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.25, 0.06),
      axeMat
    );
    axeHead.position.set(0.18, -1.4, 0);
    const axeGroup = new THREE.Group();
    axeGroup.add(handle);
    axeGroup.add(axeHead);
    axeGroup.position.set(0, 1.3, 0);
    axeGroup.rotation.z = 0.3;
    executioner.group.add(axeGroup);
    this._axe = axeGroup;

    // --- Imperial Captain ---
    const captain = new Humanoid({
      shirt: 0x3a3a4a, pants: 0x2a2a32, skin: 0xc08a5e, hair: 0x2a1d12,
      beard: true, height: 1.78,
    });
    captain.group.position.set(BLOCK.x + 1.5, this._groundY(BLOCK.x + 1.5, BLOCK.z + 0.5), BLOCK.z + 0.5);
    captain.group.rotation.y = Math.PI;
    this.scene.add(captain.group);
    this._characters.captain = captain;
    this._allHumanoids.push(captain);

    // --- General Tullius ---
    const tullius = new Humanoid({
      shirt: 0x4a4a5a, pants: 0x3a3a42, skin: 0xc0a080, hair: 0x5a4a3a,
      beard: true, height: 1.80,
    });
    tullius.group.position.set(BLOCK.x - 2.5, this._groundY(BLOCK.x - 2.5, BLOCK.z + 2), BLOCK.z + 2);
    tullius.group.rotation.y = Math.PI * 0.9;
    this.scene.add(tullius.group);
    this._characters.tullius = tullius;
    this._allHumanoids.push(tullius);

    // --- Extra prisoners (for the line) ---
    const prisoner1 = new Humanoid({
      shirt: 0x4a3a2a, pants: 0x2a2418, skin: 0xb88a5e, hair: 0x3a2a1a,
      beard: true, bound: true, height: 1.72,
    });
    prisoner1.group.position.set(LINE_POS.x + 1, this._groundY(LINE_POS.x + 1, LINE_POS.z), LINE_POS.z);
    prisoner1.group.rotation.y = 0;
    this.scene.add(prisoner1.group);
    this._characters.prisoner1 = prisoner1;
    this._allHumanoids.push(prisoner1);

    // --- Soldiers around perimeter ---
    const soldierPositions = [
      [12, 4, Math.PI],
      [0, 2, 0.3],
      [-5, 10, -0.5],
      [8, 16, Math.PI],
      [14, 8, Math.PI * 0.8],
    ];
    this._soldiers = [];
    for (const [x, z, rot] of soldierPositions) {
      const soldier = new Humanoid({
        shirt: 0x3a3a4a, pants: 0x2a2a32, skin: 0xc08a5e, hair: 0x1a1208,
        hooded: true, height: 1.78,
      });
      soldier.group.position.set(x, this._groundY(x, z), z);
      soldier.group.rotation.y = rot;
      this.scene.add(soldier.group);
      this._soldiers.push(soldier);
      this._allHumanoids.push(soldier);
    }

    // --- Villagers watching ---
    const villagerConfigs = [
      { x: -10, z: 14, rot: 0.5, shirt: 0x6a4a2a, skin: 0xc98a5e, hair: 0x2a1d12 },
      { x: -14, z: 8, rot: 1.0, shirt: 0x5a3a3a, skin: 0xb87a4e, hair: 0x3a2a1a, beard: true },
      { x: 10, z: 18, rot: Math.PI, shirt: 0x4a5a3a, skin: 0xd2a070, hair: 0x1a1208 },
    ];
    this._villagers = [];
    for (const c of villagerConfigs) {
      const v = new Humanoid({
        shirt: c.shirt, pants: 0x2a2418, skin: c.skin, hair: c.hair,
        beard: c.beard || false,
      });
      v.group.position.set(c.x, this._groundY(c.x, c.z), c.z);
      v.group.rotation.y = c.rot;
      this.scene.add(v.group);
      this._villagers.push(v);
      this._allHumanoids.push(v);
    }

    // --- Archer on the wall (for Lokir's death) ---
    this._archerPos = new THREE.Vector3(14, 6, -4);
  }

  _buildDragon() {
    this.dragon = new Dragon();
    this.scene.add(this.dragon.group);
  }

  // Extract passengers from the cart and reposition them in the courtyard.
  _extractPassengers() {
    const chars = this.cart.characters;
    if (!chars) return;

    // Ralof — in the prisoner line.
    if (chars.ralof) {
      this._detachFromCart(chars.ralof);
      chars.ralof.group.position.set(
        LINE_POS.x, this._groundY(LINE_POS.x, LINE_POS.z), LINE_POS.z
      );
      chars.ralof.group.rotation.y = 0;
      chars.ralof._sitting = false;
      chars.ralof._standingUp = false;
      this._resetLegs(chars.ralof);
      this._characters.ralof = chars.ralof;
      this._allHumanoids.push(chars.ralof);
    }

    // Ulfric — near Tullius, special prisoner.
    if (chars.ulfric) {
      this._detachFromCart(chars.ulfric);
      chars.ulfric.group.position.set(
        BLOCK.x - 3.5, this._groundY(BLOCK.x - 3.5, BLOCK.z + 2), BLOCK.z + 2
      );
      chars.ulfric.group.rotation.y = Math.PI * 0.9;
      chars.ulfric._sitting = false;
      chars.ulfric._standingUp = false;
      this._resetLegs(chars.ulfric);
      this._characters.ulfric = chars.ulfric;
      this._allHumanoids.push(chars.ulfric);
    }

    // Lokir — in the prisoner line (will flee).
    if (chars.lokir) {
      this._detachFromCart(chars.lokir);
      chars.lokir.group.position.set(
        LINE_POS.x + 2, this._groundY(LINE_POS.x + 2, LINE_POS.z), LINE_POS.z
      );
      chars.lokir.group.rotation.y = 0;
      chars.lokir._sitting = false;
      chars.lokir._standingUp = false;
      this._resetLegs(chars.lokir);
      this._characters.lokir = chars.lokir;
      this._allHumanoids.push(chars.lokir);
    }
  }

  _detachFromCart(humanoid) {
    const worldPos = new THREE.Vector3();
    const worldQuat = new THREE.Quaternion();
    humanoid.group.getWorldPosition(worldPos);
    humanoid.group.getWorldQuaternion(worldQuat);
    this.cart.group.remove(humanoid.group);
    this.scene.add(humanoid.group);
    humanoid.group.position.copy(worldPos);
    humanoid.group.quaternion.copy(worldQuat);
  }

  _resetLegs(humanoid) {
    if (humanoid.legs) {
      for (const leg of humanoid.legs) leg.rotation.x = 0;
    }
    if (humanoid.shins) {
      for (const shin of humanoid.shins) shin.rotation.x = 0;
    }
  }

  _speak(character, text, name) {
    const sub = document.getElementById('subtitle');
    if (!sub) return;
    sub.querySelector('.name').textContent = name || character;
    sub.querySelector('.line').textContent = text;
    sub.style.opacity = '1';
    return this.voice.speakAs(character, text).then(() => {
      setTimeout(() => { sub.style.opacity = '0'; }, 300);
    });
  }

  _setCamTrans(fromPos, fromLook, toPos, toLook, dur) {
    this._camFromPos.copy(fromPos);
    this._camFromLook.copy(fromLook);
    this._camToPos.copy(toPos);
    this._camToLook.copy(toLook);
    this._camTransT = 0;
    this._camTransDur = dur;
  }

  _standingCamPos(x, z) {
    return new THREE.Vector3(x, this._groundY(x, z) + 1.7, z);
  }

  _enterState(state) {
    this.state = state;
    this.stateTime = 0;

    switch (state) {
      case 'CART_STOP': {
        // Camera stays in cart. Captain approaches.
        this._speak('captain', 'Step toward the block when we call you. Run, and we\'ll catch you.', 'Captain');
        break;
      }
      case 'EXIT_CART': {
        // Extract passengers from cart and reposition them.
        this._extractPassengers();
        // Transition camera from cart-seated to standing in courtyard.
        const cartPos = new THREE.Vector3();
        this.camera.getWorldPosition(cartPos);
        const cartLook = new THREE.Vector3();
        const fwd = new THREE.Vector3();
        this.camera.getWorldDirection(fwd);
        cartLook.copy(cartPos).add(fwd.multiplyScalar(5));
        const standPos = this._standingCamPos(8, 3);
        const standLook = new THREE.Vector3(BLOCK.x, this._groundY(BLOCK.x, BLOCK.z) + 1.0, BLOCK.z);
        this._setCamTrans(cartPos, cartLook, standPos, standLook, 2.0);
        break;
      }
      case 'CAPTAIN_ORDERS': {
        // Captain looks at prisoners.
        const captain = this._characters.captain;
        if (captain) captain.lookAt(new THREE.Vector3(LINE_POS.x, this._groundY(LINE_POS.x, LINE_POS.z) + 1.5, LINE_POS.z));
        break;
      }
      case 'LOKIR_FLEES': {
        // Lokir panics and runs toward the gate.
        const lokir = this._characters.lokir;
        if (lokir) {
          this._speak('lokir', 'No! I\'m not a rebel! You can\'t do this!', 'Lokir');
          // After 2s, start running.
          setTimeout(() => {
            if (lokir && !lokir._fallen) {
              lokir.walkTo(new THREE.Vector3(13, 0, -4), 4.0);
            }
          }, 2000);
          // After 4.5s, he's shot.
          setTimeout(() => {
            if (lokir && !lokir._fallen) {
              lokir._fallenGroundY = this._groundY(lokir.group.position.x, lokir.group.position.z);
              lokir.fall();
            }
          }, 4500);
        }
        break;
      }
      case 'RESUME': {
        this._speak('captain', 'Anyone else feel like running?', 'Captain');
        break;
      }
      case 'FIRST_EXEC': {
        // First prisoner walks to block and kneels.
        const p1 = this._characters.prisoner1;
        if (p1) {
          p1.walkTo(new THREE.Vector3(BLOCK.x, 0, BLOCK.z - 1), 1.5);
        }
        // After 4s, kneel. After 6s, axe swings.
        setTimeout(() => {
          const p1 = this._characters.prisoner1;
          if (p1) p1.kneel();
        }, 4000);
        setTimeout(() => {
          if (this._axe) this._axe.rotation.z = -1.2; // swing down
        }, 6000);
        break;
      }
      case 'PLAYER_CALLED': {
        this._speak('captain', 'You. Step forward.', 'Captain');
        break;
      }
      case 'PLAYER_WALKS': {
        // Camera walks forward toward the block.
        const fromPos = this._standingCamPos(8, 3);
        const fromLook = new THREE.Vector3(BLOCK.x, this._groundY(BLOCK.x, BLOCK.z) + 1.0, BLOCK.z);
        const toPos = new THREE.Vector3(BLOCK.x + 0.5, this._groundY(BLOCK.x + 0.5, BLOCK.z - 1) + 1.7, BLOCK.z - 1);
        const toLook = new THREE.Vector3(BLOCK.x, this._groundY(BLOCK.x, BLOCK.z) + 0.3, BLOCK.z);
        this._setCamTrans(fromPos, fromLook, toPos, toLook, 4.0);
        break;
      }
      case 'PLAYER_KNEELS': {
        // Camera drops to kneeling height.
        const curPos = new THREE.Vector3();
        this.camera.getWorldPosition(curPos);
        const curLook = new THREE.Vector3();
        const fwd = new THREE.Vector3();
        this.camera.getWorldDirection(fwd);
        curLook.copy(curPos).add(fwd.multiplyScalar(5));
        const kneelPos = new THREE.Vector3(BLOCK.x + 0.5, this._groundY(BLOCK.x + 0.5, BLOCK.z - 1) + 0.5, BLOCK.z - 1);
        const kneelLook = new THREE.Vector3(BLOCK.x, this._groundY(BLOCK.x, BLOCK.z) + 0.3, BLOCK.z);
        this._setCamTrans(curPos, curLook, kneelPos, kneelLook, 2.0);
        // Executioner raises axe.
        if (this._axe) this._axe.rotation.z = 1.5;
        break;
      }
      case 'PRE_DRAGON': {
        // Characters look up, uneasy.
        const lookUp = new THREE.Vector3(TOWER_POS.x, 20, TOWER_POS.z);
        for (const h of this._allHumanoids) {
          h.lookUp(0.6);
          h.lookAt(lookUp);
        }
        break;
      }
      case 'DRAGON_ARRIVES': {
        // Dragon flies in from the distance and lands on the tower.
        const towerTop = new THREE.Vector3(
          TOWER_POS.x,
          this._groundY(TOWER_POS.x, TOWER_POS.z) + 11,
          TOWER_POS.z
        );
        const startPos = new THREE.Vector3(-60, 35, -40);
        this.dragon.flyTo(startPos, towerTop, 5.0);
        this._shakeAmount = 0;
        // After landing, roar.
        setTimeout(() => {
          this.dragon.roar();
          this._shakeAmount = 0.8;
        }, 5200);
        break;
      }
      case 'POST_DRAGON': {
        // Brief dialogue, then transition.
        this._speak('ralof', 'We need to get out of here, come on!', 'Ralof');
        break;
      }
    }
  }

  update(dt) {
    if (this.done) return;
    this.elapsed += dt;
    this.stateTime += dt;

    // Update all humanoids.
    const t = this.elapsed;
    for (const h of this._allHumanoids) {
      h.update(t, { dt });
    }

    // Update dragon.
    this.dragon.update(t, dt);

    // Update axe swing recovery.
    if (this._axe && this.state !== 'PLAYER_KNEELS' && this.state !== 'PRE_DRAGON') {
      this._axe.rotation.z += (0.3 - this._axe.rotation.z) * 0.05;
    }

    // Camera transitions or state-based camera.
    if (this._camTransDur > 0 && this._camTransT < this._camTransDur) {
      this._camTransT += dt;
      const u = clamp(this._camTransT / this._camTransDur, 0, 1);
      const e = u * u * (3 - 2 * u);
      this.camera.position.lerpVectors(this._camFromPos, this._camToPos, e);
      const look = new THREE.Vector3().lerpVectors(this._camFromLook, this._camToLook, e);
      this.camera.lookAt(look);
    } else {
      // State-based camera (after transition completes).
      this._updateStateCamera(dt);
    }

    // Screen shake.
    if (this._shakeAmount > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this._shakeAmount;
      this.camera.position.y += (Math.random() - 0.5) * this._shakeAmount;
      this._shakeAmount *= 0.95;
      if (this._shakeAmount < 0.01) this._shakeAmount = 0;
    }

    // State timer.
    const stateCfg = STATES[this.state];
    if (stateCfg && this.stateTime >= stateCfg.dur) {
      const next = this._nextState(this.state);
      if (next) {
        this._enterState(next);
      } else {
        this.done = true;
        if (this.onComplete) this.onComplete();
      }
    }
  }

  _nextState(state) {
    const order = [
      'CART_STOP', 'EXIT_CART', 'CAPTAIN_ORDERS', 'LOKIR_FLEES',
      'RESUME', 'FIRST_EXEC', 'PLAYER_CALLED', 'PLAYER_WALKS',
      'PLAYER_KNEELS', 'PRE_DRAGON', 'DRAGON_ARRIVES', 'POST_DRAGON',
    ];
    const idx = order.indexOf(state);
    if (idx < 0 || idx >= order.length - 1) return null;
    return order[idx + 1];
  }

  _updateStateCamera(dt) {
    // During states without active transitions, hold the camera at the last
    // target position, but allow subtle sway for life.
    const sway = Math.sin(this.elapsed * 0.7) * 0.03;
    const nod = Math.sin(this.elapsed * 1.5) * 0.015;

    switch (this.state) {
      case 'CART_STOP': {
        // Keep camera in cart — let cart seq camera stay.
        break;
      }
      case 'CAPTAIN_ORDERS':
      case 'LOKIR_FLEES':
      case 'RESUME':
      case 'FIRST_EXEC':
      case 'PLAYER_CALLED': {
        // Standing view of the execution area, with subtle sway.
        this.camera.position.x = this._camToPos.x + sway;
        this.camera.position.y = this._camToPos.y + nod;
        this.camera.position.z = this._camToPos.z;
        // Look at block area.
        const lookY = this._groundY(BLOCK.x, BLOCK.z) + 1.0;
        this.camera.lookAt(BLOCK.x + sway, lookY, BLOCK.z);
        break;
      }
      case 'PLAYER_WALKS': {
        // Camera is handled by transition — nothing extra.
        break;
      }
      case 'PLAYER_KNEELS':
      case 'PRE_DRAGON': {
        // Kneeling view, look at block / slightly up.
        this.camera.position.x = this._camToPos.x + sway * 0.5;
        this.camera.position.y = this._camToPos.y;
        this.camera.position.z = this._camToPos.z;
        const lookY = this.state === 'PRE_DRAGON'
          ? this._groundY(TOWER_POS.x, TOWER_POS.z) + 8
          : this._groundY(BLOCK.x, BLOCK.z) + 0.3;
        const lookZ = this.state === 'PRE_DRAGON' ? TOWER_POS.z : BLOCK.z;
        const lookX = this.state === 'PRE_DRAGON' ? TOWER_POS.x : BLOCK.x;
        this.camera.lookAt(lookX, lookY, lookZ);
        break;
      }
      case 'DRAGON_ARRIVES': {
        // Look up at the dragon on the tower.
        this.camera.position.x = this._camToPos.x + sway * 0.3;
        this.camera.position.y = this._camToPos.y;
        this.camera.position.z = this._camToPos.z;
        const dragonPos = this.dragon.group.position;
        this.camera.lookAt(dragonPos.x, dragonPos.y, dragonPos.z);
        break;
      }
      case 'POST_DRAGON': {
        // Same as dragon arrives.
        this.camera.position.x = this._camToPos.x + sway * 0.3;
        this.camera.position.y = this._camToPos.y;
        this.camera.position.z = this._camToPos.z;
        const dragonPos = this.dragon.group.position;
        this.camera.lookAt(dragonPos.x, dragonPos.y, dragonPos.z);
        break;
      }
    }
  }
}
