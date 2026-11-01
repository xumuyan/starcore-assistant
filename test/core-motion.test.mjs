import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { CoreMotion } from '../client/scene/motion.mjs';

test('camera approaches and leaves close-up continuously without an idle breathing scale', () => {
  const motion = new CoreMotion(); for (let i = 0; i < 90; i++) motion.tick(1 / 30);
  assert.equal(motion.distance, 6.1);
  motion.setZoom(1); const first = motion.tick(1 / 30).distance;
  assert.ok(first < 6.1 && first > 5.05);
  let previous = first;
  for (let i = 0; i < 90; i++) { const next = motion.tick(1 / 30).distance; assert.ok(next <= previous); previous = next; }
  assert.ok(Math.abs(previous - 5.05) < .001);
  motion.setZoom(0); assert.ok(motion.tick(1 / 30).distance > previous);
});
test('perspective dolly changes foreground and background by different amounts', () => {
  const camera = new PerspectiveCamera(42, 16 / 9, .1, 30);
  const project = (z, depth) => { camera.position.z = z; camera.updateMatrixWorld(); return new Vector3(.5, .78, depth).project(camera).x; };
  const foreground = project(5.05, .8) / project(6.1, .8);
  const background = project(5.05, -.8) / project(6.1, -.8);
  assert.ok(foreground > background + .04);
});
test('real input and output envelopes are smooth, bounded, and separate', () => {
  const motion = new CoreMotion(); motion.phase = 'listening'; motion.input = 1;
  const first = motion.tick(1 / 30).energy; assert.ok(first > 0 && first < 1);
  for (let i = 0; i < 100; i++) motion.tick(1 / 30);
  assert.ok(motion.energy < .001);
  motion.phase = 'speaking'; motion.input = 1;
  assert.ok(motion.tick(1 / 30).energy < .001);
  motion.output = .8; assert.ok(motion.tick(1 / 30).energy > .1);
  motion.reduced = true; const pose = motion.tick(1 / 30); assert.equal(pose.energy, 0); assert.equal(pose.speed, 0);
});
