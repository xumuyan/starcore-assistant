import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { createMechanicalCore } from '../client/scene/prototype/mechanical-core.mjs';
import { createWorld } from '../client/scene/world.mjs';

test('fixed camera sees independent moving 3D rings with real thickness and constant whole-model scale', () => {
  const core=createMechanicalCore(),camera=new PerspectiveCamera(42,16/9,.1,40);
  camera.position.set(0,0,6.1);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const cameraBefore=[...camera.matrixWorld.elements,...camera.projectionMatrix.elements,camera.zoom];
  const projectedMarker=()=>new Vector3(1.12,0,.03).applyMatrix4(core.tracks[0].spin.matrixWorld).project(camera);
  core.update(0);core.group.updateMatrixWorld(true);const a=projectedMarker();
  core.update(2);core.group.updateMatrixWorld(true);const b=projectedMarker();
  assert.ok(a.distanceTo(b)>.1);
  const angles=core.diagnostics().ringAngles;
  assert.ok(angles[0]>0&&angles[1]<0&&angles[2]<0&&angles[3]>0);
  assert.equal(new Set(angles).size,core.tracks.length);
  assert.ok(angles.length>=5);
  assert.deepEqual([...camera.matrixWorld.elements,...camera.projectionMatrix.elements,camera.zoom],cameraBefore);
  assert.deepEqual(core.group.scale.toArray(),[1,1,1]);
  const positions=core.tracks[0].spin.children[0].geometry.getAttribute('position');
  let lo=Infinity,hi=-Infinity;for(let i=0;i<positions.count;i++){lo=Math.min(lo,positions.getZ(i));hi=Math.max(hi,positions.getZ(i));}
  assert.ok(hi-lo>.02,'the band has actual axial depth instead of a flat picture');
});

test('paused time freezes all scene layers; wireframe and layer visibility retain the same models', () => {
  const core=createMechanicalCore(),world=createWorld();core.update(5);world.update(5,0,1);
  const before={core:core.diagnostics(),world:world.diagnostics()},objects=core.group.children.length;
  for(let i=0;i<10;i++){core.update(5);world.update(5,0,1);}
  assert.deepEqual({core:core.diagnostics(),world:world.diagnostics()},before);
  core.setWireframe(true);let meshes=0;core.group.traverse(object=>{if(object.isMesh){meshes++;assert.equal(object.material.wireframe,true);}});
  assert.ok(meshes>60);core.update(5.5);assert.equal(core.diagnostics().filamentTime,5.5);assert.equal(core.diagnostics().materialWireframe,true);core.setWireframe(false);assert.equal(core.diagnostics().materialWireframe,false);
  core.rings.visible=false;assert.equal(core.plasma.visible,true);assert.equal(core.group.children.length,objects);core.rings.visible=true;
  core.update(6);world.update(6,0,1);
  assert.notDeepEqual(core.diagnostics().ringAngles,before.core.ringAngles);
  assert.notEqual(core.diagnostics().filamentTime,before.core.filamentTime);
  assert.notEqual(world.diagnostics().planetAngle,before.world.planetAngle);
  assert.notEqual(world.diagnostics().sweepAngle,before.world.sweepAngle);
});
