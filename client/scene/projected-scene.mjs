import * as THREE from 'three';
import { TAU, random, glowTexture } from './materials.mjs';
import { createCoreEffects } from './core-effects.mjs';

// Single-view projection mapping. The supplied artwork is a surface material,
// not a full-frame zoom animation. Separate curved meshes own its moving parts.
export const DESIGN = Object.freeze({width:1672,height:941,unit:1/200});
const U=DESIGN.unit, cx=836, cy=470.5;
const sourceUv=(x,y)=>[x/DESIGN.width,1-y/DESIGN.height];
const subjects=[
  [836,315,284,265], [836,582,675,71],
  [205,328,18,18], [356,403,11,11], [1229,270,16,16], [1558,159,24,24]
];

function surfaceGeometry({x,y,rx,ry,inner=0,outer=1,depth=0,radial=10,segments=256}) {
  const positions=[],uvs=[],indices=[];
  for(let j=0;j<=radial;j++) for(let i=0;i<=segments;i++) {
    const r=inner+(outer-inner)*j/radial,a=i/segments*TAU;
    positions.push(Math.cos(a)*r*rx*U,Math.sin(a)*r*rx*U,Math.sqrt(Math.max(0,1-r*r))*depth*U);
    uvs.push(...sourceUv(x+Math.cos(a)*r*rx,y-Math.sin(a)*r*ry));
    if(j<radial&&i<segments){const k=j*(segments+1)+i;indices.push(k,k+1,k+segments+1,k+1,k+segments+2,k+segments+1);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();return g;
}

function projectedMaterial(art,environment,{flow=0,inner=0,outer=1,rx=284,floor=false,guard=false}={}) {
  return new THREE.ShaderMaterial({
    uniforms:{art:{value:art},environment:{value:environment},time:{value:0},energy:{value:0},flow:{value:flow},limits:{value:new THREE.Vector3(inner,outer,rx/200)},floorLayer:{value:floor?1:0},guard:{value:guard?1:0},parts:{value:new THREE.Vector2(1,1)}},
    side:THREE.DoubleSide,transparent:true,depthWrite:true,
    vertexShader:`varying vec2 vUv;varying vec2 fixedUv;varying vec3 local;void main(){vUv=uv;local=position;vec4 world=modelMatrix*vec4(position,1.);fixedUv=world.xy/vec2(8.36,4.705)+.5;gl_Position=projectionMatrix*viewMatrix*world;}`,
    fragmentShader:`uniform sampler2D art;uniform sampler2D environment;uniform float time;uniform float energy;uniform float flow;uniform vec3 limits;uniform float floorLayer;uniform float guard;uniform vec2 parts;varying vec2 vUv;varying vec2 fixedUv;varying vec3 local;
      void main(){
        vec2 uv=vUv;
        // Small tangential flow within the plasma, zero displacement at t=0.
        float k=flow*.00055;
        uv+=k*vec2(sin(local.y*17.+time*.8)-sin(local.y*17.),cos(local.x*19.+time*.7)-cos(local.x*19.));
        vec3 moving=texture2D(art,uv).rgb,fixedColor=texture2D(art,fixedUv).rgb;
        float r=(floorLayer>.5?length(local):length(local.xy))/limits.z;
        if(guard>.5&&((r<.49&&parts.x<.5)||(r>=.49&&parts.y<.5)))discard;
        float feather=min(.025,(limits.y-limits.x)*.22);
        float mask=smoothstep(limits.x,limits.x+feather,r)*(1.-smoothstep(limits.y-feather,limits.y,r));
        if(limits.x==0.)mask=1.-smoothstep(limits.y-feather,limits.y,r);
        if(floorLayer>.5){
          // The original platform photograph overlaps the sphere at its far
          // edge. Do not drag those sphere pixels around the floor with its UVs.
          vec2 body=(uv-vec2(.5,1.-315./941.))/vec2(284./1672.,265./941.);
          float safe=smoothstep(1.,1.045,length(body));
          moving=mix(fixedColor,moving,safe);mask*=.50;
        }
        vec3 color=mix(fixedColor,moving,mask);
        color*=1.+flow*(.035*sin(time*1.3)+energy*.08)*exp(-dot(local.xy,local.xy)*2.);
        gl_FragColor=vec4(color,1.);
        #include <colorspace_fragment>
      }`
  });
}

export function createReferenceScene({art=null,environment=null,cleanArt=art}={}) {
  const group=new THREE.Group(),rings=new THREE.Group(),plasma=new THREE.Group(),pedestal=new THREE.Group(),planetGroup=new THREE.Group();
  group.add(rings,plasma,pedestal,planetGroup);
  const tracks=[],floorTracks=[],materials=[],planets=[];
  let currentTime=0,wireframe=false;
  const baseMaterial=new THREE.ShaderMaterial({
    depthWrite:false,
    uniforms:{art:{value:art},cleanArt:{value:cleanArt},environment:{value:environment},time:{value:0},subjects:{value:subjects.map(([x,y,rx,ry])=>new THREE.Vector4(x/1672,1-y/941,rx/1672,ry/941))}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`uniform sampler2D art;uniform sampler2D cleanArt;uniform sampler2D environment;uniform float time;uniform vec4 subjects[6];varying vec2 vUv;
      float rect(vec2 p,vec4 box){vec2 d=min(p-box.xy,box.zw-p);return smoothstep(0.,9.,min(d.x,d.y));}
      void main(){
        vec3 c=texture2D(art,vUv).rgb,bg=texture2D(environment,vUv).rgb;
        // Retain exact source colors where the screenshot contains scene art.
        // Erase all source UI regions with the existing clean plate; real HTML
        // provides their editable text, icons and controls above this canvas.
        vec2 px=vec2(vUv.x*1672.,(1.-vUv.y)*941.);
        float ui=max(rect(px,vec4(8.,8.,390.,86.)),rect(px,vec4(1320.,6.,1672.,86.)));
        ui=max(ui,rect(px,vec4(495.,637.,1175.,790.)));
        ui=max(ui,rect(px,vec4(584.,782.,1090.,935.)));
        ui=max(ui,rect(px,vec4(12.,798.,335.,930.)));
        ui=max(ui,rect(px,vec4(1370.,798.,1672.,930.)));
        vec3 clean=texture2D(cleanArt,vUv).rgb;
        clean*=mix(vec3(1.),vec3(1.,.70,.66),smoothstep(570.,800.,px.y));
        c=mix(c,clean,ui);
        float cut=0.;
        for(int i=0;i<6;i++){
          vec4 s=subjects[i];float d=length((vUv-s.xy)/s.zw);
          cut=max(cut,1.-smoothstep(.995,1.005,d));
        }
        c=mix(c,bg,cut);
        // Stars in the photographic environment shimmer locally. Their positions
        // do not change with a camera transform or full-picture displacement.
        float star=step(.24,max(c.r,max(c.g,c.b)))*step(.55,vUv.y)*(1.-cut);
        float phase=vUv.x*93.+vUv.y*147.;
        c*=1.+star*.05*(sin(time*.9+phase)-sin(phase));
        gl_FragColor=vec4(c,1.);
        #include <colorspace_fragment>
      }`
  });
  const base=new THREE.Mesh(new THREE.PlaneGeometry(1672*U,941*U),baseMaterial);base.position.z=-2;base.renderOrder=-100;group.add(base);

  function addSurface(parent,spec,speed) {
    const material=projectedMaterial(art,environment,spec),mesh=new THREE.Mesh(surfaceGeometry(spec),material),shape=new THREE.Group();
    shape.position.set((spec.x-cx)*U,(cy-spec.y)*U,spec.z||0);shape.scale.y=spec.ry/spec.rx;shape.add(mesh);parent.add(shape);materials.push(material);
    const track={mesh,shape,speed,spec};return track;
  }
  // A continuously covered dome, divided into independently rotating annuli.
  // Source detail is attached to vertices. Boundaries retain the reference's
  // elliptical silhouette while highlights travel over actual curved surfaces.
  const boundaries=[.49,.62,.75,.85,.925,1];
  for(let i=0;i<boundaries.length-1;i++) {
    const track=addSurface(rings,{x:836,y:315,rx:284,ry:265,inner:boundaries[i],outer:boundaries[i+1],depth:170,radial:12},[.025,-.018,.014,-.010,.007][i]);
    tracks.push(track);
  }
  const heart=addSurface(plasma,{x:836,y:315,rx:284,ry:265,inner:0,outer:.49,depth:170,radial:22,flow:1},-.052);
  // Independently tilted boundaries are not watertight. A continuous, slightly
  // recessed dome supplies the same source pixels behind every moving seam.
  // Its depth separation avoids coplanar flicker; masks preserve layer toggles.
  const seamGuard=addSurface(group,{x:836,y:315,rx:284,ry:265,inner:0,outer:1,depth:170,radial:48,guard:true,z:-.04},0);
  seamGuard.mesh.renderOrder=-20;
  const effects=createCoreEffects();plasma.add(effects.group);

  // The platform is a real tilted circular plane. Rotation is about its own
  // normal, so it stays flat rather than swinging a 2D ellipse around the screen.
  for(const [inner,outer,speed] of [[0,.40,.022],[.40,.66,-.016],[.66,.84,.011],[.84,1,-.008]]) {
    const rx=675,ry=71,geometry=surfaceGeometry({x:836,y:582,rx,ry,inner,outer,radial:5,segments:384});
    const p=geometry.getAttribute('position');
    for(let i=0;i<p.count;i++){const py=p.getY(i);p.setZ(i,-py*Math.sqrt(1-(ry/rx)**2));p.setY(i,py*ry/rx);}
    geometry.computeVertexNormals();
    const mat=projectedMaterial(art,environment,{inner,outer,rx,floor:true});materials.push(mat);const mesh=new THREE.Mesh(geometry,mat),anchor=new THREE.Group();anchor.position.set(0,(cy-582)*U,-.9);anchor.add(mesh);pedestal.add(anchor);
    floorTracks.push({mesh,anchor,speed,axis:new THREE.Vector3(0,Math.sqrt(1-(ry/rx)**2),ry/rx)});
  }
  for(const [index,[x,y,r]] of [[205,328,18],[356,403,11],[1229,270,16],[1558,159,24]].entries()) {
    const item=addSurface(planetGroup,{x,y,rx:r,ry:r,depth:r*.8,radial:18,segments:64,z:.7},.025*(index%2?-1:1));
    planets.push(item);
  }
  const glow=glowTexture(),orbitBeacons=[];
  for(let i=0;i<7;i++) {
    const beacon=new THREE.Sprite(new THREE.SpriteMaterial({map:glow,color:i%4?0xf18ba1:0xffd6a0,transparent:true,opacity:.30,blending:THREE.AdditiveBlending,depthWrite:false}));beacon.scale.setScalar((i%3?10:17)*U);rings.add(beacon);orbitBeacons.push(beacon);
  }
  const stars=new THREE.Group();group.add(stars);
  for(let i=0;i<56;i++) {
    const p=new THREE.Sprite(new THREE.SpriteMaterial({map:glow,color:i%11?0xf0829a:0xffc17d,transparent:true,opacity:.25,depthWrite:false,blending:THREE.AdditiveBlending}));
    const x=(random(i+1300)*1672-cx)*U,y=(cy-random(i+1500)*620)*U;
    p.position.set(x,y,-.7+random(i+1700)*.4);p.scale.setScalar((1.6+random(i+1800)*5)*U);p.userData.start=p.position.clone();stars.add(p);
  }
  const originalMaterials=new WeakMap();
  const lineMaterial=new THREE.MeshBasicMaterial({color:0xf191a6,wireframe:true,transparent:true,opacity:.36});
  function setWireframe(value){wireframe=value;base.visible=!value;effects.group.visible=!value;group.traverse(o=>{if(o.isMesh&&o!==base){if(value){if(!originalMaterials.has(o))originalMaterials.set(o,o.material);o.material=lineMaterial;}else if(originalMaterials.has(o))o.material=originalMaterials.get(o);}});}
  function update(time,energy=0,pixelRatio=1){
    currentTime=time;baseMaterial.uniforms.time.value=time;
    for(const m of materials){m.uniforms.time.value=time;m.uniforms.energy.value=Math.max(0,Math.min(energy,1));}
    if(!wireframe)seamGuard.mesh.material.uniforms.parts.value.set(plasma.visible?1:0,rings.visible?1:0);
    effects.update(time,Math.max(0,Math.min(energy,1)),pixelRatio);
    for(const t of tracks)t.mesh.rotation.z=Math.sin(time*t.speed*7)*.075;
    heart.mesh.rotation.z=Math.sin(time*heart.speed*4)*.035;
    // Small genuine depth changes in the core; the full-scene scale stays 1.
    heart.mesh.rotation.x=Math.sin(time*.28)*.006;
    for(const t of floorTracks)t.mesh.quaternion.setFromAxisAngle(t.axis,Math.sin(time*t.speed*9)*.045);
    for(const [i,p] of planets.entries()){p.mesh.rotation.y=Math.sin(time*.12+i)*.07-Math.sin(i)*.07;p.mesh.rotation.z=Math.sin(time*p.speed*5)*.14;p.shape.position.y=(cy-p.spec.y)*U+Math.sin(time*.17+i)*.006-Math.sin(i)*.006;}
    for(const [i,p] of orbitBeacons.entries()) {
      const a=time*(.14+i*.015)+i/7*TAU,px=Math.cos(a)*450,py=Math.sin(a)*73,tilt=.20;
      p.position.set((px*Math.cos(tilt)-py*Math.sin(tilt)+20)*U,(cy-326-px*Math.sin(tilt)-py*Math.cos(tilt))*U,Math.sin(a)*1.8+.35);
      p.material.opacity=.19+(.5+.5*Math.sin(time+i))*.16;
    }
    for(const [i,p] of stars.children.entries()){p.position.x=p.userData.start.x+Math.sin(time*.055+i)*.035-Math.sin(i)*.035;p.position.y=p.userData.start.y+Math.sin(time*.07+i)*.018-Math.sin(i)*.018;p.material.opacity=.12+(.5+.5*Math.sin(time*.6+i))*.30;}
  }
  function diagnostics(){return {rendering:'single-view reference projection on independent curved meshes',ringAngles:tracks.map(t=>t.mesh.rotation.z),plasmaAngle:heart.mesh.rotation.z,plasmaFlowTime:currentTime,platformAngle:floorTracks[0].mesh.quaternion.toArray(),sweepAngle:currentTime*.14,planetAngle:planets[0].mesh.rotation.y,starTime:currentTime,scale:group.scale.toArray(),materialWireframe:wireframe,meshLayers:tracks.length+floorTracks.length+planets.length+1,seamGuard:true,...effects.diagnostics()};}
  update(0);
  return {group,rings,plasma,pedestal,planets,tracks,floorTracks,heart,stars,base,seamGuard,effects,update,setWireframe,diagnostics};
}

export function resizeReferenceCamera(camera,aspect) {
  const h=(aspect>1672/941?1672/aspect:941)*U,w=h*aspect;
  camera.left=-w/2;camera.right=w/2;camera.top=h/2;camera.bottom=-h/2;camera.updateProjectionMatrix();
}
