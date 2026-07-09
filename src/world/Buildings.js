import * as THREE from 'three';

// Modular timber-frame medieval house builder. Returns a THREE.Group.
// Style: stone foundation, dark wood beams, daub infill, pitched thatch/shingle
// roof, emissive window glows (pick up bloom at dusk).
export class Buildings {
  static house(opts = {}) {
    const {
      width = 6,
      depth = 5,
      height = 3,
      roofColor = 0x4a2a18,
      wallColor = 0xb8a878,
      beamColor = 0x2a1d12,
      stoneColor = 0x6a6258,
      windowGlow = 0xffc266,
      floors = 1,
    } = opts;

    const g = new THREE.Group();
    const matBeam = new THREE.MeshStandardMaterial({ color: beamColor, roughness: 0.9 });
    const matWall = new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.95 });
    const matStone = new THREE.MeshStandardMaterial({ color: stoneColor, roughness: 0.95, flatShading: true });
    const matRoof = new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.9, flatShading: true });
    const matWindow = new THREE.MeshStandardMaterial({
      color: windowGlow, emissive: windowGlow, emissiveIntensity: 1.4, roughness: 0.4,
    });
    const matDoor = new THREE.MeshStandardMaterial({ color: 0x3a2412, roughness: 0.85 });

    const h = height * floors;

    // Stone foundation.
    const foundation = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.4, 0.5, depth + 0.4),
      matStone
    );
    foundation.position.y = 0.25;
    foundation.castShadow = true;
    foundation.receiveShadow = true;
    g.add(foundation);

    // Walls (box, slightly inset).
    const walls = new THREE.Mesh(
      new THREE.BoxGeometry(width, h, depth),
      matWall
    );
    walls.position.y = 0.5 + h / 2;
    walls.castShadow = true;
    walls.receiveShadow = true;
    g.add(walls);

    // Timber-frame beams: vertical corners + horizontal mid-rails.
    const beamW = 0.18;
    const addBeam = (x, y, z, w, h, d) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), matBeam);
      b.position.set(x, y, z);
      b.castShadow = true;
      g.add(b);
    };
    // Corner posts.
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      addBeam(sx * width / 2, 0.5 + h / 2, sz * depth / 2, beamW, h, beamW);
    }
    // Mid rails per floor.
    for (let f = 0; f < floors; f++) {
      const y = 0.5 + f * height + height / 2;
      addBeam(0, y, -depth / 2, width, beamW * 0.7, beamW);
      addBeam(0, y, depth / 2, width, beamW * 0.7, beamW);
      addBeam(-width / 2, y, 0, beamW, beamW * 0.7, depth);
      addBeam(width / 2, y, 0, beamW, beamW * 0.7, depth);
    }

    // Pitched roof (a prism).
    const roofH = height * 0.7;
    const roofGeo = new THREE.BufferGeometry();
    const hw = width / 2 + 0.3;
    const hd = depth / 2 + 0.3;
    const verts = new Float32Array([
      // front triangle
      -hw, 0, hd,  hw, 0, hd,  0, roofH, hd,
      // back triangle
      -hw, 0, -hd,  0, roofH, -hd,  hw, 0, -hd,
      // left slope
      -hw, 0, hd,  0, roofH, hd,  0, roofH, -hd,  -hw, 0, -hd,
      // right slope
      hw, 0, hd,  hw, 0, -hd,  0, roofH, -hd,  0, roofH, hd,
    ]);
    roofGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    roofGeo.computeVertexNormals();
    const roof = new THREE.Mesh(roofGeo, matRoof);
    roof.position.y = 0.5 + h;
    roof.castShadow = true;
    roof.receiveShadow = true;
    g.add(roof);

    // Roof ridge beam.
    const ridge = new THREE.Mesh(
      new THREE.BoxGeometry(beamW * 0.8, beamW * 0.5, depth + 0.6),
      matBeam
    );
    ridge.position.set(0, 0.5 + h + roofH, 0);
    g.add(ridge);

    // Door.
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 1.8, 0.1),
      matDoor
    );
    door.position.set(0, 0.5 + 0.9, depth / 2 + 0.02);
    g.add(door);
    // Door frame.
    addBeam(-0.55, 0.5 + 0.9, depth / 2 + 0.03, 0.12, 1.8, 0.08);
    addBeam(0.55, 0.5 + 0.9, depth / 2 + 0.03, 0.12, 1.8, 0.08);
    addBeam(0, 0.5 + 1.85, depth / 2 + 0.03, 1.2, 0.12, 0.08);

    // Windows (emissive, pick up bloom). Front + one side.
    const winGeo = new THREE.BoxGeometry(0.7, 0.6, 0.08);
    const addWindow = (x, y, z, ry = 0) => {
      const w = new THREE.Mesh(winGeo, matWindow);
      w.position.set(x, y, z);
      w.rotation.y = ry;
      g.add(w);
      // shutter beams
      const f = matBeam;
      const sl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 0.06), f);
      sl.position.set(x - 0.42, y, z);
      g.add(sl);
      const sr = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 0.06), f);
      sr.position.set(x + 0.42, y, z);
      g.add(sr);
    };
    const winY = 0.5 + height * 0.6;
    addWindow(-width * 0.28, winY, depth / 2 + 0.02);
    addWindow(width * 0.28, winY, depth / 2 + 0.02);
    addWindow(width / 2 + 0.02, winY, 0, Math.PI / 2);

    if (floors > 1) {
      const winY2 = 0.5 + height + height * 0.5;
      addWindow(-width * 0.25, winY2, depth / 2 + 0.02);
      addWindow(width * 0.25, winY2, depth / 2 + 0.02);
    }

    // Chimney (stone).
    const chim = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 1.2, 0.6),
      matStone
    );
    chim.position.set(width * 0.3, 0.5 + h + roofH * 0.5, -depth * 0.25);
    chim.castShadow = true;
    g.add(chim);

    g.userData.colliders = [{ x: 0, z: 0, w: width, d: depth }];
    return g;
  }

  // A larger inn/tavern with a sign.
  static inn() {
    const g = Buildings.house({
      width: 8, depth: 6, height: 3, floors: 2,
      roofColor: 0x5a2a14, wallColor: 0xc4b078, windowGlow: 0xffd278,
    });
    // Hanging sign.
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 3, 6),
      new THREE.MeshStandardMaterial({ color: 0x2a1d12, roughness: 0.9 })
    );
    post.position.set(2.2, 1.5, 3.4);
    post.castShadow = true;
    g.add(post);
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.06, 0.06),
      post.material
    );
    arm.position.set(1.6, 2.9, 3.4);
    g.add(arm);
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 0.7, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x4a3220, roughness: 0.9 })
    );
    board.position.set(1.6, 2.4, 3.4);
    board.castShadow = true;
    g.add(board);
    // Sign text drawn on canvas.
    const tex = signTexture('SLEEPING\n GIANT');
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.6),
      new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.8 })
    );
    sign.position.set(1.6, 2.4, 3.45);
    g.add(sign);
    return g;
  }

  // City gate: two stone towers + a timber archway.
  static gate(span = 5) {
    const g = new THREE.Group();
    const matStone = new THREE.MeshStandardMaterial({ color: 0x7a7068, roughness: 0.95, flatShading: true });
    const matWood = new THREE.MeshStandardMaterial({ color: 0x3a2412, roughness: 0.9 });
    const matRoof = new THREE.MeshStandardMaterial({ color: 0x4a2a18, roughness: 0.9, flatShading: true });

    const towerGeo = new THREE.CylinderGeometry(1.6, 1.8, 7, 10);
    for (const sx of [-1, 1]) {
      const tower = new THREE.Mesh(towerGeo, matStone);
      tower.position.set(sx * (span / 2 + 1.8), 3.5, 0);
      tower.castShadow = true;
      tower.receiveShadow = true;
      g.add(tower);
      // Conical roof.
      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(2.0, 2.5, 10),
        matRoof
      );
      roof.position.set(sx * (span / 2 + 1.8), 8.25, 0);
      roof.castShadow = true;
      g.add(roof);
      // A window slit.
      const slit = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.6, 0.2),
        new THREE.MeshStandardMaterial({ color: 0x1a1408 })
      );
      slit.position.set(sx * (span / 2 + 1.8), 5, 0);
      g.add(slit);
    }
    // Archway beam.
    const arch = new THREE.Mesh(
      new THREE.BoxGeometry(span + 4, 1.0, 1.2),
      matWood
    );
    arch.position.set(0, 7.2, 0);
    arch.castShadow = true;
    g.add(arch);

    // Gate doors — stored for animation. Start closed (rotation = 0).
    // Pivots are at the hinge (outer edge), so we offset geometry.
    const doors = [];
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * (span / 2), 2.75, 0.6);
      const door = new THREE.Mesh(
        new THREE.BoxGeometry(span / 2, 5.5, 0.15),
        matWood
      );
      // Offset so the hinge is at the pivot point (outer edge).
      door.position.x = -sx * span / 4;
      door.castShadow = true;
      pivot.add(door);

      // Iron bands for detail.
      for (const y of [1.0, 4.5]) {
        const band = new THREE.Mesh(
          new THREE.BoxGeometry(span / 2, 0.12, 0.18),
          new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.5, metalness: 0.7 })
        );
        band.position.set(-sx * span / 4, y - 2.75, 0.02);
        pivot.add(band);
      }

      g.add(pivot);
      doors.push(pivot);
    }
    g.userData.doors = doors;
    g.userData.gateOpenAmount = 0; // 0 = closed, 1 = fully open

    return g;
  }

  // A stone well.
  static well() {
    const g = new THREE.Group();
    const matStone = new THREE.MeshStandardMaterial({ color: 0x7a7068, roughness: 0.95, flatShading: true });
    const matWood = new THREE.MeshStandardMaterial({ color: 0x3a2412, roughness: 0.9 });
    const matWater = new THREE.MeshStandardMaterial({
      color: 0x2a4a5a, roughness: 0.2, metalness: 0.3,
      emissive: 0x0a1a22, emissiveIntensity: 0.3,
    });

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.4, 1.0, 12),
      matStone
    );
    base.position.y = 0.5;
    base.castShadow = true;
    base.receiveShadow = true;
    g.add(base);

    const water = new THREE.Mesh(
      new THREE.CylinderGeometry(1.0, 1.0, 0.1, 16),
      matWater
    );
    water.position.y = 0.85;
    g.add(water);
    g.userData.water = water;

    // Posts + roof.
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 2.2, 0.12),
        matWood
      );
      post.position.set(sx * 1.1, 2.1, sz * 1.1);
      post.castShadow = true;
      g.add(post);
    }
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(1.7, 0.9, 4),
      matWood
    );
    roof.position.y = 3.5;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    g.add(roof);
    // Crossbar + bucket rope.
    const bar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6),
      matWood
    );
    bar.rotation.z = Math.PI / 2;
    bar.position.y = 3.0;
    g.add(bar);
    return g;
  }

  // Blacksmith forge with glowing embers.
  static forge() {
    const g = new THREE.Group();
    const matStone = new THREE.MeshStandardMaterial({ color: 0x5a5048, roughness: 0.95, flatShading: true });
    const matWood = new THREE.MeshStandardMaterial({ color: 0x3a2412, roughness: 0.9 });
    const matIron = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.4, metalness: 0.8 });
    const matEmber = new THREE.MeshStandardMaterial({
      color: 0xff5a1a, emissive: 0xff7a2a, emissiveIntensity: 3.0, roughness: 0.5,
    });

    // Forge structure.
    const structure = Buildings.house({
      width: 5, depth: 4, height: 2.6, floors: 1,
      roofColor: 0x2a1a10, wallColor: 0x6a5a48, windowGlow: 0xff9a3a,
    });
    g.add(structure);

    // Anvil.
    const anvil = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.4, 0.3),
      matIron
    );
    anvil.position.set(2.5, 0.7, 1.5);
    anvil.castShadow = true;
    g.add(anvil);
    const anvilBase = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.6, 0.3),
      matWood
    );
    anvilBase.position.set(2.5, 0.3, 1.5);
    g.add(anvilBase);

    // Forge hearth (glowing).
    const hearth = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.8, 0.8),
      matStone
    );
    hearth.position.set(-2.5, 0.4, 1.5);
    g.add(hearth);
    const ember = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.2, 0.5),
      matEmber
    );
    ember.position.set(-2.5, 0.75, 1.5);
    g.add(ember);
    g.userData.ember = ember;

    // Chimney smoke origin (used by particle system later).
    g.userData.smokeOrigin = new THREE.Vector3(1.5, 4.5, -1);

    g.userData.colliders = structure.userData.colliders;
    return g;
  }
}

function signTexture(text) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 170;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#d8c9a0';
  ctx.font = 'bold 34px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = text.split('\n');
  lines.forEach((ln, i) => {
    ctx.fillText(ln.trim(), c.width / 2, c.height / 2 + (i - (lines.length - 1) / 2) * 36);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}
