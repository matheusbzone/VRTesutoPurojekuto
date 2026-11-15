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
  maxX: 2.45,
  minZ: -3.65,
  maxZ: 2.55,
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
    // Pedestal do Cristal de Éter no canto da sala
    {x: -1.55, z: 2.05, radius: 0.45},
  ],
};

export interface CompoundRoomLayout {
  floorY: number;
  sectors: BoxObstacle[];
  obstacles: RoomObstacleSet;
}

export const EXPANDED_HOUSE_LAYOUT: CompoundRoomLayout = {
  floorY: 1.50,
  sectors: [
    // Setor 1: Sala Principal (Living Room)
    {minX: -2.05, maxX: 2.45, minZ: -3.65, maxZ: 2.65},
    // Setor 2: Arco / Passagem conectando as duas salas
    {minX: -0.85, maxX: 0.85, minZ: 2.55, maxZ: 3.10},
    // Setor 3: Gabinete Arcano & Jardim de Inverno (Arcane Conservatory)
    {minX: -3.60, maxX: 3.60, minZ: 3.00, maxZ: 8.00},
  ],
  obstacles: {
    boxes: [
      // Sofá cinza grande atrás do jogador (bloqueia atravessar para trás)
      {minX: -1.15, maxX: 1.15, minZ: 0.35, maxZ: 1.65},
      // Mesa de estudos no novo cômodo (Study Desk)
      {minX: -2.80, maxX: -1.30, minZ: 4.80, maxZ: 6.00},
      // Estante de livros esquerda (Bookshelf Left)
      {minX: -3.60, maxX: -2.90, minZ: 3.30, maxZ: 4.80},
      // Vitrine / Expositor à direita (Display Right)
      {minX: 2.90, maxX: 3.60, minZ: 3.40, maxZ: 6.00},
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
      // Pedestal do Cristal de Éter na sala
      {x: -1.55, z: 2.05, radius: 0.42},
      // Pedestal Central de Relíquias no Conservatório
      {x: 0.0, z: 5.50, radius: 0.65},
    ],
  },
};

/**
 * Checks if a 2D position with player radius is inside any walkable sector of the house.
 */
export function isInsideAnySector(
  x: number,
  z: number,
  sectors: BoxObstacle[] = EXPANDED_HOUSE_LAYOUT.sectors,
  radius = 0.25
): boolean {
  for (const s of sectors) {
    if (
      x >= s.minX + radius - 1e-4 &&
      x <= s.maxX - radius + 1e-4 &&
      z >= s.minZ + radius - 1e-4 &&
      z <= s.maxZ - radius + 1e-4
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Resolves 2D cylinder player collision against room walls and furniture obstacles,
 * supporting compound multi-room sectors with smooth sliding along walls and doorways
 * while strictly preventing the player from ever passing through outer walls.
 */
export function resolveRoomCollision(
  currentPos: {x: number; y: number; z: number},
  desiredDelta: {dx: number; dz: number},
  playerRadius = 0.25,
  layout: CompoundRoomLayout = EXPANDED_HOUSE_LAYOUT
): {x: number; y: number; z: number} {
  const targetX = currentPos.x + desiredDelta.dx;
  const targetZ = currentPos.z + desiredDelta.dz;

  let nextX = currentPos.x;
  let nextZ = currentPos.z;

  const doorMinX = -0.85 + playerRadius;
  const doorMaxX = 0.85 - playerRadius;
  const livingMaxZ = 2.65 - playerRadius;
  const studyMinZ = 3.00 + playerRadius;

  // Step 1: Enforce doorway portal gate between Living Room (z <= 2.65) and Study (z >= 3.00)
  let clampedTargetZ = targetZ;
  if (currentPos.z <= 2.65 + 1e-4) {
    // Player is in Living Room: cannot cross z > 2.65 unless x is aligned with doorway
    const inDoorwayX = targetX >= doorMinX - 1e-4 && targetX <= doorMaxX + 1e-4;
    if (!inDoorwayX && targetZ > livingMaxZ) {
      clampedTargetZ = livingMaxZ;
    }
  } else if (currentPos.z >= 3.00 - 1e-4) {
    // Player is in Conservatory/Study: cannot cross z < 3.00 unless x is aligned with doorway
    const inDoorwayX = targetX >= doorMinX - 1e-4 && targetX <= doorMaxX + 1e-4;
    if (!inDoorwayX && targetZ < studyMinZ) {
      clampedTargetZ = studyMinZ;
    }
  }

  // Step 2: Axis-independent sliding validation
  const canMoveX = isInsideAnySector(targetX, currentPos.z, layout.sectors, playerRadius);
  const canMoveZ = isInsideAnySector(currentPos.x, clampedTargetZ, layout.sectors, playerRadius);

  if (canMoveX) {
    nextX = targetX;
  }
  if (canMoveZ) {
    nextZ = clampedTargetZ;
  }

  // If diagonal movement is completely valid, take both
  if (isInsideAnySector(targetX, clampedTargetZ, layout.sectors, playerRadius)) {
    nextX = targetX;
    nextZ = clampedTargetZ;
  }

  // Inside the connecting archway corridor (z between 2.60 and 3.05), enforce side jamb walls
  if (nextZ > 2.60 && nextZ < 3.05) {
    nextX = Math.max(doorMinX, Math.min(doorMaxX, nextX));
  }

  // Step 3: Resolve against circular obstacles (tables, pedestals, portal posts)
  for (const c of layout.obstacles.circles) {
    const minDist = c.radius + playerRadius;
    const dx = nextX - c.x;
    const dz = nextZ - c.z;
    const distSq = dx * dx + dz * dz;
    if (distSq < minDist * minDist && distSq > 1e-6) {
      const dist = Math.sqrt(distSq);
      const nx = dx / dist;
      const nz = dz / dist;
      const pushX = c.x + nx * minDist;
      const pushZ = c.z + nz * minDist;
      if (isInsideAnySector(pushX, pushZ, layout.sectors, playerRadius * 0.4)) {
        nextX = pushX;
        nextZ = pushZ;
      }
    }
  }

  // Step 4: Resolve against box obstacles (sofa, study desk, bookshelves)
  for (const b of layout.obstacles.boxes) {
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
      let candX = nextX;
      let candZ = nextZ;
      if (minDist === distLeft) candX = expandedMinX;
      else if (minDist === distRight) candX = expandedMaxX;
      else if (minDist === distFront) candZ = expandedMinZ;
      else candZ = expandedMaxZ;

      if (isInsideAnySector(candX, candZ, layout.sectors, playerRadius * 0.4)) {
        nextX = candX;
        nextZ = candZ;
      }
    }
  }

  return {
    x: nextX,
    y: layout.floorY,
    z: nextZ,
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
