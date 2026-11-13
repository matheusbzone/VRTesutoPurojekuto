import * as THREE from 'three';

const PORTAL_STENCIL_REF = 1;

/**
 * Configures a material so it renders ONLY where the portal doorway stencil
 * aperture wrote `stencilRef = 1`.
 */
export function applyPortalStencil<T extends THREE.Material>(material: T): T {
  material.stencilWrite = true;
  material.stencilRef = PORTAL_STENCIL_REF;
  material.stencilFunc = THREE.EqualStencilFunc;
  material.stencilFail = THREE.KeepStencilOp;
  material.stencilZFail = THREE.KeepStencilOp;
  material.stencilZPass = THREE.KeepStencilOp;
  return material;
}

interface FloatingIslandEntry {
  group: THREE.Group;
  baseY: number;
  bobAmplitude: number;
  bobSpeed: number;
  bobPhase: number;
  rotSpeed: number;
}

interface FloatingCrystalEntry {
  mesh: THREE.Object3D;
  baseY: number;
  bobAmp: number;
  bobSpeed: number;
  phase: number;
  spinSpeed: number;
}

/**
 * Hidden 3D sci-fi alien world rendered exclusively inside the portal frame
 * via stencil testing: purple nebula skies, twin alien moons, multi-part
 * floating islands with obsidian spires & glowing crystals, rotating astrolabe
 * rings, and drifting bioluminescent particles.
 */
export class AlienWorld extends THREE.Group {
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly textures: THREE.Texture[] = [];

  private readonly islands: FloatingIslandEntry[] = [];
  private readonly floatingCrystals: FloatingCrystalEntry[] = [];
  private readonly astrolabeRings: THREE.Mesh[] = [];
  private skyMesh!: THREE.Mesh;
  private skyMaterial!: THREE.ShaderMaterial;
  private particleMaterial!: THREE.ShaderMaterial;
  private crystalMaterials: THREE.MeshPhysicalMaterial[] = [];
  private elapsedTime = 0;

  constructor() {
    super();
    this.name = 'AlienWorld';
    this.buildLights();
    this.buildSkyDome();
    this.buildFloatingIslands();
    this.buildAstrolabeRings();
    this.buildDriftingParticles();
  }

  setStencilEnabled(enabled: boolean): void {
    for (const mat of this.materials) {
      if (enabled) {
        applyPortalStencil(mat);
      } else {
        mat.stencilWrite = false;
        mat.stencilFunc = THREE.AlwaysStencilFunc;
      }
      mat.needsUpdate = true;
    }
  }

  setSkyCenter(localPos: THREE.Vector3): void {
    this.skyMesh.position.copy(localPos);
  }

  private trackGeo<T extends THREE.BufferGeometry>(geo: T): T {
    this.geometries.push(geo);
    return geo;
  }

  private trackMat<T extends THREE.Material>(mat: T): T {
    applyPortalStencil(mat);
    this.materials.push(mat);
    return mat;
  }

  private buildLights(): void {
    const hemi = new THREE.HemisphereLight(0xc88cff, 0x1a0b38, 2.2);
    this.add(hemi);

    const key = new THREE.DirectionalLight(0xf6c2ff, 2.6);
    key.position.set(4.5, 7.0, -2.5);
    this.add(key);

    const rim = new THREE.DirectionalLight(0x4ff2ff, 2.1);
    rim.position.set(-5.0, 2.5, -10.0);
    this.add(rim);

    const crystalGlow = new THREE.PointLight(0x9b5cff, 3.0, 14, 1.5);
    crystalGlow.position.set(0, 0.8, -3.4);
    this.add(crystalGlow);
  }

  private buildSkyDome(): void {
    // Inverted sphere positioned behind the doorway so all sky geometry stays
    // in the alien realm while wrapping a 180+ degree vista through the aperture.
    const geo = this.trackGeo(new THREE.SphereGeometry(28, 36, 24));
    this.skyMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: {value: 0},
      },
      vertexShader: /* glsl */ `
        varying vec3 vLocalDir;
        void main() {
          vLocalDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        varying vec3 vLocalDir;

        float hash(vec3 p) {
          p = fract(p * 0.3183099 + 0.1);
          p *= 17.0;
          return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
        }

        float noise(vec3 x) {
          vec3 i = floor(x);
          vec3 f = fract(x);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
                mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
            mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
            f.z
          );
        }

        float fbm(vec3 p) {
          float v = 0.0;
          float a = 0.5;
          for (int i = 0; i < 4; i++) {
            v += a * noise(p);
            p = p * 2.05 + vec3(1.7, 9.2, 3.4);
            a *= 0.5;
          }
          return v;
        }

        void main() {
          vec3 dir = normalize(vLocalDir);
          float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);

          // Deep alien twilight purple -> vivid magenta horizon -> indigo zenith
          vec3 abyss = vec3(0.05, 0.02, 0.14);
          vec3 horizon = vec3(0.36, 0.12, 0.58);
          vec3 upper = vec3(0.15, 0.05, 0.34);
          vec3 zenith = vec3(0.03, 0.01, 0.10);

          vec3 col = mix(abyss, horizon, smoothstep(0.22, 0.50, h));
          col = mix(col, upper, smoothstep(0.50, 0.72, h));
          col = mix(col, zenith, smoothstep(0.72, 0.98, h));

          // Swirling cosmic nebula bands
          vec3 nebCoord = dir * 3.2 + vec3(uTime * 0.018, -uTime * 0.012, uTime * 0.01);
          float neb = fbm(nebCoord);
          float ribbon = smoothstep(0.42, 0.82, neb);
          vec3 cyanCloud = vec3(0.24, 0.72, 0.98);
          vec3 violetCloud = vec3(0.84, 0.30, 0.96);
          col += mix(violetCloud, cyanCloud, smoothstep(-0.3, 0.5, dir.x)) * ribbon * 0.42;

          // Alien ringed gas moon in the upper-right sky
          vec3 moonDir = normalize(vec3(0.34, 0.28, -0.89));
          float moonDot = dot(dir, moonDir);
          float moonDisc = smoothstep(0.991, 0.9928, moonDot);
          float moonHalo = pow(max(0.0, moonDot), 48.0) * 0.55;
          float moonBand = sin((dir.y - moonDir.y) * 90.0 + neb * 4.0) * 0.5 + 0.5;
          vec3 moonColor = mix(vec3(0.62, 0.38, 0.95), vec3(0.95, 0.65, 1.0), moonBand);
          col += vec3(0.55, 0.30, 0.95) * moonHalo;
          col = mix(col, moonColor, moonDisc);

          // Smaller cyan companion moon upper-left
          vec3 moon2Dir = normalize(vec3(-0.42, 0.36, -0.83));
          float m2Dot = dot(dir, moon2Dir);
          float m2Disc = smoothstep(0.9968, 0.9978, m2Dot);
          col += vec3(0.25, 0.85, 1.0) * pow(max(0.0, m2Dot), 90.0) * 0.45;
          col = mix(col, vec3(0.65, 0.96, 1.0), m2Disc);

          // Crisp twinkling starfield
          float starGrid = hash(floor(dir * 210.0));
          float star = smoothstep(0.9945, 0.9995, starGrid);
          float twinkle = 0.65 + 0.35 * sin(uTime * 2.5 + starGrid * 120.0);
          col += vec3(0.88, 0.82, 1.0) * star * twinkle * 1.15;

          gl_FragColor = vec4(col, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
    });
    this.trackMat(this.skyMaterial);

    this.skyMesh = new THREE.Mesh(geo, this.skyMaterial);
    this.skyMesh.position.set(0, 0, -4.0);
    this.skyMesh.renderOrder = 2;
    this.skyMesh.xb = {pointerEvents: 'none'};
    this.add(this.skyMesh);
  }

  private createRockTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#24173c';
    ctx.fillRect(0, 0, 256, 256);

    for (let i = 0; i < 650; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const r = 2 + Math.random() * 14;
      const shade = Math.floor(28 + Math.random() * 52);
      ctx.fillStyle = `rgba(${shade + 10}, ${shade - 6}, ${shade + 38}, 0.35)`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    this.textures.push(tex);
    return tex;
  }

  private buildFloatingIslands(): void {
    const rockTex = this.createRockTexture();

    const basaltMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        map: rockTex,
        color: 0xffffff,
        roughness: 0.88,
        metalness: 0.12,
        flatShading: true,
      })
    );

    const plateauMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x2c1b4e,
        emissive: 0x160933,
        emissiveIntensity: 0.45,
        roughness: 0.65,
        metalness: 0.2,
        flatShading: true,
      })
    );

    const spireMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x1b1530,
        roughness: 0.28,
        metalness: 0.78,
      })
    );

    const cyanCrystalMat = this.trackMat(
      new THREE.MeshPhysicalMaterial({
        color: 0x4df4ff,
        emissive: 0x1ad8ff,
        emissiveIntensity: 1.35,
        roughness: 0.14,
        metalness: 0.1,
        clearcoat: 1.0,
        clearcoatRoughness: 0.08,
      })
    );

    const magentaCrystalMat = this.trackMat(
      new THREE.MeshPhysicalMaterial({
        color: 0xf46bff,
        emissive: 0xc22bff,
        emissiveIntensity: 1.25,
        roughness: 0.16,
        metalness: 0.1,
        clearcoat: 1.0,
        clearcoatRoughness: 0.1,
      })
    );
    this.crystalMaterials.push(cyanCrystalMat, magentaCrystalMat);

    // 1. Hero Central Sanctuary Island (z = -3.8)
    const hero = this.createIslandGroup(1.45, 1.9, basaltMat, plateauMat);
    hero.position.set(0, -0.55, -3.8);
    this.addCrystalCluster(hero, new THREE.Vector3(-0.62, 0.16, 0.28), 0.52, cyanCrystalMat, 4);
    this.addCrystalCluster(hero, new THREE.Vector3(0.68, 0.14, -0.15), 0.46, magentaCrystalMat, 3);
    this.addAlienMonolithArch(hero, spireMat, cyanCrystalMat);
    this.add(hero);
    this.islands.push({
      group: hero,
      baseY: -0.55,
      bobAmplitude: 0.055,
      bobSpeed: 0.65,
      bobPhase: 0,
      rotSpeed: 0.03,
    });

    // 2. Left High Crystal Spire Island (z = -5.6)
    const leftIsland = this.createIslandGroup(0.92, 1.35, basaltMat, plateauMat);
    leftIsland.position.set(-1.95, 0.35, -5.6);
    this.addCrystalCluster(leftIsland, new THREE.Vector3(0.05, 0.14, 0.05), 0.72, magentaCrystalMat, 5);
    this.add(leftIsland);
    this.islands.push({
      group: leftIsland,
      baseY: 0.35,
      bobAmplitude: 0.08,
      bobSpeed: 0.8,
      bobPhase: 1.4,
      rotSpeed: -0.04,
    });

    // 3. Right Mid Island (z = -4.9)
    const rightIsland = this.createIslandGroup(0.84, 1.15, basaltMat, plateauMat);
    rightIsland.position.set(1.75, -0.15, -4.9);
    this.addCrystalCluster(rightIsland, new THREE.Vector3(-0.1, 0.12, 0.1), 0.56, cyanCrystalMat, 4);
    this.add(rightIsland);
    this.islands.push({
      group: rightIsland,
      baseY: -0.15,
      bobAmplitude: 0.07,
      bobSpeed: 0.72,
      bobPhase: 2.8,
      rotSpeed: 0.035,
    });

    // 4. Far Citadel Island (z = -8.6)
    const farIsland = this.createIslandGroup(1.8, 2.4, basaltMat, plateauMat);
    farIsland.position.set(0.35, 0.85, -8.6);
    this.addCrystalCluster(farIsland, new THREE.Vector3(0, 0.2, 0), 1.05, cyanCrystalMat, 5);
    this.addCrystalCluster(farIsland, new THREE.Vector3(-0.55, 0.16, 0.4), 0.65, magentaCrystalMat, 3);
    this.add(farIsland);
    this.islands.push({
      group: farIsland,
      baseY: 0.85,
      bobAmplitude: 0.09,
      bobSpeed: 0.5,
      bobPhase: 4.1,
      rotSpeed: -0.02,
    });

    // 5. Lower Foreground Stepping Stone Island (z = -2.35)
    const nearIsland = this.createIslandGroup(0.52, 0.78, basaltMat, plateauMat);
    nearIsland.position.set(-0.78, -0.78, -2.35);
    this.addCrystalCluster(nearIsland, new THREE.Vector3(0.05, 0.08, -0.04), 0.28, cyanCrystalMat, 3);
    this.add(nearIsland);
    this.islands.push({
      group: nearIsland,
      baseY: -0.78,
      bobAmplitude: 0.045,
      bobSpeed: 0.95,
      bobPhase: 0.9,
      rotSpeed: 0.05,
    });

    // 6. Orbiting/Levitating Shards inside the doorway depth
    const shardGeo = this.trackGeo(new THREE.OctahedronGeometry(0.075, 0));
    for (let i = 0; i < 14; i++) {
      const mat = i % 2 === 0 ? cyanCrystalMat : magentaCrystalMat;
      const shard = new THREE.Mesh(shardGeo, mat);
      const angle = (i / 14) * Math.PI * 2;
      const radius = 0.85 + (i % 3) * 0.55;
      const x = Math.cos(angle) * radius * 1.25;
      const z = -2.2 - Math.abs(Math.sin(angle)) * 3.8 - (i % 4) * 0.55;
      const y = -0.35 + ((i * 0.37) % 1.4);
      shard.position.set(x, y, z);
      shard.scale.set(0.65 + (i % 3) * 0.28, 1.3 + (i % 2) * 0.5, 0.65 + (i % 3) * 0.28);
      shard.renderOrder = 2;
      shard.xb = {pointerEvents: 'none'};
      this.add(shard);
      this.floatingCrystals.push({
        mesh: shard,
        baseY: y,
        bobAmp: 0.08 + (i % 3) * 0.03,
        bobSpeed: 1.1 + (i % 4) * 0.25,
        phase: i * 0.8,
        spinSpeed: (i % 2 === 0 ? 1 : -1) * (0.5 + (i % 3) * 0.25),
      });
    }
  }

  /**
   * Builds a multi-part sculpted floating island (tapered rock underside,
   * faceted strata rim, and top plateau) rather than a single primitive.
   */
  private createIslandGroup(
    radius: number,
    depth: number,
    rockMat: THREE.Material,
    plateauMat: THREE.Material
  ): THREE.Group {
    const group = new THREE.Group();
    group.xb = {pointerEvents: 'none'};

    // Displaced tapered stalactite underside
    const coneGeo = this.trackGeo(new THREE.ConeGeometry(radius, depth, 9, 4));
    const pos = coneGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      const vz = pos.getZ(i);
      const angle = Math.atan2(vz, vx);
      const radialNoise = 0.84 + 0.28 * Math.sin(angle * 3.0 + vy * 2.5);
      pos.setX(i, vx * radialNoise);
      pos.setZ(i, vz * radialNoise);
    }
    coneGeo.computeVertexNormals();

    const underside = new THREE.Mesh(coneGeo, rockMat);
    underside.rotation.x = Math.PI;
    underside.position.y = -depth * 0.5;
    underside.renderOrder = 2;
    group.add(underside);

    // Secondary rock shelf
    const shelfGeo = this.trackGeo(new THREE.CylinderGeometry(radius * 1.04, radius * 0.88, 0.16, 9));
    const shelf = new THREE.Mesh(shelfGeo, rockMat);
    shelf.position.y = -0.02;
    shelf.rotation.y = 0.35;
    shelf.renderOrder = 2;
    group.add(shelf);

    // Top alien plateau cap
    const capGeo = this.trackGeo(new THREE.CylinderGeometry(radius * 0.96, radius * 1.03, 0.14, 9));
    const cap = new THREE.Mesh(capGeo, plateauMat);
    cap.position.y = 0.08;
    cap.renderOrder = 2;
    group.add(cap);

    return group;
  }

  private addCrystalCluster(
    parent: THREE.Group,
    origin: THREE.Vector3,
    scale: number,
    material: THREE.Material,
    count: number
  ): void {
    const cluster = new THREE.Group();
    cluster.position.copy(origin);

    const crystalGeo = this.trackGeo(new THREE.CylinderGeometry(0.015, 0.09, 0.55, 6));
    crystalGeo.translate(0, 0.275, 0);

    for (let i = 0; i < count; i++) {
      const crystal = new THREE.Mesh(crystalGeo, material);
      const angle = (i / count) * Math.PI * 2;
      const tilt = i === 0 ? 0.06 : 0.24 + (i % 2) * 0.16;
      const heightScale = i === 0 ? 1.2 : 0.65 + (i % 3) * 0.18;
      crystal.scale.setScalar(scale * heightScale);
      crystal.rotation.z = Math.cos(angle) * tilt;
      crystal.rotation.x = Math.sin(angle) * tilt;
      crystal.position.set(Math.cos(angle) * 0.06 * scale, 0, Math.sin(angle) * 0.06 * scale);
      crystal.renderOrder = 2;
      cluster.add(crystal);
    }

    parent.add(cluster);
  }

  private addAlienMonolithArch(
    parent: THREE.Group,
    spireMat: THREE.Material,
    glowMat: THREE.Material
  ): void {
    const archGroup = new THREE.Group();
    archGroup.position.set(0, 0.14, -0.1);

    const pillarGeo = this.trackGeo(new THREE.BoxGeometry(0.14, 1.05, 0.18));
    const leftPillar = new THREE.Mesh(pillarGeo, spireMat);
    leftPillar.position.set(-0.34, 0.52, 0);
    leftPillar.rotation.z = -0.09;
    leftPillar.renderOrder = 2;

    const rightPillar = new THREE.Mesh(pillarGeo, spireMat);
    rightPillar.position.set(0.34, 0.52, 0);
    rightPillar.rotation.z = 0.09;
    rightPillar.renderOrder = 2;

    const crownGeo = this.trackGeo(new THREE.TorusGeometry(0.34, 0.042, 8, 24, Math.PI));
    const crown = new THREE.Mesh(crownGeo, spireMat);
    crown.position.set(0, 0.96, 0);
    crown.renderOrder = 2;

    // Floating energy core inside the monolith arch
    const coreGeo = this.trackGeo(new THREE.OctahedronGeometry(0.14, 0));
    const core = new THREE.Mesh(coreGeo, glowMat);
    core.position.set(0, 0.66, 0);
    core.renderOrder = 2;
    this.floatingCrystals.push({
      mesh: core,
      baseY: 0.66,
      bobAmp: 0.05,
      bobSpeed: 1.4,
      phase: 0.4,
      spinSpeed: 0.9,
    });

    archGroup.add(leftPillar, rightPillar, crown, core);
    parent.add(archGroup);
  }

  private buildAstrolabeRings(): void {
    const ringConfigs = [
      {radius: 1.55, tube: 0.018, color: 0x56f0ff, z: -3.8, y: 0.25, tiltX: 0.48, tiltY: 0.25},
      {radius: 2.05, tube: 0.014, color: 0xd96bff, z: -3.8, y: 0.25, tiltX: -0.62, tiltY: -0.35},
      {radius: 3.1, tube: 0.022, color: 0x7b61ff, z: -7.2, y: 0.9, tiltX: 0.35, tiltY: 0.15},
    ];

    for (const cfg of ringConfigs) {
      const geo = this.trackGeo(new THREE.TorusGeometry(cfg.radius, cfg.tube, 10, 64));
      const mat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: cfg.color,
          transparent: true,
          opacity: 0.65,
        })
      );
      const ring = new THREE.Mesh(geo, mat);
      ring.position.set(0, cfg.y, cfg.z);
      ring.rotation.set(cfg.tiltX, cfg.tiltY, 0);
      ring.renderOrder = 3;
      ring.xb = {pointerEvents: 'none'};
      this.add(ring);
      this.astrolabeRings.push(ring);
    }
  }

  private buildDriftingParticles(): void {
    const count = 380;
    const positions = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    const sizes = new Float32Array(count);
    const colors = new Float32Array(count * 3);

    const palette = [
      new THREE.Color(0x52f7ff),
      new THREE.Color(0xe070ff),
      new THREE.Color(0xa68cff),
      new THREE.Color(0xff9ce6),
    ];

    for (let i = 0; i < count; i++) {
      // Keep all particles strictly behind z = -0.35 so none poke out in front of the doorway
      positions[i * 3] = (Math.random() - 0.5) * 7.5;
      positions[i * 3 + 1] = -1.6 + Math.random() * 4.2;
      positions[i * 3 + 2] = -0.45 - Math.random() * 10.5;
      phases[i] = Math.random() * Math.PI * 2;
      sizes[i] = 16 + Math.random() * 34;

      const c = palette[i % palette.length];
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    const geo = this.trackGeo(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));

    this.particleMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: {value: 0},
      },
      vertexShader: /* glsl */ `
        attribute float aPhase;
        attribute float aSize;
        attribute vec3 aColor;
        uniform float uTime;
        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          vColor = aColor;
          vec3 p = position;
          p.y += mod(uTime * 0.14 + aPhase, 3.6) - 1.8;
          p.x += sin(uTime * 0.55 + aPhase) * 0.22;
          p.z += cos(uTime * 0.45 + aPhase * 1.3) * 0.18;
          // Clamp strictly behind doorway plane
          p.z = min(p.z, -0.35);

          vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
          float dist = max(0.5, -mvPosition.z);
          gl_PointSize = aSize / dist;
          vAlpha = 0.55 + 0.45 * sin(uTime * 1.8 + aPhase * 3.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          vec2 d = gl_PointCoord - vec2(0.5);
          float r = length(d) * 2.0;
          if (r > 1.0) discard;
          float glow = pow(1.0 - r, 2.2);
          gl_FragColor = vec4(vColor, glow * vAlpha * 0.85);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.trackMat(this.particleMaterial);

    const points = new THREE.Points(geo, this.particleMaterial);
    points.renderOrder = 3;
    points.frustumCulled = false;
    points.xb = {pointerEvents: 'none'};
    this.add(points);
  }

  update(deltaTime: number): void {
    this.elapsedTime += deltaTime;
    const t = this.elapsedTime;

    this.skyMaterial.uniforms.uTime.value = t;
    this.particleMaterial.uniforms.uTime.value = t;

    for (const island of this.islands) {
      island.group.position.y =
        island.baseY + Math.sin(t * island.bobSpeed + island.bobPhase) * island.bobAmplitude;
      island.group.rotation.y += island.rotSpeed * deltaTime;
    }

    for (const crystal of this.floatingCrystals) {
      crystal.mesh.position.y =
        crystal.baseY + Math.sin(t * crystal.bobSpeed + crystal.phase) * crystal.bobAmp;
      crystal.mesh.rotation.y += crystal.spinSpeed * deltaTime;
    }

    if (this.astrolabeRings[0]) {
      this.astrolabeRings[0].rotation.z += 0.22 * deltaTime;
      this.astrolabeRings[0].rotation.y += 0.08 * deltaTime;
    }
    if (this.astrolabeRings[1]) {
      this.astrolabeRings[1].rotation.z -= 0.16 * deltaTime;
      this.astrolabeRings[1].rotation.x += 0.06 * deltaTime;
    }
    if (this.astrolabeRings[2]) {
      this.astrolabeRings[2].rotation.z += 0.11 * deltaTime;
    }

    for (let i = 0; i < this.crystalMaterials.length; i++) {
      this.crystalMaterials[i].emissiveIntensity = 1.15 + 0.35 * Math.sin(t * 2.1 + i * 1.4);
    }
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    for (const t of this.textures) t.dispose();
    this.geometries.length = 0;
    this.materials.length = 0;
    this.textures.length = 0;
  }
}
