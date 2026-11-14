import * as THREE from 'three';

export interface InteractableEntity {
  id: string;
  name: string;
  mesh: THREE.Object3D;
  colliderRadius: number;
  isHeld: boolean;
  velocity: THREE.Vector3;
  angularVelocity: THREE.Vector3;
  homePosition: THREE.Vector3;
  isTarget?: boolean;
  targetCooldown?: number;
  onHit?: () => void;
}

/**
 * Creates high-detail procedural canvas textures for floors, wainscoted walls,
 * and library bookshelves without external assets.
 */
function createParquetTexture(): THREE.CanvasTexture {
  if (typeof document === 'undefined') {
    return new THREE.CanvasTexture(null as unknown as HTMLCanvasElement);
  }
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#3e2716';
    ctx.fillRect(0, 0, 512, 512);

    const plankWidth = 64;
    const plankHeight = 128;
    const colors = ['#4f331e', '#5a3b23', '#452c1a', '#523620', '#3a2415'];

    for (let y = 0; y < 512; y += plankHeight) {
      for (let x = 0; x < 512; x += plankWidth) {
        const offset = ((y / plankHeight) % 2) * (plankWidth / 2);
        const px = (x + offset) % 512;
        const color = colors[Math.floor(Math.random() * colors.length)];
        ctx.fillStyle = color;
        ctx.fillRect(px, y, plankWidth - 2, plankHeight - 2);

        // Wood grain lines
        ctx.strokeStyle = 'rgba(25, 14, 8, 0.45)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 4; i++) {
          const gx = px + Math.random() * (plankWidth - 4);
          ctx.beginPath();
          ctx.moveTo(gx, y);
          ctx.lineTo(gx + (Math.random() - 0.5) * 6, y + plankHeight - 2);
          ctx.stroke();
        }
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(6, 6);
  return texture;
}

function createWainscotWallTexture(): THREE.CanvasTexture {
  if (typeof document === 'undefined') {
    return new THREE.CanvasTexture(null as unknown as HTMLCanvasElement);
  }
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Upper wall: textured warm cream plaster
    ctx.fillStyle = '#e4dacf';
    ctx.fillRect(0, 0, 512, 280);

    // Subtle stucco noise
    for (let i = 0; i < 1200; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255, 255, 255, 0.12)' : 'rgba(160, 145, 130, 0.1)';
      ctx.fillRect(Math.random() * 512, Math.random() * 280, 2, 2);
    }

    // Chair rail wood molding divider
    ctx.fillStyle = '#2d1a10';
    ctx.fillRect(0, 276, 512, 16);
    ctx.fillStyle = '#5c3924';
    ctx.fillRect(0, 280, 512, 8);

    // Lower wall: rich mahogany wood paneling
    ctx.fillStyle = '#422818';
    ctx.fillRect(0, 292, 512, 220);

    const panelW = 128;
    for (let x = 8; x < 512; x += panelW) {
      // Inset wood panel frame
      ctx.fillStyle = '#311c10';
      ctx.fillRect(x, 306, panelW - 16, 190);
      ctx.fillStyle = '#4f301d';
      ctx.fillRect(x + 4, 310, panelW - 24, 182);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.repeat.set(4, 1);
  return texture;
}

function createBookshelfTexture(): THREE.CanvasTexture {
  if (typeof document === 'undefined') {
    return new THREE.CanvasTexture(null as unknown as HTMLCanvasElement);
  }
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#2a180e';
    ctx.fillRect(0, 0, 512, 512);

    const shelfRows = 4;
    const shelfH = 512 / shelfRows;
    const bookColors = [
      '#7b1e1e', '#1c4d63', '#1e5f39', '#8a6519', '#4d2d6d',
      '#994224', '#2d3b5c', '#5a2233', '#685934'
    ];

    for (let r = 0; r < shelfRows; r++) {
      const sy = r * shelfH;
      // Wood shelf plank
      ctx.fillStyle = '#3e2415';
      ctx.fillRect(0, sy + shelfH - 12, 512, 12);
      ctx.fillStyle = '#1c0f08';
      ctx.fillRect(0, sy + shelfH - 14, 512, 2);

      // Books in shelf
      let bx = 16;
      while (bx < 496) {
        const bw = 12 + Math.random() * 16;
        const bh = shelfH - 24 - Math.random() * 14;
        const color = bookColors[Math.floor(Math.random() * bookColors.length)];
        ctx.fillStyle = color;
        ctx.fillRect(bx, sy + shelfH - 12 - bh, bw - 2, bh);

        // Gold foil spine line
        if (Math.random() > 0.4) {
          ctx.fillStyle = '#e6c46a';
          ctx.fillRect(bx + 2, sy + shelfH - 12 - bh + 6, bw - 6, 2);
          ctx.fillRect(bx + 2, sy + shelfH - 12 - 10, bw - 6, 2);
        }
        bx += bw;
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

/**
 * Architectural expansion of the house: connects the living room through an open archway
 * into a grand Arcane Study & Conservatory with parquet floors, wainscoted walls,
 * exposed wooden beams, panoramic bay window, and interactive magical relics & training targets.
 */
export class HouseExpansion extends THREE.Group {
  readonly interactables: InteractableEntity[] = [];

  private relicCrystal!: THREE.Mesh;
  private relicRing1!: THREE.Mesh;
  private relicRing2!: THREE.Mesh;
  private targetOrb1!: THREE.Mesh;
  private targetOrb2!: THREE.Mesh;

  private targetMat1!: THREE.MeshStandardMaterial;
  private targetMat2!: THREE.MeshStandardMaterial;

  private parquetTex: THREE.CanvasTexture;
  private wallTex: THREE.CanvasTexture;
  private bookTex: THREE.CanvasTexture;

  constructor() {
    super();
    this.name = 'HouseExpansion';

    this.parquetTex = createParquetTexture();
    this.wallTex = createWainscotWallTexture();
    this.bookTex = createBookshelfTexture();

    this.buildArchitecture();
    this.buildFurniture();
    this.buildRelicAndTargets();
    this.buildLighting();
  }

  private buildArchitecture(): void {
    const wallMat = new THREE.MeshStandardMaterial({
      map: this.wallTex,
      roughness: 0.72,
      metalness: 0.08,
      side: THREE.DoubleSide,
    });

    const floorMat = new THREE.MeshStandardMaterial({
      map: this.parquetTex,
      roughness: 0.42,
      metalness: 0.05,
    });

    const woodTrimMat = new THREE.MeshStandardMaterial({
      color: 0x3d2516,
      roughness: 0.5,
      metalness: 0.1,
    });

    // 1. Room Floor: (X: [-3.6, 3.6], Z: [2.75, 8.2], Y: 0.01)
    const floorGeo = new THREE.PlaneGeometry(7.2, 5.45);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0.01, 5.475);
    floor.receiveShadow = true;
    this.add(floor);

    // 2. Ceiling: at Y = 3.20
    const ceilingGeo = new THREE.PlaneGeometry(7.2, 5.45);
    const ceilingMat = new THREE.MeshStandardMaterial({
      color: 0xf5ede4,
      roughness: 0.9,
    });
    const ceiling = new THREE.Mesh(ceilingGeo, ceilingMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, 3.20, 5.475);
    this.add(ceiling);

    // Exposed Wooden Ceiling Beams
    const beamGeoX = new THREE.BoxGeometry(7.2, 0.18, 0.22);
    for (let bz = 3.6; bz <= 7.8; bz += 1.35) {
      const beam = new THREE.Mesh(beamGeoX, woodTrimMat);
      beam.position.set(0, 3.10, bz);
      this.add(beam);
    }

    // 3. Left Wall (X = -3.6, Z from 2.75 to 8.2)
    const leftWallGeo = new THREE.PlaneGeometry(5.45, 3.20);
    const leftWall = new THREE.Mesh(leftWallGeo, wallMat);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-3.60, 1.60, 5.475);
    this.add(leftWall);

    // 4. Right Wall (X = 3.6, Z from 2.75 to 8.2)
    const rightWallGeo = new THREE.PlaneGeometry(5.45, 3.20);
    const rightWall = new THREE.Mesh(rightWallGeo, wallMat);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(3.60, 1.60, 5.475);
    this.add(rightWall);

    // 5. Front Wall with Archway (at Z = 2.75)
    // Left Wing of front wall: X from -3.6 to -1.35
    const frontLeftGeo = new THREE.PlaneGeometry(2.25, 3.20);
    const frontLeft = new THREE.Mesh(frontLeftGeo, wallMat);
    frontLeft.position.set(-2.475, 1.60, 2.75);
    this.add(frontLeft);

    // Right Wing of front wall: X from 1.35 to 3.6
    const frontRightGeo = new THREE.PlaneGeometry(2.25, 3.20);
    const frontRight = new THREE.Mesh(frontRightGeo, wallMat);
    frontRight.position.set(2.475, 1.60, 2.75);
    this.add(frontRight);

    // Archway Header lintel above the opening: X from -1.35 to 1.35, Y from 2.50 to 3.20
    const archLintelGeo = new THREE.BoxGeometry(2.70, 0.70, 0.22);
    const archLintel = new THREE.Mesh(archLintelGeo, woodTrimMat);
    archLintel.position.set(0, 2.85, 2.75);
    this.add(archLintel);

    // Decorative Fluted Columns framing the archway
    const colGeo = new THREE.CylinderGeometry(0.12, 0.14, 2.6, 16);
    const leftCol = new THREE.Mesh(colGeo, woodTrimMat);
    leftCol.position.set(-1.35, 1.30, 2.75);
    this.add(leftCol);

    const rightCol = new THREE.Mesh(colGeo, woodTrimMat);
    rightCol.position.set(1.35, 1.30, 2.75);
    this.add(rightCol);

    // Archway threshold step
    const stepGeo = new THREE.BoxGeometry(2.70, 0.04, 0.35);
    const stepMat = new THREE.MeshStandardMaterial({color: 0x5a3c26, roughness: 0.4});
    const step = new THREE.Mesh(stepGeo, stepMat);
    step.position.set(0, 0.02, 2.75);
    this.add(step);

    // 6. Back Wall: Grand Conservatory Bay Window overlooking twilight forest (at Z = 8.20)
    // Window Frame
    const winFrameGeo = new THREE.BoxGeometry(7.20, 3.20, 0.18);
    const winFrame = new THREE.Mesh(winFrameGeo, woodTrimMat);
    winFrame.position.set(0, 1.60, 8.20);
    this.add(winFrame);

    // Glass Window Panes
    const glassGeo = new THREE.PlaneGeometry(6.40, 2.50);
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x9be2ff,
      transmission: 0.75,
      opacity: 0.85,
      transparent: true,
      roughness: 0.12,
      ior: 1.5,
    });
    const glass = new THREE.Mesh(glassGeo, glassMat);
    glass.position.set(0, 1.65, 8.16);
    this.add(glass);

    // Scenic backdrop outside the bay window
    const scenicGeo = new THREE.PlaneGeometry(9.0, 4.5);
    const scenicCanvas = document.createElement('canvas');
    scenicCanvas.width = 512;
    scenicCanvas.height = 256;
    const sctx = scenicCanvas.getContext('2d');
    if (sctx) {
      const grad = sctx.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, '#0a0d24');
      grad.addColorStop(0.5, '#1e2448');
      grad.addColorStop(0.85, '#354366');
      grad.addColorStop(1, '#1b2d28');
      sctx.fillStyle = grad;
      sctx.fillRect(0, 0, 512, 256);

      // Distant mountain & pine tree silhouettes
      sctx.fillStyle = '#091512';
      sctx.beginPath();
      sctx.moveTo(0, 256);
      for (let x = 0; x <= 512; x += 16) {
        const ty = 140 + Math.sin(x * 0.04) * 25 + Math.random() * 20;
        sctx.lineTo(x, ty);
      }
      sctx.lineTo(512, 256);
      sctx.fill();

      // Glowing stars & fireflies
      for (let i = 0; i < 70; i++) {
        sctx.fillStyle = `rgba(220, 240, 255, ${0.4 + Math.random() * 0.6})`;
        sctx.fillRect(Math.random() * 512, Math.random() * 120, 2, 2);
      }
    }
    const scenicTex = new THREE.CanvasTexture(scenicCanvas);
    const scenicMat = new THREE.MeshBasicMaterial({map: scenicTex});
    const scenicBackdrop = new THREE.Mesh(scenicGeo, scenicMat);
    scenicBackdrop.position.set(0, 1.70, 8.65);
    this.add(scenicBackdrop);
  }

  private buildFurniture(): void {
    const woodMat = new THREE.MeshStandardMaterial({
      color: 0x3a2214,
      roughness: 0.45,
      metalness: 0.1,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      roughness: 0.3,
      metalness: 0.8,
    });

    // 1. Large Bookshelf along the left wall (X: -3.30, Z: 4.0)
    const shelfGeo = new THREE.BoxGeometry(0.55, 2.40, 1.50);
    const shelfMat = new THREE.MeshStandardMaterial({
      map: this.bookTex,
      roughness: 0.65,
    });
    const bookshelf = new THREE.Mesh(shelfGeo, shelfMat);
    bookshelf.position.set(-3.30, 1.20, 4.0);
    this.add(bookshelf);

    // 2. Study Desk (X: -2.15, Z: 5.45)
    const deskTopGeo = new THREE.BoxGeometry(1.40, 0.08, 0.85);
    const deskTop = new THREE.Mesh(deskTopGeo, woodMat);
    deskTop.position.set(-2.15, 0.78, 5.45);
    this.add(deskTop);

    // Desk Legs
    const legGeo = new THREE.CylinderGeometry(0.035, 0.03, 0.76, 12);
    const legPositions = [
      [-2.75, 0.38, 5.10],
      [-1.55, 0.38, 5.10],
      [-2.75, 0.38, 5.80],
      [-1.55, 0.38, 5.80],
    ];
    for (const [lx, ly, lz] of legPositions) {
      const leg = new THREE.Mesh(legGeo, brassMat);
      leg.position.set(lx, ly, lz);
      this.add(leg);
    }

    // Desk Props: Open Antique Spellbook & Runic Cubes
    const bookCover = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.04, 0.24),
      new THREE.MeshStandardMaterial({color: 0x6e2626, roughness: 0.5})
    );
    bookCover.position.set(-2.35, 0.84, 5.40);
    bookCover.rotation.y = 0.2;
    this.add(bookCover);

    // Interactive Runic Cubes on the desk
    this.createRunicCube('cube1', new THREE.Vector3(-1.85, 0.88, 5.35), 0x3ae6ff);
    this.createRunicCube('cube2', new THREE.Vector3(-1.75, 0.88, 5.55), 0xff88ff);

    // 3. Right Wall Gallery Display (X: 3.30, Z: 4.80)
    const displayGeo = new THREE.BoxGeometry(0.50, 1.80, 2.20);
    const displayMat = new THREE.MeshStandardMaterial({color: 0x2e1c12, roughness: 0.55});
    const display = new THREE.Mesh(displayGeo, displayMat);
    display.position.set(3.30, 0.90, 4.80);
    this.add(display);
  }

  private createRunicCube(id: string, pos: THREE.Vector3, emissiveColor: number): void {
    const geo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1a243a,
      emissive: emissiveColor,
      emissiveIntensity: 0.6,
      roughness: 0.25,
      metalness: 0.6,
    });
    const cube = new THREE.Mesh(geo, mat);
    cube.position.copy(pos);
    this.add(cube);

    this.interactables.push({
      id,
      name: 'Cubo Rúnico',
      mesh: cube,
      colliderRadius: 0.10,
      isHeld: false,
      velocity: new THREE.Vector3(),
      angularVelocity: new THREE.Vector3(),
      homePosition: pos.clone(),
    });
  }

  private buildRelicAndTargets(): void {
    // 1. Central Relic Pedestal (X: 0, Z: 5.60)
    const pedGeo = new THREE.CylinderGeometry(0.55, 0.68, 0.90, 8);
    const pedMat = new THREE.MeshStandardMaterial({
      color: 0x2e2f3d,
      roughness: 0.5,
      metalness: 0.2,
    });
    const pedestal = new THREE.Mesh(pedGeo, pedMat);
    pedestal.position.set(0, 0.45, 5.60);
    this.add(pedestal);

    // Glowing Rune Inlay on Pedestal
    const ringGeo = new THREE.RingGeometry(0.28, 0.46, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x6be5ff,
      side: THREE.DoubleSide,
    });
    const pedRing = new THREE.Mesh(ringGeo, ringMat);
    pedRing.rotation.x = -Math.PI / 2;
    pedRing.position.set(0, 0.905, 5.60);
    this.add(pedRing);

    // 2. The Levitating Aether Relic Crystal
    const relicGroup = new THREE.Group();
    relicGroup.position.set(0, 1.35, 5.60);

    const crystalGeo = new THREE.OctahedronGeometry(0.28, 1);
    const crystalMat = new THREE.MeshPhysicalMaterial({
      color: 0x4ff2ff,
      emissive: 0x33b8ff,
      emissiveIntensity: 0.75,
      roughness: 0.15,
      metalness: 0.1,
      transmission: 0.6,
      transparent: true,
      opacity: 0.92,
    });
    this.relicCrystal = new THREE.Mesh(crystalGeo, crystalMat);
    relicGroup.add(this.relicCrystal);

    // Orbiting Arcane Rings
    const r1Geo = new THREE.TorusGeometry(0.42, 0.015, 8, 32);
    const rMat = new THREE.MeshBasicMaterial({color: 0xd86eff});
    this.relicRing1 = new THREE.Mesh(r1Geo, rMat);
    relicGroup.add(this.relicRing1);

    const r2Geo = new THREE.TorusGeometry(0.48, 0.015, 8, 32);
    this.relicRing2 = new THREE.Mesh(r2Geo, rMat);
    relicGroup.add(this.relicRing2);

    this.add(relicGroup);

    this.interactables.push({
      id: 'aether_crystal',
      name: 'Cristal de Éter',
      mesh: relicGroup,
      colliderRadius: 0.35,
      isHeld: false,
      velocity: new THREE.Vector3(),
      angularVelocity: new THREE.Vector3(),
      homePosition: relicGroup.position.clone(),
    });

    // 3. Arcane Training Target Pillars (Reaction Targets)
    this.buildTargetPillar('target_left', new THREE.Vector3(-2.10, 0, 7.20), 1);
    this.buildTargetPillar('target_right', new THREE.Vector3(2.10, 0, 7.20), 2);
  }

  private buildTargetPillar(id: string, basePos: THREE.Vector3, index: number): void {
    const obeliskGeo = new THREE.CylinderGeometry(0.22, 0.28, 1.30, 6);
    const obeliskMat = new THREE.MeshStandardMaterial({
      color: 0x252a38,
      roughness: 0.6,
    });
    const obelisk = new THREE.Mesh(obeliskGeo, obeliskMat);
    obelisk.position.set(basePos.x, 0.65, basePos.z);
    this.add(obelisk);

    // Floating Target Orb
    const orbGeo = new THREE.SphereGeometry(0.22, 24, 24);
    const orbMat = new THREE.MeshStandardMaterial({
      color: 0x1f1433,
      emissive: 0x9d4edd,
      emissiveIntensity: 0.85,
      roughness: 0.2,
      metalness: 0.5,
    });
    const orb = new THREE.Mesh(orbGeo, orbMat);
    orb.position.set(basePos.x, 1.55, basePos.z);
    this.add(orb);

    if (index === 1) {
      this.targetOrb1 = orb;
      this.targetMat1 = orbMat;
    } else {
      this.targetOrb2 = orb;
      this.targetMat2 = orbMat;
    }

    const entity: InteractableEntity = {
      id,
      name: `Alvo Arcano ${index}`,
      mesh: orb,
      colliderRadius: 0.28,
      isHeld: false,
      isTarget: true,
      targetCooldown: 0,
      velocity: new THREE.Vector3(),
      angularVelocity: new THREE.Vector3(),
      homePosition: orb.position.clone(),
      onHit: () => {
        orbMat.emissive.setHex(0x57ffb0);
        orbMat.emissiveIntensity = 2.2;
        entity.targetCooldown = 0.6;
      },
    };
    this.interactables.push(entity);
  }

  private buildLighting(): void {
    // Warm Archway Chandelier/Lantern Light
    const archLight = new THREE.PointLight(0xffdfb3, 1.8, 6.5);
    archLight.position.set(0, 2.50, 3.20);
    this.add(archLight);

    // Mystical Arcane Light over the Central Pedestal
    const relicLight = new THREE.PointLight(0x73d2ff, 2.2, 5.0);
    relicLight.position.set(0, 1.60, 5.60);
    this.add(relicLight);

    // Warm Study Desk Lamp
    const deskLight = new THREE.PointLight(0xffeaad, 1.2, 3.5);
    deskLight.position.set(-2.15, 1.15, 5.45);
    this.add(deskLight);
  }

  update(dt: number): void {
    const time = performance.now() * 0.001;

    // Relic Idle Levitation Animation
    if (this.relicCrystal) {
      this.relicCrystal.rotation.y += 0.8 * dt;
      this.relicCrystal.rotation.x = Math.sin(time * 1.5) * 0.15;
    }
    if (this.relicRing1) {
      this.relicRing1.rotation.x += 1.2 * dt;
      this.relicRing1.rotation.y += 0.6 * dt;
    }
    if (this.relicRing2) {
      this.relicRing2.rotation.y -= 1.4 * dt;
      this.relicRing2.rotation.z += 0.9 * dt;
    }

    // Target Orbs Bobbing & Cooldown Recovery
    if (this.targetOrb1) {
      this.targetOrb1.position.y = 1.55 + Math.sin(time * 2.0) * 0.05;
      this.targetOrb1.rotation.y += 1.0 * dt;
    }
    if (this.targetOrb2) {
      this.targetOrb2.position.y = 1.55 + Math.cos(time * 2.0) * 0.05;
      this.targetOrb2.rotation.y -= 1.0 * dt;
    }

    for (const item of this.interactables) {
      if (item.targetCooldown && item.targetCooldown > 0) {
        item.targetCooldown -= dt;
        if (item.targetCooldown <= 0) {
          if (item.id === 'target_left' && this.targetMat1) {
            this.targetMat1.emissive.setHex(0x9d4edd);
            this.targetMat1.emissiveIntensity = 0.85;
          } else if (item.id === 'target_right' && this.targetMat2) {
            this.targetMat2.emissive.setHex(0x9d4edd);
            this.targetMat2.emissiveIntensity = 0.85;
          }
        }
      }

      // Physics integration for thrown/knocked items (when not held and not static target)
      if (!item.isHeld && !item.isTarget) {
        const speedSq = item.velocity.lengthSq();
        if (speedSq > 0.0001) {
          item.mesh.position.addScaledVector(item.velocity, dt);
          item.mesh.rotation.x += item.angularVelocity.x * dt;
          item.mesh.rotation.y += item.angularVelocity.y * dt;
          item.mesh.rotation.z += item.angularVelocity.z * dt;

          // Gravity
          item.velocity.y -= 9.8 * dt;

          // Floor bounce
          const minY = 0.01 + item.colliderRadius;
          if (item.mesh.position.y <= minY) {
            item.mesh.position.y = minY;
            item.velocity.y = -item.velocity.y * 0.42;
            item.velocity.x *= 0.86;
            item.velocity.z *= 0.86;
            item.angularVelocity.multiplyScalar(0.85);

            if (Math.abs(item.velocity.y) < 0.15) {
              item.velocity.y = 0;
            }
          }

          // Wall bounds clamping inside the expanded house
          item.mesh.position.x = Math.max(-3.5, Math.min(3.5, item.mesh.position.x));
          item.mesh.position.z = Math.max(-3.5, Math.min(8.0, item.mesh.position.z));
        }
      }
    }
  }

  dispose(): void {
    this.parquetTex.dispose();
    this.wallTex.dispose();
    this.bookTex.dispose();
  }
}
