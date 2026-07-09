import * as THREE from 'three';
import { Cart } from '../world/Cart.js';
import { Input } from '../core/Input.js';
import { damp, smoothstep, lerp, clamp } from '../utils.js';

// The cinematic cart ride. Drives a Cart along a CatmullRomCurve3 toward the
// city, with a first-person camera seated in the back. The player can look
// around freely with the mouse (pointer lock). Emits an event when the ride
// completes (cart reaches the gate).
export class CartSequence {
  constructor(scene, terrain, camera, domElement) {
    this.scene = scene;
    this.terrain = terrain;
    this.camera = camera;
    this.domElement = domElement;

    this.cart = new Cart();
    scene.add(this.cart.group);

    this.curve = this._buildPath();
    this._debugPath = false;

    this.progress = 0; // 0..1 along curve
    this.speed = 0.018;
    this.duration = 120; // seconds for full ride (fits full dialogue)
    this.elapsed = 0;
    this.done = false;
    this.onComplete = null;

    // Camera rig offsets (relative to cart). The player sits on the LEFT bench
    // (-X), facing +X across the cart. Travel direction (-Z) is to the player's
    // left; Ulfric (+Z) is to the player's right. Y is seated eye height.
    this.camBase = new THREE.Vector3(-0.5, 1.8, 0.0);
    // Yaw offset: rotate 90° so default view faces +X (across the cart, toward
    // Ralof & Lokir on the opposite bench).
    this.camYawOffset = -Math.PI / 2;
    this._tmpPos = new THREE.Vector3();
    this._cartPos = new THREE.Vector3();
    this._cartQuat = new THREE.Quaternion();
    this._up = new THREE.Vector3(0, 1, 0);
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();

    // Mouse look state.
    this.input = new Input(domElement);
    this.userYaw = 0;
    this.userPitch = 0;
    this.lookSens = 0.0022;

    // Click-to-relock handler during the cart ride.
    this._relockHandler = () => {
      if (!this.done && !this.input.locked) this.input.requestLock();
    };
    domElement.addEventListener('click', this._relockHandler);

    this.camera.rotation.order = 'YXZ';
  }

  _buildPath() {
    // Path comes from the north-east, winding through the valley toward the
    // city gate (which will sit near z = +30, facing north). We sample terrain
    // height so the path sits on the ground.
    const pts = [
      [-120, 8], [-95, -40], [-70, -90], [-30, -120],
      [10, -110], [20, -80], [18, -40], [14, -6],
    ];
    const vec3pts = pts.map(([x, z]) => {
      const y = this.terrain.heightAt(x, z);
      return new THREE.Vector3(x, y, z);
    });
    const curve = new THREE.CatmullRomCurve3(vec3pts, false, 'catmullrom', 0.4);
    return curve;
  }

  // Position the cart at the start.
  reset() {
    this.progress = 0;
    this.elapsed = 0;
    this.done = false;
    this._placeCart(0);
  }

  _placeCart(u) {
    const p = this.curve.getPointAt(u);
    const tangent = this.curve.getTangentAt(u).normalize();
    // Terrain follow: sample height under the cart.
    const groundY = this.terrain.heightAt(p.x, p.z);
    this._cartPos.set(p.x, groundY, p.z);
    this.cart.group.position.copy(this._cartPos);

    // Orient cart to face the tangent.
    this._fwd.set(tangent.x, 0, tangent.z).normalize();
    this._right.crossVectors(this._up, this._fwd).normalize();
    this._cartQuat.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(this._right, this._up, this._fwd.clone().negate())
    );
    this.cart.group.quaternion.copy(this._cartQuat);

    // Slight cart bob.
    const bob = Math.sin(this.elapsed * 2.2) * 0.025;
    this.cart.group.position.y += bob;
  }

  update(dt) {
    if (this.done) {
      this.input.endFrame();
      return;
    }
    this.elapsed += dt;

    // Ease speed: slow start, cruise, slow approach at the end.
    const u = Math.min(this.elapsed / this.duration, 1);
    const eased = this._ease(u);
    this.progress = eased;

    this._placeCart(this.progress);
    this.cart.update(this.elapsed, 1.0, dt);

    // Open gate doors as cart approaches (last 12% of the ride).
    if (this.onGateProgress) {
      const gateT = smoothstep(0.72, 0.92, u);
      this.onGateProgress(gateT);
    }

    // --- Mouse look: accumulate yaw/pitch from pointer movement. ---
    if (this.input.locked) {
      this.userYaw -= this.input.mouseDX * this.lookSens;
      this.userPitch -= this.input.mouseDY * this.lookSens;
      // Clamp pitch so you can't flip upside down.
      this.userPitch = clamp(this.userPitch, -1.0, 0.85);
    }
    this.input.endFrame();

    // --- Camera position: seated in the cart with subtle head sway. ---
    this._tmpPos.copy(this.camBase);
    const sway = Math.sin(this.elapsed * 1.4) * 0.025;
    const nod = Math.sin(this.elapsed * 2.0) * 0.015;
    this._tmpPos.x += sway;
    this._tmpPos.y += nod;
    this._tmpPos.applyQuaternion(this._cartQuat).add(this._cartPos);
    this.camera.position.copy(this._tmpPos);

    // --- Camera rotation: cart base yaw + sideways offset + user look + drift. ---
    // cartYaw faces the cart's forward direction; camYawOffset rotates the
    // default view to face across the cart (+X in local space).
    const cartYaw = Math.atan2(-this._fwd.x, -this._fwd.z);
    const lookSway = Math.sin(this.elapsed * 0.5) * 0.04;
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = cartYaw + this.camYawOffset + this.userYaw + lookSway;
    this.camera.rotation.x = this.userPitch + nod;

    // FOV subtle widen when "speed" feels higher (mid-ride).
    const fovTarget = 62 + smoothstep(0.15, 0.5, u) * 6 - smoothstep(0.7, 1, u) * 6;
    this.camera.fov = lerp(this.camera.fov, fovTarget, 1 - Math.exp(-3 * dt));
    this.camera.updateProjectionMatrix();

    if (u >= 1) {
      this.done = true;
      if (this.onComplete) this.onComplete();
    }
  }

  requestLook() {
    this.input.requestLock();
  }

  destroy() {
    this.domElement.removeEventListener('click', this._relockHandler);
    this.input.destroy();
  }

  _ease(u) {
    // Slow-in, cruise, slow-out.
    return smoothstep(0, 1, u);
  }

  // The world-space position where the cart ends (for the city gate placement).
  get endPosition() {
    return this.curve.getPointAt(1).clone();
  }

  get endTangent() {
    return this.curve.getTangentAt(1).clone();
  }
}
