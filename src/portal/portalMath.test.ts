import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeCornerResizeScale,
  computeProximityAudioState,
  distanceToPortalPlaneRect,
  wrapAngleDelta,
} from './portalMath';

test('distanceToPortalPlaneRect returns 0 at center of doorway and perpendicular z in front', () => {
  assert.equal(distanceToPortalPlaneRect({x: 0, y: 0, z: 0}, 0.5, 0.8), 0);
  assert.equal(distanceToPortalPlaneRect({x: 0.25, y: -0.4, z: 1.5}, 0.5, 0.8), 1.5);
  const edgeDist = distanceToPortalPlaneRect({x: 1.5, y: 0, z: 0}, 0.5, 0.8);
  assert.ok(Math.abs(edgeDist - 1.0) < 1e-6);
});

test('computeProximityAudioState swells louder and brighter as user leans closer', () => {
  const far = computeProximityAudioState({x: 0, y: 0, z: 3.5}, 0.55, 0.85);
  const mid = computeProximityAudioState({x: 0, y: 0, z: 1.5}, 0.55, 0.85);
  const close = computeProximityAudioState({x: 0, y: 0, z: 0.2}, 0.55, 0.85);

  assert.ok(far.proximity === 0);
  assert.ok(close.proximity === 1);
  assert.ok(mid.gain > far.gain);
  assert.ok(close.gain > mid.gain);
  assert.ok(close.filterHz > mid.filterHz);
  assert.ok(mid.filterHz > far.filterHz);
});

test('computeCornerResizeScale scales proportionally and clamps to bounds', () => {
  assert.equal(computeCornerResizeScale(1.0, 1.5, 1.0, 0.45, 2.6), 1.5);
  assert.equal(computeCornerResizeScale(1.0, 0.1, 1.0, 0.45, 2.6), 0.45);
  assert.equal(computeCornerResizeScale(1.0, 5.0, 1.0, 0.45, 2.6), 2.6);
  assert.equal(computeCornerResizeScale(0, 1.0, 1.2, 0.45, 2.6), 1.2);
});

test('wrapAngleDelta normalizes angles into [-PI, PI)', () => {
  const wrapped = wrapAngleDelta(Math.PI * 1.5);
  assert.ok(Math.abs(wrapped - (-Math.PI / 2)) < 1e-6);
});
