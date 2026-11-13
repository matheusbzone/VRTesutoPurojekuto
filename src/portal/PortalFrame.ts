import * as THREE from 'three';
import * as xb from 'xrblocks';

import {AlienWorld} from './AlienWorld';
import {computeCornerResizeScale} from './portalMath';

export const PORTAL_OPENING_WIDTH = 1.06;
export const PORTAL_OPENING_HEIGHT = 1.66;
export const PORTAL_FRAME_THICKNESS = 0.085;
export const PORTAL_FRAME_DEPTH = 0.11;

export type PortalInteractionMode = 'idle' | 'move' | 'resize' | 'rotate';

const _rayOrigin = new THREE.Vector3();
const _rayDir = new THREE.Vector3();
const _planeNormal = new THREE.Vector3();
const _planePoint = new THREE.Vector3();
const _portalPlane = new THREE.Plane();
const _hitWorld = new THREE.Vector3();
const _hitLocal = new THREE.Vector3();
const _invMatrix = new THREE.Matrix4();
const _ray = new THREE.Ray();

/**
 * Interactive corner bracket handle allowing single-hand pinch or mouse drag
 * to resize the portal doorway smoothly while glowing on hover/grab.
 */
class CornerResizeHandle extends xb.MeshScript {
  private readonly baseMaterial: THREE.MeshStandardMaterial;
  private readonly onResizeActive: (active: boolean) => void;
  private readonly getPortalRoot: () => PortalFrame;

  private activeController: THREE.Object3D | null = null;
  private isDirectTouch = false;
  private initialDist = 1;
  private initialScale = 1;
  private hovered = false;

  constructor(
    geometry: THREE.BufferGeometry,
    getPortalRoot: () => PortalFrame,
    onResizeActive: (active: boolean) => void
  ) {
    const material = new THREE.MeshStandardMaterial({
      color: 0x34e8ff,
      emissive: 0x16a8e0,
      emissiveIntensity: 0.9,
      roughness: 0.2,
      metalness: 0.8,
    });
    super(geometry, material);
    this.baseMaterial = material;
    this.getPortalRoot = getPortalRoot;
    this.onResizeActive = onResizeActive;
    // Prevent XR Blocks' automatic translate from grabbing this corner node
    this.xb = {manipulationHandle: 'none'};
  }

  private sampleLocalDistance(event: xb.SelectEvent): number | null {
    const portal = this.getPortalRoot();
    portal.updateWorldMatrix(true, false);
    _invMatrix.copy(portal.matrixWorld).invert();

    const controller = event.source.controller;
    if (!controller) return null;

    if (event.source.type === 'direct-touch') {
      const handedness =
        event.source.handedness === 'left'
          ? xb.Handedness.LEFT
          : event.source.handedness === 'right'
            ? xb.Handedness.RIGHT
            : xb.Handedness.NONE;
      const tip =
        handedness === xb.Handedness.NONE
          ? undefined
          : xb.core.user.hands?.getIndexTip(handedness);
      if (tip) {
        tip.getWorldPosition(_hitWorld);
      } else {
        controller.getWorldPosition(_hitWorld);
      }
      _hitLocal.copy(_hitWorld).applyMatrix4(_invMatrix);
      const s = portal.scale.x;
      return Math.hypot(_hitLocal.x * s, _hitLocal.y * s);
    }

    _planeNormal.set(0, 0, 1).transformDirection(portal.matrixWorld).normalize();
    _planePoint.setFromMatrixPosition(portal.matrixWorld);
    _portalPlane.setFromNormalAndCoplanarPoint(_planeNormal, _planePoint);

    controller.getWorldPosition(_rayOrigin);
    _rayDir.set(0, 0, -1).transformDirection(controller.matrixWorld).normalize();
    _ray.set(_rayOrigin, _rayDir);

    if (!_ray.intersectPlane(_portalPlane, _hitWorld)) return null;
    _hitLocal.copy(_hitWorld).applyMatrix4(_invMatrix);
    const s = portal.scale.x;
    return Math.hypot(_hitLocal.x * s, _hitLocal.y * s);
  }

  override onHoverEnter(): void {
    this.hovered = true;
    this.refreshVisual();
  }

  override onHoverExit(): void {
    this.hovered = false;
    this.refreshVisual();
  }

  override onObjectTouchStart(event: xb.ObjectTouchStartEvent): void {
    // Keep touch from triggering parent translate manipulation
    event.preventDefault();
    event.stopPropagation();
  }

  override onObjectSelectStart(event: xb.SelectEvent): void {
    event.stopPropagation();
    if (this.activeController) return;
    const dist = this.sampleLocalDistance(event);
    if (dist === null) return;

    this.activeController = event.source.controller;
    this.isDirectTouch = event.source.type === 'direct-touch';
    this.initialDist = Math.max(0.15, dist);
    this.initialScale = this.getPortalRoot().scale.x;
    this.onResizeActive(true);
    this.refreshVisual();
  }

  override onSelecting(event: xb.SelectEvent): void {
    if (event.source.controller !== this.activeController) return;
    event.stopPropagation();
    const dist = this.sampleLocalDistance(event);
    if (dist === null) return;
    const nextScale = computeCornerResizeScale(
      this.initialDist,
      dist,
      this.initialScale,
      0.45,
      2.6
    );
    this.getPortalRoot().setPortalScale(nextScale);
  }

  override onObjectSelectEnd(event: xb.SelectEvent): void {
    if (event.source.controller !== this.activeController && !this.isDirectTouch) {
      return;
    }
    event.stopPropagation();
    this.activeController = null;
    this.isDirectTouch = false;
    this.onResizeActive(false);
    this.refreshVisual();
  }

  private refreshVisual(): void {
    if (this.activeController) {
      this.baseMaterial.color.setHex(0xffffff);
      this.baseMaterial.emissive.setHex(0x6ffbff);
      this.baseMaterial.emissiveIntensity = 2.2;
      this.scale.setScalar(1.22);
    } else if (this.hovered) {
      this.baseMaterial.color.setHex(0x8ff9ff);
      this.baseMaterial.emissive.setHex(0x3be8ff);
      this.baseMaterial.emissiveIntensity = 1.6;
      this.scale.setScalar(1.12);
    } else {
      this.baseMaterial.color.setHex(0x34e8ff);
      this.baseMaterial.emissive.setHex(0x16a8e0);
      this.baseMaterial.emissiveIntensity = 0.9;
      this.scale.setScalar(1.0);
    }
  }

  override dispose(): void {
    this.baseMaterial.dispose();
  }
}

/**
 * Interactive rail or rotation grip that highlights when hovered/pinched while
 * delegating transform motion to XR Blocks' built-in ManipulationManager.
 */
class PortalGripHandle extends xb.MeshScript {
  private readonly mat: THREE.MeshStandardMaterial;
  private readonly idleEmissive: number;
  private readonly activeEmissive: number;
  private hovered = false;
  private grabbed = false;

  constructor(
    geometry: THREE.BufferGeometry,
    material: THREE.MeshStandardMaterial,
    action: 'translate' | 'rotate',
    idleEmissive: number,
    activeEmissive: number
  ) {
    super(geometry, material);
    this.mat = material;
    this.idleEmissive = idleEmissive;
    this.activeEmissive = activeEmissive;
    this.xb = {manipulationHandle: {action}};
  }

  override onHoverEnter(): void {
    this.hovered = true;
    this.updateGlow();
  }

  override onHoverExit(): void {
    this.hovered = false;
    this.updateGlow();
  }

  override onObjectSelectStart(): void {
    this.grabbed = true;
    this.updateGlow();
  }

  override onObjectSelectEnd(): void {
    this.grabbed = false;
    this.updateGlow();
  }

  private updateGlow(): void {
    if (this.grabbed) {
      this.mat.emissive.setHex(this.activeEmissive);
      this.mat.emissiveIntensity = 1.75;
    } else if (this.hovered) {
      this.mat.emissive.setHex(this.activeEmissive);
      this.mat.emissiveIntensity = 1.1;
    } else {
      this.mat.emissive.setHex(this.idleEmissive);
      this.mat.emissiveIntensity = 0.45;
    }
  }

  override dispose(): void {
    this.mat.dispose();
  }
}

/**
 * Composite glowing rectangular portal doorway frame containing the stencil
 * aperture mask, animated energy rim shader, reverse-side void mirror, edge
 * move rails, corner resize grips, side rotation arcs, and the AlienWorld.
 */
export class PortalFrame extends xb.Script {
  readonly alienWorld: AlienWorld;
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];

  private energyRimMaterial!: THREE.ShaderMaterial;
  private veilMaterial!: THREE.ShaderMaterial;
  private backMirrorMaterial!: THREE.ShaderMaterial;

  private activeMode: PortalInteractionMode = 'idle';
  private elapsed = 0;

  constructor() {
    super();
    this.name = 'AetherPortalFrame';

    // Enable XR Blocks built-in move, Y-rotate, and 2-hand scale on the portal root.
    this.xb = {
      manipulation: {
        actions: {
          translate: {
            faceCamera: false,
            pushPull: true,
            minDistance: 0.45,
            maxDistance: 6.5,
          },
          rotate: {
            axis: 'y',
            space: 'world',
            sensitivity: 1.25,
          },
          scale: {
            minScale: 0.45,
            maxScale: 2.6,
          },
        },
        handle: {action: 'translate'},
      },
    };

    this.alienWorld = new AlienWorld();
    this.add(this.alienWorld);

    this.buildFrameArchitecture();
    this.buildEnergyTrimAndVeil();
    this.buildStencilAperture();
    this.buildReversePortalMirror();
    this.buildCornerResizeNodes();
    this.buildRotationArcs();
  }

  getInteractionMode(): PortalInteractionMode {
    return this.activeMode;
  }

  setPortalScale(nextScale: number): void {
    const clamped = Math.min(2.6, Math.max(0.45, nextScale));
    this.scale.setScalar(clamped);
    // Keep the alien dimension at true physical scale so resizing the doorway
    // expands the window aperture onto the world rather than shrinking islands.
    this.alienWorld.scale.setScalar(1 / clamped);
  }

  override onObjectManipulate(event: xb.ManipulationEvent): void {
    if (event.phase === 'start' || event.phase === 'update') {
      if (event.action === 'translate') this.activeMode = 'move';
      else if (event.action === 'rotate') this.activeMode = 'rotate';
      else if (event.action === 'scale') {
        this.activeMode = 'resize';
        const s = this.scale.x;
        this.alienWorld.scale.setScalar(1 / Math.max(0.45, s));
      }
    } else {
      this.activeMode = 'idle';
    }
  }

  private trackGeo<T extends THREE.BufferGeometry>(geo: T): T {
    this.geometries.push(geo);
    return geo;
  }

  private trackMat<T extends THREE.Material>(mat: T): T {
    this.materials.push(mat);
    return mat;
  }

  private createFrameRailMaterial(): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: 0x1e2236,
      emissive: 0x2a1c58,
      emissiveIntensity: 0.45,
      roughness: 0.24,
      metalness: 0.88,
    });
  }

  private buildFrameArchitecture(): void {
    const w = PORTAL_OPENING_WIDTH;
    const h = PORTAL_OPENING_HEIGHT;
    const t = PORTAL_FRAME_THICKNESS;
    const d = PORTAL_FRAME_DEPTH;

    const railSpecs = [
      // Left & Right vertical monolith piers
      {
        name: 'LeftPortalEdge',
        size: [t, h + t * 1.4, d] as const,
        pos: [-(w * 0.5 + t * 0.5), 0, 0] as const,
      },
      {
        name: 'RightPortalEdge',
        size: [t, h + t * 1.4, d] as const,
        pos: [w * 0.5 + t * 0.5, 0, 0] as const,
      },
      // Top lintel & Bottom sill
      {
        name: 'TopPortalEdge',
        size: [w + t * 2, t, d] as const,
        pos: [0, h * 0.5 + t * 0.5, 0] as const,
      },
      {
        name: 'BottomPortalEdge',
        size: [w + t * 2, t, d] as const,
        pos: [0, -(h * 0.5 + t * 0.5), 0] as const,
      },
    ];

    for (const spec of railSpecs) {
      const geo = this.trackGeo(new THREE.BoxGeometry(spec.size[0], spec.size[1], spec.size[2]));
      const mat = this.createFrameRailMaterial();
      const rail = new PortalGripHandle(geo, mat, 'translate', 0x2a1c58, 0x3ef0ff);
      rail.name = spec.name;
      rail.position.set(spec.pos[0], spec.pos[1], spec.pos[2]);
      rail.renderOrder = 0;
      this.add(rail);
    }

    // Secondary stepped metallic trim moldings & glowing rune emitters along piers
    const accentMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x394468,
        roughness: 0.38,
        metalness: 0.72,
      })
    );
    const runeMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x70f8ff,
        emissive: 0x3be0ff,
        emissiveIntensity: 1.5,
        roughness: 0.18,
        metalness: 0.3,
      })
    );

    const crownGeo = this.trackGeo(new THREE.BoxGeometry(w * 0.55, 0.045, d * 1.28));
    const crown = new THREE.Mesh(crownGeo, accentMat);
    crown.position.set(0, h * 0.5 + t + 0.015, 0);
    crown.xb = {manipulationHandle: {action: 'translate'}};
    this.add(crown);

    const sillStepGeo = this.trackGeo(new THREE.BoxGeometry(w * 0.72, 0.036, d * 1.32));
    const sillStep = new THREE.Mesh(sillStepGeo, accentMat);
    sillStep.position.set(0, -(h * 0.5 + t + 0.012), 0);
    sillStep.xb = {manipulationHandle: {action: 'translate'}};
    this.add(sillStep);

    // Glowing rune inlays on left & right monolith columns
    const runeGeo = this.trackGeo(new THREE.BoxGeometry(0.014, 0.11, d + 0.01));
    for (const side of [-1, 1]) {
      for (const yOff of [-0.46, 0, 0.46]) {
        const rune = new THREE.Mesh(runeGeo, runeMat);
        rune.position.set(side * (w * 0.5 + t * 0.5), yOff, 0);
        rune.xb = {pointerEvents: 'none'};
        this.add(rune);
      }
    }
  }

  private buildEnergyTrimAndVeil(): void {
    const w = PORTAL_OPENING_WIDTH;
    const h = PORTAL_OPENING_HEIGHT;

    // Inner continuous energy rim tubes hugging the doorway aperture
    const innerPad = 0.012;
    const rimVertGeo = this.trackGeo(
      new THREE.CylinderGeometry(0.011, 0.011, h + innerPad * 2, 10)
    );
    const rimHorizGeo = this.trackGeo(
      new THREE.CylinderGeometry(0.011, 0.011, w + innerPad * 2, 10)
    );

    this.energyRimMaterial = this.trackMat(
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: {value: 0},
        },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          varying vec2 vUv;
          void main() {
            float wave = 0.5 + 0.5 * sin(vUv.y * 18.0 - uTime * 3.8);
            vec3 cyan = vec3(0.26, 0.95, 1.0);
            vec3 violet = vec3(0.84, 0.36, 1.0);
            vec3 col = mix(violet, cyan, wave);
            float pulse = 0.85 + 0.35 * sin(uTime * 2.4 + vUv.y * 6.0);
            gl_FragColor = vec4(col * pulse * 1.25, 1.0);
          }
        `,
      })
    );

    const leftTube = new THREE.Mesh(rimVertGeo, this.energyRimMaterial);
    leftTube.position.set(-w * 0.5, 0, 0.025);
    leftTube.xb = {pointerEvents: 'none'};

    const rightTube = new THREE.Mesh(rimVertGeo, this.energyRimMaterial);
    rightTube.position.set(w * 0.5, 0, 0.025);
    rightTube.xb = {pointerEvents: 'none'};

    const topTube = new THREE.Mesh(rimHorizGeo, this.energyRimMaterial);
    topTube.rotation.z = Math.PI * 0.5;
    topTube.position.set(0, h * 0.5, 0.025);
    topTube.xb = {pointerEvents: 'none'};

    const bottomTube = new THREE.Mesh(rimHorizGeo, this.energyRimMaterial);
    bottomTube.rotation.z = Math.PI * 0.5;
    bottomTube.position.set(0, -h * 0.5, 0.025);
    bottomTube.xb = {pointerEvents: 'none'};

    this.add(leftTube, rightTube, topTube, bottomTube);

    // Subtle event-horizon edge shimmer inside the doorway opening (clear center)
    const veilGeo = this.trackGeo(new THREE.PlaneGeometry(w, h));
    this.veilMaterial = this.trackMat(
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: {value: 0},
        },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          varying vec2 vUv;
          void main() {
            vec2 edgeDist = min(vUv, 1.0 - vUv);
            float border = min(edgeDist.x * 1.0, edgeDist.y * 1.5);
            float rimMask = 1.0 - smoothstep(0.0, 0.11, border);
            float ripple = 0.5 + 0.5 * sin(vUv.x * 20.0 + vUv.y * 16.0 - uTime * 3.0);
            vec3 col = mix(vec3(0.55, 0.25, 1.0), vec3(0.28, 0.94, 1.0), ripple);
            gl_FragColor = vec4(col, rimMask * (0.28 + 0.18 * ripple));
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.FrontSide,
      })
    );
    const veil = new THREE.Mesh(veilGeo, this.veilMaterial);
    veil.position.set(0, 0, 0.004);
    veil.renderOrder = 3;
    veil.xb = {pointerEvents: 'none'};
    this.add(veil);
  }

  private buildStencilAperture(): void {
    const maskGeo = this.trackGeo(
      new THREE.PlaneGeometry(PORTAL_OPENING_WIDTH, PORTAL_OPENING_HEIGHT)
    );
    const maskMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        colorWrite: false,
        depthWrite: false,
        depthTest: true,
        stencilWrite: true,
        stencilRef: 1,
        stencilFunc: THREE.AlwaysStencilFunc,
        stencilFail: THREE.KeepStencilOp,
        stencilZFail: THREE.KeepStencilOp,
        stencilZPass: THREE.ReplaceStencilOp,
        side: THREE.FrontSide,
      })
    );

    const maskMesh = new THREE.Mesh(maskGeo, maskMat);
    maskMesh.name = 'PortalStencilAperture';
    maskMesh.position.set(0, 0, 0);
    maskMesh.renderOrder = 1;
    // Allow pointing rays to pass freely into/through the open doorway
    maskMesh.xb = {pointerEvents: 'none'};
    this.add(maskMesh);
  }

  private buildReversePortalMirror(): void {
    // When walking behind the portal frame (-Z facing), show a cosmic void mirror
    // rather than an empty cutout.
    const backGeo = this.trackGeo(
      new THREE.PlaneGeometry(PORTAL_OPENING_WIDTH, PORTAL_OPENING_HEIGHT)
    );
    this.backMirrorMaterial = this.trackMat(
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: {value: 0},
        },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          varying vec2 vUv;
          void main() {
            vec2 c = vUv - 0.5;
            float r = length(c);
            float angle = atan(c.y, c.x);
            float swirl = sin(r * 18.0 - uTime * 2.2 + angle * 3.0) * 0.5 + 0.5;
            vec3 base = mix(vec3(0.05, 0.02, 0.14), vec3(0.26, 0.12, 0.48), swirl * (1.0 - r));
            float edge = smoothstep(0.38, 0.52, max(abs(c.x), abs(c.y)));
            base += vec3(0.22, 0.82, 1.0) * edge * 0.4;
            gl_FragColor = vec4(base, 0.94);
          }
        `,
        side: THREE.FrontSide,
      })
    );
    const backMesh = new THREE.Mesh(backGeo, this.backMirrorMaterial);
    backMesh.position.set(0, 0, -0.01);
    backMesh.rotation.y = Math.PI;
    backMesh.renderOrder = 0;
    backMesh.xb = {manipulationHandle: {action: 'translate'}};
    this.add(backMesh);
  }

  private buildCornerResizeNodes(): void {
    const hw = PORTAL_OPENING_WIDTH * 0.5 + PORTAL_FRAME_THICKNESS * 0.58;
    const hh = PORTAL_OPENING_HEIGHT * 0.5 + PORTAL_FRAME_THICKNESS * 0.58;
    const cornerGeo = this.trackGeo(new THREE.OctahedronGeometry(0.062, 0));
    const collarGeo = this.trackGeo(new THREE.BoxGeometry(0.11, 0.11, PORTAL_FRAME_DEPTH * 1.18));
    const collarMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x2a3350,
        roughness: 0.3,
        metalness: 0.85,
      })
    );

    const corners = [
      {name: 'TopLeftResizeHandle', x: -hw, y: hh},
      {name: 'TopRightResizeHandle', x: hw, y: hh},
      {name: 'BottomLeftResizeHandle', x: -hw, y: -hh},
      {name: 'BottomRightResizeHandle', x: hw, y: -hh},
    ];

    for (const c of corners) {
      const collar = new THREE.Mesh(collarGeo, collarMat);
      collar.position.set(c.x, c.y, 0);
      collar.xb = {pointerEvents: 'none'};
      this.add(collar);

      const handle = new CornerResizeHandle(
        cornerGeo,
        () => this,
        (active) => {
          this.activeMode = active ? 'resize' : 'idle';
        }
      );
      handle.name = c.name;
      handle.position.set(c.x, c.y, 0.032);
      this.add(handle);
    }
  }

  private buildRotationArcs(): void {
    const pierOuterX = PORTAL_OPENING_WIDTH * 0.5 + PORTAL_FRAME_THICKNESS;
    const gripX = pierOuterX + 0.062;
    const arcGeo = this.trackGeo(new THREE.CapsuleGeometry(0.02, 0.34, 6, 12));
    const strutGeo = this.trackGeo(new THREE.BoxGeometry(0.07, 0.028, 0.04));
    const strutMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x394468,
        roughness: 0.32,
        metalness: 0.82,
      })
    );

    for (const side of [-1, 1]) {
      for (const yOff of [-0.14, 0.14]) {
        const strut = new THREE.Mesh(strutGeo, strutMat);
        strut.position.set(side * (pierOuterX + 0.03), yOff, 0);
        strut.xb = {manipulationHandle: {action: 'rotate'}};
        this.add(strut);
      }

      const mat = new THREE.MeshStandardMaterial({
        color: 0xd06bff,
        emissive: 0x9930e8,
        emissiveIntensity: 0.65,
        roughness: 0.22,
        metalness: 0.72,
      });
      const grip = new PortalGripHandle(arcGeo, mat, 'rotate', 0x9930e8, 0xf685ff);
      grip.name = side < 0 ? 'LeftRotateHandle' : 'RightRotateHandle';
      grip.position.set(side * gripX, 0, 0);
      this.add(grip);
    }
  }

  recenterInFrontOfCamera(camera: THREE.Camera, distance = 1.65): void {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    forward.y = 0;
    if (forward.lengthSq() < 1e-4) forward.set(0, 0, -1);
    forward.normalize();

    const targetPos = new THREE.Vector3()
      .copy(camera.position)
      .addScaledVector(forward, distance);
    targetPos.y = Math.max(1.05, camera.position.y - 0.08);

    this.position.copy(targetPos);
    this.lookAt(camera.position.x, this.position.y, camera.position.z);
    this.setPortalScale(1.0);
  }

  override update(): void {
    const dt = Math.min(0.05, Math.max(0.001, xb.getDeltaTime()));
    this.elapsed += dt;
    this.energyRimMaterial.uniforms.uTime.value = this.elapsed;
    this.veilMaterial.uniforms.uTime.value = this.elapsed;
    this.backMirrorMaterial.uniforms.uTime.value = this.elapsed;
    this.alienWorld.update(dt);
  }

  override dispose(): void {
    this.alienWorld.dispose();
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    this.geometries.length = 0;
    this.materials.length = 0;
  }
}
