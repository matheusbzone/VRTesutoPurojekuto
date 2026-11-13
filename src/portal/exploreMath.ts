export interface JoystickInput {
  /** Strafe axis in [-1, 1], right is +1. */
  x: number;
  /** Forward/back axis in [-1, 1], up/forward is +1. */
  y: number;
  /** Normalized deflection magnitude in [0, 1]. */
  magnitude: number;
}

export interface ExploreMoveInput {
  /** Right/left strafe in [-1, 1]. */
  moveX: number;
  /** Forward/backward in [-1, 1] (+1 = forward). */
  moveZ: number;
  /** Vertical climb/descend in [-1, 1] (+1 = up/subir, -1 = down/descer). */
  vertical: number;
}

export interface ExploreWorldDelta {
  dx: number;
  dy: number;
  dz: number;
}

export interface ExploreBounds {
  centerX: number;
  centerZ: number;
  maxRadius: number;
  minY: number;
  maxY: number;
}

/**
 * Converts a pixel displacement from the joystick center into normalized
 * circular [-1, 1] axes with deadzone remapping.
 * Screen +dy is downward, so pushing the stick up (dy < 0) yields +y (forward).
 */
export function computeJoystickInput(
  dx: number,
  dy: number,
  maxRadius: number,
  deadzone = 0.1
): JoystickInput {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || maxRadius <= 1e-4) {
    return {x: 0, y: 0, magnitude: 0};
  }

  const dist = Math.hypot(dx, dy);
  const rawMag = Math.min(1, dist / maxRadius);
  if (rawMag <= deadzone) {
    return {x: 0, y: 0, magnitude: 0};
  }

  const remappedMag = (rawMag - deadzone) / Math.max(1e-4, 1 - deadzone);
  const nx = dx / dist;
  const ny = -dy / dist; // Invert screen Y so dragging up moves forward (+1)

  return {
    x: nx * remappedMag,
    y: ny * remappedMag,
    magnitude: remappedMag,
  };
}

/**
 * Computes world-space displacement from yaw-relative joystick axes and
 * vertical Subir/Descer controls.
 */
export function computeExploreMovement(
  yawRadians: number,
  input: ExploreMoveInput,
  horizontalSpeed: number,
  verticalSpeed: number,
  dt: number
): ExploreWorldDelta {
  if (dt <= 0 || !Number.isFinite(dt)) {
    return {dx: 0, dy: 0, dz: 0};
  }

  // Forward direction in Three.js for YXZ yaw=0 is (0, 0, -1).
  // Rotating (0, 0, -1) by yaw around +Y gives (-sin(yaw), 0, -cos(yaw)).
  // Right direction is (cos(yaw), 0, -sin(yaw)).
  const sinY = Math.sin(yawRadians);
  const cosY = Math.cos(yawRadians);

  const forwardStep = input.moveZ * horizontalSpeed * dt;
  const strafeStep = input.moveX * horizontalSpeed * dt;

  const dx = -sinY * forwardStep + cosY * strafeStep;
  const dz = -cosY * forwardStep - sinY * strafeStep;
  const dy = input.vertical * verticalSpeed * dt;

  return {dx, dy, dz};
}

/**
 * Clamps a world position within the explorable floating-island archipelago.
 */
export function clampExplorePosition(
  pos: {x: number; y: number; z: number},
  bounds: ExploreBounds
): {x: number; y: number; z: number} {
  const ox = pos.x - bounds.centerX;
  const oz = pos.z - bounds.centerZ;
  const horizDist = Math.hypot(ox, oz);

  let x = pos.x;
  let z = pos.z;
  if (horizDist > bounds.maxRadius && horizDist > 1e-4) {
    const scale = bounds.maxRadius / horizDist;
    x = bounds.centerX + ox * scale;
    z = bounds.centerZ + oz * scale;
  }

  const y = Math.min(bounds.maxY, Math.max(bounds.minY, pos.y));
  return {x, y, z};
}

export interface RoomBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  floorY: number;
}

export interface CircleObstacle {
  x: number;
  z: number;
  radius: number;
}

export interface BoxObstacle {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface RoomObstacleSet {
  boxes: BoxObstacle[];
  circles: CircleObstacle[];
}

export const DEFAULT_ROOM_BOUNDS: RoomBounds = {
  minX: -2.05,
  maxX: 2.50,
  minZ: -3.70,
  maxZ: 2.80,
  floorY: 1.50,
};

export const DEFAULT_ROOM_OBSTACLES: RoomObstacleSet = {
  boxes: [
    // Sofá cinza grande atrás do jogador (bloqueia atravessar para trás)
    {minX: -1.15, maxX: 1.15, minZ: 0.35, maxZ: 1.65},
  ],
  circles: [
    // Mesa de centro redonda em frente ao sofá
    {x: 0.06, z: -1.29, radius: 0.62},
    // Poltrona verde perto da janela
    {x: -1.35, z: -0.75, radius: 0.52},
    // Pufe verde próximo à mesa
    {x: 0.65, z: -0.55, radius: 0.42},
    // Pilar esquerdo da moldura do portal
    {x: -0.58, z: -1.65, radius: 0.14},
    // Pilar direito da moldura do portal
    {x: 0.58, z: -1.65, radius: 0.14},
  ],
};

/**
 * Resolves 2D cylinder player collision against room walls and furniture obstacles,
 * allowing smooth sliding along surfaces while locking height safely to the floor.
 */
export function resolveRoomCollision(
  currentPos: {x: number; y: number; z: number},
  desiredDelta: {dx: number; dz: number},
  playerRadius = 0.25,
  bounds: RoomBounds = DEFAULT_ROOM_BOUNDS,
  obstacles: RoomObstacleSet = DEFAULT_ROOM_OBSTACLES
): {x: number; y: number; z: number} {
  let nextX = currentPos.x + desiredDelta.dx;
  let nextZ = currentPos.z + desiredDelta.dz;

  // 1. Resolve against circular obstacles (table, ottomans, armchair, portal posts)
  for (const c of obstacles.circles) {
    const minDist = c.radius + playerRadius;
    const dx = nextX - c.x;
    const dz = nextZ - c.z;
    const distSq = dx * dx + dz * dz;
    if (distSq < minDist * minDist && distSq > 1e-6) {
      const dist = Math.sqrt(distSq);
      const nx = dx / dist;
      const nz = dz / dist;
      nextX = c.x + nx * minDist;
      nextZ = c.z + nz * minDist;
    }
  }

  // 2. Resolve against box obstacles (e.g. sofa)
  for (const b of obstacles.boxes) {
    const expandedMinX = b.minX - playerRadius;
    const expandedMaxX = b.maxX + playerRadius;
    const expandedMinZ = b.minZ - playerRadius;
    const expandedMaxZ = b.maxZ + playerRadius;

    if (
      nextX > expandedMinX &&
      nextX < expandedMaxX &&
      nextZ > expandedMinZ &&
      nextZ < expandedMaxZ
    ) {
      const distLeft = nextX - expandedMinX;
      const distRight = expandedMaxX - nextX;
      const distFront = nextZ - expandedMinZ;
      const distBack = expandedMaxZ - nextZ;

      const minDist = Math.min(distLeft, distRight, distFront, distBack);
      if (minDist === distLeft) nextX = expandedMinX;
      else if (minDist === distRight) nextX = expandedMaxX;
      else if (minDist === distFront) nextZ = expandedMinZ;
      else nextZ = expandedMaxZ;
    }
  }

  // 3. Clamp against outer room walls (window wall, wood walls, front & back)
  const clampedX = Math.min(
    bounds.maxX - playerRadius,
    Math.max(bounds.minX + playerRadius, nextX)
  );
  const clampedZ = Math.min(
    bounds.maxZ - playerRadius,
    Math.max(bounds.minZ + playerRadius, nextZ)
  );

  return {
    x: clampedX,
    y: bounds.floorY,
    z: clampedZ,
  };
}

/**
 * Clamps player position within the simulator room bounds.
 */
export function clampRoomPosition(
  pos: {x: number; y: number; z: number},
  maxRadius = 8.0,
  minY = 0.5,
  maxY = 2.4
): {x: number; y: number; z: number} {
  const horizDist = Math.hypot(pos.x, pos.z);
  let x = pos.x;
  let z = pos.z;
  if (horizDist > maxRadius && horizDist > 1e-4) {
    const scale = maxRadius / horizDist;
    x = pos.x * scale;
    z = pos.z * scale;
  }
  const y = Math.min(maxY, Math.max(minY, pos.y));
  return {x, y, z};
}

/**
 * Updates yaw and pitch from pointer drag deltas with vertical pitch clamping.
 */
export function computePitchYawFromDrag(
  currentYaw: number,
  currentPitch: number,
  deltaX: number,
  deltaY: number,
  sensitivity = 0.0045,
  maxPitch = Math.PI * 0.45
): {yaw: number; pitch: number} {
  const yaw = currentYaw - deltaX * sensitivity;
  const pitch = Math.min(
    maxPitch,
    Math.max(-maxPitch, currentPitch - deltaY * sensitivity)
  );
  return {yaw, pitch};
}

export interface LookJoystickDelta {
  yawDelta: number;
  pitchDelta: number;
}

/**
 * Computes angular changes (radians) from continuous look joystick deflection.
 */
export function computeLookJoystickRotation(
  lookInput: {x: number; y: number},
  yawSpeed = 2.2,
  pitchSpeed = 1.7,
  dt = 0.016
): LookJoystickDelta {
  if (dt <= 0 || !Number.isFinite(dt)) {
    return {yawDelta: 0, pitchDelta: 0};
  }
  return {
    yawDelta: -lookInput.x * yawSpeed * dt,
    pitchDelta: lookInput.y * pitchSpeed * dt,
  };
}

/**
 * Applies yaw and pitch deltas with vertical pitch clamping.
 */
export function applyAngularDeltas(
  currentYaw: number,
  currentPitch: number,
  yawDelta: number,
  pitchDelta: number,
  maxPitch = Math.PI * 0.45
): {yaw: number; pitch: number} {
  const yaw = currentYaw + yawDelta;
  const pitch = Math.min(maxPitch, Math.max(-maxPitch, currentPitch + pitchDelta));
  return {yaw, pitch};
}
