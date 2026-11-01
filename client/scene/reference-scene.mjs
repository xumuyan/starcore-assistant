import * as THREE from 'three';
import referenceImage from '../hud/jarvis-scene-v3.png';
import { REFERENCE, referenceVertex } from './reference-layout.mjs';
import { random, TAU } from './materials.mjs';

export function createReferenceScene() {
  const group = new THREE.Group();
  let resolveReady, rejectReady;
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  const plate = new THREE.TextureLoader().load(referenceImage, resolveReady, undefined, rejectReady);
  plate.colorSpace = THREE.SRGBColorSpace;
  const geometry = new THREE.PlaneGeometry(1, 1, 240, 140);
  const material = new THREE.ShaderMaterial({
    uniforms: { plate: { value: plate }, time: { value: 0 }, energy: { value: 0 } },
    vertexShader: 'varying vec2 uv0;void main(){uv0=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `uniform sampler2D plate;uniform float time;uniform float energy;varying vec2 uv0;
      mat2 rotate(float a){return mat2(cos(a),-sin(a),sin(a),cos(a));}
      vec2 planet(vec2 uv,vec2 center,vec2 radius,float phase){
        vec2 delta=vec2(sin(time*.10+phase)*.0011,cos(time*.075+phase)*.00065);
        vec2 p=(uv-center)/radius;float mask=1.-smoothstep(1.1,2.0,length(p));uv-=delta*mask;
        p=(uv-center)/radius;float surface=1.-smoothstep(.65,.98,length(p));
        return mix(uv,center+rotate(time*.018)*p*radius,surface*.55);
      }
      void main(){vec2 uv=uv0;
        vec2 core=(uv-vec2(.5,.658))/vec2(.137,.215);float inside=1.-smoothstep(.45,1.,length(core));
        float turn=sin(time*.12)*.009+sin(time*.28)*.002;
        uv+=((rotate(turn)*core-core)*vec2(.137,.215))*inside;
        uv+=vec2(sin(core.y*16.+time*.65),cos(core.x*18.-time*.55))*.00020*inside*(.5+energy);
        vec2 floorCenter=vec2(.5,.387), p=(uv-floorCenter)/vec2(.42,.057);
        float disk=1.-smoothstep(.70,1.05,length(p));
        // Preserve the photographed concentric rings. Animate their illumination
        // instead of warping the floor pixels into an unrelated ellipse.
        uv=planet(uv,vec2(.1226,.6525),vec2(.0105,.0185),0.);
        uv=planet(uv,vec2(.2123,.576),vec2(.006,.0106),1.7);
        uv=planet(uv,vec2(.735,.715),vec2(.0084,.015),3.4);
        uv=planet(uv,vec2(.932,.832),vec2(.0114,.0202),5.1);
        vec4 color=texture2D(plate,uv);
        float sky=smoothstep(.43,.55,uv0.y)*smoothstep(.05,.23,abs(uv0.x-.5));
        float twinkle=sin(time*(.65+fract(sin(dot(floor(uv0*vec2(320.,180.)),vec2(12.98,78.23)))*43758.)*.6)+uv0.x*360.+uv0.y*190.);
        float bright=smoothstep(.08,.55,max(color.r,max(color.g,color.b)));
        color.rgb*=1.+twinkle*bright*sky*.065;
        float sweep=pow(max(0.,cos(atan(p.y,p.x)-time*.21)),18.);
        color.rgb*=1.+disk*bright*(sweep*.12+sin(time*.5)*.014);
        color.rgb*=1.+inside*(sin(time*.7)*.018+energy*.06);
        gl_FragColor=vec4(color.rgb,1.);
        #include <colorspace_fragment>
      }`,
    depthWrite: true, depthTest: true, toneMapped: false,
  });
  const surface = new THREE.Mesh(geometry, material); group.add(surface);
  const pointGeometry = new THREE.BufferGeometry(), count = 420;
  const points = new Float32Array(count * 3), seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = random(i + 12) * TAU, r = .35 + random(i + 19) * .85, z = random(i + 61) * .8 - .2;
    points.set([Math.cos(a) * r, .74 + Math.sin(a) * r, z], i * 3); seeds[i] = random(i + 38);
  }
  pointGeometry.setAttribute('position', new THREE.BufferAttribute(points, 3)); pointGeometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
  const particles = new THREE.Points(pointGeometry, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, toneMapped: false,
    uniforms: { time: { value: 0 }, pixelRatio: { value: 1 } },
    vertexShader: `attribute float seed;uniform float time;uniform float pixelRatio;varying float opacity;
      void main(){vec3 p=position;float a=time*(.025+seed*.045);float y=p.y-.74;p.xy=mat2(cos(a),-sin(a),sin(a),cos(a))*vec2(p.x,y);p.y+=.74;
      vec4 v=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*v;gl_PointSize=(1.+seed)*pixelRatio;opacity=.12+seed*.22;}`,
    fragmentShader: 'varying float opacity;void main(){float r=length(gl_PointCoord-.5);if(r>.5)discard;gl_FragColor=vec4(.45,.81,1.,pow(1.-r*2.,2.)*opacity);}'
  })); group.add(particles);
  function resize(aspect) {
    const positions = geometry.getAttribute('position'), uv = geometry.getAttribute('uv');
    for (let i = 0; i < positions.count; i++) { const p = referenceVertex(uv.getX(i), uv.getY(i), aspect); positions.setXYZ(i, p.x, p.y, p.z); }
    positions.needsUpdate = true; geometry.computeBoundingSphere();
  }
  function update(time, energy, pixelRatio) {
    material.uniforms.time.value = time; material.uniforms.energy.value = energy;
    particles.material.uniforms.time.value = time; particles.material.uniforms.pixelRatio.value = pixelRatio;
  }
  function diagnostics() {
    const t = material.uniforms.time.value;
    return { mode: 'layered-reference', coreFlow: t * .12, floorFlow: t * .021, starTime: t, planetFlow: t * .018, particleTime: particles.material.uniforms.time.value };
  }
  function dispose() { geometry.dispose(); material.dispose(); plate.dispose(); pointGeometry.dispose(); particles.material.dispose(); }
  return { group, ready, resize, update, diagnostics, dispose, reference: REFERENCE };
}
