import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import * as xb from 'xrblocks';

import {PortalAudio} from './portal/PortalAudio';
import {
  PORTAL_OPENING_HEIGHT,
  PORTAL_OPENING_WIDTH,
  PortalFrame,
} from './portal/PortalFrame';
import {createPortalControlCard} from './portal/PortalUI';
import {computeProximityAudioState} from './portal/portalMath';

const _invPortalMatrix = new THREE.Matrix4();
const _localCamPos = new THREE.Vector3();

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
 * Mixed reality "Portal to Another World" experience.
 * Spawns a glowing floating doorway with a stencil-gated alien dimension
 * inside, hand-tracking edge/corner/arc manipulation, and proximity-reactive
 * ambient space soundscapes.
 */
class AetherGateExperience extends xb.Script {
  private portal!: PortalFrame;
  private controlCard!: xb.UICard;
  private audio!: PortalAudio;
  private setModeLabel!: (text: string) => void;
  private lastModeText = '';
  private pmremEnvTex: THREE.Texture | null = null;
  private audioUnlockListener = () => this.audio?.unlockAndStart();

  override init(): void {
    this.setupLightingAndEnvironment();

    this.audio = new PortalAudio();
    this.portal = new PortalFrame();
    // Spawn comfortably floating in front of the user at eye/chest height
    this.portal.position.set(0, 1.42, -1.65);
    this.add(this.portal);

    const ui = createPortalControlCard({
      onRecenter: () => {
        this.audio.unlockAndStart();
        this.recenterExperience();
      },
      onToggleAudio: () => {
        this.audio.unlockAndStart();
        return this.audio.toggleMute();
      },
    });
    this.controlCard = ui.card;
    this.setModeLabel = ui.setModeLabel;
    this.add(this.controlCard);

    window.addEventListener('pointerdown', this.audioUnlockListener, {passive: true});
    window.addEventListener('keydown', this.audioUnlockListener, {passive: true});
    document.body.dataset.state = 'ready';
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
    this.recenterExperience();
  }

  override onXRSessionStarted(): void {
    document.body.dataset.state = 'xr';
    this.audio.unlockAndStart();
    this.recenterExperience();
  }

  override onSelectStart(): void {
    this.audio.unlockAndStart();
  }

  override update(): void {
    const cam = getActiveCamera();
    if (!cam) return;

    this.portal.updateWorldMatrix(true, false);
    _invPortalMatrix.copy(this.portal.matrixWorld).invert();
    _localCamPos.copy(cam.position).applyMatrix4(_invPortalMatrix);

    const scale = this.portal.scale.x;
    const metricLocalPos = {
      x: _localCamPos.x * scale,
      y: _localCamPos.y * scale,
      z: _localCamPos.z * scale,
    };

    const audioState = computeProximityAudioState(
      metricLocalPos,
      PORTAL_OPENING_WIDTH * 0.5 * scale,
      PORTAL_OPENING_HEIGHT * 0.5 * scale
    );
    const stereoPan = -metricLocalPos.x * 0.35;
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
  }

  override dispose(): void {
    window.removeEventListener('pointerdown', this.audioUnlockListener);
    window.removeEventListener('keydown', this.audioUnlockListener);
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
  if (params.has('autostart')) {
    options.xrButton.alwaysAutostartSimulator = true;
  }

  xb.add(new AetherGateExperience());
  await xb.init(options);

  if (isSoftwareGl && xb.core.renderer instanceof THREE.WebGLRenderer) {
    xb.core.renderer.setPixelRatio(1);
  }
});
