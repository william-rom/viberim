import * as THREE from 'three';
import { Buildings } from './Buildings.js';
import { Humanoid } from './Humanoid.js';

// Assembles the compact medieval town square. The cart arrives near (12, -8)
// facing toward -X/+Z, so the gate sits there and the plaza extends inward.
export class City {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.group = new THREE.Group();
    this.colliders = []; // {x, z, r} circular OR {x, z, w, d} box
    this.lights = []; // animated lights (forge ember, etc.)
    this.npcs = [];
    this._build();
    scene.add(this.group);
  }

  _place(obj, x, z, rotY = 0, snap = true) {
    obj.position.x = x;
    obj.position.z = z;
    if (snap) obj.position.y = this.terrain.heightAt(x, z);
    obj.rotation.y = rotY;
    this.group.add(obj);
    // collect colliders
    if (obj.userData.colliders) {
      for (const c of obj.userData.colliders) {
        this.colliders.push({ x: x + c.x, z: z + c.z, w: c.w, d: c.d, rotY });
      }
    }
    return obj;
  }

  _build() {
    this._buildGround();
    this._buildWalls();
    this._buildGate();
    this._buildPlaza();
    this._buildBuildings();
    this._buildProps();
    this._buildNPCs();
  }

  _buildGround() {
    // A worn dirt plaza disk slightly above terrain to avoid z-fighting.
    const geo = new THREE.CircleGeometry(20, 32);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x6a5840, roughness: 1.0,
    });
    const ground = new THREE.Mesh(geo, mat);
    ground.position.set(2, 0.06, 8);
    ground.receiveShadow = true;
    this.group.add(ground);

    // Cobblestone ring.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(18, 21, 40),
      new THREE.MeshStandardMaterial({ color: 0x5a524a, roughness: 0.95 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(2, 0.05, 8);
    ring.receiveShadow = true;
    this.group.add(ring);
  }

  _buildWalls() {
    // Big grey stone walls forming a perimeter around the town square.
    // Built as segments of varying-height stone blocks with crenellations.
    const matStone = new THREE.MeshStandardMaterial({
      color: 0x6a6660, roughness: 0.95, flatShading: true,
    });
    const matStoneDark = new THREE.MeshStandardMaterial({
      color: 0x5a5650, roughness: 0.95, flatShading: true,
    });
    const matMortar = new THREE.MeshStandardMaterial({
      color: 0x807870, roughness: 0.9,
    });

    const centerX = 2;
    const centerZ = 8;
    const radius = 26;
    const wallHeight = 5;
    const wallThickness = 1.8;

    // Place wall segments in a ring, leaving a gap for the gate.
    // Gate is at approx (14, -6) — direction from center is (+X, -Z).
    const gateAngle = Math.atan2(-6 - centerZ, 14 - centerX);
    const gateHalfWidth = 0.45; // radians of gap (wide enough for cart)

    const segments = 28;
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      // Skip segments near the gate gap.
      let diff = Math.abs(angle - gateAngle);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      if (diff < gateHalfWidth) continue;

      const x = centerX + Math.cos(angle) * radius;
      const z = centerZ + Math.sin(angle) * radius;
      const groundY = this.terrain.heightAt(x, z);

      // Wall segment (a chunky box, slightly rotated to follow the ring).
      const segLen = (Math.PI * 2 * radius) / segments * 1.1; // overlap slightly
      const wallSeg = new THREE.Mesh(
        new THREE.BoxGeometry(segLen, wallHeight, wallThickness),
        Math.random() > 0.5 ? matStone : matStoneDark
      );
      wallSeg.position.set(x, groundY + wallHeight / 2, z);
      wallSeg.rotation.y = -angle + Math.PI / 2;
      wallSeg.castShadow = true;
      wallSeg.receiveShadow = true;
      this.group.add(wallSeg);

      // Crenellations (merlons) on top.
      const merlonH = 1.2;
      const merlonW = 0.8;
      const merlonCount = 3;
      for (let m = 0; m < merlonCount; m++) {
        const offset = (m - (merlonCount - 1) / 2) * (segLen / merlonCount);
        const merlon = new THREE.Mesh(
          new THREE.BoxGeometry(merlonW, merlonH, wallThickness * 0.9),
          Math.random() > 0.5 ? matStone : matStoneDark
        );
        // Position along the wall segment.
        const localX = offset;
        const wx = x + Math.cos(angle + Math.PI / 2) * offset;
        const wz = z + Math.sin(angle + Math.PI / 2) * offset;
        merlon.position.set(wx, groundY + wallHeight + merlonH / 2, wz);
        merlon.rotation.y = -angle + Math.PI / 2;
        merlon.castShadow = true;
        this.group.add(merlon);
      }

      // Stone block texture detail (a few darker blocks randomly).
      for (let b = 0; b < 4; b++) {
        const block = new THREE.Mesh(
          new THREE.BoxGeometry(0.6 + Math.random() * 0.4, 0.5 + Math.random() * 0.4, 0.1),
          matStoneDark
        );
        const bx = x + (Math.random() - 0.5) * segLen * 0.8;
        const bz = z + (Math.random() - 0.5) * segLen * 0.8;
        // Project onto wall face.
        const by = groundY + Math.random() * (wallHeight - 0.5);
        block.position.set(
          bx + Math.cos(angle) * (wallThickness / 2 + 0.05),
          by,
          bz + Math.sin(angle) * (wallThickness / 2 + 0.05)
        );
        block.rotation.y = -angle + Math.PI / 2;
        this.group.add(block);
      }
    }

    // Corner towers at 4 cardinal points (thicker, taller cylinders).
    for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      // Skip if too close to gate.
      let diff = Math.abs(angle - gateAngle);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      if (diff < 0.5) continue;

      const x = centerX + Math.cos(angle) * radius;
      const z = centerZ + Math.sin(angle) * radius;
      const groundY = this.terrain.heightAt(x, z);
      const towerH = 8;

      const tower = new THREE.Mesh(
        new THREE.CylinderGeometry(2.2, 2.5, towerH, 10),
        matStone
      );
      tower.position.set(x, groundY + towerH / 2, z);
      tower.castShadow = true;
      tower.receiveShadow = true;
      this.group.add(tower);

      // Conical roof.
      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(2.6, 3, 10),
        new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.9, flatShading: true })
      );
      roof.position.set(x, groundY + towerH + 1.5, z);
      roof.castShadow = true;
      this.group.add(roof);

      // Window slit.
      const slit = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.5, 0.2),
        new THREE.MeshStandardMaterial({ color: 0x1a1408 })
      );
      slit.position.set(
        x + Math.cos(angle) * 2.4,
        groundY + towerH * 0.6,
        z + Math.sin(angle) * 2.4
      );
      this.group.add(slit);
    }
  }

  _buildGate() {
    this.gate = this._place(Buildings.gate(5), 14, -6, -0.5);
  }

  // Animate gate doors opening. amount: 0 = closed, 1 = fully open.
  setGateOpen(amount) {
    if (!this.gate || !this.gate.userData.doors) return;
    const clamped = Math.max(0, Math.min(1, amount));
    this.gate.userData.gateOpenAmount = clamped;
    const angle = clamped * 1.15; // max ~66° swing
    const doors = this.gate.userData.doors;
    doors[0].rotation.y = angle;   // left door swings open
    doors[1].rotation.y = -angle;  // right door swings open
  }

  _buildPlaza() {
    // Central well.
    this.well = this._place(Buildings.well(), 2, 8, 0);
  }

  _buildBuildings() {
    // Inn to the west.
    this.inn = this._place(Buildings.inn(), -14, 4, Math.PI * 0.35);

    // Forge to the east.
    this.forge = this._place(Buildings.forge(), 16, 12, -Math.PI * 0.7);
    if (this.forge.userData.ember) {
      this.lights.push({
        mesh: this.forge.userData.ember,
        light: new THREE.PointLight(0xff6a2a, 4, 12, 2),
      });
      const pl = this.lights[this.lights.length - 1].light;
      pl.position.set(16, 1.5, 12);
      this.group.add(pl);
    }

    // Houses around the square.
    const houses = [
      { x: -16, z: 14, rot: Math.PI * 0.4, opts: { wallColor: 0xc4a878, roofColor: 0x5a2a18 } },
      { x: -10, z: 20, rot: Math.PI * 0.5, opts: { wallColor: 0xb89868, roofColor: 0x4a2a14 } },
      { x: -4, z: 22, rot: Math.PI, opts: { wallColor: 0xbea870, roofColor: 0x6a2a18, floors: 2 } },
      { x: 18, z: 22, rot: -Math.PI * 0.5, opts: { wallColor: 0xa89060, roofColor: 0x3a2a14 } },
    ];
    for (const h of houses) {
      this._place(Buildings.house(h.opts), h.x, h.z, h.rot);
    }

    // A keep silhouette on the hill behind (north-west).
    const keep = new THREE.Group();
    const matStone = new THREE.MeshStandardMaterial({ color: 0x5a524a, roughness: 0.95, flatShading: true });
    const matRoof = new THREE.MeshStandardMaterial({ color: 0x3a2a18, roughness: 0.9, flatShading: true });
    const keepBase = new THREE.Mesh(new THREE.BoxGeometry(10, 8, 8), matStone);
    keepBase.position.y = 4;
    keepBase.castShadow = true;
    keepBase.receiveShadow = true;
    keep.add(keepBase);
    for (const sx of [-1, 1]) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 10, 8), matStone);
      t.position.set(sx * 4.5, 5, 0);
      t.castShadow = true;
      keep.add(t);
      const r = new THREE.Mesh(new THREE.ConeGeometry(1.6, 2.5, 8), matRoof);
      r.position.set(sx * 4.5, 11.25, 0);
      keep.add(r);
    }
    this._place(keep, -28, -18, Math.PI * 0.15);
  }

  _buildProps() {
    const matWood = new THREE.MeshStandardMaterial({ color: 0x4a3220, roughness: 0.9 });
    const matIron = new THREE.MeshStandardMaterial({ color: 0x3a3a3e, roughness: 0.5, metalness: 0.7 });

    // Barrels.
    const barrelGeo = new THREE.CylinderGeometry(0.35, 0.3, 0.8, 10);
    const placeBarrel = (x, z) => {
      const b = new THREE.Mesh(barrelGeo, matWood);
      b.position.set(x, this.terrain.heightAt(x, z) + 0.4, z);
      b.castShadow = true;
      b.receiveShadow = true;
      this.group.add(b);
    };
    placeBarrel(-6, 6);
    placeBarrel(-6.4, 6.6);
    placeBarrel(8, 14);

    // Crates.
    const crateGeo = new THREE.BoxGeometry(0.7, 0.7, 0.7);
    const placeCrate = (x, z, y = 0) => {
      const c = new THREE.Mesh(crateGeo, matWood);
      c.position.set(x, this.terrain.heightAt(x, z) + 0.35 + y, z);
      c.castShadow = true;
      c.receiveShadow = true;
      this.group.add(c);
    };
    placeCrate(-7, 7);
    placeCrate(-7, 7, 0.7);

    // Market stall (canvas awning on posts).
    const stall = new THREE.Group();
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2, 6), matWood);
      post.position.set(sx * 1.0, 1, sz * 0.6);
      stall.add(post);
    }
    const awning = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.05, 1.4),
      new THREE.MeshStandardMaterial({ color: 0x8a3a2a, roughness: 0.8, side: THREE.DoubleSide })
    );
    awning.position.y = 2;
    awning.rotation.z = 0.15;
    stall.add(awning);
    const table = new THREE.Mesh(
      new THREE.BoxGeometry(2.0, 0.08, 1.2),
      matWood
    );
    table.position.y = 0.8;
    stall.add(table);
    this._place(stall, -4, 14, 0.3);

    // Lanterns on posts (emissive, bloom-friendly).
    const placeLantern = (x, z) => {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.08, 3, 6),
        matWood
      );
      post.position.set(x, this.terrain.heightAt(x, z) + 1.5, z);
      post.castShadow = true;
      this.group.add(post);
      const lamp = new THREE.Mesh(
        new THREE.BoxGeometry(0.25, 0.35, 0.25),
        new THREE.MeshStandardMaterial({
          color: 0xffd278, emissive: 0xffc266, emissiveIntensity: 2.5, roughness: 0.3,
        })
      );
      lamp.position.set(x, this.terrain.heightAt(x, z) + 2.9, z);
      this.group.add(lamp);
      const pl = new THREE.PointLight(0xffc266, 1.5, 8, 2);
      pl.position.set(x, this.terrain.heightAt(x, z) + 2.9, z);
      this.group.add(pl);
      this.lights.push({ mesh: lamp, light: pl });
    };
    placeLantern(-8, 9);
    placeLantern(10, 6);
  }

  _buildNPCs() {
    const configs = [
      { x: 0, z: 10, rot: 0, shirt: 0x6b4a2a, skin: 0xc98a5e, hair: 0x2a1d12, hooded: true },
      { x: -5, z: 12, rot: 1.2, shirt: 0x4a4a6a, skin: 0xb87a4e, hair: 0x1a1208, beard: true },
      { x: 6, z: 15, rot: -0.8, shirt: 0x5a3a2a, skin: 0xa8703e, hair: 0x3a2a1a },
      { x: -10, z: 8, rot: 2.0, shirt: 0x3a4a3a, skin: 0xd2a070, hair: 0x0e0a06, hooded: true },
      { x: 12, z: 16, rot: Math.PI, shirt: 0x6a4a3a, skin: 0xbe8856, hair: 0x2a1d12, beard: true },
    ];
    for (const c of configs) {
      const npc = new Humanoid({
        shirt: c.shirt, pants: 0x2a2418, skin: c.skin, hair: c.hair,
        hooded: c.hooded || false, beard: c.beard || false,
      });
      npc.group.position.set(c.x, this.terrain.heightAt(c.x, c.z) + npc.footOffset, c.z);
      npc.group.rotation.y = c.rot;
      this.group.add(npc.group);
      this.npcs.push({ humanoid: npc, baseX: c.x, baseZ: c.z, phase: Math.random() * 6, wander: Math.random() > 0.5 });
    }
  }

  update(t) {
    // Flicker forge/lamp lights.
    for (const l of this.lights) {
      const flicker = 0.7 + Math.sin(t * 12 + l.mesh.position.x) * 0.15 + Math.random() * 0.15;
      l.light.intensity = (l.light.userData.base ?? l.light.intensity);
      if (!l.light.userData.base) l.light.userData.base = l.light.intensity;
      l.light.intensity = l.light.userData.base * flicker;
    }
    // Well water shimmer.
    if (this.well && this.well.userData.water) {
      this.well.userData.water.position.y = 0.85 + Math.sin(t * 2) * 0.01;
    }
    // NPC idle / wander.
    for (const n of this.npcs) {
      if (n.wander) {
        const wx = n.baseX + Math.sin(t * 0.3 + n.phase) * 1.5;
        const wz = n.baseZ + Math.cos(t * 0.25 + n.phase) * 1.5;
        n.humanoid.group.position.x = wx;
        n.humanoid.group.position.z = wz;
        n.humanoid.group.position.y = this.terrain.heightAt(wx, wz) + n.humanoid.footOffset;
        n.humanoid.group.rotation.y = Math.atan2(wx - n.humanoid.group.position.x, wz - n.humanoid.group.position.z);
        n.humanoid.update(t + n.phase, { walking: true });
      } else {
        n.humanoid.update(t + n.phase, { walking: false });
      }
    }
  }
}
