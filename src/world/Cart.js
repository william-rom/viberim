import * as THREE from 'three';
import { Humanoid } from './Humanoid.js';

// A wooden prisoner cart pulled by a single horse, with seated passengers.
// The group's origin sits at ground level between the rear wheels.
// Call update(t) each frame to spin wheels and animate the horse's gait.
export class Cart {
  constructor() {
    this.group = new THREE.Group();
    this.wheels = [];
    this._buildCart();
    this._buildHorse();
    this._buildPassengers();
  }

  _mat(color, rough = 0.9, metal = 0.0) {
    return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
  }

  _buildCart() {
    const woodDark = this._mat(0x3a2a18);
    const woodMid = this._mat(0x5a4028);
    const woodLight = this._mat(0x6b4f30);
    const iron = this._mat(0x2a2a2e, 0.5, 0.8);

    // Floor.
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(2.0, 0.12, 3.0),
      woodMid
    );
    floor.position.y = 0.85;
    floor.castShadow = true;
    floor.receiveShadow = true;
    this.group.add(floor);

    // Side rails (low walls) — vertical posts + horizontal planks.
    // Kept low so the camera can see over them.
    const railH = 0.38;
    const postGeo = new THREE.BoxGeometry(0.08, railH, 0.08);
    const plankGeo = new THREE.BoxGeometry(2.0, 0.07, 0.05);

    for (const side of [-1, 1]) {
      // posts
      for (const z of [-1.4, -0.5, 0.5, 1.4]) {
        const post = new THREE.Mesh(postGeo, woodDark);
        post.position.set(side * 0.96, 0.85 + railH / 2, z);
        post.castShadow = true;
        this.group.add(post);
      }
      // top + mid planks
      for (const yOff of [railH, railH * 0.5]) {
        const plank = new THREE.Mesh(plankGeo, woodLight);
        plank.position.set(side * 0.96, 0.85 + yOff, 0);
        plank.castShadow = true;
        this.group.add(plank);
      }
    }
    // Back rail.
    const backPlank = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.1, 3.0),
      woodLight
    );
    backPlank.position.set(0, 0.85 + railH, 1.45);
    this.group.add(backPlank);

    // Bench seat at the front (driver's seat).
    const bench = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.1, 0.5),
      woodDark
    );
    bench.position.set(0, 1.35, -1.0);
    bench.castShadow = true;
    this.group.add(bench);

    // Two inward-facing prisoner benches (left & right), running along Z.
    // Left bench: User + Ulfric.  Right bench: Ralof + Lokir.
    // Raised so seated shins reach the cart floor (~0.91).
    for (const side of [-1, 1]) {
      const seatX = side * 0.72;
      // Seat board.
      const seat = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.08, 2.2),
        woodDark
      );
      seat.position.set(seatX, 1.2, 0.2);
      seat.castShadow = true;
      seat.receiveShadow = true;
      this.group.add(seat);
      // Backrest (facing inward — on the outer side).
      const back = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.5, 2.2),
        woodDark
      );
      back.position.set(seatX + side * 0.22, 1.45, 0.2);
      back.castShadow = true;
      this.group.add(back);
      // Legs.
      for (const z of [-0.8, 1.2]) {
        const leg = new THREE.Mesh(
          new THREE.BoxGeometry(0.45, 0.1, 0.08),
          woodMid
        );
        leg.position.set(seatX, 1.06, z);
        this.group.add(leg);
      }
    }

    // Draw pole to the horse (slightly offset so it's not dead-center in view).
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 2.4, 8),
      woodDark
    );
    pole.rotation.x = Math.PI / 2;
    pole.position.set(0, 0.95, -2.6);
    pole.rotation.z = 0.08;
    this.group.add(pole);

    // Wheels (4).
    const wheelGeo = new THREE.TorusGeometry(0.62, 0.06, 10, 24);
    const spokeGeo = new THREE.BoxGeometry(0.04, 1.1, 0.04);
    for (const [x, z] of [[-1.0, -0.8], [1.0, -0.8], [-1.0, 1.0], [1.0, 1.0]]) {
      const wheel = new THREE.Group();
      const rim = new THREE.Mesh(wheelGeo, woodDark);
      rim.castShadow = true;
      wheel.add(rim);
      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.1, 0.12, 10),
        iron
      );
      hub.rotation.x = Math.PI / 2;
      wheel.add(hub);
      for (let i = 0; i < 6; i++) {
        const spoke = new THREE.Mesh(spokeGeo, woodLight);
        spoke.rotation.z = (i / 6) * Math.PI * 2;
        wheel.add(spoke);
      }
      wheel.rotation.y = Math.PI / 2;
      wheel.position.set(x, 0.62, z);
      this.group.add(wheel);
      this.wheels.push(wheel);
    }
  }

  _buildHorse() {
    const horse = new THREE.Group();
    const matBody = this._mat(0x5a3a22, 0.85);
    const matMane = this._mat(0x1a120a, 0.8);
    const matHoof = this._mat(0x141008, 0.6);

    // Body.
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.32, 1.1, 6, 12),
      matBody
    );
    body.rotation.z = Math.PI / 2;
    body.position.y = 1.35;
    body.castShadow = true;
    horse.add(body);

    // Neck.
    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.22, 0.7, 8),
      matBody
    );
    neck.position.set(-0.7, 1.7, 0);
    neck.rotation.z = -0.7;
    neck.castShadow = true;
    horse.add(neck);

    // Head.
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.3, 0.28),
      matBody
    );
    head.position.set(-1.05, 1.95, 0);
    head.rotation.z = 0.2;
    head.castShadow = true;
    horse.add(head);

    // Snout.
    const snout = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.2, 0.24),
      matBody
    );
    snout.position.set(-1.35, 1.85, 0);
    horse.add(snout);

    // Mane (a row of small cones).
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(
        new THREE.ConeGeometry(0.07, 0.22, 6),
        matMane
      );
      m.position.set(-0.35 - i * 0.12, 1.95 - i * 0.04, 0);
      m.rotation.z = -0.3;
      horse.add(m);
    }

    // Legs (for gait animation).
    this.horseLegs = [];
    const legPositions = [
      [-0.5, 0.6], [0.5, 0.6], [-0.5, -0.6], [0.5, -0.6],
    ];
    for (const [x, z] of legPositions) {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.05, 1.1, 6),
        matBody
      );
      leg.position.set(x, 0.65, z);
      leg.castShadow = true;
      // pivot at top
      leg.geometry.translate(0, -0.55, 0);
      leg.position.y = 1.2;
      horse.add(leg);
      const hoof = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 0.08, 6),
        matHoof
      );
      hoof.position.y = -0.55;
      leg.add(hoof);
      this.horseLegs.push(leg);
    }

    // Tail.
    const tail = new THREE.Mesh(
      new THREE.ConeGeometry(0.1, 0.6, 6),
      matMane
    );
    tail.position.set(0.85, 1.1, 0);
    tail.rotation.z = 2.6;
    horse.add(tail);

    horse.position.set(0, 0, -4.0);
    horse.rotation.y = -Math.PI / 2;
    this.horse = horse;
    this.group.add(horse);
  }

  _buildPassengers() {
    this.passengers = [];
    this.characters = {};

    // Bench seat top is at y≈1.24. When sitting, the hip is at h*0.18 in
    // local space, so group y = 1.24 - h*0.18 to put the butt on the bench.
    const seatY = (h) => 1.24 - h * 0.18;

    // --- Driver (Imperial soldier on the front bench) ---
    const driver = new Humanoid({
      shirt: 0x5a4a2a, pants: 0x2a2418, skin: 0xb87a4e, hair: 0x1a1208,
      hooded: true, beard: true, sitting: true,
    });
    driver.group.position.set(0, 1.4 - 1.75 * 0.18, -1.0);
    driver.group.rotation.y = Math.atan2(-0.5 - 0, 0 - (-1.0)); // face the player
    this.group.add(driver.group);
    this.passengers.push({ humanoid: driver, sitting: true, phase: 0 });
    this.characters.driver = driver;

    // --- Ulfric Stormcloak — on the LEFT bench, to the player's RIGHT (+Z) ---
    // Long blonde hair, black facemask over lower face, hands bound.
    const ulfric = new Humanoid({
      shirt: 0x2a3a5a,
      pants: 0x1a1a22,
      skin: 0xc0a070,
      hair: 0xd4a838,       // blonde
      longHair: true,
      facemask: true,       // black cloth over lower face
      height: 1.8,
      sitting: true,
      eyeColor: 0x5a7a9a,
    });
    ulfric.group.position.set(-0.5, seatY(1.8), 0.6);
    ulfric.group.rotation.y = Math.atan2(-0.5 - (-0.5), 0 - 0.6); // face the player
    this.group.add(ulfric.group);
    this.passengers.push({ humanoid: ulfric, sitting: true, phase: 0.5 });
    this.characters.ulfric = ulfric;

    // --- Ralof — on the RIGHT bench (+X), facing the player ---
    const ralof = new Humanoid({
      shirt: 0x2a4a6a,
      pants: 0x2a2418,
      skin: 0xc98a5e,
      hair: 0x3a2a1a,
      beard: true,
      height: 1.78,
      sitting: true,
    });
    ralof.group.position.set(0.5, seatY(1.78), 0.4);
    ralof.group.rotation.y = Math.atan2(-0.5 - 0.5, 0 - 0.4); // face the player
    this.group.add(ralof.group);
    this.passengers.push({ humanoid: ralof, sitting: true, phase: 1.2 });
    this.characters.ralof = ralof;

    // --- Lokir (horse thief) — on the RIGHT bench, front seat ---
    const lokir = new Humanoid({
      shirt: 0x6a4a2a,
      pants: 0x2a2418,
      skin: 0xa8703e,
      hair: 0x0e0a06,
      height: 1.72,
      sitting: true,
    });
    lokir.group.position.set(0.5, seatY(1.72), -0.4);
    lokir.group.rotation.y = Math.atan2(-0.5 - 0.5, 0 - (-0.4)); // face the player
    this.group.add(lokir.group);
    this.passengers.push({ humanoid: lokir, sitting: true, phase: 2.4 });
    this.characters.lokir = lokir;
  }

  // Make all characters look toward the speaker (by character key).
  // Pass null to return everyone to neutral.
  setSpeaker(characterKey) {
    if (!this.characters) return;
    // Stop all talking first.
    for (const char of Object.values(this.characters)) {
      char.setTalking(false);
    }
    const speaker = characterKey ? this.characters[characterKey] : null;
    const speakerPos = new THREE.Vector3();
    if (speaker) {
      speaker.setTalking(true);
      speaker.group.getWorldPosition(speakerPos);
      speakerPos.y += 1.5; // head height
    }
    for (const [key, char] of Object.entries(this.characters)) {
      if (key === characterKey || !speaker) {
        char.lookAt(null);
      } else {
        char.lookAt(speakerPos);
      }
    }
  }

  update(t, speed = 1, dt = 0.016) {
    // Spin wheels proportional to speed.
    const spin = t * speed * 3.0;
    for (const w of this.wheels) w.rotation.x = -spin;

    // Horse gait.
    const gait = t * speed * 6;
    if (this.horseLegs) {
      this.horseLegs[0].rotation.z = Math.sin(gait) * 0.4;
      this.horseLegs[1].rotation.z = -Math.sin(gait) * 0.4;
      this.horseLegs[2].rotation.z = -Math.sin(gait + Math.PI) * 0.4;
      this.horseLegs[3].rotation.z = Math.sin(gait + Math.PI) * 0.4;
    }
    // Horse head bob (subtle).
    if (this.horse) {
      this.horse.rotation.x = Math.sin(gait * 0.5) * 0.008;
    }

    // Passengers: breathe + lip-sync.
    for (const p of this.passengers) {
      p.humanoid.update(t + p.phase, { sitting: true, dt });
    }
  }
}
