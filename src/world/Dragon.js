import * as THREE from 'three';

// Stylized procedural dragon: serpentine body, bat-like wings, horned head,
// segmented tail, four clawed legs. Designed as a dramatic silhouette perched
// on a tower. Supports flight arrival + roar animations.
export class Dragon {
  constructor() {
    this.group = new THREE.Group();
    this._t = 0;
    this._flightT = 0;
    this._flightDur = 0;
    this._flying = false;
    this._flightPath = null;
    this._perched = false;
    this._roarT = 0;

    const matBody = new THREE.MeshStandardMaterial({
      color: 0x1a1a1e, roughness: 0.85, metalness: 0.1, flatShading: true,
    });
    const matBelly = new THREE.MeshStandardMaterial({
      color: 0x2a2020, roughness: 0.9, flatShading: true,
    });
    const matHorn = new THREE.MeshStandardMaterial({
      color: 0x4a4038, roughness: 0.6, metalness: 0.2,
    });
    const matMembrane = new THREE.MeshStandardMaterial({
      color: 0x0e0e12, roughness: 0.95, metalness: 0.0,
      side: THREE.DoubleSide, transparent: true, opacity: 0.92,
    });
    const matEye = new THREE.MeshStandardMaterial({
      color: 0xff4400, emissive: 0xff3300, emissiveIntensity: 3.0, roughness: 0.3,
    });
    this._matBody = matBody;
    this._matMembrane = matMembrane;

    this._buildBody(matBody, matBelly);
    this._buildHead(matBody, matHorn, matEye);
    this._buildWings(matBody, matMembrane);
    this._buildTail(matBody);
    this._buildLegs(matBody);

    // Scale up 3x for an imposing presence.
    this.group.scale.setScalar(3.0);

    // Start hidden (revealed when flight begins).
    this.group.visible = false;
  }

  _buildBody(matBody, matBelly) {
    this.bodySegs = [];
    const segCount = 5;
    for (let i = 0; i < segCount; i++) {
      const t = i / (segCount - 1);
      const r = 0.45 - t * 0.15;
      const seg = new THREE.Mesh(
        new THREE.SphereGeometry(r, 12, 10),
        i % 2 === 0 ? matBody : matBelly
      );
      seg.position.set(-t * 0.6, 0, 0);
      seg.castShadow = true;
      this.group.add(seg);
      this.bodySegs.push(seg);
    }
    // Chest (larger, at front).
    const chest = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 14, 12),
      matBody
    );
    chest.position.set(0.15, 0.05, 0);
    chest.castShadow = true;
    this.group.add(chest);
    this._chest = chest;
  }

  _buildHead(matBody, matHorn, matEye) {
    this.head = new THREE.Group();
    this.head.position.set(0.7, 0.15, 0);

    // Skull.
    const skull = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.3, 0.32),
      matBody
    );
    skull.castShadow = true;
    this.head.add(skull);

    // Snout (upper jaw).
    const snout = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.15, 0.22),
      matBody
    );
    snout.position.set(0.35, -0.02, 0);
    snout.castShadow = true;
    this.head.add(snout);

    // Lower jaw (separate for roar animation).
    this.lowerJaw = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.12, 0.20),
      matBody
    );
    this.lowerJaw.position.set(0.33, -0.18, 0);
    this.lowerJaw.castShadow = true;
    this.head.add(this.lowerJaw);

    // Teeth.
    const matTooth = new THREE.MeshStandardMaterial({ color: 0xe8e0c8, roughness: 0.4 });
    for (const jaw of [snout, this.lowerJaw]) {
      const dir = jaw === snout ? -1 : 1;
      for (let i = 0; i < 4; i++) {
        const tooth = new THREE.Mesh(
          new THREE.ConeGeometry(0.025, 0.08, 4),
          matTooth
        );
        tooth.position.set(0.2 + i * 0.06, dir * 0.08, 0);
        tooth.rotation.x = dir > 0 ? Math.PI : 0;
        jaw.add(tooth);
      }
    }

    // Horns (swept back).
    for (const sz of [-1, 1]) {
      const horn = new THREE.Mesh(
        new THREE.ConeGeometry(0.06, 0.35, 6),
        matHorn
      );
      horn.position.set(-0.05, 0.18, sz * 0.14);
      horn.rotation.z = -1.2;
      horn.rotation.y = sz * 0.3;
      horn.castShadow = true;
      this.head.add(horn);

      // Second smaller horn.
      const horn2 = new THREE.Mesh(
        new THREE.ConeGeometry(0.04, 0.2, 5),
        matHorn
      );
      horn2.position.set(0.05, 0.16, sz * 0.10);
      horn2.rotation.z = -0.8;
      this.head.add(horn2);
    }

    // Glowing eyes.
    for (const sz of [-1, 1]) {
      const eye = new THREE.Mesh(
        new THREE.SphereGeometry(0.045, 8, 6),
        matEye
      );
      eye.position.set(0.08, 0.05, sz * 0.14);
      this.head.add(eye);
    }

    // Brow ridges.
    for (const sz of [-1, 1]) {
      const brow = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 0.04, 0.06),
        matBody
      );
      brow.position.set(0.1, 0.1, sz * 0.13);
      this.head.add(brow);
    }

    this.group.add(this.head);
  }

  _buildWings(matBody, matMembrane) {
    this.wings = [];
    for (const side of [-1, 1]) {
      const wing = new THREE.Group();
      wing.position.set(0.0, 0.2, side * 0.35);

      // Arm (shoulder to wrist).
      const armLen = 1.2;
      const arm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.04, armLen, 6),
        matBody
      );
      arm.position.set(0, -armLen / 2, 0);
      arm.rotation.z = 0.3;
      arm.castShadow = true;
      wing.add(arm);

      // Finger bones (radiating from wrist).
      const wrist = new THREE.Group();
      wrist.position.set(0.35, -armLen + 0.1, 0);
      wing.add(wrist);

      const fingerAngles = [-0.4, -0.1, 0.2, 0.5];
      const fingerLens = [0.8, 1.0, 0.9, 0.7];
      const tips = [];
      for (let i = 0; i < 4; i++) {
        const flen = fingerLens[i];
        const finger = new THREE.Mesh(
          new THREE.CylinderGeometry(0.03, 0.02, flen, 5),
          matBody
        );
        finger.position.set(Math.sin(fingerAngles[i]) * flen / 2, -Math.cos(fingerAngles[i]) * flen / 2, 0);
        finger.rotation.z = fingerAngles[i];
        finger.castShadow = true;
        wrist.add(finger);

        const tipX = Math.sin(fingerAngles[i]) * flen;
        const tipY = -Math.cos(fingerAngles[i]) * flen;
        tips.push(new THREE.Vector2(tipX, tipY));

        // Claw at tip.
        const claw = new THREE.Mesh(
          new THREE.ConeGeometry(0.025, 0.08, 4),
          matBody
        );
        claw.position.set(tipX, tipY, 0);
        claw.rotation.z = fingerAngles[i] - Math.PI / 2;
        wrist.add(claw);
      }

      // Wing membrane (custom geometry between shoulder, wrist, and finger tips).
      const memGeo = new THREE.BufferGeometry();
      const verts = [];
      const shoulder = new THREE.Vector2(0, 0);
      // Build triangles: shoulder → tip[i] → tip[i+1]
      for (let i = 0; i < tips.length - 1; i++) {
        verts.push(shoulder.x, shoulder.y, 0);
        verts.push(tips[i].x + 0.35, tips[i].y - armLen + 0.1, 0);
        verts.push(tips[i + 1].x + 0.35, tips[i + 1].y - armLen + 0.1, 0);
      }
      memGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      memGeo.computeVertexNormals();
      const membrane = new THREE.Mesh(memGeo, matMembrane);
      membrane.castShadow = true;
      wing.add(membrane);

      this.group.add(wing);
      this.wings.push(wing);
    }
  }

  _buildTail(matBody) {
    this.tailSegs = [];
    const segCount = 6;
    for (let i = 0; i < segCount; i++) {
      const t = (i + 1) / segCount;
      const r = 0.35 - t * 0.28;
      const seg = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(r, 0.04), 8, 6),
        matBody
      );
      seg.position.set(-0.6 - t * 0.55, -t * 0.05, 0);
      seg.castShadow = true;
      this.group.add(seg);
      this.tailSegs.push(seg);
    }
    // Tail spade.
    const spade = new THREE.Mesh(
      new THREE.ConeGeometry(0.1, 0.25, 6),
      matBody
    );
    spade.position.set(-0.6 - segCount * 0.55 - 0.1, -0.25, 0);
    spade.rotation.z = Math.PI / 2;
    spade.castShadow = true;
    this.group.add(spade);
    this._tailSpade = spade;
  }

  _buildLegs(matBody) {
    this.legs = [];
    const positions = [
      [0.2, 0.35],   // front right
      [0.2, -0.35],  // front left
      [-0.3, 0.35],  // back right
      [-0.3, -0.35], // back left
    ];
    for (const [x, z] of positions) {
      const leg = new THREE.Group();
      leg.position.set(x, -0.3, z);

      const upper = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.06, 0.4, 6),
        matBody
      );
      upper.position.y = -0.2;
      upper.castShadow = true;
      leg.add(upper);

      const lower = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.04, 0.35, 6),
        matBody
      );
      lower.position.set(0.05, -0.55, 0);
      lower.rotation.z = -0.3;
      lower.castShadow = true;
      leg.add(lower);

      // Clawed foot.
      const foot = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.06, 0.15),
        matBody
      );
      foot.position.set(0.12, -0.72, 0);
      foot.castShadow = true;
      leg.add(foot);

      for (const sz of [-1, 0, 1]) {
        const claw = new THREE.Mesh(
          new THREE.ConeGeometry(0.02, 0.06, 4),
          matBody
        );
        claw.position.set(0.18, -0.72, sz * 0.05);
        claw.rotation.z = -Math.PI / 2;
        leg.add(claw);
      }

      this.group.add(leg);
      this.legs.push(leg);
    }
  }

  // Start flight from a distant point to a landing position (tower top).
  flyTo(startPos, endPos, duration = 5) {
    this._flying = true;
    this._flightT = 0;
    this._flightDur = duration;
    this._flightStart = startPos.clone();
    this._flightEnd = endPos.clone();
    // Mid-point for arc trajectory — always higher than both endpoints.
    this._flightMid = startPos.clone().lerp(endPos, 0.5);
    this._flightMid.y = Math.max(startPos.y, endPos.y) + 12;
    this.group.visible = true;
    this.group.position.copy(startPos);
  }

  roar() {
    this._roarT = 2.0;
  }

  breatheFire(targetPos = null) {
    this._fireT = 1.5;
    this._fireTarget = targetPos ? targetPos.clone() : null;
    if (!this._fireParticles) {
      this._buildFireBreath();
    }
  }

  _buildFireBreath() {
    const count = 200;
    const positions = new Float32Array(count * 3);
    const lives = new Float32Array(count);
    const sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      lives[i] = Math.random();
      sizes[i] = 0.5 + Math.random() * 0.8;
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('life', new THREE.BufferAttribute(lives, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: { pixelRatio: { value: Math.min(window.devicePixelRatio, 1.75) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float size;
        attribute float life;
        uniform float pixelRatio;
        varying float vLife;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * 300.0 * pixelRatio / -mv.z;
          gl_Position = projectionMatrix * mv;
          vLife = life;
        }
      `,
      fragmentShader: `
        varying float vLife;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.0, d) * (1.0 - vLife) * 0.9;
          vec3 col = mix(vec3(1.0, 0.9, 0.3), vec3(0.8, 0.2, 0.05), vLife);
          gl_FragColor = vec4(col, a);
        }
      `,
    });

    this._fireParticles = new THREE.Points(geo, mat);
    this._fireParticles.frustumCulled = false;
    this._fireCount = count;
    // Attach to head so it comes from the mouth.
    this.head.add(this._fireParticles);
    this._fireParticles.position.set(0.6, -0.15, 0);
  }

  update(t, dt) {
    this._t = t;

    // Flight animation.
    if (this._flying) {
      this._flightT += dt;
      const u = Math.min(this._flightT / this._flightDur, 1);
      const e = u * u * (3 - 2 * u); // smoothstep

      // Quadratic Bezier: start → mid → end.
      const a = this._flightStart.clone().lerp(this._flightMid, e);
      const b = this._flightMid.clone().lerp(this._flightEnd, e);
      this.group.position.copy(a.lerp(b, e));

      // Orient toward direction of travel.
      const ahead = a.lerp(b, Math.min(e + 0.01, 1)).sub(this.group.position);
      if (ahead.lengthSq() > 0.0001) {
        const targetYaw = Math.atan2(ahead.x, ahead.z);
        this.group.rotation.y = targetYaw;
        const targetPitch = Math.atan2(ahead.y, Math.sqrt(ahead.x * ahead.x + ahead.z * ahead.z));
        this.group.rotation.x = -targetPitch * 0.5;
      }

      // Fast wing flaps during flight.
      const flap = Math.sin(t * 8) * 0.6;
      this.wings[0].rotation.z = flap;
      this.wings[1].rotation.z = -flap;

      if (u >= 1) {
        this._flying = false;
        this._perched = true;
        this.group.rotation.x = 0;
        this.group.rotation.y = 0; // face the courtyard (toward -Z / toward player)
      }
      return;
    }

    // Perched idle: subtle breathing + wing settle.
    if (this._perched) {
      const breathe = Math.sin(t * 1.5) * 0.02;
      this._chest.scale.set(1 + breathe, 1 + breathe, 1 + breathe);
      // Wings partially spread, gentle sway.
      const sway = Math.sin(t * 0.8) * 0.05;
      this.wings[0].rotation.z = 0.3 + sway;
      this.wings[1].rotation.z = -0.3 - sway;
      // Tail sway.
      for (let i = 0; i < this.tailSegs.length; i++) {
        const sw = Math.sin(t * 1.2 + i * 0.5) * 0.04;
        this.tailSegs[i].rotation.y = sw;
      }
    }

    // Roar animation.
    if (this._roarT > 0) {
      this._roarT -= dt;
      const intensity = Math.min(this._roarT / 2.0, 1);
      // Head back, jaw open.
      this.head.rotation.x = -0.4 * intensity;
      this.lowerJaw.rotation.x = 0.5 * intensity;
      // Wings spread wide.
      this.wings[0].rotation.z = 0.8 * intensity;
      this.wings[1].rotation.z = -0.8 * intensity;
      // Body lunge.
      this._chest.scale.set(
        1 + 0.05 * intensity,
        1 + 0.05 * intensity,
        1 + 0.05 * intensity
      );
    } else if (this._perched) {
      // Reset head/jaw after roar.
      this.head.rotation.x *= 0.9;
      this.lowerJaw.rotation.x *= 0.9;
    }

    // Fire breath animation.
    if (this._fireT > 0) {
      this._fireT -= dt;
      // Keep jaw open during fire.
      this.lowerJaw.rotation.x = 0.4;
      // Aim head toward fire target.
      if (this._fireTarget) {
        const headWorld = new THREE.Vector3();
        this.head.getWorldPosition(headWorld);
        const dx = this._fireTarget.x - headWorld.x;
        const dy = this._fireTarget.y - headWorld.y;
        const dz = this._fireTarget.z - headWorld.z;
        // Compute local-space direction (account for group rotation).
        const dist = Math.sqrt(dx * dx + dz * dz);
        const targetYaw = Math.atan2(dx, dz);
        const targetPitch = Math.atan2(-dy, dist);
        // Smoothly aim.
        let dyaw = targetYaw - this.group.rotation.y;
        while (dyaw > Math.PI) dyaw -= Math.PI * 2;
        while (dyaw < -Math.PI) dyaw += Math.PI * 2;
        this.group.rotation.y += dyaw * 0.05;
        this.head.rotation.x += (targetPitch * 0.7 - this.head.rotation.x) * 0.05;
      }
      // Update fire particles — travel forward from mouth in local +X.
      if (this._fireParticles) {
        const pos = this._fireParticles.geometry.attributes.position.array;
        const lives = this._fireParticles.geometry.attributes.life.array;
        for (let i = 0; i < this._fireCount; i++) {
          lives[i] += dt * 1.2;
          if (lives[i] >= 1) {
            lives[i] = 0;
            pos[i * 3] = 0;
            pos[i * 3 + 1] = 0;
            pos[i * 3 + 2] = 0;
          }
          // Travel forward (+X is the dragon's forward / mouth direction).
          pos[i * 3] += dt * 12;
          pos[i * 3 + 1] += (Math.random() - 0.4) * dt * 3;
          pos[i * 3 + 2] += (Math.random() - 0.5) * dt * 3;
        }
        this._fireParticles.geometry.attributes.position.needsUpdate = true;
        this._fireParticles.geometry.attributes.life.needsUpdate = true;
      }
    }
  }
}
