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
