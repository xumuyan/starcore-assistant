import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

export function createFloorReflection() {
  const mirror=new Reflector(new THREE.CircleGeometry(3.25,96),{
    textureWidth:384,textureHeight:384,clipBias:.003,multisample:0,
    shader:{
      uniforms:{tDiffuse:{value:null},color:{value:null},textureMatrix:{value:null}},
      vertexShader:'uniform mat4 textureMatrix;varying vec4 reflectionUv;varying vec2 disk;void main(){disk=position.xy;reflectionUv=textureMatrix*vec4(position,1.);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:'uniform sampler2D tDiffuse;varying vec4 reflectionUv;varying vec2 disk;void main(){vec3 c=texture2DProj(tDiffuse,reflectionUv).rgb;float fade=1.-smoothstep(1.5,3.25,length(disk));gl_FragColor=vec4(c*.42,.20*fade);}'
    }
  });
  mirror.rotation.x=-Math.PI/2;mirror.position.y=-.015;
  mirror.material.transparent=true;mirror.material.depthWrite=false;mirror.material.blending=THREE.AdditiveBlending;
  return mirror;
}
