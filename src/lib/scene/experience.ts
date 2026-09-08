/**
 * Stage 1 — THE LAND.
 *
 * A procedurally displaced terrain read from above: 30 acres of Bryan County
 * at first light. No glTF, no texture atlases — the whole world is fbm noise
 * in a shader, which keeps the payload at zero bytes and lets the colour world
 * be scrubbed by the hold interaction on a single uniform.
 *
 * `setWorldMix(t)` blends the land palette (t=0) toward the interconnection
 * -queue palette (t=1). The hold button drives it directly.
 */

import * as THREE from 'three';
import { quality, type Tier, TIER_SETTINGS } from '../quality';

const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uAmp;
  varying vec2  vUv;
  varying float vH;

  // Value noise + fbm. Cheap, stable, and good enough at this camera distance.
  vec2 hash(vec2 p){
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(dot(hash(i + vec2(0.0,0.0)), f - vec2(0.0,0.0)),
                   dot(hash(i + vec2(1.0,0.0)), f - vec2(1.0,0.0)), u.x),
               mix(dot(hash(i + vec2(0.0,1.0)), f - vec2(0.0,1.0)),
                   dot(hash(i + vec2(1.0,1.0)), f - vec2(1.0,1.0)), u.x), u.y);
  }
  float fbm(vec2 p){
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }

  void main(){
    vUv = uv;
    vec3 pos = position;
    // Drift the noise field rather than the mesh: no vertex popping at edges.
    vec2 q = pos.xy * 0.06 + vec2(uTime * 0.012, uTime * 0.005);
    float h = fbm(q) * 0.65 + fbm(q * 3.1) * 0.25;
    pos.z += h * uAmp;
    vH = h;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uWorld;      // 0 = the land, 1 = the queue
  uniform vec3  uLandLow;
  uniform vec3  uLandHigh;
  uniform vec3  uWaitLow;
  uniform vec3  uWaitHigh;
  uniform float uFog;
  uniform float uScroll;
  varying vec2  vUv;
  varying float vH;

  float hash1(float n){ return fract(sin(n) * 43758.5453123); }

  void main(){
    float h = clamp(vH * 1.6 + 0.5, 0.0, 1.0);

    vec3 land = mix(uLandLow, uLandHigh, smoothstep(0.30, 0.92, h));
    vec3 wait = mix(uWaitLow, uWaitHigh, smoothstep(0.20, 0.80, h));
    vec3 col  = mix(land, wait, uWorld);

    // Low sun raking across the field, warmer as the world turns.
    float sun = smoothstep(0.35, 1.0, h) * (0.35 + 0.35 * uWorld);
    col += sun * mix(vec3(0.30, 0.36, 0.22), vec3(0.75, 0.16, 0.10), uWorld);

    // Distance haze lifts the horizon; the near field falls away into shadow so
    // the lede and the hold button always land on dark ground.
    float haze = smoothstep(0.25, 1.0, vUv.y) * uFog;
    col = mix(col, mix(vec3(0.72,0.83,0.78), vec3(0.62,0.22,0.18), uWorld), haze * 0.6);
    float near = smoothstep(0.55, 0.0, vUv.y);
    col *= 1.0 - near * 0.72;

    // Volumetric shafts. Faint over the land, and the whole subject of the
    // world we are travelling toward.
    float shafts = 0.0;
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      float x  = hash1(fi * 12.7) * 1.4 - 0.2;
      float w  = 0.012 + hash1(fi * 31.3) * 0.05;
      float sway = sin(uTime * (0.10 + hash1(fi * 5.1) * 0.14) + fi) * 0.025;
      float band = smoothstep(w, 0.0, abs(vUv.x - x - sway));
      shafts += band * (0.35 + 0.65 * hash1(fi * 77.7));
    }
    shafts *= smoothstep(0.0, 0.75, vUv.y);
    col += shafts * mix(vec3(0.05, 0.09, 0.05), vec3(0.55, 0.10, 0.06), uWorld) * (0.35 + uWorld * 1.5);

    // Film grain keeps large flat gradients from banding.
    float g = fract(sin(dot(gl_FragCoord.xy + uTime, vec2(12.9898, 78.233))) * 43758.5453);
    col += (g - 0.5) * 0.035;

    // Vignette so the floating chrome always has contrast to sit on.
    vec2 c = vUv - 0.5;
    col *= 1.0 - dot(c, c) * 1.15;

    gl_FragColor = vec4(col, 1.0);
  }
`;

/** Soft round sprite — the default point material draws hard squares. */
function makeMoteTexture(): THREE.Texture {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

export class Experience {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private terrain!: THREE.Mesh;
  private material!: THREE.ShaderMaterial;
  private motes!: THREE.Points;
  private clock = new THREE.Clock();
  private raf = 0;
  private lastFrame = performance.now();
  private disposeTier: () => void;
  private running = false;
  private scrollProgress = 0;
  private baseZ = 14;
  private baseY = -22;
  private baseLook = 6;

  constructor(private canvas: HTMLCanvasElement, private reducedMotion = false) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x123027, 1);

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 120);
    this.camera.position.set(0, -22, 14);
    this.camera.lookAt(0, 6, 0);

    this.buildTerrain(quality.settings);
    this.buildMotes(quality.settings);

    this.disposeTier = quality.onChange((_tier: Tier, settings) => {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.pixelRatio));
      this.material.uniforms.uFog.value = settings.fog ? 1 : 0;
      this.rebuildTerrain(settings);
    });

    this.resize();
  }

  private buildTerrain(settings: (typeof TIER_SETTINGS)[Tier]) {
    const geo = new THREE.PlaneGeometry(90, 70, settings.terrainSegments, settings.terrainSegments);
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uAmp: { value: 6.5 },
        uWorld: { value: 0 },
        uFog: { value: settings.fog ? 1 : 0 },
        uScroll: { value: 0 },
        // Muted field greens. The bright signal green is reserved for UI that
        // means "live" — putting it on the terrain would spend it for nothing.
        uLandLow: { value: new THREE.Color('#0e2419') },
        uLandHigh: { value: new THREE.Color('#5f8a63') },
        uWaitLow: { value: new THREE.Color('#4d0806') },
        uWaitHigh: { value: new THREE.Color('#e04a2a') },
      },
    });
    this.terrain = new THREE.Mesh(geo, this.material);
    this.terrain.rotation.x = -0.42;
    this.scene.add(this.terrain);
  }

  private rebuildTerrain(settings: (typeof TIER_SETTINGS)[Tier]) {
    const old = this.terrain.geometry;
    this.terrain.geometry = new THREE.PlaneGeometry(90, 70, settings.terrainSegments, settings.terrainSegments);
    old.dispose();
  }

  private buildMotes(settings: (typeof TIER_SETTINGS)[Tier]) {
    const count = settings.particleCount;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 70;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 50;
      pos[i * 3 + 2] = Math.random() * 14;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.motes = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.13,
      map: makeMoteTexture(),
      color: 0xdfffe8,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    this.scene.add(this.motes);
  }

  /** 0..1 through the current stage's scroll track. Dollies the camera. */
  setScrollProgress(p: number): void {
    this.scrollProgress = p;
    this.material.uniforms.uScroll.value = p;
  }

  /** 0 = the land, 1 = the interconnection queue. Driven by the hold ring. */
  setWorldMix(t: number): void {
    this.material.uniforms.uWorld.value = t;
    const clear = new THREE.Color('#123027').lerp(new THREE.Color('#4d0806'), t);
    this.renderer.setClearColor(clear, 1);
  }

  resize = (): void => {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.settings.pixelRatio));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Pull the camera back on narrow viewports so the horizon still reads —
    // re-composing for mobile rather than shrinking the desktop framing.
    // Re-compose for portrait rather than shrinking the desktop framing: pull
    // back, widen the lens, and lift the horizon into the lower third.
    const narrow = w < 700;
    this.baseZ = narrow ? 16 : 14;
    this.baseY = narrow ? -16 : -22;
    this.baseLook = narrow ? 10 : 6;
    this.camera.position.z = this.baseZ;
    this.camera.position.y = this.baseY;
    this.camera.fov = narrow ? 58 : 38;
    this.camera.lookAt(0, this.baseLook, 0);
    this.camera.updateProjectionMatrix();
  };

  start(): void {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      const now = performance.now();
      quality.sample(now - this.lastFrame);
      this.lastFrame = now;

      const t = this.clock.getElapsedTime();
      this.material.uniforms.uTime.value = this.reducedMotion ? 0 : t;
      if (!this.reducedMotion) {
        this.motes.rotation.z = t * 0.008;
        this.terrain.position.y = Math.sin(t * 0.12) * 0.4;
        // Scroll flies the camera down toward the land and tilts it up.
        const p = this.scrollProgress;
        this.camera.position.z = this.baseZ - p * 7.5;
        this.camera.position.y = this.baseY + p * 5.0;
        this.camera.rotation.z = p * 0.03;
        this.camera.lookAt(0, this.baseLook + p * 4.0, 0);
      }
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  dispose(): void {
    this.stop();
    this.disposeTier();
    this.terrain.geometry.dispose();
    this.material.dispose();
    this.motes.geometry.dispose();
    (this.motes.material as THREE.Material).dispose();
    this.renderer.dispose();
  }
}
