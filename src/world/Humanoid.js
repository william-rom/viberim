import * as THREE from 'three';

// A stylized but characterful humanoid: torso, head, simple limbs.
// Faces are drawn on a canvas texture and mapped onto the head sphere for a
// clean, painterly look (instead of blobby individual meshes).
export class Humanoid {
  constructor(opts = {}) {
    const {
      height = 1.75,
      shirt = 0x6b4a2a,
      pants = 0x3a3328,
      skin = 0xc98a5e,
      hair = 0x2a1d12,
      boots = 0x1d1812,
      hooded = false,
      bagged = false,
      bound = false,
      gagged = false,
      longHair = false,
      facemask = false,
      eyeColor = 0x4a6a8a,
      beard = false,
      sitting = false,
    } = opts;

    this.group = new THREE.Group();
    this.group.userData.humanoid = this;
    this._lookTarget = null;
    this._bound = bound;
    this._sitting = sitting;
    this._walkTarget = null;
    this._walkSpeed = 1.5;
    this._kneeling = false;
    this._fallen = false;
    this._lookUpAmount = 0;
    this._standUpProgress = 0; // 0=sitting, 1=standing
    this._standingUp = false;

    const wood = (c, r = 0.85, m = 0.0) =>
      new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });

    const matShirt = wood(shirt);
    const matPants = wood(pants);
    const matSkin = wood(skin, 0.7);
    const matHair = wood(hair, 0.8);
    const matBoot = wood(boots, 0.9);
    const h = height;

    // Torso (tapered box).
    const torso = new THREE.Mesh(
      new THREE.CylinderGeometry(0.17, 0.22, h * 0.42, 8),
      matShirt
    );
    torso.position.y = h * 0.30;
    torso.castShadow = true;
    this.group.add(torso);

    // Shoulders / chest block for a bulkier look.
    const chest = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, h * 0.16, 0.26),
      matShirt
    );
    chest.position.y = h * 0.46;
    chest.castShadow = true;
    this.group.add(chest);

    // --- Head with canvas-drawn face texture ---
    this.head = new THREE.Group();
    this.head.position.y = h * 0.62;
    this.group.add(this.head);

    if (bagged) {
      // Burlap sack — no face needed.
      const skull = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 16, 12),
        matSkin
      );
      skull.castShadow = true;
      this.head.add(skull);

      const sack = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 12, 10),
        new THREE.MeshStandardMaterial({ color: 0x8a7a52, roughness: 1.0, flatShading: true })
      );
      sack.scale.set(1, 1.3, 1);
      sack.castShadow = true;
      this.head.add(sack);

      const tie = new THREE.Mesh(
        new THREE.TorusGeometry(0.14, 0.02, 6, 12),
        new THREE.MeshStandardMaterial({ color: 0x6a5a3a, roughness: 0.9 })
      );
      tie.rotation.x = Math.PI / 2;
      tie.position.y = -0.12;
      this.head.add(tie);
    } else {
      // Draw the face on a canvas and use it as a texture on the head sphere.
      // Pre-generate multiple mouth states for lip-sync animation.
      const faceParams = { skin, hair, eyeColor, beard, facemask, gagged, bagged };
      const mouthStates = [0, 0.3, 0.6, 0.85];
      this._faceTextures = mouthStates.map(mo =>
        this._makeFaceTexture({ ...faceParams, mouthOpen: mo })
      );
      const headMat = new THREE.MeshStandardMaterial({
        map: this._faceTextures[0],
        roughness: 0.65,
        metalness: 0.0,
      });
      const skull = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 32, 24),
        headMat
      );
      skull.scale.set(0.92, 1.05, 0.95);
      skull.castShadow = true;
      this.head.add(skull);
      this._skullMat = headMat;
      this._talking = false;
      this._talkTimer = 0;

      // Nose (3D bump for depth).
      const nose = new THREE.Mesh(
        new THREE.SphereGeometry(0.02, 8, 6),
        matSkin
      );
      nose.scale.set(0.7, 1.2, 0.8);
      nose.position.set(0, -0.01, 0.108);
      this.head.add(nose);

      // Ears.
      for (const side of [-1, 1]) {
        const ear = new THREE.Mesh(
          new THREE.SphereGeometry(0.022, 8, 6),
          matSkin
        );
        ear.scale.set(0.4, 1, 0.6);
        ear.position.set(side * 0.105, -0.01, 0.0);
        this.head.add(ear);
      }
    }

    // --- Hair / hood ---
    if (!bagged) {
      if (longHair) {
        this._addLongHair(matHair);
      } else if (hooded) {
        const hood = new THREE.Mesh(
          new THREE.SphereGeometry(0.15, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62),
          matHair
        );
        hood.position.y = 0.01;
        hood.position.z = -0.02;
        hood.castShadow = true;
        this.head.add(hood);
      } else {
        const hairTop = new THREE.Mesh(
          new THREE.SphereGeometry(0.125, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
          matHair
        );
        hairTop.position.y = 0.02;
        hairTop.castShadow = true;
        this.head.add(hairTop);
      }
    }

    // --- Facemask (3D cloth over lower face) ---
    if (facemask && !bagged) {
      const maskMat = new THREE.MeshStandardMaterial({
        color: 0x1a1a1a, roughness: 0.95, metalness: 0.0,
        side: THREE.DoubleSide, flatShading: true,
      });

      // Use a half-sphere section that covers from nose-down to chin.
      // SphereGeometry with phiStart/phiLength to get only the front half.
      const mask = new THREE.Mesh(
        new THREE.SphereGeometry(0.122, 16, 10, Math.PI * 0.25, Math.PI * 0.5, Math.PI * 0.60, Math.PI * 0.30),
        maskMat
      );
      mask.scale.set(1.0, 1.15, 1.05);
      mask.position.set(0, -0.06, 0.0);
      mask.castShadow = true;
      this.head.add(mask);

      // Nose bridge cover (thin strip from forehead to mask top).
      const bridge = new THREE.Mesh(
        new THREE.BoxGeometry(0.035, 0.05, 0.06),
        maskMat
      );
      bridge.position.set(0, 0.0, 0.09);
      this.head.add(bridge);

      // Top edge of mask — a thin band to create a clean line across the face.
      const topEdge = new THREE.Mesh(
        new THREE.TorusGeometry(0.118, 0.008, 4, 16, Math.PI),
        maskMat
      );
      topEdge.rotation.x = Math.PI / 2;
      topEdge.rotation.z = Math.PI;
      topEdge.position.set(0, -0.025, 0);
      this.head.add(topEdge);

      // Strap across the back of the head.
      const strap = new THREE.Mesh(
        new THREE.TorusGeometry(0.115, 0.01, 4, 16),
        new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.9 })
      );
      strap.rotation.x = Math.PI / 2;
      strap.position.set(0, -0.055, 0);
      this.head.add(strap);
    }

    // --- Gag (cloth strip) ---
    if (gagged && !bagged && !facemask) {
      const gag = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.05, 0.05),
        new THREE.MeshStandardMaterial({ color: 0xc4b078, roughness: 0.9 })
      );
      gag.position.set(0, -0.04, 0.10);
      this.head.add(gag);
    }

    // --- Beard (3D, if not masked/bagged) ---
    if (beard && !bagged && !facemask) {
      const beardMesh = new THREE.Mesh(
        new THREE.ConeGeometry(0.06, 0.12, 8),
        matHair
      );
      beardMesh.position.set(0, -0.06, 0.06);
      beardMesh.rotation.x = Math.PI;
      beardMesh.castShadow = true;
      this.head.add(beardMesh);
    }

    // --- Arms ---
    this.arms = [];
    for (const side of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(side * 0.24, h * 0.44, 0);
      const upper = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.05, h * 0.30, 8),
        matShirt
      );
      upper.position.y = -h * 0.15;
      upper.castShadow = true;
      arm.add(upper);
      const hand = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 10, 8),
        matSkin
      );
      hand.position.y = -h * 0.30;
      arm.add(hand);
      this.group.add(arm);
      this.arms.push(arm);
    }

    if (bound) {
      // Arms behind the back — rotate backward just enough to rest behind
      // the torso without sticking up.
      this.arms[0].rotation.x = Math.PI * 0.42;
      this.arms[0].rotation.z = -0.25;
      this.arms[1].rotation.x = Math.PI * 0.42;
      this.arms[1].rotation.z = 0.25;
      const rope = new THREE.Mesh(
        new THREE.TorusGeometry(0.06, 0.015, 6, 10),
        new THREE.MeshStandardMaterial({ color: 0x6a5a3a, roughness: 0.9 })
      );
      rope.position.set(0, h * 0.14, -0.12);
      this.group.add(rope);
    }

    // --- Legs (with knee joint) ---
    this.legs = [];
    this.shins = [];
    const thighLen = h * 0.20;
    const shinLen = h * 0.16;
    for (const side of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(side * 0.11, h * 0.18, 0);
      const thigh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.06, thighLen, 8),
        matPants
      );
      thigh.position.y = -thighLen / 2;
      thigh.castShadow = true;
      leg.add(thigh);
      const shin = new THREE.Group();
      shin.position.y = -thighLen;
      leg.add(shin);
      const shinMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.05, shinLen, 8),
        matPants
      );
      shinMesh.position.y = -shinLen / 2;
      shinMesh.castShadow = true;
      shin.add(shinMesh);
      const boot = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.07, 0.20),
        matBoot
      );
      boot.position.set(0, -shinLen, 0.03);
      shin.add(boot);
      this.group.add(leg);
      this.legs.push(leg);
      this.shins.push(shin);
    }

    if (sitting) {
      for (let i = 0; i < 2; i++) {
        this.legs[i].rotation.x = -Math.PI / 2;  // thighs forward
        this.shins[i].rotation.x = Math.PI / 2;   // shins down to floor
      }
    }

    this.height = h;
  }

  // Draw a face onto a canvas and return it as a THREE.CanvasTexture.
  // The texture wraps around the sphere; the center of the canvas maps to
  // the front of the head (positive Z).
  _makeFaceTexture({ skin, hair, eyeColor, beard, facemask, gagged, bagged, mouthOpen = 0 }) {
    const W = 512, H = 512;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');

    const skinHex = '#' + new THREE.Color(skin).getHexString();
    const skinDark = '#' + new THREE.Color(skin).multiplyScalar(0.65).getHexString();
    const skinLight = '#' + new THREE.Color(skin).multiplyScalar(1.15).getHexString();
    const eyeHex = '#' + new THREE.Color(eyeColor).getHexString();
    const hairHex = '#' + new THREE.Color(hair).getHexString();
    const hairDark = '#' + new THREE.Color(hair).multiplyScalar(0.6).getHexString();

    // Fill the entire canvas with skin color (wraps around the back of head).
    ctx.fillStyle = skinHex;
    ctx.fillRect(0, 0, W, H);

    // Add subtle skin texture variation (noise dots).
    for (let i = 0; i < 2000; i++) {
      const x = Math.random() * W;
      const y = Math.random() * H;
      const a = Math.random() * 0.06;
      ctx.fillStyle = Math.random() > 0.5
        ? `rgba(0,0,0,${a})`
        : `rgba(255,255,255,${a})`;
      ctx.fillRect(x, y, 2, 2);
    }

    // The face occupies the center of the canvas.
    // UV: u=0.5 is front-center, v=0.5 is equator.
    // Three.js SphereGeometry maps u=0.25 to +Z (front of head), not u=0.5.
    const cx = W * 0.25;
    const cy = H / 2;

    // --- Hairline (top portion of the face area) ---
    if (!bagged) {
      // Draw hair at the top of the head area.
      ctx.fillStyle = hairHex;
      ctx.beginPath();
      ctx.ellipse(cx, cy - 70, 100, 50, 0, 0, Math.PI, true);
      ctx.fill();
      // Hairline gradient.
      ctx.fillStyle = hairDark;
      ctx.beginPath();
      ctx.ellipse(cx, cy - 60, 95, 40, 0, 0, Math.PI, true);
      ctx.fill();
    }

    // --- Brows ---
    if (!bagged) {
      ctx.fillStyle = hairDark;
      // Left brow.
      ctx.save();
      ctx.translate(cx - 40, cy - 20);
      ctx.rotate(-0.05);
      ctx.beginPath();
      ctx.ellipse(0, 0, 22, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // Right brow.
      ctx.save();
      ctx.translate(cx + 40, cy - 20);
      ctx.rotate(0.05);
      ctx.beginPath();
      ctx.ellipse(0, 0, 22, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // --- Eye sockets (darker skin shadow) ---
    if (!bagged) {
      for (const side of [-1, 1]) {
        const ex = cx + side * 40;
        const ey = cy - 5;
        // Shadow.
        ctx.fillStyle = skinDark;
        ctx.beginPath();
        ctx.ellipse(ex, ey, 24, 14, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // --- Eyes (whites + iris + pupil + highlight) ---
    if (!bagged) {
      for (const side of [-1, 1]) {
        const ex = cx + side * 40;
        const ey = cy - 5;

        // White.
        ctx.fillStyle = '#f0f0ec';
        ctx.beginPath();
        ctx.ellipse(ex, ey, 16, 10, 0, 0, Math.PI * 2);
        ctx.fill();

        // Upper eyelid shadow.
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.beginPath();
        ctx.ellipse(ex, ey - 6, 17, 6, 0, 0, Math.PI);
        ctx.fill();

        // Iris.
        ctx.fillStyle = eyeHex;
        ctx.beginPath();
        ctx.arc(ex, ey, 8, 0, Math.PI * 2);
        ctx.fill();

        // Pupil.
        ctx.fillStyle = '#0a0a0a';
        ctx.beginPath();
        ctx.arc(ex, ey, 4, 0, Math.PI * 2);
        ctx.fill();

        // Catchlight.
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        ctx.arc(ex - 2, ey - 2, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Lower lash line.
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(ex, ey, 16, 10, 0, 0.15, Math.PI - 0.15);
        ctx.stroke();
      }
    }

    // --- Nose ---
    if (!bagged) {
      ctx.fillStyle = skinLight;
      ctx.beginPath();
      ctx.moveTo(cx, cy + 8);
      ctx.quadraticCurveTo(cx - 8, cy + 25, cx - 5, cy + 35);
      ctx.quadraticCurveTo(cx, cy + 40, cx + 5, cy + 35);
      ctx.quadraticCurveTo(cx + 8, cy + 25, cx, cy + 8);
      ctx.fill();
      // Nostril shadows.
      ctx.fillStyle = skinDark;
      ctx.beginPath();
      ctx.ellipse(cx - 4, cy + 33, 2.5, 1.5, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + 4, cy + 33, 2.5, 1.5, 0.3, 0, Math.PI * 2);
      ctx.fill();
      // Nose bridge highlight.
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(cx - 2, cy + 10, 4, 20);
    }

    // --- Cheek warmth ---
    if (!bagged) {
      for (const side of [-1, 1]) {
        const cx2 = cx + side * 55;
        const cy2 = cy + 20;
        const grad = ctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, 25);
        grad.addColorStop(0, 'rgba(180,80,40,0.12)');
        grad.addColorStop(1, 'rgba(180,80,40,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(cx2 - 30, cy2 - 30, 60, 60);
      }
    }

    // --- Mouth / Beard / Facemask ---
    if (facemask) {
      // Dark cloth over lower face — shaped to follow the jaw line.
      const maskTop = cy + 30;   // just under the nose
      const maskBot = cy + 85;   // down to chin
      const maskHW = 62;          // half-width at widest point

      // Base fill with vertical gradient (lighter at top edge where light hits).
      const mGrad = ctx.createLinearGradient(cx, maskTop, cx, maskBot);
      mGrad.addColorStop(0, '#2a2a2a');
      mGrad.addColorStop(0.15, '#1e1e1e');
      mGrad.addColorStop(0.6, '#161616');
      mGrad.addColorStop(1, '#0e0e0e');
      ctx.fillStyle = mGrad;
      ctx.beginPath();
      // Shape: starts wide under nose, tapers toward chin.
      ctx.moveTo(cx - maskHW, maskTop + 5);
      ctx.quadraticCurveTo(cx - maskHW - 3, cy + 55, cx - 40, maskBot);
      ctx.quadraticCurveTo(cx, maskBot + 8, cx + 40, maskBot);
      ctx.quadraticCurveTo(cx + maskHW + 3, cy + 55, cx + maskHW, maskTop + 5);
      ctx.quadraticCurveTo(cx, maskTop - 3, cx - maskHW, maskTop + 5);
      ctx.fill();

      // Cloth fold shadows (vertical folds radiating from nose bridge).
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1.5;
      for (let i = -4; i <= 4; i++) {
        if (i === 0) continue;
        const fx = cx + i * 12;
        ctx.beginPath();
        ctx.moveTo(fx, maskTop + 2);
        ctx.quadraticCurveTo(fx + i * 1.5, cy + 55, fx + i * 0.5, maskBot - 5);
        ctx.stroke();
      }

      // Top edge highlight (rim light catching the cloth edge).
      ctx.strokeStyle = 'rgba(120,120,130,0.25)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - maskHW + 2, maskTop + 5);
      ctx.quadraticCurveTo(cx, maskTop - 2, cx + maskHW - 2, maskTop + 5);
      ctx.stroke();

      // Subtle horizontal weave texture.
      ctx.strokeStyle = 'rgba(255,255,255,0.025)';
      ctx.lineWidth = 0.8;
      for (let y = maskTop + 3; y < maskBot; y += 4) {
        ctx.beginPath();
        ctx.moveTo(cx - maskHW, y);
        ctx.lineTo(cx + maskHW, y);
        ctx.stroke();
      }
    } else if (gagged) {
      // Cloth gag strip.
      ctx.fillStyle = '#c4b078';
      ctx.fillRect(cx - 45, cy + 35, 90, 16);
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - 45, cy + 35, 90, 16);
    } else {
      // Lips — parameterized by mouthOpen (0 = closed, 1 = wide open).
      const lipY = cy + 48;
      const mouthW = 28;
      const openH = mouthOpen * 14; // max gap height

      if (openH > 1) {
        // Dark mouth interior.
        ctx.fillStyle = '#3a1818';
        ctx.beginPath();
        ctx.ellipse(cx, lipY + 2, mouthW * 0.7, openH * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        // Teeth (top row, slightly visible).
        if (mouthOpen > 0.3) {
          ctx.fillStyle = '#e8e0d0';
          ctx.fillRect(cx - mouthW * 0.5, lipY - 2, mouthW, 3);
        }
      }

      // Upper lip.
      ctx.fillStyle = '#8a4a3a';
      ctx.beginPath();
      ctx.moveTo(cx - mouthW, lipY);
      ctx.quadraticCurveTo(cx - 14, lipY - 6, cx, lipY - 2);
      ctx.quadraticCurveTo(cx + 14, lipY - 6, cx + mouthW, lipY);
      ctx.quadraticCurveTo(cx + 14, lipY + 4 + openH * 0.3, cx, lipY + 2 + openH * 0.2);
      ctx.quadraticCurveTo(cx - 14, lipY + 4 + openH * 0.3, cx - mouthW, lipY);
      ctx.fill();
      // Lower lip (pulled down when open).
      ctx.fillStyle = '#9a5a4a';
      ctx.beginPath();
      ctx.moveTo(cx - 24, lipY + 3 + openH * 0.5);
      ctx.quadraticCurveTo(cx, lipY + 12 + openH, cx + 24, lipY + 3 + openH * 0.5);
      ctx.quadraticCurveTo(cx, lipY + 6 + openH * 0.5, cx - 24, lipY + 3 + openH * 0.5);
      ctx.fill();
      // Lip highlight.
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.ellipse(cx, lipY + 5 + openH * 0.3, 16, 2, 0, 0, Math.PI * 2);
      ctx.fill();

      // Beard (if requested).
      if (beard) {
        ctx.fillStyle = hairHex;
        ctx.beginPath();
        ctx.ellipse(cx, cy + 65, 45, 30, 0, 0.2, Math.PI - 0.2);
        ctx.fill();
        // Beard texture.
        ctx.fillStyle = hairDark;
        for (let i = 0; i < 30; i++) {
          const bx = cx + (Math.random() - 0.5) * 80;
          const by = cy + 50 + Math.random() * 40;
          ctx.fillRect(bx, by, 2, 4);
        }
        // Mustache.
        ctx.fillStyle = hairHex;
        ctx.beginPath();
        ctx.ellipse(cx - 12, lipY + 1, 14, 5, -0.1, 0, Math.PI);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(cx + 12, lipY + 1, 14, 5, 0.1, 0, Math.PI);
        ctx.fill();
      }
    }

    // --- Chin shadow ---
    if (!facemask) {
      const grad = ctx.createRadialGradient(cx, cy + 75, 0, cx, cy + 75, 40);
      grad.addColorStop(0, 'rgba(0,0,0,0.08)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(cx - 45, cy + 50, 90, 50);
    }

    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _addLongHair(matHair) {
    // Hair cap on top.
    const hairTop = new THREE.Mesh(
      new THREE.SphereGeometry(0.128, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6),
      matHair
    );
    hairTop.position.y = 0.02;
    hairTop.castShadow = true;
    this.head.add(hairTop);
    // Long flowing hair down the back and sides.
    for (const side of [-1, -0.5, 0, 0.5, 1]) {
      const lock = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.02, 0.40, 6),
        matHair
      );
      lock.position.set(side * 0.08, -0.16, -0.05);
      lock.rotation.z = side * 0.15;
      lock.rotation.x = -0.1;
      lock.castShadow = true;
      this.head.add(lock);
    }
    // Sideburns connecting hair to jaw.
    for (const side of [-1, 1]) {
      const burn = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, 0.12, 0.04),
        matHair
      );
      burn.position.set(side * 0.11, -0.02, 0.04);
      this.head.add(burn);
    }
  }

  lookAt(point) {
    this._lookTarget = point;
  }

  setTalking(talking) {
    this._talking = talking;
    if (!talking && this._faceTextures) {
      this._skullMat.map = this._faceTextures[0];
      this._skullMat.needsUpdate = true;
    }
  }

  walkTo(point, speed = 1.5) {
    this._walkTarget = point.clone();
    this._walkSpeed = speed;
    this._sitting = false;
    this._kneeling = false;
  }

  isAtTarget() {
    return this._walkTarget === null;
  }

  kneel(k = true) {
    this._kneeling = k;
    this._sitting = false;
    this._walkTarget = null;
  }

  lookUp(amount = 0.5) {
    this._lookUpAmount = amount;
  }

  fall() {
    this._fallen = true;
    this._walkTarget = null;
    this._kneeling = false;
    this._sitting = false;
  }

  standUp() {
    if (this._sitting) {
      this._standingUp = true;
      this._standUpProgress = 0;
    }
  }

  // Y offset to place feet on ground when group origin is at this Y.
  get footOffset() {
    const h = this.height || 1.75;
    return h * 0.18 + 0.035; // hip height + half boot thickness
  }

  update(t, opts = {}) {
    const { walking = false, sitting = false } = opts;
    const dt = opts.dt || 0.016;

    // Lip-sync: cycle through mouth textures when talking.
    if (this._talking && this._faceTextures) {
      this._talkTimer += dt;
      const flap = Math.sin(this._talkTimer * 16) * 0.5 + 0.5;
      const noise = Math.sin(this._talkTimer * 7.3) * 0.3 + 0.5;
      const idx = Math.floor((flap * 0.6 + noise * 0.4) * this._faceTextures.length);
      const clamped = Math.min(this._faceTextures.length - 1, Math.max(0, idx));
      if (this._skullMat.map !== this._faceTextures[clamped]) {
        this._skullMat.map = this._faceTextures[clamped];
        this._skullMat.needsUpdate = true;
      }
    }

    // --- Fallen (dead): lerp to face-down on ground, skip all other anim ---
    if (this._fallen) {
      const targetX = -Math.PI / 2;
      this.group.rotation.x += (targetX - this.group.rotation.x) * 0.08;
      const groundY = this._fallenGroundY ?? 0;
      this.group.position.y += (groundY - this.group.position.y) * 0.08;
      this._updateHeadTracking(t);
      return;
    }

    // --- Walk-to-point: move toward target, set walking flag ---
    let isWalking = walking;
    if (this._walkTarget) {
      const dx = this._walkTarget.x - this.group.position.x;
      const dz = this._walkTarget.z - this.group.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 0.3) {
        this._walkTarget = null;
      } else {
        this.group.position.x += (dx / dist) * this._walkSpeed * dt;
        this.group.position.z += (dz / dist) * this._walkSpeed * dt;
        // Smoothly face direction of movement.
        const targetYaw = Math.atan2(dx, dz);
        let dyaw = targetYaw - this.group.rotation.y;
        while (dyaw > Math.PI) dyaw -= Math.PI * 2;
        while (dyaw < -Math.PI) dyaw += Math.PI * 2;
        this.group.rotation.y += dyaw * 0.15;
        isWalking = true;
      }
    }

    // --- Standing-up transition (from sitting) ---
    if (this._standingUp) {
      this._standUpProgress += dt * 2.5;
      const p = Math.min(this._standUpProgress, 1);
      const ease = p * p * (3 - 2 * p);
      this.legs[0].rotation.x = -Math.PI / 2 * (1 - ease);
      this.legs[1].rotation.x = -Math.PI / 2 * (1 - ease);
      this.shins[0].rotation.x = Math.PI / 2 * (1 - ease);
      this.shins[1].rotation.x = Math.PI / 2 * (1 - ease);
      this.group.children[0].scale.y = 1 + Math.sin(t * 1.8) * 0.012;
      if (p >= 1) {
        this._standingUp = false;
        this._sitting = false;
      }
    } else if (this._kneeling) {
      // Kneeling: legs folded, torso lowered, arms forward.
      this.legs[0].rotation.x = -Math.PI * 0.65;
      this.legs[1].rotation.x = -Math.PI * 0.65;
      this.shins[0].rotation.x = Math.PI * 0.60;
      this.shins[1].rotation.x = Math.PI * 0.60;
      if (!this._bound) {
        this.arms[0].rotation.x = 0.9;
        this.arms[1].rotation.x = 0.9;
      }
      this.group.children[0].scale.y = 0.82 + Math.sin(t * 1.8) * 0.008;
    } else if (sitting || this._sitting) {
      if (!this._bound) {
        this.arms[0].rotation.x = 0.08;
        this.arms[1].rotation.x = 0.08;
      }
      this.group.children[0].scale.y = 1 + Math.sin(t * 1.8) * 0.012;
    } else if (isWalking) {
      const s = t * 6;
      this.legs[0].rotation.x = Math.sin(s) * 0.5;
      this.legs[1].rotation.x = -Math.sin(s) * 0.5;
      this.arms[0].rotation.x = -Math.sin(s) * 0.4;
      this.arms[1].rotation.x = Math.sin(s) * 0.4;
    } else {
      if (!this._bound) {
        this.arms[0].rotation.x = Math.sin(t * 1.2) * 0.05;
        this.arms[1].rotation.x = -Math.sin(t * 1.2) * 0.05;
      }
    }

    this._updateHeadTracking(t);

    // Look-up override (for pre-dragon moment).
    if (this.head && this._lookUpAmount > 0) {
      this.head.rotation.x -= this._lookUpAmount;
    }
  }

  _updateHeadTracking(t) {
    if (this.head && this._lookTarget) {
      const headWorldPos = new THREE.Vector3();
      this.head.getWorldPosition(headWorldPos);
      const dx = this._lookTarget.x - headWorldPos.x;
      const dy = this._lookTarget.y - headWorldPos.y;
      const dz = this._lookTarget.z - headWorldPos.z;
      const targetYaw = Math.atan2(dx, dz);
      const targetPitch = Math.atan2(-dy, Math.sqrt(dx * dx + dz * dz));
      const bodyYaw = this.group.rotation.y;
      const localYaw = targetYaw - bodyYaw;
      const lerp = 0.08;
      this.head.rotation.y += (localYaw - this.head.rotation.y) * lerp;
      this.head.rotation.x += (targetPitch * 0.5 - this.head.rotation.x) * lerp;
    } else if (this.head) {
      this.head.rotation.y *= 0.92;
      this.head.rotation.x *= 0.92;
    }
  }
}
