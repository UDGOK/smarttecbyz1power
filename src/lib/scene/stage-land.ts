/**
 * Stage 1 — THE LAND.
 *
 * Thirty acres of Bryan County read from above at first light. The whole world
 * is fbm noise in a shader: no glTF, no texture atlases, zero bytes of media
 * above the fold, and a colour world that a single uniform can scrub.
 */

import * as THREE from 'three';
import type { SceneContext, StageScene, TierSettings } from './types';

const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uAmp;
  varying vec2  vUv;
  varying float vH;

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
  uniform float uWorld;
  uniform vec3  uLandLow;
  uniform vec3  uLandHigh;
  uniform vec3  uWaitLow;
  uniform vec3  uWaitHigh;
  uniform float uFog;
  varying vec2  vUv;
  varying float vH;

  float hash1(float n){ return fract(sin(n) * 43758.5453123); }

  void main(){
    float h = clamp(vH * 1.6 + 0.5, 0.0, 1.0);

    vec3 land = mix(uLandLow, uLandHigh, smoothstep(0.30, 0.92, h));
    vec3 wait = mix(uWaitLow, uWaitHigh, smoothstep(0.20, 0.80, h));
    vec3 col  = mix(land, wait, uWorld);

    float sun = smoothstep(0.35, 1.0, h) * (0.35 + 0.35 * uWorld);
    col += sun * mix(vec3(0.30, 0.36, 0.22), vec3(0.75, 0.16, 0.10), uWorld);

    float haze = smoothstep(0.25, 1.0, vUv.y) * uFog;
    col = mix(col, mix(vec3(0.72,0.83,0.78), vec3(0.62,0.22,0.18), uWorld), haze * 0.6);
    float near = smoothstep(0.55, 0.0, vUv.y);
    col *= 1.0 - near * 0.72;

    // Volumetric shafts: faint over the land, the whole subject of the world
    // we are travelling toward.
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

    float g = fract(sin(dot(gl_FragCoord.xy + uTime, vec2(12.9898, 78.233))) * 43758.5453);
    col += (g - 0.5) * 0.035;

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

export class LandScene implements StageScene {
  readonly id = 'land';

  private group = new THREE.Group();
  private terrain!: THREE.Mesh;
  private material!: THREE.ShaderMaterial;
  private motes!: THREE.Points;
  private moteTex!: THREE.Texture;

  private baseZ = 14;
  private baseY = -22;
  private baseLook = 6;

  build(ctx: SceneContext, settings: TierSettings): void {
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uAmp: { value: 6.5 },
        uWorld: { value: 0 },
        uFog: { value: settings.fog ? 1 : 0 },
        // Muted field greens. The bright signal green is reserved for UI that
        // means "live" — putting it on the terrain would spend it for nothing.
        uLandLow: { value: new THREE.Color('#0e2419') },
        uLandHigh: { value: new THREE.Color('#5f8a63') },
        uWaitLow: { value: new THREE.Color('#4d0806') },
        uWaitHigh: { value: new THREE.Color('#e04a2a') },
      },
    });

    this.terrain = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 70, settings.terrainSegments, settings.terrainSegments),
      this.material,
    );
    this.terrain.rotation.x = -0.42;
    this.group.add(this.terrain);

    this.moteTex = makeMoteTexture();
    this.group.add(this.buildMotes(settings));

    ctx.scene.add(this.group);
  }

  private buildMotes(settings: TierSettings): THREE.Points {
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
      map: this.moteTex,
      color: 0xdfffe8,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    return this.motes;
  }

  update(elapsed: number, _delta: number, scroll: number, ctx: SceneContext): void {
    this.material.uniforms.uTime.value = elapsed;
    if (ctx.reducedMotion) return;

    this.motes.rotation.z = elapsed * 0.008;
    this.terrain.position.y = Math.sin(elapsed * 0.12) * 0.4;

    // Scroll flies the camera down toward the land and tilts it up.
    const cam = ctx.camera;
    cam.position.z = this.baseZ - scroll * 7.5;
    cam.position.y = this.baseY + scroll * 5.0;
    cam.rotation.z = scroll * 0.03;
    cam.lookAt(0, this.baseLook + scroll * 4.0, 0);
  }

  setWorldMix(t: number): void {
    this.material.uniforms.uWorld.value = t;
  }

  onTier(settings: TierSettings, _ctx: SceneContext): void {
    this.material.uniforms.uFog.value = settings.fog ? 1 : 0;
    const old = this.terrain.geometry;
    this.terrain.geometry = new THREE.PlaneGeometry(90, 70, settings.terrainSegments, settings.terrainSegments);
    old.dispose();

    this.group.remove(this.motes);
    this.motes.geometry.dispose();
    (this.motes.material as THREE.Material).dispose();
    this.group.add(this.buildMotes(settings));
  }

  frame(ctx: SceneContext): void {
    // Re-compose for portrait rather than shrinking the desktop framing.
    const narrow = ctx.width < 700;
    this.baseZ = narrow ? 16 : 14;
    this.baseY = narrow ? -16 : -22;
    this.baseLook = narrow ? 10 : 6;
    ctx.camera.position.set(0, this.baseY, this.baseZ);
    ctx.camera.fov = narrow ? 58 : 38;
    ctx.camera.lookAt(0, this.baseLook, 0);
    ctx.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.terrain.geometry.dispose();
    this.material.dispose();
    this.motes.geometry.dispose();
    (this.motes.material as THREE.Material).dispose();
    this.moteTex.dispose();
    this.group.clear();
  }
}
