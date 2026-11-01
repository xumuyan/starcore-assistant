export const REFERENCE = Object.freeze({ width: 1672, height: 941, cameraZ: 6.1, fov: 42 });
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// A shallow, inferred depth field preserves the exact selected artwork in the
// home view. It is a 2.5D projection, not a reconstructed mechanical 3D model.
export function referenceDepth(u, v) {
  const x = (u - .5) / .195, y = (v - .655) / .30, radius = Math.hypot(x, y);
  const core = (1 - smooth(.72, 1.16, radius)) * (.20 + Math.sqrt(Math.max(0, 1 - Math.min(1, radius) ** 2)) * .75);
  const floor = (1 - smooth(.32, .46, v)) * .20;
  return core - floor;
}

export function referenceVertex(u, v, aspect) {
  const { width, height, cameraZ, fov } = REFERENCE;
  const planeHeight = 2 * cameraZ * Math.tan(fov * Math.PI / 360) * Math.max(1, aspect / (width / height));
  const z = referenceDepth(u, v), perspective = (cameraZ - z) / cameraZ;
  return { x: (u - .5) * planeHeight * width / height * perspective, y: (v - .5) * planeHeight * perspective, z };
}
