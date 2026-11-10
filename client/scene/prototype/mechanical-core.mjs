import * as THREE from 'three';
import { TAU, rose, pale, amber, random, glowTexture } from '../materials.mjs';
import { createEnergyVolume } from './energy-volume.mjs';

function alloy(radius, width, depth, bevel = .003) {
  bevel=Math.min(bevel,width*.24,depth*.24);
  const lo = radius - width / 2, hi = radius + width / 2, d = depth / 2;
  const points = [[lo,-d+bevel],[lo+bevel,-d],[hi-bevel,-d],[hi,-d+bevel],[hi,d-bevel],[hi-bevel,d],[lo+bevel,d],[lo,d-bevel],[lo,-d+bevel]].map(([x,y]) => new THREE.Vector2(x,y));
  return new THREE.LatheGeometry(points, 256).rotateX(Math.PI / 2);
}
function sector(radius, width, angle) {
  const shape = new THREE.Shape(), a = radius - width / 2, b = radius + width / 2;
  shape.moveTo(a,0); shape.lineTo(b,0); shape.absarc(0,0,b,0,angle,false);
  shape.lineTo(Math.cos(angle)*a,Math.sin(angle)*a); shape.absarc(0,0,a,angle,0,true); shape.closePath();
  return new THREE.ExtrudeGeometry(shape,{depth:.006,bevelEnabled:true,bevelThickness:.0012,bevelSize:.001,bevelSegments:2,steps:1,curveSegments:10});
}
function brushedRoughness() {
  const data=new Uint8Array(256*16*4);
  for(let y=0;y<16;y++) for(let x=0;x<256;x++) {
    const i=(y*256+x)*4, value=145+Math.round(random(x*.3+y*17)*45);
    data[i]=data[i+1]=data[i+2]=value; data[i+3]=255;
  }
  const texture=new THREE.DataTexture(data,256,16); texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.needsUpdate=true;return texture;
}
export function createMechanicalCore({bandTexture=null}={}) {
  const group=new THREE.Group(); group.position.y=.69;
  const rings=new THREE.Group(), plasma=new THREE.Group(); group.add(rings,plasma);
  const roughness=brushedRoughness(), glow=glowTexture(), tracks=[];
  const silver=new THREE.MeshPhysicalMaterial({color:0x417fa4,metalness:.79,roughness:.29,roughnessMap:roughness,clearcoat:.7,clearcoatRoughness:.18,envMapIntensity:.75});
  const dark=new THREE.MeshStandardMaterial({color:0x163346,metalness:.82,roughness:.34,envMapIntensity:1.4});
  const panelMat=new THREE.MeshPhysicalMaterial({color:0x44799a,metalness:.8,roughness:.32,clearcoat:.55,envMapIntensity:.9});
  const skinMaterial=new THREE.MeshPhysicalMaterial({color:0x91bfdf,map:bandTexture,emissive:0x175c8a,emissiveMap:bandTexture,emissiveIntensity:.75,metalness:.65,roughness:.28,clearcoat:.8,envMapIntensity:1.1,side:THREE.DoubleSide});
  const crystalMaterial=new THREE.MeshPhysicalMaterial({color:0x3f91c0,map:bandTexture,emissive:0x104368,emissiveMap:bandTexture,emissiveIntensity:.5,metalness:.3,roughness:.19,clearcoat:1,clearcoatRoughness:.12,transparent:true,opacity:.26,depthWrite:false,side:THREE.DoubleSide,envMapIntensity:1.2});
  const blue=new THREE.MeshBasicMaterial({color:0x56cfff,transparent:true,opacity:.58,blending:THREE.AdditiveBlending,depthWrite:false});
  const lampMaterial=new THREE.MeshBasicMaterial({color:new THREE.Color(.36,1.15,1.8)});
  const lampGold=new THREE.MeshBasicMaterial({color:new THREE.Color(1.8,1.05,.36)});
  function sprite(parent,position,size,color,opacity) {
    const s=new THREE.Sprite(new THREE.SpriteMaterial({map:glow,color,transparent:true,opacity,depthWrite:false,blending:THREE.AdditiveBlending}));
    s.position.copy(position);s.scale.set(size,size,1);parent.add(s);return s;
  }
  const specs=[
    {radius:1.20,width:.140,depth:.040,rotation:[.10,-.22,-.13],speed:.20,precess:.018,stretch:1.06},
    {radius:1.33,width:.050,depth:.023,rotation:[.10,-.22,-.13],speed:-.14,precess:0,stretch:1.06},
    {radius:1.36,width:.030,depth:.022,rotation:[.10,1.15,-.30],speed:-.24,precess:.028,y:.12},
    {radius:1.25,width:.022,depth:.017,rotation:[.88,-.48,-.50],speed:.29,precess:-.035},
    {radius:2.02,width:.012,depth:.013,rotation:[1.34,-.18,.07],speed:-.23,precess:.012},
    {radius:1.11,width:.034,depth:.017,rotation:[.10,-.22,-.13],speed:.11,precess:0,z:.30,stretch:1.06},
    {radius:1.20,width:.045,depth:.020,rotation:[.10,-.22,-.13],speed:-.085,precess:0,z:-.25,stretch:1.06},
    {radius:1.88,width:.004,depth:.004,rotation:[1.36,-.185,.07],speed:.075,precess:0,delicate:true},
    {radius:2.14,width:.003,depth:.003,rotation:[1.32,-.175,.07],speed:-.065,precess:0,delicate:true},
  ];
  for(const [index,spec] of specs.entries()) {
    const gimbal=new THREE.Group(), spin=new THREE.Group(); gimbal.rotation.set(...spec.rotation);gimbal.position.set(0,spec.y||0,spec.z||0);gimbal.scale.x=spec.stretch||1;gimbal.add(spin);rings.add(gimbal);
    if(spec.delicate) {
      spin.add(new THREE.Mesh(new THREE.TorusGeometry(spec.radius,.0014,4,512),new THREE.MeshBasicMaterial({color:0x55b6e0,transparent:true,opacity:.45,depthWrite:false,blending:THREE.AdditiveBlending})));
      for(let j=0;j<5;j++) {
        const arc=new THREE.Mesh(new THREE.TorusGeometry(spec.radius,.002,4,70,.40),j%3?blue:lampGold);
        arc.rotation.z=j/5*TAU;spin.add(arc);
      }
      tracks.push({gimbal,spin,spec});continue;
    }
    spin.add(new THREE.Mesh(alloy(spec.radius,spec.width,spec.depth),silver));
    if(index===0||index===1||index===5||index===6) {
      const skinGeometry=new THREE.RingGeometry(spec.radius-spec.width*.46,spec.radius+spec.width*.46,512,1);
      const vertices=skinGeometry.getAttribute('position'),uv=skinGeometry.getAttribute('uv');
      for(let i=0;i<vertices.count;i++) {
        const x=vertices.getX(i),y=vertices.getY(i),r=Math.hypot(x,y);
        uv.setXY(i,(Math.atan2(y,x)/TAU+1)%1,(r-spec.radius+spec.width*.46)/(spec.width*.92));
      }
      const skin=new THREE.Mesh(skinGeometry,skinMaterial);skin.position.z=spec.depth/2+.002;spin.add(skin);
    }
    for(const edge of [-1,1]) {
      const rail=new THREE.Mesh(alloy(spec.radius+edge*spec.width*.52,.004,.009,.001),blue);spin.add(rail);
      const etching=new THREE.Mesh(alloy(spec.radius+edge*spec.width*.28,.003,.003,.0007),dark);etching.position.z=spec.depth/2+.001;spin.add(etching);
    }
    const count=index===0?96:64, piece=sector(spec.radius,spec.width*.62,TAU/count*.90);
    const panels=new THREE.InstancedMesh(piece,panelMat,count*2), transform=new THREE.Object3D();
    for(let i=0;i<count;i++) for(let side=0;side<2;side++) {
      transform.position.set(0,0,side? -spec.depth/2-.006 : spec.depth/2);
      transform.rotation.set(0,0,i/count*TAU);transform.scale.set(1,1,1);transform.updateMatrix();panels.setMatrixAt(i*2+side,transform.matrix);
      panels.setColorAt(i*2+side,new THREE.Color(i%12===0?0xb2d7e8:0x6e9fb8).multiplyScalar(i%4?.78:1.2));
    }
    spin.add(panels);
    if(index===0) {
      for(let j=0;j<12;j++) {
        const shield=new THREE.Mesh(sector(spec.radius+(j%3-1)*.014,.10+(j%3)*.025,.14+random(j+44)*.22),crystalMaterial);
        shield.position.z=spec.depth/2+.022+(j%3)*.006;shield.rotation.z=j/12*TAU+.06;spin.add(shield);
      }
    }
    if(index===0||index===1||index===5||index===6) {
      // Thin parallel face rails and stepped side ribs make a layered housing,
      // instead of a set of identical empty hoops.
      for(let j=-2;j<=2;j++) {
        const faceRail=new THREE.Mesh(alloy(spec.radius+j*spec.width*.17,.0016,.002,.0004),j%2?blue:silver);
        faceRail.position.z=spec.depth/2+.009;spin.add(faceRail);
      }
    }
    const tickCount=index===0?360:240;
    const ticks=new THREE.InstancedMesh(new THREE.BoxGeometry(.0023,spec.width*.32,.0024),lampMaterial,tickCount);
    for(let i=0;i<tickCount;i++) {
      const a=i/tickCount*TAU;
      transform.position.set(Math.cos(a)*spec.radius,Math.sin(a)*spec.radius,spec.depth/2+.010);
      transform.rotation.set(0,0,a-Math.PI/2);transform.scale.set(1,i%15?1:2,1);transform.updateMatrix();ticks.setMatrixAt(i,transform.matrix);
      ticks.setColorAt(i,new THREE.Color(i%45?rose:amber).multiplyScalar(i%5?.35:1));
    }
    spin.add(ticks);
    for(let i=0;i<8;i++) {
      const arc=new THREE.Mesh(sector(spec.radius,spec.width*.30,.025+(i%3)*.022),i%3?lampMaterial:lampGold);
      arc.position.z=spec.depth/2+.009;arc.rotation.z=i/8*TAU+.13*index;spin.add(arc);
    }
    // Clearly visible beacons belong to each ring, not to the camera.
    const beacon=new THREE.Mesh(new THREE.SphereGeometry(.008,12,8),lampMaterial);beacon.position.set(spec.radius,0,.018);spin.add(beacon);
    sprite(beacon,new THREE.Vector3(),.065,rose,.45);
    tracks.push({gimbal,spin,spec});
  }
  const paths=[],flowMaterials=[];
  const shellSegments=new THREE.Group();rings.add(shellSegments);
  for(const [latitude,width] of [[.24,.045],[.37,.027],[.58,.035],[.72,.045]]) {
    const patch=new THREE.SphereGeometry(1.105,9,5,0,TAU/36*.76,Math.PI*latitude,Math.PI*width);
    const patches=new THREE.InstancedMesh(patch,crystalMaterial,36),transform=new THREE.Object3D();
    for(let j=0;j<36;j++) {transform.rotation.set(.10,j/36*TAU,-.10);transform.updateMatrix();patches.setMatrixAt(j,transform.matrix);}
    shellSegments.add(patches);
  }
  const nodes=Array.from({length:380},(_,i)=>{
    const y=random(i+1800)*2-1,a=random(i+1900)*TAU,r=1.04;
    return new THREE.Vector3(Math.sqrt(1-y*y)*Math.cos(a)*r,y*r,Math.sqrt(1-y*y)*Math.sin(a)*r);
  }),connections=[];
  for(let i=0;i<nodes.length;i++) for(let j=i+1;j<nodes.length;j++) {
    const distance=nodes[i].distanceTo(nodes[j]);
    if(distance>.08&&distance<.27)connections.push(nodes[i],nodes[j]);
  }
  shellSegments.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(connections),new THREE.LineBasicMaterial({color:0x65c8f1,transparent:true,opacity:.11,blending:THREE.AdditiveBlending,depthWrite:false})));
  for(let i=0;i<48;i++) {
    const points=[], r=.24+random(i+14)*.48;
    for(let j=0;j<100;j++) {
      const a=j/100*TAU, wobble=1+Math.sin(a*3+i)*.16;
      points.push(new THREE.Vector3(Math.cos(a)*r*wobble,Math.sin(a)*r*wobble,Math.sin(a*(2+i%3)+i)*r*.5));
    }
    const curve=new THREE.CatmullRomCurve3(points,true), tube=new THREE.TubeGeometry(curve,160,i%7?.0016:.003,4,true);
    const material=new THREE.ShaderMaterial({
      transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
      uniforms:{time:{value:0},phase:{value:i*.73}},
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:`uniform float time;uniform float phase;varying vec2 vUv;
        void main(){float wave=pow(.5+.5*sin(vUv.x*37.7-time*3.4+phase),7.);float edge=sin(vUv.y*3.14159);vec3 c=mix(vec3(.02,.56,1.8),vec3(.16,1.3,2.8),wave);gl_FragColor=vec4(c,(.24+wave*.60)*(.5+edge*.5));}`
    });
    const mesh=new THREE.Mesh(tube,material);mesh.rotation.set(random(i+7)*Math.PI,random(i+61)*Math.PI,random(i+24)*Math.PI);plasma.add(mesh);paths.push(mesh);flowMaterials.push(material);
  }
  const volume=createEnergyVolume();plasma.add(volume.mesh);
  const glowObject=sprite(plasma,new THREE.Vector3(),1.75,0x008bff,.34);
  sprite(plasma,new THREE.Vector3(),.60,new THREE.Color(.10,.95,2.0),.85);
  sprite(plasma,new THREE.Vector3(),.18,new THREE.Color(.8,2.0,3.),.85);
  const opticalShell=new THREE.Mesh(new THREE.SphereGeometry(1.12,64,40),new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{time:{value:0}},
    vertexShader:'varying vec3 n;varying vec3 v;varying vec3 local;void main(){local=position;n=normalize(normalMatrix*normal);vec4 p=modelViewMatrix*vec4(position,1.);v=-p.xyz;gl_Position=projectionMatrix*p;}',
    fragmentShader:'varying vec3 n;varying vec3 v;varying vec3 local;uniform float time;void main(){float rim=pow(1.-abs(dot(normalize(n),normalize(v))),2.6);float stripes=pow(.5+.5*sin(atan(local.y,local.x)*180.+local.z*22.-time*.1),22.);gl_FragColor=vec4(.025,.36,.84,.035+rim*.16+stripes*.025);}'
  }));plasma.add(opticalShell);const opticalMaterial=opticalShell.material;
  const web=new THREE.Group();plasma.add(web);
  for(let i=0;i<32;i++) {
    const radius=.94+random(i+211)*.15, pts=[];
    for(let j=0;j<200;j++) { const a=j/200*TAU;pts.push(new THREE.Vector3(Math.cos(a)*radius,Math.sin(a)*radius,Math.sin(a*2+i)*.09)); }
    const l=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:0x5ebee7,transparent:true,opacity:.075,blending:THREE.AdditiveBlending,depthWrite:false}));
    l.rotation.set(random(i+80)*Math.PI,random(i+90)*Math.PI,random(i+100)*Math.PI);web.add(l);
  }
  const positions=new Float32Array(1600*3), seeds=new Float32Array(1600);
  for(let i=0;i<1600;i++) {const z=random(i+700)*2-1,a=random(i+400)*TAU,r=.15+random(i+500)**.4*.88;positions.set([Math.sqrt(1-z*z)*Math.cos(a)*r,z*r,Math.sqrt(1-z*z)*Math.sin(a)*r],i*3);seeds[i]=random(i+800);}
  const particleGeometry=new THREE.BufferGeometry();particleGeometry.setAttribute('position',new THREE.BufferAttribute(positions,3));particleGeometry.setAttribute('seed',new THREE.BufferAttribute(seeds,1));
  const particles=new THREE.Points(particleGeometry,new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{time:{value:0},pixelRatio:{value:1}},
    vertexShader:`attribute float seed;uniform float time;uniform float pixelRatio;varying float s;void main(){s=seed;vec3 p=position;float a=time*(.04+seed*.11);p.xz=mat2(cos(a),-sin(a),sin(a),cos(a))*p.xz;vec4 v=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*v;gl_PointSize=(.8+seed*1.5)*pixelRatio*6./(-v.z);}`,
    fragmentShader:'varying float s;void main(){float r=length(gl_PointCoord-.5);if(r>.5)discard;gl_FragColor=vec4(s>.985?vec3(1.4,.85,.25):vec3(.35,.9,1.5),pow(1.-r*2.,2.)*.7);}'
  }));plasma.add(particles);
  function update(time,pixelRatio=1) {
    for(const {gimbal,spin,spec} of tracks) {
      spin.rotation.z=time*spec.speed;
      gimbal.rotation.x=spec.rotation[0]+Math.sin(time*spec.precess)*.18;
      gimbal.rotation.y=spec.rotation[1]+Math.sin(time*spec.precess*.7)*.13;
    }
    plasma.rotation.y=time*.12;plasma.rotation.x=Math.sin(time*.08)*.08;web.rotation.z=-time*.055;
    shellSegments.rotation.y=-time*.035;
    // Debug wireframe replaces visible materials, but the underlying flow
    // clocks must remain addressable and keep running independently.
    for(const material of flowMaterials) material.uniforms.time.value=time;
    volume.update(time);opticalMaterial.uniforms.time.value=time;
    particles.material.uniforms.time.value=time;particles.material.uniforms.pixelRatio.value=pixelRatio;
    glowObject.material.opacity=.34;
  }
  const originalMaterials=new WeakMap(),originalVisibility=new WeakMap();
  const wireMaterial=new THREE.MeshBasicMaterial({color:0x76c9ee,wireframe:true,transparent:true,opacity:.27,depthWrite:false});
  function setWireframe(value) {
    group.traverse(object=>{
      if(object.isMesh){
        if(value){if(!originalMaterials.has(object))originalMaterials.set(object,object.material);object.material=wireMaterial;}
        else if(originalMaterials.has(object))object.material=originalMaterials.get(object);
      }
      if(object.isSprite){if(value){if(!originalVisibility.has(object))originalVisibility.set(object,object.visible);object.visible=false;}else if(originalVisibility.has(object))object.visible=originalVisibility.get(object);}
    });
  }
  function diagnostics() {return {ringAngles:tracks.map(t=>t.spin.rotation.z),gimbalAngles:tracks.map(t=>[t.gimbal.rotation.x,t.gimbal.rotation.y]),plasmaAngle:plasma.rotation.y,filamentTime:flowMaterials[0].uniforms.time.value,volumeTime:volume.material.uniforms.time.value,scale:group.scale.toArray(),materialWireframe:tracks[0].spin.children[0].material.wireframe};}
  return {group,rings,plasma,tracks,paths,particles,update,setWireframe,diagnostics};
}
