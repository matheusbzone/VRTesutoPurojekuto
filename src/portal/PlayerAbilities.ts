import * as THREE from 'three';
import {type InteractableEntity} from './HouseExpansion';
import {type PortalAudio} from './PortalAudio';

interface Projectile {
  mesh: THREE.Mesh;
  light: THREE.PointLight;
  velocity: THREE.Vector3;
  lifetime: number;
}

interface Spark {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  lifetime: number;
  maxLife: number;
}

export interface PlayerAbilitiesOptions {
  audio: PortalAudio;
  onGrabStateChange?: (isHolding: boolean, itemName?: string) => void;
}

/**
 * Natural first-person magical gauntlets and ability system:
 * - Beautifully angled first-person hands entering from the bottom corners of the viewport
 * - Dynamic finger poses, glowing palm arcane cores, and emission nodes
 * - Plasma projectile firing with hand recoil and particle impacts
 * - Telekinetic attraction, floating hold, and launching with glowing energy tether
 */
export class PlayerAbilities {
  readonly handsGroup: THREE.Group;

  private readonly audio: PortalAudio;
  private readonly onGrabStateChange?: (isHolding: boolean, itemName?: string) => void;

  private enabled = false;
  private heldItem: InteractableEntity | null = null;

  // Hands hierarchy
  private leftHand: THREE.Group;
  private rightHand: THREE.Group;
  private rightHandBasePos = new THREE.Vector3(0.24, -0.28, -0.42);
  private leftHandBasePos = new THREE.Vector3(-0.24, -0.28, -0.42);

  private rightRecoil = 0;
  private leftCast = 0;

  // Palm light surges
  private rightPalmLight: THREE.PointLight;
  private leftPalmLight: THREE.PointLight;

  // Energy Tether Line (Left palm -> Grabbed object)
  private tetherLine: THREE.Line;
  private tetherGeo: THREE.BufferGeometry;

  // Projectiles & Sparks
  private projectiles: Projectile[] = [];
  private sparks: Spark[] = [];
  private readonly projectileGroup = new THREE.Group();
  private readonly sparksGroup = new THREE.Group();

  constructor(options: PlayerAbilitiesOptions) {
    this.audio = options.audio;
    this.onGrabStateChange = options.onGrabStateChange;

    this.handsGroup = new THREE.Group();
    this.handsGroup.name = 'FirstPersonHands';
    this.handsGroup.visible = false;

    // Create Left (Telekinesis - Amethyst) and Right (Plasma Blaster - Cyan) Hands
    const leftData = this.createRealisticHand('left', 0xd966ff);
    this.leftHand = leftData.group;
    this.leftPalmLight = leftData.palmLight;

    const rightData = this.createRealisticHand('right', 0x4ff2ff);
    this.rightHand = rightData.group;
    this.rightPalmLight = rightData.palmLight;

    this.leftHand.position.copy(this.leftHandBasePos);
    this.rightHand.position.copy(this.rightHandBasePos);

    this.handsGroup.add(this.leftHand);
    this.handsGroup.add(this.rightHand);

    // Telekinesis Tether Line
    this.tetherGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]);
    const tetherMat = new THREE.LineBasicMaterial({
      color: 0xee77ff,
      transparent: true,
      opacity: 0.85,
    });
    this.tetherLine = new THREE.Line(this.tetherGeo, tetherMat);
    this.tetherLine.visible = false;
    this.handsGroup.add(this.tetherLine);

    this.handsGroup.add(this.projectileGroup);
    this.handsGroup.add(this.sparksGroup);
  }

  private createRealisticHand(
    side: 'left' | 'right',
    glowColor: number
  ): {group: THREE.Group; palmLight: THREE.PointLight} {
    const handGroup = new THREE.Group();
    const isRight = side === 'right';
    const mirrorX = isRight ? 1 : -1;

    // Premium PBR Materials
    const armorMat = new THREE.MeshStandardMaterial({
      color: 0x181c26,
      roughness: 0.28,
      metalness: 0.88,
    });

    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      roughness: 0.22,
      metalness: 0.92,
    });

    const glowMat = new THREE.MeshStandardMaterial({
      color: glowColor,
      emissive: glowColor,
      emissiveIntensity: 1.2,
      roughness: 0.1,
    });

    // 1. Forearm (Extending from off-screen below up to wrist)
    const armGeo = new THREE.CylinderGeometry(0.042, 0.058, 0.28, 12);
    const forearm = new THREE.Mesh(armGeo, armorMat);
    forearm.position.set(0, -0.10, 0.10);
    forearm.rotation.x = 0.55; // Tilted upward into the scene
    handGroup.add(forearm);

    // Gold Trim Ring around forearm
    const cuffGeo = new THREE.TorusGeometry(0.045, 0.005, 8, 16);
    const cuff = new THREE.Mesh(cuffGeo, goldMat);
    cuff.position.set(0, -0.02, 0.02);
    cuff.rotation.x = 0.55;
    handGroup.add(cuff);

    // 2. Wrist Joint & Palm Core
    const palmPlate = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.024, 0.078), armorMat);
    palmPlate.position.set(0, 0, -0.04);
    handGroup.add(palmPlate);

    // Glowing Arcane Palm Core
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.016, 12, 12), glowMat);
    core.position.set(0, 0.014, -0.04);
    handGroup.add(core);

    const palmLight = new THREE.PointLight(glowColor, 0.8, 1.2);
    palmLight.position.set(0, 0.03, -0.04);
    handGroup.add(palmLight);

    // 3. Articulated Fingers (Curled in a ready magic stance)
    const fingerDefs = [
      // Thumb
      {x: -0.036 * mirrorX, z: -0.02, len1: 0.028, len2: 0.024, angleY: -0.55 * mirrorX, curl: 0.35},
      // Index
      {x: -0.025 * mirrorX, z: -0.075, len1: 0.034, len2: 0.026, angleY: -0.10 * mirrorX, curl: 0.52},
      // Middle
      {x: 0.000, z: -0.082, len1: 0.038, len2: 0.028, angleY: 0, curl: 0.55},
      // Ring
      {x: 0.024 * mirrorX, z: -0.074, len1: 0.032, len2: 0.024, angleY: 0.12 * mirrorX, curl: 0.54},
      // Pinky
      {x: 0.042 * mirrorX, z: -0.062, len1: 0.026, len2: 0.020, angleY: 0.22 * mirrorX, curl: 0.58},
    ];

    for (const f of fingerDefs) {
      const fingerRoot = new THREE.Group();
      fingerRoot.position.set(f.x, 0.005, f.z);
      fingerRoot.rotation.y = f.angleY;
      fingerRoot.rotation.x = -f.curl;

      // Proximal phalanx
      const p1 = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0075, f.len1, 8), armorMat);
      p1.position.set(0, 0, -f.len1 * 0.5);
      p1.rotation.x = Math.PI / 2;
      fingerRoot.add(p1);

      // Knuckle joint
      const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.007, 8, 8), goldMat);
      knuckle.position.set(0, 0, -f.len1);
      fingerRoot.add(knuckle);

      // Distal phalanx (curving inward)
      const distGroup = new THREE.Group();
      distGroup.position.set(0, 0, -f.len1);
      distGroup.rotation.x = -f.curl * 0.8;

      const p2 = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.006, f.len2, 8), armorMat);
      p2.position.set(0, 0, -f.len2 * 0.5);
      p2.rotation.x = Math.PI / 2;
      distGroup.add(p2);

      // Glowing fingertip crystal
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.0055, 6, 6), glowMat);
      tip.position.set(0, 0, -f.len2);
      distGroup.add(tip);

      fingerRoot.add(distGroup);
      handGroup.add(fingerRoot);
    }

    // Natural camera view angle: angled diagonally inward and upward
    handGroup.rotation.x = -0.32;
    handGroup.rotation.y = -0.22 * mirrorX;
    handGroup.rotation.z = -0.15 * mirrorX;

    return {group: handGroup, palmLight};
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(active: boolean): void {
    this.enabled = active;
    this.handsGroup.visible = active;
    if (!active && this.heldItem) {
      this.heldItem.isHeld = false;
      this.heldItem = null;
      this.tetherLine.visible = false;
      this.onGrabStateChange?.(false);
    }
  }

  toggleEnabled(): boolean {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  isHolding(): boolean {
    return this.heldItem !== null;
  }

  getHeldItemName(): string | undefined {
    return this.heldItem?.name;
  }

  /**
   * Fires a glowing plasma energy projectile from the right hand along the camera view.
   */
  shoot(camera: THREE.Camera): void {
    this.audio.unlockAndStart();
    this.audio.playShootSound();

    // Trigger right hand recoil gesture and palm flash
    this.rightRecoil = 0.28;
    this.rightPalmLight.intensity = 3.5;

    const projGeo = new THREE.SphereGeometry(0.055, 16, 16);
    const projMat = new THREE.MeshBasicMaterial({color: 0x62f7ff});
    const projMesh = new THREE.Mesh(projGeo, projMat);

    const light = new THREE.PointLight(0x62f7ff, 2.5, 3.5);
    projMesh.add(light);

    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);

    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const spawnPos = camera.position
      .clone()
      .addScaledVector(right, 0.20)
      .addScaledVector(dir, 0.40);
    spawnPos.y -= 0.12;

    projMesh.position.copy(spawnPos);
    this.projectileGroup.add(projMesh);

    const speed = 15.0; // m/s
    this.projectiles.push({
      mesh: projMesh,
      light,
      velocity: dir.multiplyScalar(speed),
      lifetime: 0,
    });
  }

  /**
   * Telekinetic Grab or Launch/Throw action:
   * - If holding an object: throws it forward with physics impulse
   * - If not holding: raycasts forward to pick up the nearest interactable
   */
  grabOrRelease(camera: THREE.Camera, interactables: InteractableEntity[]): void {
    this.audio.unlockAndStart();

    if (this.heldItem) {
      // Throw / Release held object forward
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);

      this.heldItem.velocity.copy(dir).multiplyScalar(8.0);
      this.heldItem.angularVelocity.set(
        (Math.random() - 0.5) * 6,
        (Math.random() - 0.5) * 6,
        (Math.random() - 0.5) * 6
      );
      this.heldItem.isHeld = false;
      this.audio.playReleaseSound();

      this.heldItem = null;
      this.tetherLine.visible = false;
      this.onGrabStateChange?.(false);
      return;
    }

    // Attempt to grab closest interactable in line of sight (up to 5.0 meters)
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);

    let bestEntity: InteractableEntity | null = null;
    let bestDist = 5.0;

    for (const entity of interactables) {
      const toObj = entity.mesh.position.clone().sub(camera.position);
      const dist = toObj.length();
      if (dist < bestDist && dist > 0.25) {
        toObj.normalize();
        const dot = camDir.dot(toObj);
        if (dot > 0.80) {
          bestDist = dist;
          bestEntity = entity;
        }
      }
    }

    if (bestEntity) {
      this.heldItem = bestEntity;
      bestEntity.isHeld = true;
      bestEntity.velocity.set(0, 0, 0);
      this.audio.playGrabSound();
      this.leftCast = 0.35;
      this.leftPalmLight.intensity = 3.0;
      this.tetherLine.visible = true;
      this.onGrabStateChange?.(true, bestEntity.name);
    }
  }

  private spawnImpactSparks(position: THREE.Vector3, color = 0x6be5ff): void {
    const count = 7;
    for (let i = 0; i < count; i++) {
      const sparkGeo = new THREE.SphereGeometry(0.018, 6, 6);
      const sparkMat = new THREE.MeshBasicMaterial({color, transparent: true, opacity: 1});
      const spark = new THREE.Mesh(sparkGeo, sparkMat);
      spark.position.copy(position);

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 3.5,
        Math.random() * 2.5 + 0.8,
        (Math.random() - 0.5) * 3.5
      );

      this.sparksGroup.add(spark);
      this.sparks.push({
        mesh: spark,
        velocity: vel,
        lifetime: 0,
        maxLife: 0.32,
      });
    }
  }

  update(dt: number, camera: THREE.Camera, interactables: InteractableEntity[]): void {
    if (!this.enabled) return;

    const time = performance.now() * 0.001;

    // 1. Natural idle breathing sway
    const idleSwayY = Math.sin(time * 2.0) * 0.005;
    const idleSwayX = Math.cos(time * 1.5) * 0.003;

    // Right hand recoil & palm light decay
    this.rightRecoil = Math.max(0, this.rightRecoil - dt * 2.8);
    this.rightPalmLight.intensity = Math.max(0.8, this.rightPalmLight.intensity - dt * 5.0);
    this.rightHand.position.set(
      this.rightHandBasePos.x + idleSwayX,
      this.rightHandBasePos.y + idleSwayY,
      this.rightHandBasePos.z + this.rightRecoil * 0.20
    );

    // Left hand telekinesis casting animation & palm light decay
    this.leftCast = Math.max(0, this.leftCast - dt * 2.0);
    this.leftPalmLight.intensity = Math.max(0.8, this.leftPalmLight.intensity - dt * 4.0);
    this.leftHand.position.set(
      this.leftHandBasePos.x - idleSwayX,
      this.leftHandBasePos.y + idleSwayY,
      this.leftHandBasePos.z - this.leftCast * 0.12
    );

    // 2. Telekinetic Hold & Tether Update
    if (this.heldItem) {
      const camDir = new THREE.Vector3();
      camera.getWorldDirection(camDir);

      const targetHoldPos = camera.position
        .clone()
        .addScaledVector(camDir, 1.25);
      targetHoldPos.y -= 0.10;

      // Smooth lerp to hold position in front of hands
      this.heldItem.mesh.position.lerp(targetHoldPos, 14.0 * dt);

      // Update energy tether from left palm to object
      const leftPalmWorld = new THREE.Vector3();
      this.leftHand.getWorldPosition(leftPalmWorld);

      this.tetherGeo.setFromPoints([leftPalmWorld, this.heldItem.mesh.position]);
      this.tetherGeo.attributes.position.needsUpdate = true;
    }

    // 3. Projectiles Update & Collision
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.lifetime += dt;
      p.mesh.position.addScaledVector(p.velocity, dt);

      let hit = false;
      // Check collision against all interactables
      for (const entity of interactables) {
        const dist = p.mesh.position.distanceTo(entity.mesh.position);
        if (dist <= entity.colliderRadius + 0.10) {
          hit = true;
          // Apply physics impulse
          const impulse = p.velocity.clone().normalize().multiplyScalar(4.0);
          entity.velocity.add(impulse);
          entity.angularVelocity.set(
            (Math.random() - 0.5) * 5,
            (Math.random() - 0.5) * 5,
            (Math.random() - 0.5) * 5
          );
          entity.onHit?.();
          this.audio.playImpactSound();
          this.spawnImpactSparks(p.mesh.position, 0x57ffb0);
          break;
        }
      }

      // Check boundary collision against house walls
      if (
        !hit &&
        (p.lifetime > 1.2 ||
          p.mesh.position.y <= 0.05 ||
          p.mesh.position.z > 7.90 ||
          p.mesh.position.z < -3.55 ||
          Math.abs(p.mesh.position.x) > 3.55)
      ) {
        hit = true;
        this.spawnImpactSparks(p.mesh.position);
      }

      if (hit) {
        this.projectileGroup.remove(p.mesh);
        p.mesh.geometry.dispose();
        this.projectiles.splice(i, 1);
      }
    }

    // 4. Sparks Update
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.lifetime += dt;
      s.mesh.position.addScaledVector(s.velocity, dt);
      s.velocity.y -= 9.8 * dt;

      const progress = s.lifetime / s.maxLife;
      const mat = s.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 1 - progress;

      if (s.lifetime >= s.maxLife) {
        this.sparksGroup.remove(s.mesh);
        s.mesh.geometry.dispose();
        mat.dispose();
        this.sparks.splice(i, 1);
      }
    }
  }

  dispose(): void {
    this.tetherGeo.dispose();
  }
}
