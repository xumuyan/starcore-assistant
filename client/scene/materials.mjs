import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const rose = 0xcc9ba6, pale = 0xe7d0d5, amber = 0xffc477;
export function random(seed) { const value = Math.sin(seed * 127.1 + 41.7) * 43758.5453; return value - Math.floor(value); }
export function emissive(color, opacity = .6) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
}
export function glowTexture() {
  const data = new Uint8Array(64 * 64 * 4);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const radius = Math.hypot((x - 31.5) / 31.5, (y - 31.5) / 31.5), i = (y * 64 + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = 255;
    data[i + 3] = Math.round(255 * Math.max(0, Math.exp(-radius * radius * 8) - .0004));
  }
  const texture = new THREE.DataTexture(data, 64, 64); texture.needsUpdate = true; return texture;
}

// One time coordinate drives every layer so reduced motion and hidden tabs also
// freeze the pedestal, planets and stars, rather than only the main core.
export function worldPose(time) {
  return {
    inner: time * .07,
    outer: -time * .027,
    sweep: time * .13,
    stars: time * .003,
    planetOrbit: time * .016,
    planetSpin: time * .09,
    reflection: .16 + Math.sin(time * .55) * .015,
  };
}
