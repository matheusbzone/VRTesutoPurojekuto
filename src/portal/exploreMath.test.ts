import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampExplorePosition,
  clampRoomPosition,
  computeExploreMovement,
  computeJoystickInput,
  computePitchYawFromDrag,
} from './exploreMath';

test('computeJoystickInput respects deadzone, clamps to unit circle, and maps up to +y', () => {
  const dead = computeJoystickInput(2, 2, 50, 0.15);
  assert.equal(dead.magnitude, 0);
  assert.equal(dead.x, 0);
  assert.equal(dead.y, 0);

  const up = computeJoystickInput(0, -100, 50, 0.1);
  assert.ok(Math.abs(up.y - 1) < 1e-6);
  assert.ok(Math.abs(up.x) < 1e-6);
  assert.ok(Math.abs(up.magnitude - 1) < 1e-6);

  const right = computeJoystickInput(50, 0, 50, 0.1);
  assert.ok(Math.abs(right.x - 1) < 1e-6);
  assert.ok(Math.abs(right.y) < 1e-6);
});

test('computeExploreMovement moves forward along -Z at yaw=0 and climbs/descends vertically', () => {
  const forward = computeExploreMovement(
    0,
    {moveX: 0, moveZ: 1, vertical: 0},
    3.0,
    2.0,
    0.5
  );
  assert.ok(Math.abs(forward.dx) < 1e-6);
  assert.ok(Math.abs(forward.dz - -1.5) < 1e-6);
  assert.equal(forward.dy, 0);

  const climb = computeExploreMovement(
    0,
    {moveX: 0, moveZ: 0, vertical: 1},
    3.0,
    2.0,
    0.5
  );
  assert.equal(climb.dy, 1.0);

  const descend = computeExploreMovement(
    0,
    {moveX: 0, moveZ: 0, vertical: -1},
    3.0,
    2.0,
    0.5
  );
  assert.equal(descend.dy, -1.0);
});

test('clampExplorePosition keeps player inside radius and vertical limits', () => {
  const clamped = clampExplorePosition(
    {x: 30, y: 20, z: -4},
    {centerX: 0, centerZ: -4, maxRadius: 18, minY: -3, maxY: 9}
  );
  assert.ok(Math.abs(clamped.x - 18) < 1e-6);
  assert.equal(clamped.y, 9);
  assert.equal(clamped.z, -4);
});

test('computePitchYawFromDrag clamps pitch safely within bounds', () => {
  const res = computePitchYawFromDrag(0, 0, 100, -5000, 0.005, 1.4);
  assert.ok(Math.abs(res.yaw - -0.5) < 1e-6);
  assert.equal(res.pitch, 1.4);
});

test('clampRoomPosition keeps player inside room radius and vertical limits', () => {
  const inside = clampRoomPosition({x: 2, y: 1.5, z: 2}, 8.0);
  assert.equal(inside.x, 2);
  assert.equal(inside.y, 1.5);
  assert.equal(inside.z, 2);

  const outside = clampRoomPosition({x: 10, y: 3.0, z: 0}, 8.0);
  assert.ok(Math.abs(outside.x - 8.0) < 1e-6);
  assert.equal(outside.y, 2.4);
  assert.equal(outside.z, 0);
});
