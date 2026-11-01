import * as THREE from 'three';
import {createReferenceScene,resizeReferenceCamera} from './reference-scene.mjs';

const $=id=>document.getElementById(id),canvas=$('scene');
const still=new URLSearchParams(location.search).has('still');
let time=0,paused=still||matchMedia('(prefers-reduced-motion: reduce)').matches,speed=1,frames=0,last=performance.now(),reportAt=0,stop=false;
let toastTimer;
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3200);}
try {
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true,powerPreference:'low-power'});
  renderer.setClearColor(0x020a10,1);renderer.toneMapping=THREE.NoToneMapping;renderer.outputColorSpace=THREE.SRGBColorSpace;
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-4.18,4.18,2.3525,-2.3525,.1,40);
  camera.position.set(0,0,6.1);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const loader=new THREE.TextureLoader();
  const [art,environment,cleanArt]=await Promise.all(['reference-target.png','environment-v5.png','jarvis-scene-v3.png'].map(url=>loader.loadAsync(url)));
  for(const texture of [art,environment,cleanArt]){texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());}
  const model=createReferenceScene({art,environment,cleanArt});scene.add(model.group);
  let pixelRatio=1;
  function resize(){pixelRatio=Math.min(devicePixelRatio||1,2,3000/innerWidth);renderer.setPixelRatio(pixelRatio);renderer.setSize(innerWidth,innerHeight,false);resizeReferenceCamera(camera,innerWidth/innerHeight);}
  resize();addEventListener('resize',resize);
  const cameraState=()=>({position:camera.position.toArray(),rotation:camera.rotation.toArray(),zoom:camera.zoom,scale:model.group.scale.toArray(),matrix:camera.matrixWorld.toArray()});
  const initialCamera=JSON.stringify(cameraState());
  function state(){return {time,frames,camera:cameraState(),cameraLocked:JSON.stringify(cameraState())===initialCamera,...model.diagnostics(),paused,visible:{rings:model.rings.visible,plasma:model.plasma.visible,floor:model.pedestal.visible,planets:model.planets.every(p=>p.shape.visible)},drawCalls:renderer.info.render.calls};}
  function frame(now){
    if(stop)return;requestAnimationFrame(frame);
    if(document.hidden){last=now;return;}if(now-last<1000/30)return;
    const dt=Math.min((now-last)/1000,.1);last=now;if(!paused)time+=dt*speed;
    model.update(time);renderer.render(scene,camera);frames++;
    if(now-reportAt>300){reportAt=now;const s=state();$('diagnostics').textContent=JSON.stringify(s);$('camera-label').textContent=s.cameraLocked?'CAMERA LOCKED · Z 6.10 · ZOOM 1.00':'镜头状态异常';}
  }
  requestAnimationFrame(frame);
  function pause(value){paused=value;$('pause').textContent=paused?'恢复运动':'暂停运动';document.body.classList.toggle('motion-paused',paused);}
  pause(paused);
  $('pause').onclick=()=>pause(!paused);$('speed').onchange=e=>speed=Number(e.target.value);
  $('rings').onchange=e=>model.rings.visible=e.target.checked;$('plasma').onchange=e=>model.plasma.visible=e.target.checked;
  $('floor').onchange=e=>model.pedestal.visible=e.target.checked;$('planets').onchange=e=>model.planets.forEach(p=>p.shape.visible=e.target.checked);
  $('wireframe').onchange=e=>{model.setWireframe(e.target.checked);document.body.classList.toggle('wireframe',e.target.checked);};
  $('compare').onchange=e=>document.body.classList.toggle('compare-reference',e.target.checked);
  $('reference-exit').onclick=()=>{$('compare').checked=false;document.body.classList.remove('compare-reference');};
  const movement=s=>JSON.stringify({rings:s.ringAngles,plasma:s.plasmaAngle,filament:s.plasmaFlowTime,floor:s.platformAngle,sweep:s.sweepAngle,planet:s.planetAngle,stars:s.starTime});
  $('run-check').onclick=async()=>{
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));$('qa-result').textContent='RUNNING';$('qa-label').textContent='检查中';
    pause(false);await wait(400);const a=state();await wait(900);const b=state();
    pause(true);await wait(300);const c=state();await wait(500);const d=state();
    const changed=['plasmaAngle','plasmaFlowTime','sweepAngle','planetAngle','starTime'].every(k=>a[k]!==b[k])&&JSON.stringify(a.platformAngle)!==JSON.stringify(b.platformAngle)&&a.ringAngles.every((v,i)=>v!==b.ringAngles[i]);
    const locked=[a,b,c,d].every(s=>s.cameraLocked)&&JSON.stringify(a.camera)===JSON.stringify(d.camera);
    const frozen=movement(c)===movement(d);pause(false);
    $('wireframe').checked=true;$('wireframe').dispatchEvent(new Event('change'));await wait(250);const e=state();await wait(400);const f=state();
    const wireframeRuns=e.materialWireframe&&f.materialWireframe&&e.plasmaFlowTime!==f.plasmaFlowTime&&f.cameraLocked;
    $('wireframe').checked=false;$('wireframe').dispatchEvent(new Event('change'));
    const passed=changed&&locked&&frozen&&wireframeRuns;
    $('qa-result').textContent=JSON.stringify({result:passed?'PASSED':'FAILED',moving:changed,cameraLocked:locked,pausedFrozen:frozen,wireframeRuns,layers:a.meshLayers});
    $('qa-label').textContent=passed?'检查通过 · 镜头锁定':'检查未通过';
  };
  $('record').onclick=async()=>{
    time=0;speed=1;$('speed').value='1';pause(false);$('wireframe').checked=false;$('wireframe').dispatchEvent(new Event('change'));
    $('compare').checked=false;document.body.classList.remove('compare-reference');
    for(const id of ['rings','plasma','floor','planets']){$(id).checked=true;$(id).dispatchEvent(new Event('change'));}
    const stream=canvas.captureStream(30),mime=['video/webm;codecs=vp9','video/webm','video/mp4'].find(t=>MediaRecorder.isTypeSupported(t));
    const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:9000000}),chunks=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    $('record').disabled=true;$('record').textContent='正在录制…';
    recorder.onstop=()=>{stream.getTracks().forEach(t=>t.stop());const link=document.createElement('a');link.href=URL.createObjectURL(new Blob(chunks,{type:mime}));link.download='jarvis-reference-v3.'+(mime.includes('webm')?'webm':'mp4');link.click();setTimeout(()=>URL.revokeObjectURL(link.href),30000);$('record').disabled=false;$('record').textContent='录制十秒';};
    recorder.start();setTimeout(()=>{if(recorder.state==='recording')recorder.stop();},10000);
  };
  addEventListener('pagehide',()=>{stop=true;art.dispose();environment.dispose();cleanArt.dispose();renderer.dispose();},{once:true});
}catch(error){$('status').textContent='图形初始化失败：'+error.message;console.error(error);}

function panel(id,open){$(id).hidden=!open;if(open)$(id).querySelector('button,input,textarea')?.focus();}
$('settings-open').onclick=()=>panel('settings-panel',true);$('settings-close').onclick=()=>panel('settings-panel',false);
$('keyboard-toggle').onclick=()=>panel('composer-panel',$('composer-panel').hidden);$('keyboard-close').onclick=()=>panel('composer-panel',false);
$('project-open').onclick=()=>toast('当前为视觉预览，Mac 客户端中的项目和聊天保持不变。');
$('history-open').onclick=()=>toast('这里展示设计图的示例内容，不读取你的真实聊天记录。');
for(const item of document.querySelectorAll('[data-prompt]'))item.onclick=()=>{panel('composer-panel',true);$('input').value=item.dataset.prompt;$('input').focus();};
$('send').onclick=()=>{const value=$('input').value.trim();if(!value)return;$('focus-content').textContent=value;$('speaker-name').textContent='你';$('core-detail').textContent='文字预览 · 尚未发送到聊天服务';panel('composer-panel',false);};
$('set-name').oninput=e=>{const name=e.target.value.trim()||'贾维斯';$('assistant-name').textContent=name;$('speaker-name').textContent=name;};
$('set-wake').oninput=e=>document.querySelectorAll('.wake-name').forEach(el=>el.textContent=e.target.value.trim()||'贾维斯');
function listening(value){$('listen').setAttribute('aria-pressed',String(value));$('listen-label').textContent=value?'聆听中':'待唤醒';document.body.classList.toggle('not-listening',!value);}
$('listen').onclick=()=>{listening($('listen').getAttribute('aria-pressed')!=='true');toast('语音状态演示，不采集麦克风。');};
$('interrupt').onclick=()=>{listening(false);$('focus-content').textContent='我在。 接下来，我们先解决哪个问题？';$('speaker-name').textContent=$('assistant-name').textContent;toast('演示已打断');};
addEventListener('keydown',e=>{if(e.key==='Escape'){panel('settings-panel',false);panel('composer-panel',false);$('reference-exit').click();}if(e.code==='Space'&&!['INPUT','TEXTAREA','BUTTON','SELECT'].includes(document.activeElement.tagName)){e.preventDefault();$('listen').click();}});
document.querySelectorAll('.wave b').forEach((bar,i)=>bar.style.setProperty('--i',i));
function tick(){if(!still)$('clock').textContent=new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});}tick();setInterval(tick,1000);
