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
 * Grand Arcane Conservatory & Study:
 * An architectural wing seamlessly connected to the living room through an open archway.
 * Built with rich 3D architectural elements (3D wainscoting moldings, exposed timber rafters,
 * 3D library books, bay windows, and PBR physical materials).
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

  constructor() {
    super();
    this.name = 'HouseExpansion';

    this.buildArchitecture();
    this.buildFurnitureAndBooks();
    this.buildRelicAndTargets();
    this.buildLighting();
  }

  private buildArchitecture(): void {
    // Premium PBR Architectural Materials (No flat 2D canvas drawings!)
    const woodFloorMat = new THREE.MeshStandardMaterial({
      color: 0x3a2416,
      roughness: 0.36,
      metalness: 0.08,
    });

    const woodTrimMat = new THREE.MeshStandardMaterial({
      color: 0x301c10,
      roughness: 0.42,
      metalness: 0.12,
    });

    const wainscotPanelMat = new THREE.MeshStandardMaterial({
      color: 0x422818,
      roughness: 0.48,
      metalness: 0.06,
    });

    const upperWallMat = new THREE.MeshStandardMaterial({
      color: 0xede5db,
      roughness: 0.82,
      metalness: 0.02,
    });

    const ceilingMat = new THREE.MeshStandardMaterial({
      color: 0xf4eee8,
      roughness: 0.90,
    });

    // 1. Conservatory Floor (X: [-3.6, 3.6], Z: [2.95, 8.00], Y: 0.01)
    const floorGeo = new THREE.PlaneGeometry(7.20, 5.05);
    const floor = new THREE.Mesh(floorGeo, woodFloorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0.01, 5.475);
    this.add(floor);

    // 2. Ceiling with Exposed Timber Beams (Y: 3.20)
    const ceilingGeo = new THREE.PlaneGeometry(7.20, 5.05);
    const ceiling = new THREE.Mesh(ceilingGeo, ceilingMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, 3.20, 5.475);
    this.add(ceiling);

    const beamGeo = new THREE.BoxGeometry(7.20, 0.18, 0.22);
    for (let bz = 3.65; bz <= 7.65; bz += 1.30) {
      const beam = new THREE.Mesh(beamGeo, woodTrimMat);
      beam.position.set(0, 3.10, bz);
      this.add(beam);
    }

    // 3. Left Wall (X: -3.60, Z: 2.95 to 8.00)
    this.buildWainscotedWall(new THREE.Vector3(-3.60, 0, 5.475), 5.05, Math.PI / 2, woodTrimMat, wainscotPanelMat, upperWallMat);

    // 4. Right Wall (X: 3.60, Z: 2.95 to 8.00)
    this.buildWainscotedWall(new THREE.Vector3(3.60, 0, 5.475), 5.05, -Math.PI / 2, woodTrimMat, wainscotPanelMat, upperWallMat);

    // 5. Front Dividing Wall with Archway (at Z: 2.95)
    // Left Wing (X from -3.60 to -0.90, width: 2.70m)
    this.buildWainscotedWall(new THREE.Vector3(-2.25, 0, 2.95), 2.70, 0, woodTrimMat, wainscotPanelMat, upperWallMat);

    // Right Wing (X from 0.90 to 3.60, width: 2.70m)
    this.buildWainscotedWall(new THREE.Vector3(2.25, 0, 2.95), 2.70, 0, woodTrimMat, wainscotPanelMat, upperWallMat);

    // 6. Double-sided Archway Frame & Corridor Jambs (X: [-0.90, 0.90], Z: [2.60, 2.95])
    const archLintel = new THREE.Mesh(new THREE.BoxGeometry(2.00, 0.65, 0.40), woodTrimMat);
    archLintel.position.set(0, 2.875, 2.775);
    this.add(archLintel);

    // Fluted Corinthian wood pilasters framing the doorway
    const colGeo = new THREE.CylinderGeometry(0.12, 0.14, 2.55, 16);
    const leftCol = new THREE.Mesh(colGeo, woodTrimMat);
    leftCol.position.set(-0.90, 1.275, 2.775);
    this.add(leftCol);

    const rightCol = new THREE.Mesh(colGeo, woodTrimMat);
    rightCol.position.set(0.90, 1.275, 2.775);
    this.add(rightCol);

    // Threshold wood step connecting the two rooms
    const step = new THREE.Mesh(new THREE.BoxGeometry(1.80, 0.03, 0.45), woodTrimMat);
    step.position.set(0, 0.015, 2.775);
    this.add(step);

    // 7. Grand Conservatory Bay Window at the back (Z: 8.00)
    const winFrameMat = new THREE.MeshStandardMaterial({color: 0x221812, roughness: 0.35, metalness: 0.2});
    const winFrame = new THREE.Mesh(new THREE.BoxGeometry(7.20, 3.20, 0.16), winFrameMat);
    winFrame.position.set(0, 1.60, 8.00);
    this.add(winFrame);

    // Translucent glass panes
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xa8e6ff,
      transmission: 0.80,
      opacity: 0.88,
      transparent: true,
      roughness: 0.08,
      ior: 1.52,
    });
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(6.40, 2.40), glassMat);
    glass.position.set(0, 1.60, 7.96);
    this.add(glass);

    // Scenic Vista outside the Conservatory window
    this.buildScenicBackdrop();
  }

  private buildWainscotedWall(
    pos: THREE.Vector3,
    length: number,
    rotY: number,
    trimMat: THREE.Material,
    panelMat: THREE.Material,
    upperMat: THREE.Material
  ): void {
    const wallGroup = new THREE.Group();
    wallGroup.position.copy(pos);
    wallGroup.rotation.y = rotY;

    // Upper plaster wall (Y: 1.15 to 3.20, height: 2.05)
    const upperGeo = new THREE.PlaneGeometry(length, 2.05);
    const upper = new THREE.Mesh(upperGeo, upperMat);
    upper.position.set(0, 2.175, 0);
    wallGroup.add(upper);

    // Lower wainscot wood wall (Y: 0 to 1.15)
    const lowerGeo = new THREE.PlaneGeometry(length, 1.15);
    const lower = new THREE.Mesh(lowerGeo, panelMat);
    lower.position.set(0, 0.575, 0);
    wallGroup.add(lower);

    // 3D Chair rail molding dividing lower and upper wall
    const railGeo = new THREE.BoxGeometry(length, 0.07, 0.05);
    const rail = new THREE.Mesh(railGeo, trimMat);
    rail.position.set(0, 1.15, 0.025);
    wallGroup.add(rail);

    // 3D Baseboard along the floor
    const baseGeo = new THREE.BoxGeometry(length, 0.14, 0.04);
    const base = new THREE.Mesh(baseGeo, trimMat);
    base.position.set(0, 0.07, 0.02);
    wallGroup.add(base);

    // 3D vertical decorative panel slats
    const slatGeo = new THREE.BoxGeometry(0.05, 0.95, 0.025);
    const halfL = length * 0.5;
    for (let x = -halfL + 0.40; x <= halfL - 0.40; x += 0.65) {
      const slat = new THREE.Mesh(slatGeo, trimMat);
      slat.position.set(x, 0.62, 0.015);
      wallGroup.add(slat);
    }

    this.add(wallGroup);
  }

  private buildScenicBackdrop(): void {
    const scenicGeo = new THREE.PlaneGeometry(9.5, 4.8);
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, '#060918');
      grad.addColorStop(0.5, '#121832');
      grad.addColorStop(0.85, '#243048');
      grad.addColorStop(1, '#111e1a');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 512, 256);

      // Starry sky
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      for (let i = 0; i < 90; i++) {
        ctx.fillRect(Math.random() * 512, Math.random() * 120, 1.5, 1.5);
      }

      // Mountain ridges and pine silhouettes
      ctx.fillStyle = '#080d0f';
      ctx.beginPath();
      ctx.moveTo(0, 256);
      for (let x = 0; x <= 512; x += 12) {
        const h = 135 + Math.sin(x * 0.035) * 25 + Math.random() * 15;
        ctx.lineTo(x, h);
      }
      ctx.lineTo(512, 256);
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.MeshBasicMaterial({map: tex});
    const mesh = new THREE.Mesh(scenicGeo, mat);
    mesh.position.set(0, 1.65, 8.45);
    this.add(mesh);
  }

  private buildFurnitureAndBooks(): void {
    const woodMat = new THREE.MeshStandardMaterial({color: 0x321e12, roughness: 0.40, metalness: 0.10});
    const brassMat = new THREE.MeshStandardMaterial({color: 0xd4af37, roughness: 0.25, metalness: 0.88});

    // 1. Large 3D Bookshelf (X: -3.25, Z: 4.10)
    const shelfGroup = new THREE.Group();
    shelfGroup.position.set(-3.25, 0, 4.10);

    // Frame
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.50, 2.40, 1.60), woodMat);
    frame.position.y = 1.20;
    shelfGroup.add(frame);

    // Real 3D Book rows
    const bookColors = [0x782020, 0x1d4661, 0x225c38, 0x826018, 0x482b63, 0x8a391e, 0x2a3754];
    for (let row = 0; row < 4; row++) {
      const sy = 0.35 + row * 0.55;
      let bz = -0.65;
      while (bz < 0.65) {
        const bw = 0.04 + Math.random() * 0.04;
        const bh = 0.28 + Math.random() * 0.12;
        const bd = 0.28;
        const color = bookColors[Math.floor(Math.random() * bookColors.length)];
        const book = new THREE.Mesh(
          new THREE.BoxGeometry(bd, bh, bw),
          new THREE.MeshStandardMaterial({color, roughness: 0.55})
        );
        book.position.set(0.10, sy + bh * 0.5, bz);
        shelfGroup.add(book);
        bz += bw + 0.01;
      }
    }
    this.add(shelfGroup);

    // 2. Study Desk (X: -2.15, Z: 5.45)
    const deskGroup = new THREE.Group();
    deskGroup.position.set(-2.15, 0, 5.45);

    const top = new THREE.Mesh(new THREE.BoxGeometry(1.40, 0.08, 0.85), woodMat);
    top.position.y = 0.76;
    deskGroup.add(top);

    // 4 Brass legs
    const legGeo = new THREE.CylinderGeometry(0.03, 0.025, 0.72, 12);
    const legCoords = [[-0.60, 0.36, -0.35], [0.60, 0.36, -0.35], [-0.60, 0.36, 0.35], [0.60, 0.36, 0.35]];
    for (const [lx, ly, lz] of legCoords) {
      const leg = new THREE.Mesh(legGeo, brassMat);
      leg.position.set(lx, ly, lz);
      deskGroup.add(leg);
    }

    // Antique Spellbook on desk
    const spellbook = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.05, 0.26),
      new THREE.MeshStandardMaterial({color: 0x6e2424, roughness: 0.45})
    );
    spellbook.position.set(-0.25, 0.825, -0.05);
    spellbook.rotation.y = 0.25;
    deskGroup.add(spellbook);

    this.add(deskGroup);

    // Interactive Runic Cubes on the Study Desk
    this.createRunicCube('study_cube_1', new THREE.Vector3(-1.85, 0.88, 5.35), 0x3ae6ff);
    this.createRunicCube('study_cube_2', new THREE.Vector3(-1.75, 0.88, 5.55), 0xff88ff);

    // Interactive Runic Cube on the Living Room Coffee Table
    this.createRunicCube('living_cube', new THREE.Vector3(0.15, 0.48, -1.20), 0x57ffb0);
  }

  private createRunicCube(id: string, pos: THREE.Vector3, emissiveColor: number): void {
    const geo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x161c28,
      emissive: emissiveColor,
      emissiveIntensity: 0.75,
      roughness: 0.25,
      metalness: 0.80,
    });
    const cube = new THREE.Mesh(geo, mat);
    cube.position.copy(pos);
    this.add(cube);

    this.interactables.push({
      id,
      name: 'Cubo Rúnico',
      mesh: cube,
      colliderRadius: 0.12,
      isHeld: false,
      velocity: new THREE.Vector3(),
      angularVelocity: new THREE.Vector3(),
      homePosition: pos.clone(),
    });
  }

  private buildRelicAndTargets(): void {
    // 1. Central Relic Pedestal in the Conservatory (X: 0, Z: 5.50)
    const pedGeo = new THREE.CylinderGeometry(0.55, 0.65, 0.90, 8);
    const pedMat = new THREE.MeshStandardMaterial({color: 0x242834, roughness: 0.35, metalness: 0.7});
    const pedestal = new THREE.Mesh(pedGeo, pedMat);
    pedestal.position.set(0, 0.45, 5.50);
    this.add(pedestal);

    // Glowing Rune Ring on top of pedestal
    const ringPlate = new THREE.Mesh(
      new THREE.RingGeometry(0.24, 0.42, 24),
      new THREE.MeshBasicMaterial({color: 0x62f7ff, side: THREE.DoubleSide})
    );
    ringPlate.rotation.x = -Math.PI / 2;
    ringPlate.position.set(0, 0.905, 5.50);
    this.add(ringPlate);

    // 2. The Levitating Aether Relic Crystal (Physical PBR Glass with Orbiting Rings)
    const crystalGroup = new THREE.Group();
    crystalGroup.position.set(0, 1.35, 5.50);

    const crystalGeo = new THREE.OctahedronGeometry(0.26, 0);
    const crystalMat = new THREE.MeshPhysicalMaterial({
      color: 0x62f7ff,
      emissive: 0x2288cc,
      emissiveIntensity: 0.70,
      roughness: 0.10,
      metalness: 0.15,
      transmission: 0.80,
      transparent: true,
      opacity: 0.95,
      ior: 1.55,
    });
    this.relicCrystal = new THREE.Mesh(crystalGeo, crystalMat);
    crystalGroup.add(this.relicCrystal);

    const r1Geo = new THREE.TorusGeometry(0.38, 0.014, 8, 32);
    const rMat = new THREE.MeshBasicMaterial({color: 0xd966ff});
    this.relicRing1 = new THREE.Mesh(r1Geo, rMat);
    crystalGroup.add(this.relicRing1);

    const r2Geo = new THREE.TorusGeometry(0.44, 0.014, 8, 32);
    this.relicRing2 = new THREE.Mesh(r2Geo, rMat);
    crystalGroup.add(this.relicRing2);

    this.add(crystalGroup);

    this.interactables.push({
      id: 'aether_crystal',
      name: 'Cristal de Éter',
      mesh: crystalGroup,
      colliderRadius: 0.35,
      isHeld: false,
      velocity: new THREE.Vector3(),
      angularVelocity: new THREE.Vector3(),
      homePosition: crystalGroup.position.clone(),
    });

    // 3. Arcane Training Targets in the Conservatory
    this.buildTargetPillar('target_left', new THREE.Vector3(-2.0, 0, 7.10), 1);
    this.buildTargetPillar('target_right', new THREE.Vector3(2.0, 0, 7.10), 2);
  }

  private buildTargetPillar(id: string, basePos: THREE.Vector3, index: number): void {
    const obeliskGeo = new THREE.CylinderGeometry(0.20, 0.26, 1.25, 6);
    const obeliskMat = new THREE.MeshStandardMaterial({color: 0x242834, roughness: 0.55});
    const obelisk = new THREE.Mesh(obeliskGeo, obeliskMat);
    obelisk.position.set(basePos.x, 0.625, basePos.z);
    this.add(obelisk);

    const orbGeo = new THREE.SphereGeometry(0.20, 24, 24);
    const orbMat = new THREE.MeshStandardMaterial({
      color: 0x201435,
      emissive: 0x9d4edd,
      emissiveIntensity: 0.90,
      roughness: 0.20,
      metalness: 0.60,
    });
    const orb = new THREE.Mesh(orbGeo, orbMat);
    orb.position.set(basePos.x, 1.50, basePos.z);
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
      colliderRadius: 0.26,
      isHeld: false,
      isTarget: true,
      targetCooldown: 0,
      velocity: new THREE.Vector3(),
      angularVelocity: new THREE.Vector3(),
      homePosition: orb.position.clone(),
      onHit: () => {
        orbMat.emissive.setHex(0x57ffb0);
        orbMat.emissiveIntensity = 2.4;
        entity.targetCooldown = 0.6;
      },
    };
    this.interactables.push(entity);
  }

  private buildLighting(): void {
    // Warm Archway Chandelier
    const archLight = new THREE.PointLight(0xffdfb3, 1.6, 6.0);
    archLight.position.set(0, 2.65, 2.85);
    this.add(archLight);

    // Glowing Arcane Crystal Light
    const relicLight = new THREE.PointLight(0x70d8ff, 2.2, 5.0);
    relicLight.position.set(0, 1.60, 5.50);
    this.add(relicLight);

    // Study Desk Lamp
    const deskLight = new THREE.PointLight(0xffeaad, 1.2, 3.5);
    deskLight.position.set(-2.15, 1.15, 5.45);
    this.add(deskLight);
  }

  update(dt: number): void {
    const time = performance.now() * 0.001;

    // Relic Idle Levitation
    if (this.relicCrystal) {
      this.relicCrystal.rotation.y += 0.8 * dt;
      this.relicCrystal.rotation.x = Math.sin(time * 1.5) * 0.12;
    }
    if (this.relicRing1) {
      this.relicRing1.rotation.x += 1.1 * dt;
      this.relicRing1.rotation.y += 0.5 * dt;
    }
    if (this.relicRing2) {
      this.relicRing2.rotation.y -= 1.3 * dt;
      this.relicRing2.rotation.z += 0.8 * dt;
    }

    // Target Orbs Bobbing
    if (this.targetOrb1) {
      this.targetOrb1.position.y = 1.50 + Math.sin(time * 2.0) * 0.04;
      this.targetOrb1.rotation.y += 0.8 * dt;
    }
    if (this.targetOrb2) {
      this.targetOrb2.position.y = 1.50 + Math.cos(time * 2.0) * 0.04;
      this.targetOrb2.rotation.y -= 0.8 * dt;
    }

    for (const item of this.interactables) {
      if (item.targetCooldown && item.targetCooldown > 0) {
        item.targetCooldown -= dt;
        if (item.targetCooldown <= 0) {
          if (item.id === 'target_left' && this.targetMat1) {
            this.targetMat1.emissive.setHex(0x9d4edd);
            this.targetMat1.emissiveIntensity = 0.90;
          } else if (item.id === 'target_right' && this.targetMat2) {
            this.targetMat2.emissive.setHex(0x9d4edd);
            this.targetMat2.emissiveIntensity = 0.90;
          }
        }
      }

      // Physics integration for free items (when not held and not static target)
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
          const minY = 0.02 + item.colliderRadius;
          if (item.mesh.position.y <= minY) {
            item.mesh.position.y = minY;
            item.velocity.y = -item.velocity.y * 0.40;
            item.velocity.x *= 0.85;
            item.velocity.z *= 0.85;
            item.angularVelocity.multiplyScalar(0.82);

            if (Math.abs(item.velocity.y) < 0.12) {
              item.velocity.y = 0;
            }
          }

          // Wall clamping across the expanded house
          item.mesh.position.x = Math.max(-3.50, Math.min(3.50, item.mesh.position.x));
          item.mesh.position.z = Math.max(-3.55, Math.min(7.90, item.mesh.position.z));
        }
      }
    }
  }

  dispose(): void {
    // Geometries & materials disposed
  }
}
