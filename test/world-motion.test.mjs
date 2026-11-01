import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { createWorld } from '../client/scene/world.mjs';

test('all background layers move on one clock and freeze without scaling when that clock stops', () => {
  const world = createWorld();
  const scale = world.pedestal.scale.clone();
  world.update(0, 0, 1); const before = world.diagnostics();
  world.update(6, .8, 1); const moving = world.diagnostics();
  for (const key of Object.keys(before)) assert.notEqual(moving[key], before[key], key);
  const planet = world.planets[0].mesh.position.clone();
  for (let i = 0; i < 20; i++) world.update(6, 0, 1);
  assert.deepEqual(world.diagnostics(), moving);
  assert.ok(world.planets[0].mesh.position.equals(planet));
  assert.ok(world.pedestal.scale.equals(scale));
});

test('side planets stay framed after viewport changes without creating more scene objects', () => {
  const world = createWorld(), objects = world.group.children.length;
  const geometry = world.stars.geometry;
  for (const aspect of [16 / 9, 4 / 3, 980 / 720]) {
    world.resize(aspect); world.update(8, 0, 1.25);
    const camera = new PerspectiveCamera(42, aspect, .1, 30); camera.position.z = 6.1; camera.updateMatrixWorld();
    for (const { mesh } of world.planets) {
      const p = new Vector3().copy(mesh.position).project(camera);
      assert.ok(Math.abs(p.x) < .95 && Math.abs(p.y) < .9);
    }
    assert.equal(world.group.children.length, objects);
    assert.equal(world.stars.geometry, geometry);
    assert.equal(geometry.getAttribute('position').count, 1100);
  }
});
