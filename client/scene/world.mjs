import * as THREE from 'three';
import { TAU, rose, pale, amber, random, emissive, glowTexture, worldPose } from './materials.mjs';

function floorRing(radius, width, color, opacity, arc = TAU) {
  const mesh = new THREE.Mesh(new THREE.RingGeometry(radius - width, radius, Math.max(20, Math.ceil(arc * 60)), 1, 0, arc), emissive(color, opacity));
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

export function createWorld() {
  const group = new THREE.Group(), pedestal = new THREE.Group(), inner = new THREE.Group(), outer = new THREE.Group(), scanner = new THREE.Group();
  pedestal.position.y = -.64; pedestal.scale.z = .52;
  group.add(pedestal); pedestal.add(inner, outer, scanner);
  // Analytical, derivative-antialiased rings stay continuous at the grazing
  // floor angle. Subpixel RingGeometry edges otherwise break into dotted arcs.
  const footprint = new THREE.Mesh(new THREE.PlaneGeometry(6.7, 6.7), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec2 p;void main(){p=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec2 p;
      float ring(float r,float at,float width){float aa=fwidth(r)*.85;return 1.-smoothstep(width-aa,width+aa,abs(r-at));}
      void main(){float r=length(p);float a=ring(r,.48,.003)*.2+ring(r,.67,.005)*.25+ring(r,.96,.003)*.23+
      ring(r,1.25,.008)*.65+ring(r,1.38,.003)*.2+ring(r,1.74,.004)*.26+ring(r,2.13,.008)*.5+
      ring(r,2.24,.004)*.25+ring(r,2.81,.003)*.18+ring(r,3.25,.003)*.15;
      if(a<.001)discard;gl_FragColor=vec4(.22,.66,.92,min(.8,a));}`
  }));
  footprint.rotation.x = -Math.PI / 2; pedestal.add(footprint);
  for (let i = 0; i < 16; i++) {
    const arc = floorRing(i % 2 ? 2.19 : 1.32, i % 2 ? .022 : .032, i % 7 ? pale : amber, i % 3 ? .35 : .8, .09 + random(i + 33) * .26);
    arc.rotation.z = i / 16 * TAU; (i % 2 ? outer : inner).add(arc);
  }
  const tickCount = 320, tickMaterial = emissive(rose, .48);
  const ticks = new THREE.InstancedMesh(new THREE.BoxGeometry(.006, .008, .040), tickMaterial, tickCount), tick = new THREE.Object3D();
  for (let i = 0; i < tickCount; i++) {
    const a = i / tickCount * TAU, radius = i % 2 ? 2.30 : 1.48;
    tick.position.set(Math.cos(a) * radius, .008, Math.sin(a) * radius); tick.rotation.y = -a + Math.PI / 2;
    tick.scale.z = i % 10 ? 1 : 2.7; tick.updateMatrix(); ticks.setMatrixAt(i, tick.matrix);
    ticks.setColorAt(i, new THREE.Color(i % 47 ? rose : amber).multiplyScalar(i % 5 ? .45 : 1.5));
  }
  outer.add(ticks);
  const scan = new THREE.Mesh(new THREE.RingGeometry(.37, 2.25, 80, 1, 0, .42), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec2 p;void main(){p=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'varying vec2 p;void main(){float a=atan(p.y,p.x);float r=length(p);float alpha=smoothstep(0.,.42,a)*.12*(1.-smoothstep(1.7,2.25,r));gl_FragColor=vec4(.14,.60,1.,alpha);}'
  }));
  scan.rotation.x = -Math.PI / 2; scanner.add(scan);
  // A static footprint and moving small highlights read as a powered platform;
  // reflection brightness changes slightly without changing the platform scale.
  const reflection = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 6.5), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { brightness: { value: .16 } },
    vertexShader: 'varying vec2 uv0;void main(){uv0=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'varying vec2 uv0;uniform float brightness;void main(){float r=length((uv0-.5)*2.);float glow=exp(-r*r*16.);gl_FragColor=vec4(.04,.42,.9,glow*brightness);}'
  }));
  reflection.rotation.x = -Math.PI / 2; reflection.position.y = -.009; pedestal.add(reflection);
  const sparks = new THREE.Group(); pedestal.add(sparks);
  const texture = glowTexture();
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * TAU, r = i % 2 ? 2.16 : 1.29;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, color: i % 4 ? rose : amber, blending: THREE.AdditiveBlending, transparent: true, opacity: .8, depthWrite: false }));
    s.position.set(Math.cos(a) * r, .018, Math.sin(a) * r); s.scale.set(.11,.11,1); sparks.add(s);
  }
  const beam = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, color: 0xc38895, blending: THREE.AdditiveBlending, transparent: true, opacity: .28, depthWrite: false }));
  beam.position.set(0, -.05, -.02); beam.scale.set(.07, 1.15, 1); group.add(beam);
  const starGeometry = new THREE.BufferGeometry(), count = 1100;
  const positions = new Float32Array(count * 3), seeds = new Float32Array(count);
  function positionStars(aspect) {
    for (let i = 0; i < count; i++) {
      const z = -2 - random(i + 902) * 9, depth = 6.1 - z;
      const x = (random(i + 401) * 2 - 1), y = random(i + 607) * 1.57 - .57;
      positions.set([x * depth * .384 * aspect, y * depth * .384, z], i * 3); seeds[i] = random(i + 35);
    }
    starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starGeometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
  }
  positionStars(16 / 9);
  const stars = new THREE.Points(starGeometry, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { time: { value: 0 }, pixelRatio: { value: 1 } },
    vertexShader: `attribute float seed;uniform float time;uniform float pixelRatio;varying float brightness;varying float tint;
      void main(){vec3 p=position;p.x+=sin(time*.08+seed*70.)*.16;p.y+=sin(time*.06+seed*33.)*.045;
      vec4 v=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*v;
      gl_PointSize=(1.4+pow(seed,8.)*4.5)*pixelRatio*9./(-v.z);
      brightness=(.38+seed*.5)*(.72+.28*sin(time*(.45+seed*.8)+seed*50.));tint=seed;}`,
    fragmentShader: `varying float brightness;varying float tint;void main(){vec2 p=gl_PointCoord-.5;float r=length(p);if(r>.5)discard;
      float glow=pow(max(0.,1.-r*2.),2.);vec3 color=tint>.97?vec3(1.,.65,.28):mix(vec3(.20,.48,.85),vec3(.65,.87,1.),tint);
      gl_FragColor=vec4(color,glow*brightness);}`
  }));
  group.add(stars);

  const planetGeometry = new THREE.SphereGeometry(1, 40, 28);
  const planetMaterial = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: `varying vec3 n;varying vec3 local;varying vec3 viewDirection;void main(){local=position;n=normalize(normalMatrix*normal);vec4 v=modelViewMatrix*vec4(position,1.);viewDirection=normalize(-v.xyz);gl_Position=projectionMatrix*v;}`,
    fragmentShader: `varying vec3 n;varying vec3 local;varying vec3 viewDirection;
      float noise(vec3 p){return sin(p.x*5.+sin(p.z*4.))*sin(p.y*7.+cos(p.x*3.))*.5+.5;}
      void main(){vec3 normal=normalize(n);float light=max(0.,dot(normal,normalize(vec3(-.7,.55,.65))));
      float cloud=noise(local*1.5)*.4+noise(local*3.2)*.12+sin(local.y*16.+noise(local*2.)*3.)*.06;
      vec3 surface=mix(vec3(.006,.019,.036),vec3(.035,.19,.30),cloud);
      float rim=pow(1.-max(0.,dot(normal,normalize(viewDirection))),3.5);
      gl_FragColor=vec4(surface*(.13+light*1.8)+vec3(.10,.52,.80)*rim*(.18+light*.65),1.);}`
  });
  const slots = [[-.80,.42,-.4,.15],[-.58,-.07,-.8,.075],[.63,.78,-.8,.12],[.84,1.62,-1.9,.18]];
  const planets = slots.map((slot, i) => {
    const mesh = new THREE.Mesh(planetGeometry, planetMaterial); mesh.scale.setScalar(slot[3]); mesh.rotation.set(.25, i, .22); group.add(mesh);
    return { mesh, slot, originX: 0, phase: i * 1.7 };
  });
  function resize(aspect) {
    positionStars(aspect);
    for (const planet of planets) planet.originX = planet.slot[0] * (6.1 - planet.slot[2]) * .384 * aspect;
  }
  resize(16 / 9);
  let pose = worldPose(0);
  function update(time, energy, pixelRatio) {
    pose = worldPose(time);
    inner.rotation.y = pose.inner; outer.rotation.y = pose.outer; scanner.rotation.y = pose.sweep; sparks.rotation.y = -pose.sweep * .7;
    reflection.material.uniforms.brightness.value = pose.reflection + energy * .055;
    stars.rotation.z = Math.sin(pose.stars) * .015; stars.material.uniforms.time.value = time; stars.material.uniforms.pixelRatio.value = pixelRatio;
    for (const { mesh, slot, originX, phase } of planets) {
      mesh.position.set(originX + Math.sin(pose.planetOrbit + phase) * .12, slot[1] + Math.sin(pose.planetOrbit * .8 + phase) * .045, slot[2]);
      mesh.rotation.y = phase + pose.planetSpin;
    }
  }
  return { group, pedestal, inner, outer, scanner, stars, planets, resize, update, diagnostics: () => ({ platformAngle: pose.inner, sweepAngle: pose.sweep, starTime: stars.material.uniforms.time.value, planetAngle: planets[0].mesh.rotation.y }) };
}
