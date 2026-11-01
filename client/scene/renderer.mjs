import * as THREE from 'three';
import referenceUrl from '../assets/SceneReference-v3.png';
import environmentUrl from '../hud/environment-v5.png';
import cleanUrl from '../hud/jarvis-scene-v3.png';
import {CoreMotion} from './motion.mjs';
import {createReferenceScene,resizeReferenceCamera} from './projected-scene.mjs';

const canvas=document.getElementById('atmosphere'),motion=new CoreMotion();
motion.phase=document.getElementById('core-stage')?.dataset.state||'idle';
let stop=false,preferenceReduced=document.body.classList.contains('reduce-motion'),renderer,art,textures=[],time=0,last=performance.now(),frames=0,reportAt=0;
// State events can arrive while textures are loading. Register before loading.
document.addEventListener('assistant-state',e=>{motion.phase=e.detail;if(e.detail!=='speaking')motion.output=0;});
document.addEventListener('assistant-event',({detail:e})=>{
  if(e.type==='level')motion.input=Math.max(0,Math.min(e.value||0,1));
  if(e.type==='outputLevel')motion.output=Math.max(0,Math.min(e.value||0,1));
  if(e.type==='configured')preferenceReduced=!!e.settings.reducedMotion;
  if(e.type==='stopAudio'||(e.type==='microphone'&&!e.enabled)){motion.input=0;motion.output=0;}
});
function fallback(message){const status=document.getElementById('graphics-status');if(status)status.textContent='动态效果未启用 · 正在使用静态备用画面';stop=true;document.body.classList.remove('three-active');document.body.classList.add('graphics-fallback');const detail=document.getElementById('core-detail');if(detail)detail.textContent=message;}
async function start(){
  renderer=new THREE.WebGLRenderer({canvas,alpha:false,antialias:true,powerPreference:'low-power'});
  renderer.setClearColor(0x020a10,1);renderer.toneMapping=THREE.NoToneMapping;renderer.outputColorSpace=THREE.SRGBColorSpace;
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-4.18,4.18,2.3525,-2.3525,.1,40);
  camera.position.set(0,0,6.1);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const loader=new THREE.TextureLoader();
  textures=await Promise.all([referenceUrl,environmentUrl,cleanUrl].map(url=>loader.loadAsync(url)));
  if(stop){textures.forEach(t=>t.dispose());return;}
  for(const t of textures){t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());}
  art=createReferenceScene({art:textures[0],environment:textures[1],cleanArt:textures[2]});scene.add(art.group);
  function resize(){renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5,2400/innerWidth));renderer.setSize(innerWidth,innerHeight,false);resizeReferenceCamera(camera,innerWidth/innerHeight);}
  resize();window.addEventListener('resize',resize);
  const initialCamera=JSON.stringify({matrix:camera.matrixWorld.toArray(),zoom:camera.zoom});
  function frame(now){
    if(stop)return;requestAnimationFrame(frame);
    if(document.hidden){last=now;return;}
    const reduced=preferenceReduced||matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(now-last<(reduced?200:1000/30))return;
    const dt=Math.min((now-last)/1000,.06);last=now;motion.reduced=reduced;
    const pose=motion.tick(dt);if(!reduced)time+=dt;
    art.update(time,reduced?0:pose.energy,renderer.getPixelRatio());renderer.render(scene,camera);frames++;
    if(frames===1)document.body.classList.add('three-active');
    const status=document.getElementById('graphics-status');if(status)status.textContent=reduced?'动态效果已暂停':'动态效果正在运行';
    if(now-reportAt>350){reportAt=now;const output=document.getElementById('scene-diagnostics');if(output)output.textContent=JSON.stringify({webgl:true,frames,cameraZ:camera.position.z,cameraLocked:JSON.stringify({matrix:camera.matrixWorld.toArray(),zoom:camera.zoom})===initialCamera,...art.diagnostics(),energy:pose.energy,reduced,drawCalls:renderer.info.render.calls});}
  }
  requestAnimationFrame(frame);
}
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();fallback('动态图形已中断，重新打开客户端可恢复');});
window.addEventListener('pagehide',()=>{stop=true;textures.forEach(t=>t.dispose());renderer?.dispose();},{once:true});
start().catch(error=>{fallback('动态图形暂不可用，正在显示静态备用画面');console.error('Scene renderer failed:',error.message);});
