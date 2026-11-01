import * as THREE from 'three';
import {TAU,random,glowTexture} from './materials.mjs';

// Local light only: no camera, whole-model scale or reference UV distortion.
export function createCoreEffects(){
  const group=new THREE.Group();group.position.set(0,(470.5-315)/200,1.02);
  const positions=[],seeds=[];
  for(let i=0;i<160;i++){
    const a=random(i+2600)*TAU,r=.28+random(i+2700)*.84;
    positions.push(Math.cos(a)*r,Math.sin(a)*r*.86,(random(i+2800)-.5)*.22);seeds.push(random(i+2900));
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('seed',new THREE.Float32BufferAttribute(seeds,1));
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    uniforms:{time:{value:0},energy:{value:0},pixelRatio:{value:1},glow:{value:glowTexture()}},
    vertexShader:`attribute float seed;uniform float time;uniform float energy;uniform float pixelRatio;varying float light;varying float warm;void main(){float a=time*(.035+seed*.08);vec3 p=position;p.xy=mat2(cos(a),-sin(a),sin(a),cos(a))*p.xy;p.z+=sin(time*.5+seed*17.)*.04;light=.14+(.5+.5*sin(time*1.6+seed*31.))*.45+energy*.20;warm=step(.96,seed);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);gl_PointSize=(1.5+seed*2.0+energy*.8)*pixelRatio;}`,
    fragmentShader:`uniform sampler2D glow;varying float light;varying float warm;void main(){float a=texture2D(glow,gl_PointCoord).a;gl_FragColor=vec4(mix(vec3(.25,.72,1.),vec3(1.,.72,.33),warm),a*light);}`});
  const points=new THREE.Points(geometry,material);group.add(points);const trails=[];
  for(let i=0;i<2;i++){
    const positions=[],progress=[];
    for(let j=0;j<=240;j++){const a=j/240*TAU,r=.84+i*.25;positions.push(Math.cos(a)*r,Math.sin(a)*r*(.36+i*.12),Math.sin(a)*.15);progress.push(j/240);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('progress',new THREE.Float32BufferAttribute(progress,1));
    const m=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{time:{value:0},energy:{value:0},phase:{value:i*.47},direction:{value:i?-1:1}},
      vertexShader:'attribute float progress;varying float v;void main(){v=progress;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:'uniform float time;uniform float energy;uniform float phase;uniform float direction;varying float v;void main(){float d=fract(v-direction*time*.07+phase);float tail=smoothstep(.0,.025,d)*(1.-smoothstep(.025,.17,d));gl_FragColor=vec4(.35,.78,1.,tail*(.26+energy*.20));}'});
    const line=new THREE.Line(g,m);line.rotation.z=i?-.43:.23;group.add(line);trails.push(line);
  }
  function update(time,energy=0,pixelRatio=1){for(const m of [material,...trails.map(x=>x.material)]){m.uniforms.time.value=time;m.uniforms.energy.value=energy;}material.uniforms.pixelRatio.value=pixelRatio;}
  return {group,points,trails,update,diagnostics:()=>({lightFlowTime:material.uniforms.time.value,lightParticleCount:seeds.length})};
}
