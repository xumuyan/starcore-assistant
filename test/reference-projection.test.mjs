import test from 'node:test';
import assert from 'node:assert/strict';
import {OrthographicCamera,Vector3,Raycaster} from 'three';
import {createReferenceScene,resizeReferenceCamera} from '../client/scene/prototype/reference-scene.mjs';

function camera(){const c=new OrthographicCamera();c.position.set(0,0,6.1);c.lookAt(0,0,0);resizeReferenceCamera(c,1672/941);c.updateMatrixWorld();return c;}

test('all projected meshes, including the seam guard, align source UVs at rest',()=>{
  const scene=createReferenceScene(),c=camera();scene.update(0);scene.group.updateMatrixWorld(true);
  const layers=[...scene.tracks,scene.heart,...scene.floorTracks,...scene.planets,scene.seamGuard];
  assert.equal(layers.length,15);
  for(const layer of layers){
    const position=layer.mesh.geometry.getAttribute('position'),uv=layer.mesh.geometry.getAttribute('uv');
    for(let i=0;i<position.count;i+=17){
      const p=new Vector3().fromBufferAttribute(position,i).applyMatrix4(layer.mesh.matrixWorld).project(c);
      assert.ok(Math.abs((p.x+1)/2-uv.getX(i))<1e-6);
      assert.ok(Math.abs((p.y+1)/2-uv.getY(i))<1e-6);
    }
  }
});

test('tilted core cannot expose the dark environment through the moving boundary',()=>{
  const s=createReferenceScene();
  for(const time of [5.6,16.8]){
    s.update(time);s.group.updateMatrixWorld(true);let gap=0,point;
    for(let i=0;i<360;i++){
      const a=i*Math.PI/180,p=new Vector3(Math.cos(a)*1.42*.49,Math.sin(a)*1.42*.49,Math.sqrt(1-.49**2)*.85).applyMatrix4(s.heart.mesh.matrixWorld);
      const local=s.tracks[0].shape.worldToLocal(p.clone()),g=(1.42*.49-Math.hypot(local.x,local.y))*200;
      if(g>gap){gap=g;point=p;}
    }
    assert.ok(gap>.8,'reproduce the original subpixel opening');
    point.y+=(point.y>s.heart.shape.position.y?1:-1)*gap/200*.5;point.z=5;
    const ray=new Raycaster(point,new Vector3(0,0,-1)),shell=[s.heart.mesh,...s.tracks.map(t=>t.mesh)];
    assert.equal(ray.intersectObjects(shell,false).length,0);
    assert.ok(ray.intersectObject(s.seamGuard.mesh,false).length>0,'continuous source dome fills the opening');
  }
  s.plasma.visible=false;s.update(10);
  assert.equal(s.seamGuard.mesh.material.uniforms.parts.value.x,0);
  s.rings.visible=false;s.update(11);
  assert.equal(s.seamGuard.mesh.material.uniforms.parts.value.y,0);
});

test('actual surface motion preserves camera, global scale and floor plane',()=>{
  const scene=createReferenceScene(),c=camera();
  const cameraBefore=[...c.matrixWorld.elements,...c.projectionMatrix.elements];
  const marker=()=>new Vector3().fromBufferAttribute(scene.tracks[0].mesh.geometry.getAttribute('position'),1100).applyMatrix4(scene.tracks[0].mesh.matrixWorld).project(c);
  scene.update(0);scene.group.updateMatrixWorld(true);const a=marker();
  scene.update(10);scene.group.updateMatrixWorld(true);const b=marker();
  assert.ok(a.distanceTo(b)>5/836,'a marked surface point moves at least five reference pixels');
  assert.equal(new Set(scene.diagnostics().ringAngles).size,5);
  assert.deepEqual(scene.group.scale.toArray(),[1,1,1]);
  assert.deepEqual([...c.matrixWorld.elements,...c.projectionMatrix.elements],cameraBefore);
  const f=scene.floorTracks[0],p=f.mesh.geometry.getAttribute('position');
  const sample=new Vector3().fromBufferAttribute(p,777).applyQuaternion(f.mesh.quaternion);
  assert.ok(Math.abs(sample.dot(f.axis))<1e-6,'platform rotates within its tilted plane');
  const d=scene.tracks[0].mesh.geometry.getAttribute('position');
  const zs=Array.from({length:d.count},(_,i)=>d.getZ(i));
  assert.ok(Math.max(...zs)-Math.min(...zs)>.05,'shell has curved depth');
});

test('one time value freezes all layers and wireframe does not replace underlying animation state',()=>{
  const scene=createReferenceScene();scene.update(8);const before=scene.diagnostics();
  scene.update(8);assert.deepEqual(scene.diagnostics(),before);
  scene.setWireframe(true);scene.update(9);
  assert.equal(scene.base.visible,false);assert.equal(scene.diagnostics().materialWireframe,true);
  assert.notDeepEqual(scene.diagnostics().ringAngles,before.ringAngles);
  scene.setWireframe(false);assert.equal(scene.base.visible,true);assert.equal(scene.diagnostics().materialWireframe,false);
});
