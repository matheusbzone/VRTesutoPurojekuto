export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface ProximityAudioState {
  /** Normalized proximity in [0, 1], where 1 is right at/inside the portal threshold. */
  proximity: number;
  /** Master gain multiplier in [baseGain, maxGain]. */
  gain: number;
  /** Low-pass filter cutoff frequency in Hz. */
  filterHz: number;
  /** Distance from camera to the portal rectangle surface in meters. */
  distance: number;
}

export interface ProximityAudioConfig {
  minDistance?: number;
  maxDistance?: number;
  baseGain?: number;
  maxGain?: number;
  minFilterHz?: number;
  maxFilterHz?: number;
}

/**
 * Computes the shortest distance from a point to an axis-aligned rectangle
 * centered at the origin in the XY plane (z = 0), transformed into portal local space.
 */
export function distanceToPortalPlaneRect(
  localPoint: Vec3Like,
  halfWidth: number,
  halfHeight: number
): number {
  const dx = Math.max(0, Math.abs(localPoint.x) - Math.max(0, halfWidth));
  const dy = Math.max(0, Math.abs(localPoint.y) - Math.max(0, halfHeight));
  const dz = localPoint.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Computes ambient space audio gain and filter cutoff based on how close the
 * user's head is to the portal doorway opening.
 */
export function computeProximityAudioState(
  localCameraPos: Vec3Like,
  halfWidth: number,
  halfHeight: number,
  config: ProximityAudioConfig = {}
): ProximityAudioState {
  const minDistance = config.minDistance ?? 0.25;
  const maxDistance = config.maxDistance ?? 3.2;
  const baseGain = config.baseGain ?? 0.14;
  const maxGain = config.maxGain ?? 0.88;
  const minFilterHz = config.minFilterHz ?? 420;
  const maxFilterHz = config.maxFilterHz ?? 4200;

  const distance = distanceToPortalPlaneRect(localCameraPos, halfWidth, halfHeight);
  const span = Math.max(0.001, maxDistance - minDistance);
  const t = Math.min(1, Math.max(0, 1 - (distance - minDistance) / span));
  // Smooth cubic Hermite curve (smoothstep) with gentle quadratic boost near doorway
  const smooth = t * t * (3 - 2 * t);
  const proximity = Math.min(1, Math.max(0, smooth * 0.65 + t * t * 0.35));

  return {
    proximity,
    gain: baseGain + (maxGain - baseGain) * proximity,
    filterHz: minFilterHz + (maxFilterHz - minFilterHz) * proximity,
    distance,
  };
}

/**
 * Computes a clamped uniform scale factor when dragging a corner resize handle
 * relative to the portal center in the portal's local XY plane.
 */
export function computeCornerResizeScale(
  initialHandleDist: number,
  currentHandleDist: number,
  initialScale: number,
  minScale = 0.45,
  maxScale = 2.6
): number {
  if (!Number.isFinite(initialHandleDist) || initialHandleDist <= 1e-4) {
    return clamp(initialScale, minScale, maxScale);
  }
  if (!Number.isFinite(currentHandleDist) || currentHandleDist <= 1e-4) {
    return minScale;
  }
  const ratio = currentHandleDist / initialHandleDist;
  return clamp(initialScale * ratio, minScale, maxScale);
}

/**
 * Computes shortest signed angular delta between two angles in radians.
 */
export function wrapAngleDelta(deltaRadians: number): number {
  let d = (deltaRadians + Math.PI) % (Math.PI * 2);
  if (d < 0) d += Math.PI * 2;
  return d - Math.PI;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
