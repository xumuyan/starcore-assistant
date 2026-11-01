const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

// Camera motion is independent of the HTML overlay and of mesh geometry scale.
// A continuous critically damped-like response replaces binary CSS breathing.
export class CoreMotion {
  constructor() {
    this.phase = 'idle'; this.input = 0; this.output = 0; this.energy = 0;
    this.zoom = 0; this.distance = 6.1; this.reduced = false;
    this.pointer = { x: 0, y: 0 }; this.x = 0; this.y = 0;
  }
  setZoom(value) { this.zoom = clamp(Number.isFinite(value) ? value : 0, 0, 1); }
  tick(dt) {
    dt = clamp(dt, 0, .06);
    const ease = this.reduced ? 1 : 1 - Math.exp(-dt * 7);
    const level = this.phase === 'speaking' ? this.output : ['listening', 'armed', 'transcribing'].includes(this.phase) ? this.input : 0;
    this.energy += ((this.reduced ? 0 : clamp(level, 0, 1)) - this.energy) * ease;
    const distance = 6.1 - this.zoom * 1.05 - this.energy * .32;
    this.distance += (distance - this.distance) * ease;
    this.x += ((this.reduced ? 0 : this.pointer.x * .12) + this.zoom * .15 - this.x) * ease;
    this.y += (this.zoom * .19 + (this.reduced ? 0 : this.pointer.y * .04) - this.y) * ease;
    this.input *= Math.exp(-dt * 4); this.output *= Math.exp(-dt * 5);
    return { distance: this.distance, x: this.x, y: this.y, energy: this.energy, speed: this.reduced ? 0 : 1 + this.energy * .7 };
  }
}
