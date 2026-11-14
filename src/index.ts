import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import * as xb from 'xrblocks';

import {MobileExploreControls} from './portal/MobileExploreControls';
import {PortalAudio} from './portal/PortalAudio';
import {HouseExpansion} from './portal/HouseExpansion';
import {PlayerAbilities} from './portal/PlayerAbilities';
import {
  PORTAL_OPENING_HEIGHT,
  PORTAL_OPENING_WIDTH,
  PortalFrame,
} from './portal/PortalFrame';
import {createPortalControlCard} from './portal/PortalUI';
import {
  applyAngularDeltas,
  clampExplorePosition,
  clampRoomPosition,
  computeExploreMovement,
  computeLookJoystickRotation,
  computePitchYawFromDrag,
  resolveRoomCollision,
} from './portal/exploreMath';
import {computeProximityAudioState} from './portal/portalMath';

const _invPortalMatrix = new THREE.Matrix4();
const _localCamPos = new THREE.Vector3();
const _skyLocalCam = new THREE.Vector3();
const _exploreStartPos = new THREE.Vector3();
const _exploreLookAt = new THREE.Vector3();
const _exploreCenter = new THREE.Vector3();
const _roomDesiredPos = new THREE.Vector3();
const _exploreEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const _raycaster = new THREE.Raycaster();
const _pointerNorm = new THREE.Vector2();

function isPointerOverObjects(
  clientX: number,
  clientY: number,
  camera: THREE.Camera,
  objects: THREE.Object3D[]
): boolean {
  if (typeof window === 'undefined') return false;
  _pointerNorm.x = (clientX / window.innerWidth) * 2 - 1;
  _pointerNorm.y = -(clientY / window.innerHeight) * 2 + 1;
  _raycaster.setFromCamera(_pointerNorm, camera);
  const hits = _raycaster.intersectObjects(objects, true);
  return hits.length > 0;
}

function detectSoftwareWebGL(): boolean {
  if (typeof document === 'undefined') return false;
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return true;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param));
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
}

function getActiveCamera(): THREE.Camera {
  return (
    (xb.core.simulatorRunning ? xb.core.simulator?.getRenderCamera() : undefined) ??
    xb.core.camera
  );
}

/**
 * Mixed reality "Portal to Another World" experience with a full-world "Sem AR"
 * exploration mode controlled via an on-screen virtual joystick and Subir / Descer
 * vertical elevation buttons.
 */
class AetherGateExperience extends xb.Script {
  private portal!: PortalFrame;
  private controlCard!: xb.UICard;
  private audio!: PortalAudio;
  private houseExpansion!: HouseExpansion;
  private abilities!: PlayerAbilities;
  private exploreControls!: MobileExploreControls;
  private setModeLabel!: (text: string) => void;
  private setCardExploreActive!: (active: boolean) => void;
  private lastModeText = '';
  private pmremEnvTex: THREE.Texture | null = null;
  private exploreMode = false;
  private pendingExplore = false;
  private readonly heldKeys = new Set<string>();

  private audioUnlockListener = () => this.audio?.unlockAndStart();

  constructor(initialExplore = false) {
    super();
    this.pendingExplore = initialExplore;
  }

  override init(): void {
    this.setupLightingAndEnvironment();

    this.audio = new PortalAudio();
    this.portal = new PortalFrame();
    // Spawn comfortably floating in front of the user at eye/chest height
    this.portal.position.set(0, 1.42, -1.65);
    this.add(this.portal);

    // Architectural room expansion (Arcane Study & Sunroom Gallery)
    this.houseExpansion = new HouseExpansion();
    this.add(this.houseExpansion);

    // First-person hands and abilities (plasma shot & telekinesis)
    this.abilities = new PlayerAbilities({
      audio: this.audio,
      onGrabStateChange: (isHolding, itemName) => {
        this.exploreControls.setHoldingState(isHolding, itemName);
      },
    });

    const ui = createPortalControlCard({
      onRecenter: () => {
        this.audio.unlockAndStart();
        this.recenterExperience();
      },
      onToggleAudio: () => {
        this.audio.unlockAndStart();
        return this.audio.toggleMute();
      },
      onToggleExplore: () => {
        this.audio.unlockAndStart();
        void this.toggleExploreMode();
        return !this.exploreMode;
      },
    });
    this.controlCard = ui.card;
    this.setModeLabel = ui.setModeLabel;
    this.setCardExploreActive = ui.setExploreActive;
    this.add(this.controlCard);

    this.exploreControls = new MobileExploreControls({
      onToggleExplore: async () => {
        this.audio.unlockAndStart();
        await this.toggleExploreMode();
      },
      onLookDrag: (dx, dy) => this.applyLookDrag(dx, dy),
      canLookDrag: (event) => {
        if (this.exploreMode) return true;
        if (this.portal.getInteractionMode() !== 'idle') return false;
        const cam = getActiveCamera();
        if (!cam) return false;
        return !isPointerOverObjects(event.clientX, event.clientY, cam, [
          this.portal,
          this.controlCard,
        ]);
      },
      onTogglePowers: () => {
        this.audio.unlockAndStart();
        return this.abilities.toggleEnabled();
      },
      onShoot: () => {
        const cam = getActiveCamera();
        if (cam) this.abilities.shoot(cam);
      },
      onGrab: () => {
        const cam = getActiveCamera();
        if (cam) this.abilities.grabOrRelease(cam, this.houseExpansion.interactables);
      },
    });

    window.addEventListener('pointerdown', this.handleWindowPointerDown);
    window.addEventListener('keydown', this.handleWindowKeyDown);
    window.addEventListener('keyup', this.handleWindowKeyUp, {passive: true});
    window.addEventListener('blur', this.onWindowBlur);
    window.addEventListener('contextmenu', this.handleContextMenu);

    document.body.dataset.state = 'ready';
    document.body.dataset.mode = 'portal';
  }

  private handleContextMenu = (event: MouseEvent): void => {
    if (this.abilities?.isEnabled()) {
      event.preventDefault();
    }
  };

  private handleWindowPointerDown = (event: PointerEvent): void => {
    this.audioUnlockListener();
    if (!this.abilities?.isEnabled()) return;
    if (event.pointerType !== 'mouse') return;

    const cam = getActiveCamera();
    if (!cam) return;

    // Do not fire if clicking UI buttons or portal control card
    if (isPointerOverObjects(event.clientX, event.clientY, cam, [this.controlCard, this.portal])) {
      return;
    }

    if (event.button === 0) {
      this.abilities.shoot(cam);
    } else if (event.button === 2) {
      event.preventDefault();
      this.abilities.grabOrRelease(cam, this.houseExpansion.interactables);
    }
  };

  private handleWindowKeyDown = (event: KeyboardEvent): void => {
    this.audioUnlockListener();
    this.heldKeys.add(event.code);

    if (event.code === 'KeyH') {
      const active = this.abilities.toggleEnabled();
      this.exploreControls.setPowersActive(active);
    } else if (event.code === 'KeyF') {
      if (this.abilities.isEnabled()) {
        const cam = getActiveCamera();
        if (cam) this.abilities.shoot(cam);
      }
    } else if (event.code === 'KeyE') {
      if (this.abilities.isEnabled()) {
        const cam = getActiveCamera();
        if (cam) this.abilities.grabOrRelease(cam, this.houseExpansion.interactables);
      }
    }
  };

  private handleWindowKeyUp = (event: KeyboardEvent): void => {
    this.heldKeys.delete(event.code);
  };

  private onWindowBlur = (): void => {
    this.heldKeys.clear();
  };

  private async toggleExploreMode(): Promise<void> {
    if (!xb.core.simulatorRunning) {
      this.pendingExplore = true;
      await xb.core.startSimulator();
      return;
    }
    this.setExploreMode(!this.exploreMode);
  }

  private setExploreMode(enabled: boolean): void {
    this.exploreMode = enabled;
    this.portal.setExploreMode(enabled);
    this.exploreControls.setExploreMode(enabled);
    this.setCardExploreActive(enabled);
    document.body.dataset.mode = enabled ? 'explore' : 'portal';

    const cam = getActiveCamera();
    if (enabled) {
      xb.core.simulator?.userInterface?.notifyUserInteraction?.();
      this.controlCard.visible = false;
      this.portal.updateWorldMatrix(true, false);
      // Enter through the portal threshold overlooking the central floating island
      _exploreStartPos.set(0, 0.25, -1.35).applyMatrix4(this.portal.matrixWorld);
      _exploreLookAt.set(0, 0.05, -4.4).applyMatrix4(this.portal.matrixWorld);
      cam.position.copy(_exploreStartPos);
      cam.lookAt(_exploreLookAt);
      this.portal.alienWorld.updateWorldMatrix(true, false);
      this.portal.alienWorld.worldToLocal(_skyLocalCam.copy(cam.position));
      this.portal.alienWorld.setSkyCenter(_skyLocalCam);
    } else {
      this.controlCard.visible = true;
      cam.position.set(0, xb.core.user?.height ?? 1.5, 0);
      cam.lookAt(0, 1.42, -1.65);
      this.recenterExperience();
    }
  }

  private applyLookDrag(deltaX: number, deltaY: number): void {
    if (!this.exploreMode && this.portal.getInteractionMode() !== 'idle') return;
    const cam = getActiveCamera();
    if (!cam) return;
    _exploreEuler.setFromQuaternion(cam.quaternion, 'YXZ');
    const {yaw, pitch} = computePitchYawFromDrag(
      _exploreEuler.y,
      _exploreEuler.x,
      deltaX,
      deltaY
    );
    _exploreEuler.set(pitch, yaw, 0, 'YXZ');
    cam.quaternion.setFromEuler(_exploreEuler);
  }

  private recenterExperience(): void {
    const cam = getActiveCamera();
    this.portal.recenterInFrontOfCamera(cam, 1.65);

    const right = new THREE.Vector3(1, 0, 0)
      .applyQuaternion(this.portal.quaternion)
      .normalize();
    this.controlCard.position
      .copy(this.portal.position)
      .addScaledVector(right, 1.05);
    this.controlCard.position.y = this.portal.position.y - 0.04;
    this.controlCard.lookAt(cam.position.x, this.controlCard.position.y, cam.position.z);
  }

  private setupLightingAndEnvironment(): void {
    const hemi = new THREE.HemisphereLight(0xd9e8ff, 0x24193d, 2.2);
    this.add(hemi);

    const key = new THREE.DirectionalLight(0xfff4e8, 2.4);
    key.position.set(2.5, 4.5, 2.0);
    this.add(key);

    const rim = new THREE.DirectionalLight(0x63e8ff, 1.4);
    rim.position.set(-2.5, 2.0, -1.5);
    this.add(rim);

    const renderer = xb.core.renderer;
    if (renderer instanceof THREE.WebGLRenderer && xb.core.scene) {
      const pmrem = new THREE.PMREMGenerator(renderer);
      this.pmremEnvTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      xb.core.scene.environment = this.pmremEnvTex;
      pmrem.dispose();
    }
  }

  override onSimulatorStarted(): void {
    document.body.dataset.state = 'simulator';
    this.exploreControls.setXRSessionActive(false);
    this.recenterExperience();
    if (this.pendingExplore) {
      this.pendingExplore = false;
      this.setExploreMode(true);
    }
  }

  override onXRSessionStarted(): void {
    document.body.dataset.state = 'xr';
    this.pendingExplore = false;
    this.exploreControls.setXRSessionActive(true);
    this.setExploreMode(false);
    this.audio.unlockAndStart();
    this.recenterExperience();
  }

  override onSelectStart(): void {
    this.audio.unlockAndStart();
  }

  override update(): void {
    const cam = getActiveCamera();
    if (!cam) return;

    if (this.abilities && this.abilities.handsGroup.parent !== cam) {
      cam.add(this.abilities.handsGroup);
    }

    const dt = Math.min(0.05, Math.max(0.001, xb.getDeltaTime()));

    this.houseExpansion?.update(dt);
    this.abilities?.update(dt, cam, this.houseExpansion.interactables);

    const lookInput = this.exploreControls.getLookInput();
    if (lookInput.lookX !== 0 || lookInput.lookY !== 0) {
      _exploreEuler.setFromQuaternion(cam.quaternion, 'YXZ');
      const rot = computeLookJoystickRotation(
        {x: lookInput.lookX, y: lookInput.lookY},
        2.2,
        1.7,
        dt
      );
      const angles = applyAngularDeltas(
        _exploreEuler.y,
        _exploreEuler.x,
        rot.yawDelta,
        rot.pitchDelta
      );
      _exploreEuler.set(angles.pitch, angles.yaw, 0, 'YXZ');
      cam.quaternion.setFromEuler(_exploreEuler);
    }

    if (this.exploreMode) {
      const moveInput = this.exploreControls.getMoveInput();
      const kbUp = this.heldKeys.has('Space') || this.heldKeys.has('PageUp') ? 1 : 0;
      const kbDown =
        this.heldKeys.has('ShiftLeft') ||
        this.heldKeys.has('ShiftRight') ||
        this.heldKeys.has('PageDown')
          ? 1
          : 0;
      const vertical = Math.max(-1, Math.min(1, moveInput.vertical + kbUp - kbDown));

      _exploreEuler.setFromQuaternion(cam.quaternion, 'YXZ');
      const delta = computeExploreMovement(
        _exploreEuler.y,
        {moveX: moveInput.moveX, moveZ: moveInput.moveZ, vertical},
        3.6,
        2.6,
        dt
      );

      this.portal.updateWorldMatrix(true, false);
      _exploreCenter.set(0, 0, -4.4).applyMatrix4(this.portal.matrixWorld);
      const clamped = clampExplorePosition(
        {
          x: cam.position.x + delta.dx,
          y: cam.position.y + delta.dy,
          z: cam.position.z + delta.dz,
        },
        {
          centerX: _exploreCenter.x,
          centerZ: _exploreCenter.z,
          maxRadius: 15.0,
          minY: this.portal.position.y - 2.8,
          maxY: this.portal.position.y + 8.5,
        }
      );
      cam.position.set(clamped.x, clamped.y, clamped.z);

      this.portal.alienWorld.updateWorldMatrix(true, false);
      this.portal.alienWorld.worldToLocal(_skyLocalCam.copy(cam.position));
      this.portal.alienWorld.setSkyCenter(_skyLocalCam);
    } else {
      const moveInput = this.exploreControls.getMoveInput();
      const kbForward =
        this.heldKeys.has('KeyW') || this.heldKeys.has('ArrowUp')
          ? 1
          : this.heldKeys.has('KeyS') || this.heldKeys.has('ArrowDown')
            ? -1
            : 0;
      const kbStrafe =
        this.heldKeys.has('KeyD') || this.heldKeys.has('ArrowRight')
          ? 1
          : this.heldKeys.has('KeyA') || this.heldKeys.has('ArrowLeft')
            ? -1
            : 0;

      const totalMoveX = Math.max(-1, Math.min(1, moveInput.moveX + kbStrafe));
      const totalMoveZ = Math.max(-1, Math.min(1, moveInput.moveZ + kbForward));

      if (totalMoveX !== 0 || totalMoveZ !== 0) {
        _exploreEuler.setFromQuaternion(cam.quaternion, 'YXZ');
        const delta = computeExploreMovement(
          _exploreEuler.y,
          {moveX: totalMoveX, moveZ: totalMoveZ, vertical: 0},
          2.6,
          0,
          dt
        );
        const resolvedPos = resolveRoomCollision(
          cam.position,
          {dx: delta.dx, dz: delta.dz},
          0.25
        );

        cam.position.set(resolvedPos.x, resolvedPos.y, resolvedPos.z);
        _roomDesiredPos.set(resolvedPos.x, resolvedPos.y, resolvedPos.z);
        if (xb.core.simulatorRunning && xb.core.simulator) {
          xb.core.simulator.moveUser(_roomDesiredPos);
        }
      } else {
        // Keep camera grounded on the floor and locked within safe room boundaries
        const clampedIdle = resolveRoomCollision(cam.position, {dx: 0, dz: 0}, 0.25);
        cam.position.set(clampedIdle.x, clampedIdle.y, clampedIdle.z);
      }
    }

    this.portal.updateWorldMatrix(true, false);
    _invPortalMatrix.copy(this.portal.matrixWorld).invert();
    _localCamPos.copy(cam.position).applyMatrix4(_invPortalMatrix);

    const scale = this.portal.scale.x;
    const metricLocalPos = {
      x: _localCamPos.x * scale,
      y: _localCamPos.y * scale,
      z: _localCamPos.z * scale,
    };

    const audioState = this.exploreMode
      ? computeProximityAudioState({x: 0, y: 0, z: 0.25}, 0.5, 0.8)
      : computeProximityAudioState(
          metricLocalPos,
          PORTAL_OPENING_WIDTH * 0.5 * scale,
          PORTAL_OPENING_HEIGHT * 0.5 * scale
        );
    const stereoPan = this.exploreMode ? 0 : -metricLocalPos.x * 0.35;
    this.audio.updateProximity(audioState, stereoPan);

    const mode = this.portal.getInteractionMode();
    const nextLabel =
      mode === 'move'
        ? 'MOVING PORTAL · RELEASE PINCH TO ANCHOR'
        : mode === 'resize'
          ? `RESIZING PORTAL · ${Math.round(scale * 100)}% SCALE`
          : mode === 'rotate'
            ? 'ROTATING PORTAL · DRAG TO ORIENT DOORWAY'
            : 'PINCH EDGES TO MOVE · CORNERS TO RESIZE · ARCS TO ROTATE';

    if (nextLabel !== this.lastModeText) {
      this.lastModeText = nextLabel;
      this.setModeLabel(nextLabel);
    }

    document.body.dataset.portalDistance = audioState.distance.toFixed(2);
    document.body.dataset.portalScale = scale.toFixed(2);
    document.body.dataset.audioGain = this.audio.getLastGain().toFixed(2);
    document.body.dataset.camPos = `${cam.position.x.toFixed(2)},${cam.position.y.toFixed(2)},${cam.position.z.toFixed(2)}`;
  }

  override dispose(): void {
    window.removeEventListener('pointerdown', this.handleWindowPointerDown);
    window.removeEventListener('keydown', this.handleWindowKeyDown);
    window.removeEventListener('keyup', this.handleWindowKeyUp);
    window.removeEventListener('blur', this.onWindowBlur);
    window.removeEventListener('contextmenu', this.handleContextMenu);
    this.exploreControls?.dispose();
    this.abilities?.dispose();
    this.houseExpansion?.dispose();
    this.audio?.dispose();
    this.pmremEnvTex?.dispose();
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const isSoftwareGl = detectSoftwareWebGL();
  const options = new xb.Options();

  // Stencil buffer MUST be enabled so the portal doorway masks the hidden alien world.
  options.stencil = true;
  options.antialias = !isSoftwareGl;

  options.enableHands();
  options.hands.visualization = true;
  options.enableReticles();

  options.setAppTitle('Aether Gate');
  options.setAppDescription(
    'Open a glowing dimensional doorway in your room. Pinch edges to move, corners to resize, and side arcs to rotate.'
  );
  options.xrButton.showEnterSimulatorButton = true;

  const params = new URLSearchParams(window.location.search);
  const initialExplore = params.has('explore');
  if (params.has('autostart') || initialExplore) {
    options.xrButton.alwaysAutostartSimulator = true;
  }

  xb.add(new AetherGateExperience(initialExplore));
  await xb.init(options);

  if (isSoftwareGl && xb.core.renderer instanceof THREE.WebGLRenderer) {
    xb.core.renderer.setPixelRatio(1);
  }
});
