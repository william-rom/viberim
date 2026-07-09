import * as THREE from 'three';
import { Input } from '../core/Input.js';
import { damp, clamp } from '../utils.js';

// Free-roam first-person controller for the city phase. Pointer-lock look,
// WASD movement, sprint, jump, gravity, terrain-following, and OBB collision
// against building colliders.
export class CityExplore {
  constructor(scene, terrain, camera, city, domElement) {
    this.scene = scene;
    this.terrain = terrain;
    this.camera = camera;
    this.city = city;
    this.domElement = domElement;

    this.input = new Input(domElement);

    // Player state.
    this.eyeHeight = 1.7;
    this.position = new THREE.Vector3(2, 0, 6);
    this.velocity = new THREE.Vector3();
    this.yaw = Math.PI; // facing toward the gate/north initially
    this.pitch = 0;
    this.onGround = true;

    // Tuning.
    this.walkSpeed = 4.2;
    this.sprintSpeed = 7.5;
    this.accel = 14;
    this.friction = 10;
    this.gravity = 18;
    this.jumpSpeed = 6.5;

    this.colliders = city.colliders;
    this._tmp = new THREE.Vector3();
    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._wish = new THREE.Vector3();
  }

  // Place the player at a start position with a given yaw.
  spawn(x, z, yaw = Math.PI) {
    this.position.set(x, this.terrain.heightAt(x, z), z);
    this.yaw = yaw;
    this.pitch = 0;
    this.velocity.set(0, 0, 0);
    this._applyCamera();
  }

  // Smoothly blend the camera from a given world position/look to the player
  // view over a short duration. Used for the cart→city handoff.
  beginTransition(fromPos, fromLookTarget, duration = 1.6) {
    this._trans = {
      from: fromPos.clone(),
      to: this.position.clone().add(new THREE.Vector3(0, this.eyeHeight, 0)),
      lookFrom: fromLookTarget.clone(),
      t: 0,
      duration,
    };
  }

  update(dt) {
    // Handle transition blend first.
    if (this._trans) {
      this._trans.t += dt;
      const u = clamp(this._trans.t / this._trans.duration, 0, 1);
      const e = u * u * (3 - 2 * u);
      // blend position
      this.camera.position.lerpVectors(this._trans.from, this._trans.to, e);
      // blend look: look at a point that moves from lookFrom toward forward
      const lookTarget = new THREE.Vector3();
      lookTarget.lerpVectors(this._trans.lookFrom, this._playerLookTarget(), e);
      this.camera.lookAt(lookTarget);
      if (u >= 1) this._trans = null;
      this.input.endFrame();
      return;
    }

    // --- Look (mouse) ---
    if (this.input.locked) {
      const sens = 0.0022;
      this.yaw -= this.input.mouseDX * sens;
      this.pitch -= this.input.mouseDY * sens;
      this.pitch = clamp(this.pitch, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
    }

    // --- Movement ---
    const [mx, mz] = this.input.moveAxis();
    this._forward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this._right.set(this._forward.z, 0, -this._forward.x);

    const speed = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight')
      ? this.sprintSpeed : this.walkSpeed;

    this._wish.set(0, 0, 0);
    this._wish.addScaledVector(this._forward, mz);
    this._wish.addScaledVector(this._right, mx);
    if (this._wish.lengthSq() > 0) this._wish.normalize().multiplyScalar(speed);

    // Horizontal velocity with accel/friction.
    const vx = this.velocity.x;
    const vz = this.velocity.z;
    this.velocity.x = damp(vx, this._wish.x, this._wish.x !== 0 ? this.accel : this.friction, dt);
    this.velocity.z = damp(vz, this._wish.z, this._wish.z !== 0 ? this.accel : this.friction, dt);

    // Jump + gravity.
    if (this.input.justPressed.has('Space') && this.onGround) {
      this.velocity.y = this.jumpSpeed;
      this.onGround = false;
    }
    this.velocity.y -= this.gravity * dt;

    // Integrate.
    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;
    this.position.z += this.velocity.z * dt;

    // Collision (resolve before ground snap).
    this._resolveCollisions();

    // Ground follow.
    const groundY = this.terrain.heightAt(this.position.x, this.position.z);
    if (this.position.y <= groundY) {
      this.position.y = groundY;
      this.velocity.y = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }

    // Keep player within a reasonable play area.
    const bound = 60;
    this.position.x = clamp(this.position.x, -bound, bound);
    this.position.z = clamp(this.position.z, -bound, bound + 20);

    this._applyCamera();
    this.input.endFrame();
  }

  _playerLookTarget() {
    const dir = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch)
    );
    return this.position.clone().add(new THREE.Vector3(0, this.eyeHeight, 0)).add(dir);
  }

  _applyCamera() {
    this.camera.position.set(
      this.position.x,
      this.position.y + this.eyeHeight,
      this.position.z
    );
    const look = this._playerLookTarget();
    this.camera.lookAt(look);
    // Head-bob when moving on ground.
    const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.onGround && horizSpeed > 0.5) {
      const bob = Math.sin(this._bobT ?? 0) * 0.04 * (horizSpeed / this.sprintSpeed);
      this.camera.position.y += bob;
    }
    this._bobT = (this._bobT ?? 0) + (horizSpeed > 0.5 ? horizSpeed * 0.9 * (1 / 60) : 0);
  }

  _resolveCollisions() {
    for (const c of this.colliders) {
      // Transform player into box local space.
      const dx = this.position.x - c.x;
      const dz = this.position.z - c.z;
      const cos = Math.cos(-c.rotY);
      const sin = Math.sin(-c.rotY);
      const lx = dx * cos - dz * sin;
      const lz = dx * sin + dz * cos;
      const hx = c.w / 2 + 0.4; // player radius padding
      const hz = c.d / 2 + 0.4;
      if (Math.abs(lx) < hx && Math.abs(lz) < hz) {
        // Penetration on each axis.
        const penX = hx - Math.abs(lx);
        const penZ = hz - Math.abs(lz);
        // Resolve along smallest penetration.
        if (penX < penZ) {
          const sign = lx >= 0 ? 1 : -1;
          const nx = sign * hx;
          // back to world
          const wx = nx * Math.cos(c.rotY) - lz * Math.sin(c.rotY) + c.x;
          // recompute z with corrected x
          this.position.x = wx;
          // kill velocity into the wall
          this.velocity.x *= 0.2;
        } else {
          const sign = lz >= 0 ? 1 : -1;
          const nz = sign * hz;
          const wz = lx * Math.sin(c.rotY) + nz * Math.cos(c.rotY) + c.z;
          this.position.z = wz;
          this.velocity.z *= 0.2;
        }
      }
    }
  }
}
