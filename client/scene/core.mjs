import * as THREE from 'three';
import plasmaImage from '../assets/PlasmaSurface-v4.png';
import { TAU, cyan, pale, amber, random, emissive, glowTexture } from './materials.mjs';
function line(points, color = cyan, opacity = .35, closed = true) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  return closed ? new THREE.LineLoop(geometry, material) : new THREE.Line(geometry, material);
}
function circle(radius, z = 0, count = 256) {
  return Array.from({ length: count }, (_, i) => new THREE.Vector3(Math.cos(i / count * TAU) * radius, Math.sin(i / count * TAU) * radius, z));
}
function torus(radius, thickness, material, arc = TAU) {
  return new THREE.Mesh(new THREE.TorusGeometry(radius, thickness, 5, Math.max(24, Math.ceil(arc * 60)), arc), material);
}
export function createCore() {
  const group = new THREE.Group(); group.position.y = .78;
  const tracks = [], texture = glowTexture();
  const plasmaTexture = new THREE.TextureLoader().load(plasmaImage); plasmaTexture.colorSpace = THREE.SRGBColorSpace;
  function flare(color, size, opacity, parent = group) {
    const object = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
    object.scale.set(size, size, 1); parent.add(object); return object;
  }
  const aura = flare(0x1789ef, 2.5, .13), hot = flare(0x59dfff, .66, .85), center = flare(0xe0fbff, .22, 1);
  center.material.color.setRGB(1.3,3.4,5.5); hot.material.color.setRGB(.25,1.05,2.1);
  const horizontal = flare(pale, 1, .47); horizontal.scale.set(1.9, .045, 1);
  const vertical = flare(cyan, 1, .19); vertical.scale.set(.025, 1.8, 1);

  const shell = new THREE.Mesh(new THREE.SphereGeometry(.70, 64, 40), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.FrontSide,
    uniforms: { energy: { value: 0 }, plasma: { value: plasmaTexture } },
    vertexShader: `varying vec3 vN; varying vec3 vP; varying vec3 vLocal;
      void main(){vLocal=normalize(position);vec4 p=modelViewMatrix*vec4(position,1.);vN=normalize(normalMatrix*normal);vP=p.xyz;gl_Position=projectionMatrix*p;}`,
    fragmentShader: `varying vec3 vN; varying vec3 vP; varying vec3 vLocal; uniform float energy; uniform sampler2D plasma;
      void main(){float rim=pow(1.-abs(dot(normalize(vN),normalize(-vP))),2.4);
      vec4 textureColor=texture2D(plasma,vec2(.5)+vLocal.xy*.46);
      gl_FragColor=vec4(textureColor.rgb*(.73+energy*.18)+vec3(.015,.12,.22)*rim,textureColor.a*(.48+rim*.2));}`
  })); group.add(shell);

  const grid = new THREE.Group(); group.add(grid);
  for (let i = -4; i <= 4; i++) {
    const latitude = i * .255, radius = Math.sqrt(1 - Math.sin(latitude) ** 2);
    const points = Array.from({ length: 180 }, (_, j) => new THREE.Vector3(radius * Math.cos(j / 180 * TAU), Math.sin(latitude), radius * Math.sin(j / 180 * TAU)));
    grid.add(line(points, 0x3aabdd, i % 2 ? .035 : .06));
  }
  for (let i = 0; i < 12; i++) {
    const ring = line(circle(1.01), 0x4fb6e4, .035); ring.rotation.y = i / 12 * Math.PI; grid.add(ring);
  }
  tracks.push({ object: grid, axis: 'y', speed: .075 });

  const filaments = new THREE.Group(); group.add(filaments);
  for (let i = 0; i < 18; i++) {
    const points = [];
    for (let j = 0; j < 60; j++) {
      const t = j / 60 * TAU, radius = .28 + random(i + 10) * .59;
      points.push(new THREE.Vector3(Math.cos(t) * radius, Math.sin(t) * radius, Math.sin(t * (2 + i % 3) + i) * radius * .48));
    }
    const curve = new THREE.CatmullRomCurve3(points, true);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 140, i % 5 ? .0018 : .0034, 4, true), emissive(i % 6 ? 0x37b9ff : pale, .23));
    tube.rotation.set(random(i + 5) * Math.PI, random(i + 23) * Math.PI, random(i + 78) * Math.PI);
    filaments.add(tube);
  }
  tracks.push({ object: filaments, axis: 'y', speed: -.14 }); tracks.push({ object: filaments, axis: 'x', speed: .055 });

  function instrumentRing(radius, rotation, speed, count = 180, width = .022) {
    const gimbal = new THREE.Group(); gimbal.rotation.set(...rotation); group.add(gimbal);
    const spin = new THREE.Group(); gimbal.add(spin);
    spin.add(torus(radius, .017, new THREE.MeshStandardMaterial({ color: 0x39627a, emissive: 0x144764, emissiveIntensity: .8, metalness: .72, roughness: .3 })));
    spin.add(torus(radius + .017, .0055, emissive(0x4ac6fa, .67)));
    spin.add(torus(radius + .028, .0017, emissive(0x85ddff, .32)));
    spin.add(torus(radius - .026, .002, emissive(0x3a91ba, .55)));
    // Segmented alloy faces supply mechanical depth around the inner plasma.
    // Instancing keeps the detailed belt to two draw calls per orbital plane.
    const panelCount = 64;
    const plates = new THREE.InstancedMesh(new THREE.RingGeometry(radius - .035, radius + .045, 8, 1, 0, TAU / panelCount * .76), new THREE.MeshStandardMaterial({ color: 0x204b66, emissive: 0x082638, metalness: .82, roughness: .27, side: THREE.DoubleSide }), panelCount);
    const marks = new THREE.InstancedMesh(new THREE.BoxGeometry(.011, .033, .009), new THREE.MeshBasicMaterial({ color: pale }), panelCount);
    const panel = new THREE.Object3D();
    for (let i = 0; i < panelCount; i++) {
      const a = i / panelCount * TAU;
      panel.position.set(0, 0, .014); panel.rotation.set(0, 0, a); panel.updateMatrix(); plates.setMatrixAt(i, panel.matrix);
      panel.position.set(Math.cos(a) * (radius + .007), Math.sin(a) * (radius + .007), .026);
      panel.rotation.z = a - Math.PI / 2; panel.updateMatrix(); marks.setMatrixAt(i, panel.matrix);
      marks.setColorAt(i, new THREE.Color(i % 16 === 0 ? amber : cyan).multiplyScalar(i % 4 ? .25 : 1.1));
    }
    spin.add(plates, marks);
    const ticks = new THREE.InstancedMesh(new THREE.BoxGeometry(.006, width, .006), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .72 }), count);
    const transform = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const a = i / count * TAU; transform.position.set(Math.cos(a) * radius, Math.sin(a) * radius, .006);
      transform.rotation.z = a - Math.PI / 2; transform.scale.set(1, i % 10 ? 1 : 2.5, 1); transform.updateMatrix();
      ticks.setMatrixAt(i, transform.matrix); ticks.setColorAt(i, new THREE.Color(i % 31 ? cyan : amber).multiplyScalar(i % 3 ? .5 : 1.1));
    }
    spin.add(ticks);
    for (let i = 0; i < 12; i++) {
      const arc = .09 + random(i + radius) * .22, piece = torus(radius, .013, emissive(i % 4 ? pale : amber, .8), arc);
      piece.rotation.z = i / 12 * TAU + random(i) * .08; spin.add(piece);
    }
    const orb = new THREE.Mesh(new THREE.SphereGeometry(.017, 10, 8), emissive(pale, 1)); orb.position.x = radius; spin.add(orb);
    const point = flare(cyan, .15, .9, orb); point.position.z = .015;
    tracks.push({ object: spin, axis: 'z', speed });
    return gimbal;
  }
  instrumentRing(1.18, [.12, -.18, -.12], .105, 240, .025);
  instrumentRing(1.29, [.12, -.18, -.12], -.046, 280, .017);
  const verticalRing = instrumentRing(1.37, [.16, 1.06, .27], -.12, 180, .018);
  const diagonalRing = instrumentRing(1.29, [.66, -.57, -.48], .16, 160, .015);
  const equator = instrumentRing(1.81, [1.21, .13, -.15], -.085, 160, .012); equator.scale.x = 1.12;
  instrumentRing(1.09, [-.63, .38, .64], -.07, 160, .014);

  const count = 2400, positions = new Float32Array(count * 3), seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const z = random(i + 81) * 2 - 1, theta = random(i + 97) * TAU, r = .18 + random(i + 17) ** .45 * 1.1;
    positions.set([r * Math.sqrt(1 - z * z) * Math.cos(theta), r * z, r * Math.sqrt(1 - z * z) * Math.sin(theta)], i * 3); seeds[i] = random(i + 41);
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
  const particles = new THREE.Points(geometry, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { time: { value: 0 }, energy: { value: 0 }, pixelRatio: { value: 1 } },
    vertexShader: `attribute float seed; uniform float time; uniform float energy; uniform float pixelRatio; varying float vSeed;
      void main(){vSeed=seed;float a=time*(.035+seed*.09);vec3 p=position;
      p.xz=mat2(cos(a),-sin(a),sin(a),cos(a))*p.xz;p+=normalize(p)*sin(time*.7+seed*40.)*energy*.018;
      vec4 view=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*view;gl_PointSize=(1.+seed*1.6)*pixelRatio*6./(-view.z);}`,
    fragmentShader: `varying float vSeed;void main(){float r=length(gl_PointCoord-.5);if(r>.5)discard;float a=pow(1.-r*2.,2.);vec3 c=vSeed>.975?vec3(1.,.68,.27):vec3(.33,.8,1.);gl_FragColor=vec4(c,a*(.45+vSeed*.45));}`
  })); group.add(particles);
  function update(time, dt, energy, speed, pixelRatio) {
    for (const track of tracks) track.object.rotation[track.axis] += dt * track.speed * speed;
    verticalRing.rotation.z = .27 + Math.sin(time * .11) * .055;
    diagonalRing.rotation.x = .66 + Math.sin(time * .09) * .04;
    shell.rotation.y = time * .035; shell.rotation.z = Math.sin(time * .09) * .035;
    shell.material.uniforms.energy.value = energy;
    hot.material.opacity = .82 + energy * .18; center.material.opacity = .9 + energy * .1;
    aura.material.opacity = .11 + energy * .07;
    particles.material.uniforms.time.value = time; particles.material.uniforms.energy.value = energy; particles.material.uniforms.pixelRatio.value = pixelRatio;
  }
  return { group, update, tracks, particles };
}
