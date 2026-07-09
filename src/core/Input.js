// Keyboard + mouse input with pointer-lock look. Tracks key states and
// accumulates mouse movement deltas each frame.
export class Input {
  constructor(domElement) {
    this.el = domElement;
    this.keys = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.locked = false;
    this.justPressed = new Set();

    this._onKeyDown = (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
      if (!this.keys.has(e.code)) this.justPressed.add(e.code);
      this.keys.add(e.code);
    };
    this._onKeyUp = (e) => this.keys.delete(e.code);
    this._onMouseMove = (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    };
    this._onLockChange = () => {
      this.locked = document.pointerLockElement === this.el;
      if (!this.locked) this.keys.clear();
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('pointerlockchange', this._onLockChange);
  }

  requestLock() {
    this.el.requestPointerLock();
  }

  // Call once per frame after consuming deltas.
  endFrame() {
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.justPressed.clear();
  }

  isDown(code) {
    return this.keys.has(code);
  }

  // Axis helpers.
  moveAxis() {
    // returns [x, z] where x = strafe, z = forward(+)/back(-)
    let x = 0, z = 0;
    if (this.isDown('KeyW')) z += 1;
    if (this.isDown('KeyS')) z -= 1;
    if (this.isDown('KeyD')) x += 1;
    if (this.isDown('KeyA')) x -= 1;
    return [x, z];
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('pointerlockchange', this._onLockChange);
  }
}
