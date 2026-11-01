import * as THREE from 'three';

// A time-varying 3D emission field, integrated through the sphere. There is no
// image of the core: depth, parallax and flow come from local-space samples.
export function createEnergyVolume() {
  const material=new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    uniforms:{time:{value:0},cameraLocal:{value:new THREE.Vector3(0,-.72,6.1)},power:{value:2.3}},
    vertexShader:'varying vec3 local;void main(){local=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec3 local;uniform float time;uniform vec3 cameraLocal;uniform float power;
      float field(vec3 p){
        p.xz=mat2(cos(time*.05),-sin(time*.05),sin(time*.05),cos(time*.05))*p.xz;
        float a=sin(dot(p,vec3(15.7,8.4,11.2))+time*.48+sin(p.y*8.));
        float b=sin(dot(p,vec3(-9.1,17.2,6.7))-time*.35+cos(p.x*10.));
        float c=sin(dot(p,vec3(6.2,-11.4,19.8))+time*.29);
        return pow(max(0.,1.-abs(a*.48+b*.32+c*.20)),14.);
      }
      void main(){vec3 ray=normalize(local-cameraLocal);vec3 p=local+ray*.001;
        float travel=max(0.,-2.*dot(local,ray)),stepSize=travel/28.,trans=1.;vec3 light=vec3(0.);
        for(int i=0;i<28;i++){
          float r=length(p);float falloff=exp(-r*r*5.5)*(1.-smoothstep(.67,.84,r));
          float filament=field(p),hot=exp(-r*r*48.);
          float density=falloff*(.26+filament*2.0);float opacity=1.-exp(-density*stepSize*1.65);
          vec3 color=mix(vec3(.015,.29,1.15),vec3(.14,.95,2.1),filament)+vec3(.15,.8,1.4)*hot;
          light+=trans*opacity*color;trans*=1.-opacity;p+=ray*stepSize;
        }
        float alpha=clamp(1.-trans,.001,.78);gl_FragColor=vec4(light*power/alpha,alpha);
      }`
  });
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(.82,48,32),material);
  mesh.onBeforeRender=(renderer,scene,camera)=>{camera.getWorldPosition(material.uniforms.cameraLocal.value);mesh.worldToLocal(material.uniforms.cameraLocal.value);};
  return {mesh,material,update:time=>material.uniforms.time.value=time};
}
