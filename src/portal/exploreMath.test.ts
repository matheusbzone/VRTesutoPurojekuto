import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAngularDeltas,
  clampExplorePosition,
  clampRoomPosition,
  computeExploreMovement,
  computeJoystickInput,
  computeLookJoystickRotation,
  computePitchYawFromDrag,
  resolveRoomCollision,
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

test('computeLookJoystickRotation produces correct yaw and pitch angular deltas', () => {
  const right = computeLookJoystickRotation({x: 1.0, y: 0}, 2.0, 1.5, 0.5);
  assert.ok(Math.abs(right.yawDelta - -1.0) < 1e-6);
  assert.strictEqual(Math.abs(right.pitchDelta), 0);

  const up = computeLookJoystickRotation({x: 0, y: 1.0}, 2.0, 1.5, 0.5);
  assert.strictEqual(Math.abs(up.yawDelta), 0);
  assert.ok(Math.abs(up.pitchDelta - 0.75) < 1e-6);
});

test('applyAngularDeltas adds deltas and clamps pitch to maxPitch', () => {
  const normal = applyAngularDeltas(0.5, 0.2, 0.1, -0.05);
  assert.ok(Math.abs(normal.yaw - 0.6) < 1e-6);
  assert.ok(Math.abs(normal.pitch - 0.15) < 1e-6);

  const clamped = applyAngularDeltas(0, 1.4, 0, 0.5, 1.41);
  assert.equal(clamped.pitch, 1.41);
});

test('resolveRoomCollision blocks walking through window wall and clamps within room', () => {
  // Trying to walk far to the left (out the window into the forest)
  const pos = {x: -1.5, y: 1.5, z: 0};
  const blocked = resolveRoomCollision(pos, {dx: -2.0, dz: 0}, 0.25);
  // minX is -2.05, with playerRadius 0.25, max left is -1.80
  assert.ok(blocked.x >= -1.80);
  assert.equal(blocked.y, 1.50);
});

test('resolveRoomCollision blocks backing up into the sofa', () => {
  // Player at (0, 1.5, 0) tries to walk back into the sofa at z in [0.35, 1.65]
  const pos = {x: 0, y: 1.5, z: 0};
  const blocked = resolveRoomCollision(pos, {dx: 0, dz: 0.8}, 0.25);
  // Should be stopped in front of the sofa (minZ 0.35 - 0.25 = 0.10)
  assert.ok(blocked.z <= 0.11);
  assert.equal(blocked.y, 1.50);
});

test('resolveRoomCollision prevents penetrating the round coffee table', () => {
  // Table at (0.06, -1.29) with radius 0.62.
  // Player at (0.06, 1.5, -0.2) walks forward toward table center.
  const pos = {x: 0.06, y: 1.5, z: -0.2};
  const blocked = resolveRoomCollision(pos, {dx: 0, dz: -1.0}, 0.25);
  const distToTable = Math.hypot(blocked.x - 0.06, blocked.z - -1.29);
  // Minimum distance should be table radius + player radius = 0.62 + 0.25 = 0.87
  assert.ok(distToTable >= 0.86);
  assert.equal(blocked.y, 1.50);
});

test('resolveRoomCollision allows walking through archway into expanded Arcane Study', () => {
  // Player walking along the side of the sofa towards the archway at (0, 2.5) -> (0, 4.5)
  const pos = {x: 0, y: 1.5, z: 2.2};
  const moved = resolveRoomCollision(pos, {dx: 0, dz: 2.0}, 0.25);
  // Player successfully crossed through archway into the Arcane Study (z > 3.0)
  assert.ok(moved.z >= 3.8);
  assert.equal(moved.y, 1.50);

  // In the Arcane Study, moving left is allowed up to the new expanded wall (minX -3.60)
  const inStudy = resolveRoomCollision({x: 0, y: 1.5, z: 4.5}, {dx: -3.0, dz: 0}, 0.25);
  assert.ok(inStudy.x <= -2.5); // Much wider than original room (-1.80)!
  assert.ok(inStudy.x >= -3.35); // Clamped by study wall (-3.60 + 0.25)
});
