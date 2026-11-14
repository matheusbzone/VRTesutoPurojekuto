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
 * First-person holographic/energy hands and powers system:
 * - Stylized articulated first-person hands anchored to the player's view
 * - Energy projectile shooting with physical impulse impacts and particle bursts
 * - Telekinetic attraction, floating hold, and launching/throwing of interactable objects
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
  private rightHandBasePos = new THREE.Vector3(0.28, -0.25, -0.52);
  private leftHandBasePos = new THREE.Vector3(-0.28, -0.25, -0.52);

  private rightRecoil = 0;
  private leftCast = 0;

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

    this.leftHand = this.createStylizedHand('left', 0xd966ff);
    this.rightHand = this.createStylizedHand('right', 0x4ff2ff);

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
      color: 0xe879f9,
      linewidth: 3,
      transparent: true,
      opacity: 0.85,
    });
    this.tetherLine = new THREE.Line(this.tetherGeo, tetherMat);
    this.tetherLine.visible = false;
    this.handsGroup.add(this.tetherLine);

    this.handsGroup.add(this.projectileGroup);
    this.handsGroup.add(this.sparksGroup);
  }

  private createStylizedHand(side: 'left' | 'right', glowColor: number): THREE.Group {
    const hand = new THREE.Group();
    const isRight = side === 'right';

    const bracerMat = new THREE.MeshStandardMaterial({
      color: 0x181a28,
      roughness: 0.35,
      metalness: 0.8,
    });

    const glowMat = new THREE.MeshBasicMaterial({
      color: glowColor,
      transparent: true,
      opacity: 0.88,
    });

    const skinMat = new THREE.MeshStandardMaterial({
      color: 0x222a3d,
      roughness: 0.5,
      metalness: 0.3,
    });

    // 1. Forearm Bracer / Gauntlet
    const bracerGeo = new THREE.CylinderGeometry(0.045, 0.052, 0.22, 12);
    const bracer = new THREE.Mesh(bracerGeo, bracerMat);
    bracer.rotation.x = Math.PI / 2;
    bracer.position.set(0, 0, 0.08);
    hand.add(bracer);

    // Glowing Runic Ring on Bracer
    const ringGeo = new THREE.TorusGeometry(0.049, 0.005, 8, 20);
    const ring = new THREE.Mesh(ringGeo, glowMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, 0, 0.04);
    hand.add(ring);

    // 2. Palm Plate
    const palmGeo = new THREE.BoxGeometry(0.065, 0.022, 0.075);
    const palm = new THREE.Mesh(palmGeo, skinMat);
    palm.position.set(0, 0, -0.06);
    hand.add(palm);

    // Central Glowing Palm Arcane Core
    const coreGeo = new THREE.SphereGeometry(0.016, 12, 12);
    const core = new THREE.Mesh(coreGeo, glowMat);
    core.position.set(0, 0.012, -0.06);
    hand.add(core);

    // 3. Articulated Digits / Fingers
    const fingerOffsets = [
      {x: isRight ? -0.034 : 0.034, z: -0.035, len: 0.035, angle: (isRight ? -1 : 1) * 0.45}, // Thumb
      {x: (isRight ? -1 : 1) * 0.024, z: -0.10, len: 0.045, angle: 0.05}, // Index
      {x: 0.00, z: -0.105, len: 0.048, angle: 0.0}, // Middle
      {x: (isRight ? 1 : -1) * 0.022, z: -0.098, len: 0.042, angle: -0.05}, // Ring
      {x: (isRight ? 1 : -1) * 0.036, z: -0.088, len: 0.032, angle: -0.12}, // Pinky
    ];

    for (const f of fingerOffsets) {
      const fGeo = new THREE.CylinderGeometry(0.007, 0.008, f.len, 8);
      const finger = new THREE.Mesh(fGeo, skinMat);
      finger.rotation.x = Math.PI / 2;
      finger.rotation.z = f.angle;
      finger.position.set(f.x, 0, f.z);
      hand.add(finger);

      // Glowing fingertip
      const tipGeo = new THREE.SphereGeometry(0.007, 8, 8);
      const tip = new THREE.Mesh(tipGeo, glowMat);
      tip.position.set(f.x, 0, f.z - f.len * 0.5);
      hand.add(tip);
    }

    // Default angle for natural first-person viewing
    hand.rotation.x = 0.15;
    hand.rotation.y = (isRight ? -1 : 1) * 0.12;
    hand.rotation.z = (isRight ? 1 : -1) * 0.18;

    return hand;
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

    // Trigger right hand recoil gesture
    this.rightRecoil = 0.32;

    const projGeo = new THREE.SphereGeometry(0.065, 16, 16);
    const projMat = new THREE.MeshBasicMaterial({color: 0x62f7ff});
    const projMesh = new THREE.Mesh(projGeo, projMat);

    const light = new THREE.PointLight(0x62f7ff, 2.5, 4.0);
    projMesh.add(light);

    // Calculate spawn position in front of right hand
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);

    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const spawnPos = camera.position
      .clone()
      .addScaledVector(right, 0.22)
      .addScaledVector(dir, 0.45);
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

      this.heldItem.velocity.copy(dir).multiplyScalar(8.5);
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

    // Attempt to grab closest interactable in line of sight (up to 5.5 meters)
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);

    let bestEntity: InteractableEntity | null = null;
    let bestDist = 5.5;

    for (const entity of interactables) {
      const toObj = entity.mesh.position.clone().sub(camera.position);
      const dist = toObj.length();
      if (dist < bestDist && dist > 0.3) {
        toObj.normalize();
        const dot = camDir.dot(toObj);
        // Generous angle cone (~35 degrees)
        if (dot > 0.82) {
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
      this.tetherLine.visible = true;
      this.onGrabStateChange?.(true, bestEntity.name);
    }
  }

  private spawnImpactSparks(position: THREE.Vector3, color = 0x6be5ff): void {
    const count = 8;
    for (let i = 0; i < count; i++) {
      const sparkGeo = new THREE.SphereGeometry(0.02, 6, 6);
      const sparkMat = new THREE.MeshBasicMaterial({color, transparent: true, opacity: 1});
      const spark = new THREE.Mesh(sparkGeo, sparkMat);
      spark.position.copy(position);

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 4,
        Math.random() * 3 + 1,
        (Math.random() - 0.5) * 4
      );

      this.sparksGroup.add(spark);
      this.sparks.push({
        mesh: spark,
        velocity: vel,
        lifetime: 0,
        maxLife: 0.35,
      });
    }
  }

  update(dt: number, camera: THREE.Camera, interactables: InteractableEntity[]): void {
    if (!this.enabled) return;

    const time = performance.now() * 0.001;

    // 1. Hands breathing & idle movement
    const idleSwayY = Math.sin(time * 2.2) * 0.006;
    const idleSwayX = Math.cos(time * 1.6) * 0.004;

    // Right hand recoil decay
    this.rightRecoil = Math.max(0, this.rightRecoil - dt * 2.5);
    this.rightHand.position.set(
      this.rightHandBasePos.x + idleSwayX,
      this.rightHandBasePos.y + idleSwayY,
      this.rightHandBasePos.z + this.rightRecoil * 0.25
    );

    // Left hand telekinesis casting animation
    this.leftCast = Math.max(0, this.leftCast - dt * 1.8);
    this.leftHand.position.set(
      this.leftHandBasePos.x - idleSwayX,
      this.leftHandBasePos.y + idleSwayY,
      this.leftHandBasePos.z - this.leftCast * 0.15
    );

    // 2. Telekinetic Hold & Tether Update
    if (this.heldItem) {
      const camDir = new THREE.Vector3();
      camera.getWorldDirection(camDir);

      const targetHoldPos = camera.position
        .clone()
        .addScaledVector(camDir, 1.35);
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
        if (dist <= entity.colliderRadius + 0.12) {
          hit = true;
          // Apply physics impulse
          const impulse = p.velocity.clone().normalize().multiplyScalar(4.5);
          entity.velocity.add(impulse);
          entity.angularVelocity.set(
            (Math.random() - 0.5) * 6,
            (Math.random() - 0.5) * 6,
            (Math.random() - 0.5) * 6
          );
          entity.onHit?.();
          this.audio.playImpactSound();
          this.spawnImpactSparks(p.mesh.position, 0x57ffb0);
          break;
        }
      }

      // Check max lifetime or boundary collision
      if (
        !hit &&
        (p.lifetime > 1.2 ||
          p.mesh.position.y <= 0.05 ||
          p.mesh.position.z > 8.1 ||
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
