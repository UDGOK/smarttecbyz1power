/**
 * Electrical / data particle primitives.
 *
 * Four reusable, GPU-cheap effects any stage can drop into its own group:
 *
 *   ArcBolt      branching discharge between two points
 *   DataStream   luminous packets travelling an arbitrary THREE.Curve
 *   FieldLines   current flowing along static field / grid lines
 *   ChargeMotes  drifting charged cloud with occasional spark events
 *
 * House rules these all obey, because they run on top of stages that are
 * already spending their frame budget:
 *
 *   - ONE draw call each. Instanced quads, or a single THREE.Points.
 *   - No renderer, no camera, no loop. The stage owns those; a primitive is
 *     an Object3D plus `update(elapsed, delta, intensity)` plus `dispose()`.
 *   - Nothing accumulates. Motion is a closed form of `elapsed`, and the
 *     0..1 `intensity` only ever gates counts, widths and brightness — so a
 *     scroll scrub backwards lands on exactly the frame it left.
 *   - Bloom-safe. Every fragment alpha is hard-capped below 1 (see the cap
 *     table on each material) so nothing clips to white at bloomStrength 1.35,
 *     and the incoming colour is normalised so its brightest channel is <= 1.
 *   - Mobile-first LOW tier. Fewer instances, but never an empty frame: the
 *     arcs still branch, the packets still read as packets. Overdraw — the
 *     thing that actually kills a mid-range Android — is bounded in *screen*
 *     space: every streak clamps its own pixel width AND its own pixel length
 *     in the vertex shader, so worst-case fill is a number, not a hope.
 *
 * Colour is always a parameter. There is no default colour, and the signal
 * green #7be88a is reserved for UI — never pass it here.
 */

import * as THREE from 'three';
import type { SceneContext, TierSettings } from './types';

/* ------------------------------------------------------------------ *
 * Tier
 * ------------------------------------------------------------------ */

export type ParticleTier = 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * TierSettings carries no name, so read one back out of it. The thresholds
 * sit between the shipped tiers rather than on them, so a stage that hands
 * over a hand-tuned settings object still lands somewhere sane.
 */
export function particleTier(settings: TierSettings): ParticleTier {
  if (settings.particleCount >= 900 && settings.terrainSegments >= 260) return 'HIGH';
  if (settings.particleCount >= 500 || settings.terrainSegments >= 160) return 'MEDIUM';
  return 'LOW';
}

/* ------------------------------------------------------------------ *
 * Small utilities
 * ------------------------------------------------------------------ */

/** Deterministic PRNG (mulberry32). Same seed, same cloud, every reload. */
function rng(seed: number): () => number {
  let s = (seed >>> 0) || 0x9e3779b9;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/**
 * Bloom hygiene, part one: never hand the shader a colour whose brightest
 * channel already exceeds 1. Additive blending plus a 1.35-strength bloom
 * turns any such colour into white, and the world loses its hue.
 */
function safeColor(c: THREE.ColorRepresentation): THREE.Color {
  const col = new THREE.Color(c);
  const m = Math.max(col.r, col.g, col.b);
  if (m > 1) col.multiplyScalar(1 / m);
  return col;
}

/** A colour's own hot core: pushed toward white, but only part way. */
function hotOf(c: THREE.Color, amount = 0.55): THREE.Color {
  return c.clone().lerp(new THREE.Color(1, 1, 1), clamp(amount, 0, 0.75));
}

/* ------------------------------------------------------------------ *
 * Shared GLSL
 * ------------------------------------------------------------------ */

const GLSL_HASH = /* glsl */ `
  float h11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
  float h12(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
  vec2  h22(vec2 p){ vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); q += dot(q, q.yzx + 33.33); return fract((q.xx + q.yz) * q.zy); }
`;

/**
 * Portrait re-lay. A layout composed for 16:9 walks off the sides of a
 * 390px phone; rather than crop it, squeeze it along one axis about a centre.
 * Uniform, so it costs one madd per vertex and is driven straight off the
 * viewport — no rebuild, and it un-squeezes on rotate.
 */
const GLSL_RELAY = /* glsl */ `
  uniform vec3  uRelayCenter;
  uniform vec3  uRelayAxis;
  uniform float uRelayScale;
  vec3 relay(vec3 p){
    vec3 d = p - uRelayCenter;
    return p + uRelayAxis * (dot(d, uRelayAxis) * (uRelayScale - 1.0));
  }
`;

/**
 * View-aligned streak. A point sprite is a square with a soft falloff, which
 * under a real bloom pass turns into a blob; a short tapered streak with a
 * hard head reads as a moving quantum and gives the bloom something specific
 * to catch.
 *
 * Both the width and the length are resolved in *pixels*, not world units:
 *   - a floor, so a far packet never thins into aliasing noise, and so the
 *     same scene on a 390px phone still shows discrete packets;
 *   - a ceiling, so a packet that flies past the near plane cannot smear an
 *     additive quad across the whole screen. That ceiling is the entire
 *     overdraw budget for these effects, and it is why they survive a phone.
 */
const GLSL_STREAK = /* glsl */ `
  uniform float uPxScale;     // world units per CSS px, per unit of view depth
  uniform float uMinPx;       // width floor, CSS px
  uniform float uMaxWidthPx;  // width ceiling, CSS px
  uniform float uMaxLenPx;    // length ceiling, CSS px

  vec3 streakPoint(vec3 headV, vec3 tailV, vec2 q, float width){
    vec2 d = headV.xy - tailV.xy;
    float l = length(d);
    vec2 ax = l > 1e-5 ? d / l : vec2(1.0, 0.0);
    vec2 pe = vec2(-ax.y, ax.x);
    vec3 base = mix(tailV, headV, q.x);
    return base + vec3(pe * (q.y - 0.5) * width, 0.0);
  }

  /** World units in one CSS pixel at this view-space depth. */
  float pxUnit(float viewZ){ return uPxScale * max(-viewZ, 0.001); }

  /** Shorten the tail until the streak fits inside the pixel-length budget. */
  vec3 clampLen(vec3 headV, vec3 tailV, float unit){
    vec3 seg = headV - tailV;
    float l = length(seg.xy);
    float maxL = unit * uMaxLenPx;
    return l > maxL ? headV - seg * (maxL / max(l, 1e-5)) : tailV;
  }
`;

/* ------------------------------------------------------------------ *
 * Base
 * ------------------------------------------------------------------ */

export interface ElectricOptions {
  /**
   * Required. Different worlds are different colours, so nothing here has a
   * default. Do not pass the UI signal green #7be88a.
   */
  color: THREE.ColorRepresentation;
  /** Core / spark colour. Defaults to `color` pushed 55% toward white. */
  hotColor?: THREE.ColorRepresentation;
  /** Quality tier. Drives instance counts, trail length and pixel floors. */
  settings: TierSettings;
  /** Hold a static, fully-populated frame instead of animating. */
  reducedMotion?: boolean;
  /** Seed for the deterministic layout. */
  seed?: number;
  /** Starting intensity 0..1. */
  intensity?: number;
  /** Master alpha multiplier 0..1, on top of the per-material bloom cap. */
  strength?: number;
  /** THREE renderOrder for the primitive's mesh. */
  renderOrder?: number;
  /**
   * Portrait re-lay: how much of the lateral extent to squeeze out at a
   * fully portrait viewport (0 = never re-lay, 0.35 = 35% narrower).
   */
  portraitSquash?: number;
  /** Axis the squash acts along. Defaults to world X. */
  squashAxis?: THREE.Vector3;
}

type UF = { value: number };
type UC = { value: THREE.Color };
type UV3 = { value: THREE.Vector3 };

/**
 * Shared plumbing: the animation clock, the intensity input, the colours,
 * the viewport-derived pixel scales and the portrait re-lay. Subclasses build
 * one mesh into `object3d` and read these uniform objects from their shaders.
 */
export abstract class ElectricPrimitive {
  /** Add this to the stage's group. Transform it like any Object3D. */
  readonly object3d = new THREE.Group();

  protected readonly uTime: UF = { value: 0 };
  protected readonly uIntensity: UF = { value: 1 };
  protected readonly uStrength: UF = { value: 1 };
  protected readonly uColor: UC = { value: new THREE.Color(1, 1, 1) };
  protected readonly uHot: UC = { value: new THREE.Color(1, 1, 1) };

  protected readonly uPxScale: UF = { value: 0.0022 };
  protected readonly uMinPx: UF = { value: 2 };
  protected readonly uMaxWidthPx: UF = { value: 9 };
  protected readonly uMaxLenPx: UF = { value: 64 };
  protected readonly uPixelRatio: UF = { value: 1 };

  protected readonly uRelayCenter: UV3 = { value: new THREE.Vector3() };
  protected readonly uRelayAxis: UV3 = { value: new THREE.Vector3(1, 0, 0) };
  protected readonly uRelayScale: UF = { value: 1 };

  protected settings: TierSettings;
  protected tier: ParticleTier;
  protected reducedMotion: boolean;
  protected seed: number;
  protected portraitSquash: number;
  /** 1 = 16:9 or wider, 0 = square or narrower. Drives the re-lay. */
  protected wideness = 1;
  /** Time the still frame is pinned to. Chosen per primitive. */
  protected stillTime = 7.3;
  private disposed = false;

  constructor(opts: ElectricOptions) {
    this.settings = opts.settings;
    this.tier = particleTier(opts.settings);
    this.reducedMotion = opts.reducedMotion ?? false;
    this.seed = opts.seed ?? 1337;
    this.portraitSquash = clamp(opts.portraitSquash ?? 0.3, 0, 0.75);
    this.uIntensity.value = clamp(opts.intensity ?? 1, 0, 1);
    this.uStrength.value = clamp(opts.strength ?? 1, 0, 1);
    this.setColor(opts.color, opts.hotColor);
    if (opts.squashAxis) this.uRelayAxis.value.copy(opts.squashAxis).normalize();
    this.object3d.frustumCulled = false;
    if (opts.renderOrder !== undefined) this.object3d.renderOrder = opts.renderOrder;
  }

  /** Colour is live — a stage can grade a primitive across a transition. */
  setColor(color: THREE.ColorRepresentation, hot?: THREE.ColorRepresentation): void {
    const base = safeColor(color);
    this.uColor.value.copy(base);
    this.uHot.value.copy(hot !== undefined ? safeColor(hot) : hotOf(base));
  }

  /** 0..1. Scroll drives this; everything downstream is derived from it. */
  setIntensity(v: number): void {
    this.uIntensity.value = clamp(v, 0, 1);
  }

  /** Master alpha, under the per-material bloom cap. Use for world mixes. */
  setStrength(v: number): void {
    this.uStrength.value = clamp(v, 0, 1);
  }

  setReducedMotion(v: boolean): void {
    this.reducedMotion = v;
  }

  /**
   * Feed the viewport in. Three things come out of it:
   *
   *  1. world units per CSS pixel, so streak widths and lengths can be
   *     reasoned about in pixels at any depth;
   *  2. a fatter pixel floor on narrow viewports — a 2px trail that reads
   *     fine on a desktop is a hairline on a phone;
   *  3. the portrait re-lay factor, so a landscape composition squeezes
   *     rather than falling off the sides.
   *
   * devicePixelRatio is kept separate and only applied where the shader
   * genuinely speaks device pixels (gl_PointSize). Widths stay in CSS px, so
   * a 3x phone does not get 3x-fat trails.
   */
  setViewport(camera: THREE.PerspectiveCamera, width: number, height: number, pixelRatio = 1): void {
    const h = Math.max(1, height);
    const w = Math.max(1, width);
    this.uPxScale.value = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5)) / h;
    this.uPixelRatio.value = clamp(pixelRatio, 1, 3);

    const aspect = w / h;
    // 0 at 1:1 or taller, 1 at 16:9 or wider.
    this.wideness = clamp((aspect - 1.0) / (1.78 - 1.0), 0, 1);
    // A phone in portrait gets a thicker floor so packets stay discrete.
    this.uMinPx.value = THREE.MathUtils.lerp(3.2, 2.0, this.wideness);
    this.uRelayScale.value = 1 - this.portraitSquash * (1 - this.wideness);
    this.onViewport(w, h);
  }

  /** Convenience for stages: everything above straight off the SceneContext. */
  setViewportFromContext(ctx: SceneContext): void {
    this.setViewport(ctx.camera, ctx.width, ctx.height, ctx.renderer.getPixelRatio());
  }

  /** Where the portrait squash pinches. Defaults to the primitive's centre. */
  setRelayCenter(p: THREE.Vector3): void {
    this.uRelayCenter.value.copy(p);
  }

  /**
   * Per frame.
   *
   * `elapsed` is the host clock, `delta` the frame time, `intensity` the
   * 0..1 scroll-derived input. Reduced motion pins the clock to a moment
   * chosen so the still frame reads as a working effect, not a dead one.
   */
  update(elapsed: number, delta: number, intensity?: number): void {
    if (intensity !== undefined) this.setIntensity(intensity);
    this.uTime.value = this.reducedMotion ? this.stillTime : elapsed;
    this.onUpdate(this.uTime.value, Math.min(Math.max(delta, 0), 0.1));
  }

  /** Rebuild instance data at a new budget. Materials are kept. */
  setTier(settings: TierSettings): void {
    this.settings = settings;
    this.tier = particleTier(settings);
    this.onTier();
  }

  /** Releases every geometry, material and texture this primitive created. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.object3d.removeFromParent();
    this.object3d.traverse((o) => {
      const mesh = o as Partial<THREE.Mesh> & { isInstancedMesh?: boolean; dispose?: () => void };
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material;
      if (mat) {
        for (const m of Array.isArray(mat) ? mat : [mat]) disposeMaterial(m);
      }
      if (mesh.isInstancedMesh && typeof mesh.dispose === 'function') mesh.dispose();
    });
    this.object3d.clear();
  }

  protected onViewport(_width: number, _height: number): void {}
  protected onUpdate(_time: number, _delta: number): void {}
  protected abstract onTier(): void;
}

/** Materials here own no textures, but dispose defensively anyway. */
function disposeMaterial(mat: THREE.Material): void {
  const rec = mat as unknown as Record<string, unknown>;
  for (const key of Object.keys(rec)) {
    const v = rec[key];
    if (v && typeof v === 'object' && (v as { isTexture?: boolean }).isTexture) {
      (v as THREE.Texture).dispose();
    }
  }
  const uniforms = (mat as THREE.ShaderMaterial).uniforms;
  if (uniforms) {
    for (const key of Object.keys(uniforms)) {
      const v = uniforms[key]?.value as { isTexture?: boolean; dispose?: () => void } | undefined;
      if (v && v.isTexture && typeof v.dispose === 'function') v.dispose();
    }
  }
  mat.dispose();
}

/* ------------------------------------------------------------------ *
 * Instanced quad — the one draw call behind three of the four primitives
 * ------------------------------------------------------------------ */

const QUAD_POS = new Float32Array([0, -0.5, 0, 1, -0.5, 0, 1, 0.5, 0, 0, 0.5, 0]);
const QUAD_UV = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
const QUAD_IDX = [0, 1, 2, 0, 2, 3];

/**
 * A unit quad, stretched along the screen-space velocity in the vertex
 * shader. InstancedBufferGeometry rather than InstancedMesh: nothing here
 * uses a per-instance matrix, so there is no reason to pay for one.
 */
function quadGeometry(count: number): THREE.InstancedBufferGeometry {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(QUAD_POS.slice(), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(QUAD_UV.slice(), 2));
  geo.setIndex(QUAD_IDX.slice());
  geo.instanceCount = count;
  return geo;
}

function additiveMaterial(
  vertexShader: string,
  fragmentShader: string,
  uniforms: Record<string, { value: unknown }>,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: uniforms as THREE.ShaderMaterial['uniforms'],
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

/* ================================================================== *
 * 1. ArcBolt — branching discharge
 * ================================================================== */

export interface ArcBoltOptions extends ElectricOptions {
  /** Discharge origin, in the primitive's parent space. */
  from: THREE.Vector3;
  /** Discharge target. */
  to: THREE.Vector3;
  /** Lateral wander of the trunk, in world units. Default: 8% of the span. */
  jitter?: number;
  /** Strikes per second per bolt. Default 1.6. */
  rate?: number;
  /** How many of the bolt's own slots actually fire at intensity 1. Default 0.85. */
  fireChance?: number;
  /** Branch length as a fraction of the span. Default 0.22. */
  branchLength?: number;
  /** Trunk width in world units. Default: sized from the span. */
  width?: number;
  /** Override the tier's simultaneous-bolt count. */
  bolts?: number;
}

const ARC_TIER: Record<ParticleTier, { bolts: number; segments: number; branches: number; branchSegments: number }> = {
  // A LOW bolt is still a branching discharge — coarser, but it forks.
  HIGH: { bolts: 3, segments: 22, branches: 5, branchSegments: 6 },
  MEDIUM: { bolts: 2, segments: 16, branches: 3, branchSegments: 4 },
  LOW: { bolts: 1, segments: 12, branches: 2, branchSegments: 3 },
};

const ARC_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform float uRate;
  uniform float uFire;
  uniform float uStill;
  uniform vec3  uA;
  uniform vec3  uB;
  uniform vec3  uU;
  uniform vec3  uV;
  uniform vec3  uAxis;
  uniform float uJitter;
  uniform float uBranchLen;

  attribute vec2  aSeg;     // (t0, t1) along the instance's own path
  attribute float aBranch;  // 0 = trunk, >0 = branch id
  attribute float aRoot;    // trunk t the branch leaves from
  attribute float aBolt;
  attribute float aWidth;

  varying vec2  vUv;
  varying float vAmp;
  varying float vBranch;
  varying float vTip;

  ${GLSL_HASH}
  ${GLSL_RELAY}
  ${GLSL_STREAK}

  /**
   * Fractal midpoint displacement. Four octaves of node values interpolated
   * along t, pinned to zero at both ends by the sine envelope — which is what
   * makes it read as a discharge finding a path rather than a drawn zigzag.
   * The whole shape is a function of the strike index, so every strike is a
   * new path with no CPU work and no buffer upload.
   */
  vec2 wander(float t, float seed, int octaves){
    vec2 off = vec2(0.0);
    // Starts well below 1 and falls off slowly: a dominant base octave is one
    // big smooth swoop, which is the difference between a discharge and a
    // drawn curve. The top octaves are finer than the segment spacing, so the
    // polyline undersamples them and kinks at every joint — which is the look.
    float amp = 0.58;
    for (int k = 1; k <= 6; k++){
      if (k > octaves) break;
      float n = exp2(float(k));
      float x = t * n;
      float i = floor(x);
      float f = x - i;
      // Only the base octave is eased. The rest interpolate linearly, which
      // is what true midpoint displacement does and what puts the hard kinks
      // in — smooth every octave and the arc turns into a length of rope.
      f = k <= 1 ? f * f * (3.0 - 2.0 * f) : f;
      vec2 a = h22(vec2(i, seed + float(k) * 13.7)) * 2.0 - 1.0;
      vec2 b = h22(vec2(i + 1.0, seed + float(k) * 13.7)) * 2.0 - 1.0;
      off += mix(a, b, f) * amp;
      amp *= 0.74;
    }
    return off;
  }

  vec3 trunkPt(float t, float seed){
    vec2 off = wander(t, seed, 6);
    float env = pow(sin(3.14159265 * clamp(t, 0.0, 1.0)), 0.7);
    return mix(uA, uB, t) + (uU * off.x + uV * off.y) * uJitter * env;
  }

  vec3 branchPt(float s, float rootT, float seed, float bseed){
    vec3 root = trunkPt(rootT, seed);
    vec2 d = h22(vec2(bseed * 7.13, rootT * 31.7)) * 2.0 - 1.0;
    // Biased forward along the discharge, so branches trail the head.
    vec3 dir = normalize(uU * d.x + uV * d.y + uAxis * 0.45);
    vec2 off = wander(s, seed + bseed * 41.0, 4);
    return root + dir * uBranchLen * s + (uU * off.x + uV * off.y) * uJitter * 0.4 * s;
  }

  void main(){
    vUv = uv;
    vBranch = step(0.5, aBranch);

    // --- flicker: sharp attack, exponential decay, sub-frame stutter ---
    float phase  = uTime * uRate + h11(aBolt * 17.31) * 5.7;
    float strike = floor(phase);
    float life   = fract(phase);
    float slot   = h11(strike * 3.77 + aBolt * 91.3);
    float fire   = step(slot, uFire * (0.18 + 0.82 * uIntensity));
    float att    = smoothstep(0.0, 0.05, life);
    float dec    = exp(-life * 7.5);
    float stut   = 0.55 + 0.45 * step(0.34, h11(strike * 57.1 + floor(life * 24.0) + aBolt * 3.3));
    float amp    = fire * att * dec * stut;
    // Reduced motion holds a mid-decay frame with every bolt lit, so the
    // still image reads as a live discharge rather than a switched-off rig.
    amp = mix(amp, 0.62, uStill);
    vAmp = amp * (0.55 + 0.45 * uIntensity);

    float seed = strike * 13.0 + aBolt * 57.0;

    vec3 head;
    vec3 tail;
    if (vBranch > 0.5) {
      float bseed = aBranch + aBolt * 7.0;
      head = branchPt(aSeg.y, aRoot, seed, bseed);
      tail = branchPt(aSeg.x, aRoot, seed, bseed);
      vTip = aSeg.y;
    } else {
      head = trunkPt(aSeg.y, seed);
      tail = trunkPt(aSeg.x, seed);
      vTip = 0.0;
    }

    vec4 hv = modelViewMatrix * vec4(relay(head), 1.0);
    vec4 tv = modelViewMatrix * vec4(relay(tail), 1.0);
    float unit = pxUnit(mix(tv.z, hv.z, 0.5));
    vec3 tc = clampLen(hv.xyz, tv.xyz, unit);

    // Branches thin toward their tips; the trunk thins toward both terminals,
    // so the discharge is fattest where it is actually carrying.
    float mid = (aSeg.x + aSeg.y) * 0.5;
    float taper = vBranch > 0.5
      ? (1.0 - 0.75 * aSeg.y)
      : (0.55 + 0.45 * sqrt(sin(3.14159265 * mid)));
    float w = clamp(aWidth * taper, unit * uMinPx, unit * uMaxWidthPx) * step(0.0005, amp);
    gl_Position = projectionMatrix * vec4(streakPoint(hv.xyz, tc, uv, w), 1.0);
  }
`;

const ARC_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3  uColor;
  uniform vec3  uHot;
  uniform float uStrength;
  varying vec2  vUv;
  varying float vAmp;
  varying float vBranch;
  varying float vTip;

  void main(){
    float across = abs(vUv.y - 0.5) * 2.0;
    float body   = max(1.0 - across * across, 0.0);
    // A tight core inside a soft body: the channel, then the corona around
    // it. A single wide falloff is what makes an arc read as a drawn stroke.
    float core   = pow(max(1.0 - across, 0.0), 3.5);
    float fade   = mix(1.0, 1.0 - vTip * 0.55, vBranch);

    vec3 col = mix(uColor, uHot, min(core * 0.7, 0.7));
    // Cap: trunk 0.95, branch 0.72 — matched to the power stage's streaks so
    // a 1.35-strength bloom lifts the core without clipping the hue to white.
    float cap = mix(0.95, 0.72, vBranch);
    float a = min(body * (0.30 + 0.70 * core) * vAmp * fade * uStrength, cap);
    if (a <= 0.003) discard;
    gl_FragColor = vec4(col, a);
  }
`;

/**
 * Branching electrical arc between two points.
 *
 * One instanced quad per segment: `segments` for the trunk plus
 * `branches * branchSegments` forks, times the number of simultaneous bolts.
 * The path itself is a four-octave fractal midpoint displacement solved in
 * the vertex shader from the current strike index, so a new strike costs one
 * uniform write, not a buffer upload.
 */
export class ArcBolt extends ElectricPrimitive {
  private mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly uA: UV3 = { value: new THREE.Vector3() };
  private readonly uB: UV3 = { value: new THREE.Vector3() };
  private readonly uU: UV3 = { value: new THREE.Vector3(1, 0, 0) };
  private readonly uV: UV3 = { value: new THREE.Vector3(0, 1, 0) };
  private readonly uAxis: UV3 = { value: new THREE.Vector3(0, 0, 1) };
  private readonly uJitter: UF = { value: 1 };
  private readonly uBranchLen: UF = { value: 1 };
  private readonly uRate: UF = { value: 1.6 };
  private readonly uFire: UF = { value: 0.85 };
  private readonly uStill: UF = { value: 0 };

  private jitterOpt: number | undefined;
  private branchFrac: number;
  private widthOpt: number | undefined;
  private boltsOpt: number | undefined;

  constructor(opts: ArcBoltOptions) {
    super(opts);
    this.stillTime = 4.06; // lands ~6% into a strike: just past the attack.
    this.jitterOpt = opts.jitter;
    this.branchFrac = opts.branchLength ?? 0.22;
    this.widthOpt = opts.width;
    this.boltsOpt = opts.bolts;
    this.uRate.value = opts.rate ?? 1.6;
    this.uFire.value = clamp(opts.fireChance ?? 0.85, 0, 1);
    this.uStill.value = this.reducedMotion ? 1 : 0;

    const mat = additiveMaterial(ARC_VERT, ARC_FRAG, {
      uTime: this.uTime,
      uIntensity: this.uIntensity,
      uStrength: this.uStrength,
      uColor: this.uColor,
      uHot: this.uHot,
      uPxScale: this.uPxScale,
      uMinPx: this.uMinPx,
      uMaxWidthPx: this.uMaxWidthPx,
      uMaxLenPx: this.uMaxLenPx,
      uRelayCenter: this.uRelayCenter,
      uRelayAxis: this.uRelayAxis,
      uRelayScale: this.uRelayScale,
      uA: this.uA,
      uB: this.uB,
      uU: this.uU,
      uV: this.uV,
      uAxis: this.uAxis,
      uJitter: this.uJitter,
      uBranchLen: this.uBranchLen,
      uRate: this.uRate,
      uFire: this.uFire,
      uStill: this.uStill,
    });
    // An arc is short and never near the camera in practice; keep the length
    // ceiling tight so a stack of segments cannot flood a phone's fill rate.
    this.uMaxLenPx.value = 56;
    this.uMaxWidthPx.value = 7;

    this.mesh = new THREE.Mesh(quadGeometry(1), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = opts.renderOrder ?? 6;
    this.object3d.add(this.mesh);

    this.setEndpoints(opts.from, opts.to);
    this.onTier();
  }

  /** Move the discharge. Endpoints are live — attach it to anything. */
  setEndpoints(from: THREE.Vector3, to: THREE.Vector3): void {
    this.uA.value.copy(from);
    this.uB.value.copy(to);
    const axis = this.uAxis.value.copy(to).sub(from);
    const span = axis.length() || 1;
    axis.divideScalar(span);

    // A stable perpendicular frame; the trunk wanders inside it.
    const ref = Math.abs(axis.y) > 0.94 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    this.uU.value.copy(ref).cross(axis).normalize();
    this.uV.value.copy(axis).cross(this.uU.value).normalize();

    this.uJitter.value = this.jitterOpt ?? span * 0.1;
    this.uBranchLen.value = span * this.branchFrac;
    this.uRelayCenter.value.copy(from).add(to).multiplyScalar(0.5);
  }

  /** Strikes per second per bolt. */
  setRate(rate: number): void {
    this.uRate.value = Math.max(0, rate);
  }

  override setReducedMotion(v: boolean): void {
    super.setReducedMotion(v);
    this.uStill.value = v ? 1 : 0;
  }

  protected onTier(): void {
    const t = ARC_TIER[this.tier];
    const bolts = Math.max(1, this.boltsOpt ?? t.bolts);
    const per = t.segments + t.branches * t.branchSegments;
    const count = bolts * per;

    const seg = new Float32Array(count * 2);
    const branch = new Float32Array(count);
    const root = new Float32Array(count);
    const bolt = new Float32Array(count);
    const width = new Float32Array(count);

    const span = this.uA.value.distanceTo(this.uB.value) || 1;
    const baseWidth = this.widthOpt ?? Math.max(0.02, span * 0.012);
    const rand = rng(this.seed ^ 0x51ec7);

    let i = 0;
    for (let b = 0; b < bolts; b++) {
      for (let s = 0; s < t.segments; s++) {
        seg[i * 2] = s / t.segments;
        seg[i * 2 + 1] = (s + 1) / t.segments;
        branch[i] = 0;
        root[i] = 0;
        bolt[i] = b;
        width[i] = baseWidth * (0.85 + rand() * 0.4);
        i++;
      }
      for (let br = 0; br < t.branches; br++) {
        // Branches leave the middle of the run — a fork off the very end
        // reads as a mistake, not a discharge.
        const rt = 0.16 + rand() * 0.66;
        for (let s = 0; s < t.branchSegments; s++) {
          seg[i * 2] = s / t.branchSegments;
          seg[i * 2 + 1] = (s + 1) / t.branchSegments;
          branch[i] = br + 1;
          root[i] = rt;
          bolt[i] = b;
          width[i] = baseWidth * (0.35 + rand() * 0.3);
          i++;
        }
      }
    }

    const geo = quadGeometry(count);
    geo.setAttribute('aSeg', new THREE.InstancedBufferAttribute(seg, 2));
    geo.setAttribute('aBranch', new THREE.InstancedBufferAttribute(branch, 1));
    geo.setAttribute('aRoot', new THREE.InstancedBufferAttribute(root, 1));
    geo.setAttribute('aBolt', new THREE.InstancedBufferAttribute(bolt, 1));
    geo.setAttribute('aWidth', new THREE.InstancedBufferAttribute(width, 1));

    this.mesh.geometry.dispose();
    this.mesh.geometry = geo;
  }

  /** Instances currently drawn — one draw call regardless. */
  get instanceCount(): number {
    return this.mesh.geometry.instanceCount;
  }
}

/* ================================================================== *
 * 2. DataStream — packets along a curve
 * ================================================================== */

export interface DataStreamOptions extends ElectricOptions {
  /** The path packets travel. Sampled once, arc-length uniform. */
  curve: THREE.Curve<THREE.Vector3>;
  /**
   * Packets as a fraction of `settings.particleCount`. Default 0.25 —
   * 275 / 175 / 80 on the shipped HIGH / MEDIUM / LOW tiers.
   */
  density?: number;
  /** Hard packet count, overriding `density`. */
  count?: number;
  /** Laps per second at speed 1. Default 0.18. */
  speed?: number;
  /** Spread of per-packet speed, 0..1. Default 0.7 — a narrow spread reads as a conveyor. */
  speedSpread?: number;
  /** Trail length in path fraction at the mean speed. Default 0.035. */
  trail?: number;
  /** Packet width in world units. Default 0.18. */
  width?: number;
  /** Parallel lanes braided around the path. Default 3. */
  lanes?: number;
  /** Lane radius in world units. Default 0. */
  laneRadius?: number;
  /** Fraction of packets in flight at intensity 0. Default 0.25. */
  minDensity?: number;
  /** Fade packets in and out at the ends of an open path. Default true. */
  fadeEnds?: boolean;
  /** Curve samples baked into the shader, 4..64. Default 32. */
  pathSamples?: number;
  /** Distinct arrival buckets — e.g. one per cabinet. Default 1. */
  targets?: number;
  /** Fired once per packet landing, with the bucket it was assigned. */
  onArrival?: (target: number) => void;
}

const STREAM_TIER: Record<ParticleTier, { trail: number; width: number }> = {
  HIGH: { trail: 1, width: 1 },
  MEDIUM: { trail: 0.85, width: 1.05 },
  // Shorter trails on LOW: trail length is literally fill rate. Slightly
  // fatter packets so they still read as packets at a lower count.
  LOW: { trail: 0.65, width: 1.15 },
};

function streamVert(samples: number): string {
  const n = Math.max(4, Math.min(64, Math.round(samples)));
  return /* glsl */ `
  uniform float uTime;
  uniform float uSpeed;
  uniform float uEmit;
  uniform float uTrail;
  uniform float uFadeEnds;
  uniform vec3  uPath[${n}];

  attribute float aOff;
  attribute float aSpeed;
  attribute float aRank;
  attribute float aWidth;
  attribute vec2  aLane;   // (angle, radius)

  varying vec2  vUv;
  varying float vAlive;
  varying float vFade;
  varying float vHot;

  ${GLSL_RELAY}
  ${GLSL_STREAK}

  /** Catmull-Rom through the baked, arc-length-uniform samples. */
  vec3 pathAt(float t){
    float last = ${(n - 1).toFixed(1)};
    float x = clamp(t, 0.0, 1.0) * last;
    float i = floor(x);
    float f = x - i;
    // Clamped in float, then cast: GLSL ES 1.00 has no integer min/max.
    int i1 = int(i);
    int i0 = int(max(i - 1.0, 0.0));
    int i2 = int(min(i + 1.0, last));
    int i3 = int(min(i + 2.0, last));
    vec3 p0 = uPath[i0];
    vec3 p1 = uPath[i1];
    vec3 p2 = uPath[i2];
    vec3 p3 = uPath[i3];
    vec3 a = 2.0 * p1;
    vec3 b = p2 - p0;
    vec3 c = 2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3;
    vec3 d = -p0 + 3.0 * p1 - 3.0 * p2 + p3;
    return 0.5 * (a + b * f + c * f * f + d * f * f * f);
  }

  void main(){
    vUv = uv;
    // Emission is a threshold on a per-packet rank, not a rebuild: raising
    // intensity opens the gate wider and the stream thickens for free.
    float alive = step(aRank, uEmit);
    vAlive = alive;

    float t = fract(aOff + uTime * uSpeed * aSpeed);
    // A fast packet draws a longer trail than a slow one, which is what
    // stops the stream reading as evenly spaced beads on a wire.
    float dt = clamp(uTrail * (0.4 + 0.6 * aSpeed), 0.004, 0.09);

    vec3 hp = pathAt(t);
    vec3 tp = pathAt(max(t - dt, 0.0));

    // One frame, taken at the head and reused for the tail: the two are a few
    // percent apart, and a per-end frame twists the lane offsets for nothing.
    vec3 tanv = normalize(pathAt(min(t + 0.006, 1.0)) - pathAt(max(t - 0.006, 0.0)) + vec3(1e-6, 0.0, 0.0));
    vec3 upv = abs(tanv.y) > 0.94 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 nrm = normalize(cross(upv, tanv));
    vec3 bin = cross(tanv, nrm);
    vec3 off = (nrm * cos(aLane.x) + bin * sin(aLane.x)) * aLane.y;

    vFade = mix(1.0, sin(3.14159265 * t), uFadeEnds);
    vHot  = smoothstep(0.72, 1.0, t);

    vec4 hv = modelViewMatrix * vec4(relay(hp + off), 1.0);
    vec4 tv = modelViewMatrix * vec4(relay(tp + off), 1.0);
    float unit = pxUnit(mix(tv.z, hv.z, 0.5));
    vec3 tc = clampLen(hv.xyz, tv.xyz, unit);

    float w = aWidth * (0.30 + 0.70 * uv.x) * (0.45 + 0.55 * vFade);
    w = clamp(w, unit * uMinPx, unit * uMaxWidthPx) * alive;
    gl_Position = projectionMatrix * vec4(streakPoint(hv.xyz, tc, uv, w), 1.0);
  }
`;
}

const STREAM_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3  uColor;
  uniform vec3  uHot;
  uniform float uIntensity;
  uniform float uStrength;
  varying vec2  vUv;
  varying float vAlive;
  varying float vFade;
  varying float vHot;

  void main(){
    if (vAlive < 0.5) discard;
    float across = abs(vUv.y - 0.5) * 2.0;
    float body   = max(1.0 - across * across, 0.0);
    float along  = pow(vUv.x, 2.6);
    float core   = smoothstep(0.88, 1.0, vUv.x) * max(1.0 - across * 1.7, 0.0);

    vec3 col = mix(uColor, uHot, min(core * 0.75 + vHot * 0.2, 0.75));
    // Cap 0.95, the same discipline as the power stage's charging quanta: a
    // streak that clips to white loses the colour the world is built on.
    float a = min(body * (along * 0.85 + core * 0.95) * vFade * (0.35 + 0.65 * uIntensity) * uStrength, 0.95);
    if (a <= 0.003) discard;
    gl_FragColor = vec4(col, a);
  }
`;

/**
 * Luminous packets travelling an arbitrary curve.
 *
 * The generalisation of the power stage's charging quanta: one instanced
 * quad per packet, position solved closed-form in the vertex shader from a
 * shared clock, and arrivals detected on the CPU by comparing lap floors —
 * no readback, no per-particle state.
 */
export class DataStream extends ElectricPrimitive {
  private mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly uSpeed: UF = { value: 0.18 };
  private readonly uEmit: UF = { value: 1 };
  private readonly uTrail: UF = { value: 0.035 };
  private readonly uFadeEnds: UF = { value: 1 };
  private readonly uPath: { value: THREE.Vector3[] };

  private readonly samples: number;
  private readonly densityOpt: number;
  private readonly countOpt: number | undefined;
  private readonly spread: number;
  private readonly trailOpt: number;
  private readonly widthOpt: number;
  private readonly lanes: number;
  private readonly laneRadius: number;
  private readonly minDensity: number;
  private readonly targets: number;
  private readonly onArrival: ((target: number) => void) | undefined;

  /** Read back each frame to detect landings. Mirrors the shader exactly. */
  private offs = new Float32Array(0);
  private speeds = new Float32Array(0);
  private ranks = new Float32Array(0);
  private buckets = new Uint16Array(0);
  /** -1 until the first frame, so a late mount does not fire a whole lap of
   *  arrivals in one go. */
  private prevPhase = -1;

  constructor(opts: DataStreamOptions) {
    super(opts);
    this.stillTime = 11.7; // any fixed phase distributes packets; this one is mid-path.
    this.samples = Math.max(4, Math.min(64, Math.round(opts.pathSamples ?? 32)));
    this.densityOpt = opts.density ?? 0.25;
    this.countOpt = opts.count;
    this.spread = clamp(opts.speedSpread ?? 0.7, 0, 1);
    this.trailOpt = opts.trail ?? 0.035;
    this.widthOpt = opts.width ?? 0.18;
    this.lanes = Math.max(1, Math.round(opts.lanes ?? 3));
    this.laneRadius = opts.laneRadius ?? 0;
    this.minDensity = clamp(opts.minDensity ?? 0.25, 0, 1);
    this.targets = Math.max(1, Math.round(opts.targets ?? 1));
    this.onArrival = opts.onArrival;
    this.uSpeed.value = opts.speed ?? 0.18;
    this.uFadeEnds.value = (opts.fadeEnds ?? true) ? 1 : 0;

    this.uPath = { value: Array.from({ length: this.samples }, () => new THREE.Vector3()) };

    const mat = additiveMaterial(streamVert(this.samples), STREAM_FRAG, {
      uTime: this.uTime,
      uIntensity: this.uIntensity,
      uStrength: this.uStrength,
      uColor: this.uColor,
      uHot: this.uHot,
      uPxScale: this.uPxScale,
      uMinPx: this.uMinPx,
      uMaxWidthPx: this.uMaxWidthPx,
      uMaxLenPx: this.uMaxLenPx,
      uRelayCenter: this.uRelayCenter,
      uRelayAxis: this.uRelayAxis,
      uRelayScale: this.uRelayScale,
      uSpeed: this.uSpeed,
      uEmit: this.uEmit,
      uTrail: this.uTrail,
      uFadeEnds: this.uFadeEnds,
      uPath: this.uPath,
    });
    this.uMaxWidthPx.value = 8;
    this.uMaxLenPx.value = 64;

    this.mesh = new THREE.Mesh(quadGeometry(1), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = opts.renderOrder ?? 6;
    this.object3d.add(this.mesh);

    this.setCurve(opts.curve);
    this.onTier();
  }

  /** Re-route the stream. Cheap: it only re-uploads the path uniform. */
  setCurve(curve: THREE.Curve<THREE.Vector3>): void {
    // Spaced (arc-length) rather than raw parameter points, so packet speed
    // is constant along the path instead of racing through the flat parts.
    const pts = curve.getSpacedPoints(this.samples - 1);
    const centre = new THREE.Vector3();
    for (let i = 0; i < this.samples; i++) {
      const p = pts[Math.min(i, pts.length - 1)] ?? new THREE.Vector3();
      this.uPath.value[i]?.copy(p);
      centre.add(p);
    }
    this.uRelayCenter.value.copy(centre.multiplyScalar(1 / this.samples));
  }

  /** Laps per second at speed 1. */
  setSpeed(v: number): void {
    this.uSpeed.value = Math.max(0, v);
  }

  protected override onUpdate(time: number, _delta: number): void {
    // Emission opens with intensity. Reduced motion holds the gate wide so a
    // still frame shows a populated, well-distributed stream.
    const still = this.reducedMotion;
    const floorD = still ? Math.max(this.minDensity, 0.55) : this.minDensity;
    this.uEmit.value = floorD + (1 - floorD) * this.uIntensity.value;

    const phase = time * this.uSpeed.value;
    if (this.onArrival && !still && this.prevPhase >= 0 && phase !== this.prevPhase) {
      const emit = this.uEmit.value;
      const prev = this.prevPhase;
      for (let i = 0; i < this.offs.length; i++) {
        if ((this.ranks[i] as number) > emit) continue;
        const sp = this.speeds[i] as number;
        const o = this.offs[i] as number;
        // A lap boundary crossed between the last frame and this one IS the
        // arrival: exactly one impulse per landing, and no per-packet state.
        if (Math.floor(o + phase * sp) === Math.floor(o + prev * sp)) continue;
        this.onArrival(this.buckets[i] as number);
      }
    }
    this.prevPhase = phase;
  }

  protected onTier(): void {
    const t = STREAM_TIER[this.tier];
    const count = Math.max(
      8,
      Math.min(1200, Math.round(this.countOpt ?? this.settings.particleCount * this.densityOpt)),
    );
    this.uTrail.value = this.trailOpt * t.trail;

    const off = new Float32Array(count);
    const spd = new Float32Array(count);
    const rank = new Float32Array(count);
    const wid = new Float32Array(count);
    const lane = new Float32Array(count * 2);

    this.offs = new Float32Array(count);
    this.speeds = new Float32Array(count);
    this.ranks = new Float32Array(count);
    this.buckets = new Uint16Array(count);

    const rand = rng(this.seed ^ 0xd47a);
    for (let i = 0; i < count; i++) {
      off[i] = rand();
      // A wide speed spread is what stops the stream reading as a conveyor.
      spd[i] = 1 - this.spread * 0.5 + Math.pow(rand(), 1.6) * this.spread;
      rank[i] = rand();
      wid[i] = this.widthOpt * t.width * (0.75 + rand() * 0.5);
      const li = i % this.lanes;
      lane[i * 2] = (li / this.lanes) * Math.PI * 2 + (rand() - 0.5) * 0.5;
      lane[i * 2 + 1] = this.laneRadius * (0.35 + rand() * 0.65);

      this.offs[i] = off[i] as number;
      this.speeds[i] = spd[i] as number;
      this.ranks[i] = rank[i] as number;
      this.buckets[i] = Math.floor(rand() * this.targets) % this.targets;
    }

    const geo = quadGeometry(count);
    geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 1));
    geo.setAttribute('aSpeed', new THREE.InstancedBufferAttribute(spd, 1));
    geo.setAttribute('aRank', new THREE.InstancedBufferAttribute(rank, 1));
    geo.setAttribute('aWidth', new THREE.InstancedBufferAttribute(wid, 1));
    geo.setAttribute('aLane', new THREE.InstancedBufferAttribute(lane, 2));

    this.mesh.geometry.dispose();
    this.mesh.geometry = geo;
  }

  get instanceCount(): number {
    return this.mesh.geometry.instanceCount;
  }
}

/* ================================================================== *
 * 3. FieldLines — current flowing along static lines
 * ================================================================== */

export interface FieldLinesOptions extends ElectricOptions {
  /** The lines. Each is sampled into `segments` instanced quads. */
  lines: THREE.Curve<THREE.Vector3>[];
  /** Override the tier's segments-per-line. */
  segments?: number;
  /** Line width in world units. Default 0.06. */
  width?: number;
  /** Pulse slots along a line. Default 4 — higher packs more current in. */
  frequency?: number;
  /** Pulse travel, line-lengths per second. Default 0.35. */
  flowSpeed?: number;
  /** Head sharpness. Higher is a shorter, harder head. Default 7. */
  sharpness?: number;
  /** Fraction of pulse slots occupied at intensity 1. Default 0.55. */
  pulseDensity?: number;
  /** Always-on brightness of the line itself, 0..1. Default 0.3. */
  base?: number;
  /** Fade the flow out at both ends of each line. Default false. */
  fadeEnds?: boolean;
  /** Reverse the flow direction. Default false. */
  reverse?: boolean;
}

const FIELD_TIER: Record<ParticleTier, { lineScale: number; segments: number }> = {
  HIGH: { lineScale: 1, segments: 20 },
  MEDIUM: { lineScale: 0.7, segments: 14 },
  // LOW keeps roughly half the lines at 9 segments — still a readable weave
  // of current, not a token pair of wires.
  LOW: { lineScale: 0.45, segments: 9 },
};

const FIELD_VERT = /* glsl */ `
  attribute vec3  aP0;
  attribute vec3  aP1;
  attribute vec2  aU;      // (u at p0, u at p1) along the parent line
  attribute float aLine;
  attribute float aWidth;

  varying vec2  vUv;
  varying float vU;
  varying float vLine;

  ${GLSL_RELAY}
  ${GLSL_STREAK}

  void main(){
    vUv = uv;
    vU = mix(aU.x, aU.y, uv.x);
    vLine = aLine;

    vec4 hv = modelViewMatrix * vec4(relay(aP1), 1.0);
    vec4 tv = modelViewMatrix * vec4(relay(aP0), 1.0);
    float unit = pxUnit(mix(tv.z, hv.z, 0.5));
    vec3 tc = clampLen(hv.xyz, tv.xyz, unit);
    float w = clamp(aWidth, unit * uMinPx, unit * uMaxWidthPx);
    gl_Position = projectionMatrix * vec4(streakPoint(hv.xyz, tc, uv, w), 1.0);
  }
`;

const FIELD_FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uIntensity;
  uniform float uStrength;
  uniform vec3  uColor;
  uniform vec3  uHot;
  uniform float uFreq;
  uniform float uFlow;
  uniform float uSharp;
  uniform float uDensity;
  uniform float uBase;
  uniform float uFadeEnds;
  uniform float uDir;

  varying vec2  vUv;
  varying float vU;
  varying float vLine;

  ${GLSL_HASH}

  void main(){
    float across = abs(vUv.y - 0.5) * 2.0;
    float body   = max(1.0 - across * across, 0.0);
    float core   = max(1.0 - across * 2.1, 0.0);

    // The geometry never moves. The pattern is a function of (u - c*t), so
    // what travels is the current, which is the whole point of the primitive.
    float lineSpeed = 0.7 + 0.6 * h11(vLine * 3.13);
    float f = (vU - uTime * uFlow * lineSpeed * uDir) * uFreq + h11(vLine * 7.71) * 13.0;
    float g = fract(f);
    float gate = step(h11(floor(f) * 1.77 + vLine * 31.3), uDensity * (0.25 + 0.75 * uIntensity));
    float pulse = gate * pow(g, uSharp);

    float edge = mix(1.0, smoothstep(0.0, 0.08, vU) * smoothstep(1.0, 0.92, vU), uFadeEnds);

    vec3 col = mix(uColor, uHot, min(pulse * core * 0.8, 0.7));
    // Cap 0.85 for the lit line: it is a broad, always-present element, and a
    // structure that fills the frame has to sit further under the bloom knee
    // than a sparse packet does. The resting line alone tops out at 0.22.
    float lit = uBase * 0.42 + pulse * (0.55 + 0.45 * core);
    float a = min(body * lit * edge * (0.3 + 0.7 * uIntensity) * uStrength, 0.85);
    if (a <= 0.003) discard;
    gl_FragColor = vec4(col, a);
  }
`;

/**
 * Flowing field or grid lines.
 *
 * The lines are static instanced segments; only the light on them moves.
 * Pulse slots are gated by a hash so the traffic is irregular, and each line
 * carries its own phase and speed so the set never pulses in lockstep.
 */
export class FieldLines extends ElectricPrimitive {
  private mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly uFreq: UF = { value: 4 };
  private readonly uFlow: UF = { value: 0.35 };
  private readonly uSharp: UF = { value: 7 };
  private readonly uDensity: UF = { value: 0.55 };
  private readonly uBase: UF = { value: 0.3 };
  private readonly uFadeEnds: UF = { value: 0 };
  private readonly uDir: UF = { value: 1 };

  private lines: THREE.Curve<THREE.Vector3>[];
  private readonly segmentsOpt: number | undefined;
  private readonly widthOpt: number;

  constructor(opts: FieldLinesOptions) {
    super(opts);
    this.stillTime = 3.9;
    this.lines = opts.lines;
    this.segmentsOpt = opts.segments;
    this.widthOpt = opts.width ?? 0.06;
    this.uFreq.value = opts.frequency ?? 4;
    this.uFlow.value = opts.flowSpeed ?? 0.35;
    this.uSharp.value = Math.max(1, opts.sharpness ?? 7);
    this.uDensity.value = clamp(opts.pulseDensity ?? 0.55, 0, 1);
    this.uBase.value = clamp(opts.base ?? 0.3, 0, 1);
    this.uFadeEnds.value = opts.fadeEnds ? 1 : 0;
    this.uDir.value = opts.reverse ? -1 : 1;

    const mat = additiveMaterial(FIELD_VERT, FIELD_FRAG, {
      uTime: this.uTime,
      uIntensity: this.uIntensity,
      uStrength: this.uStrength,
      uColor: this.uColor,
      uHot: this.uHot,
      uPxScale: this.uPxScale,
      uMinPx: this.uMinPx,
      uMaxWidthPx: this.uMaxWidthPx,
      uMaxLenPx: this.uMaxLenPx,
      uRelayCenter: this.uRelayCenter,
      uRelayAxis: this.uRelayAxis,
      uRelayScale: this.uRelayScale,
      uFreq: this.uFreq,
      uFlow: this.uFlow,
      uSharp: this.uSharp,
      uDensity: this.uDensity,
      uBase: this.uBase,
      uFadeEnds: this.uFadeEnds,
      uDir: this.uDir,
    });
    // Lines are the widest-area primitive here, so it gets the tightest
    // ceilings: a grid is many quads and they all overlap near the horizon.
    this.uMaxWidthPx.value = 5;
    this.uMaxLenPx.value = 96;

    this.mesh = new THREE.Mesh(quadGeometry(1), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = opts.renderOrder ?? 5;
    this.object3d.add(this.mesh);

    this.onTier();
  }

  /** Swap the line set — e.g. re-laying a grid for a new viewport. */
  setLines(lines: THREE.Curve<THREE.Vector3>[]): void {
    this.lines = lines;
    this.onTier();
  }

  protected onTier(): void {
    const t = FIELD_TIER[this.tier];
    const segs = Math.max(2, Math.round(this.segmentsOpt ?? t.segments));
    const total = this.lines.length;
    const keep = Math.max(1, Math.min(total, Math.round(total * t.lineScale)));
    // Take an even stride through the set rather than the first N, so a
    // thinned grid stays a grid instead of collapsing to one corner.
    const stride = total / keep;

    const count = keep * segs;
    const p0 = new Float32Array(count * 3);
    const p1 = new Float32Array(count * 3);
    const u = new Float32Array(count * 2);
    const lineId = new Float32Array(count);
    const width = new Float32Array(count);

    const rand = rng(this.seed ^ 0xf1e1d);
    const centre = new THREE.Vector3();
    let i = 0;
    for (let k = 0; k < keep; k++) {
      const curve = this.lines[Math.min(total - 1, Math.floor(k * stride))];
      if (!curve) continue;
      const pts = curve.getSpacedPoints(segs);
      const w = this.widthOpt * (0.8 + rand() * 0.45);
      for (let s = 0; s < segs; s++) {
        const a = pts[s] ?? new THREE.Vector3();
        const b = pts[s + 1] ?? a;
        p0[i * 3] = a.x; p0[i * 3 + 1] = a.y; p0[i * 3 + 2] = a.z;
        p1[i * 3] = b.x; p1[i * 3 + 1] = b.y; p1[i * 3 + 2] = b.z;
        u[i * 2] = s / segs;
        u[i * 2 + 1] = (s + 1) / segs;
        lineId[i] = k;
        width[i] = w;
        centre.add(a);
        i++;
      }
    }
    if (i > 0) centre.multiplyScalar(1 / i);
    this.uRelayCenter.value.copy(centre);

    const geo = quadGeometry(i);
    geo.setAttribute('aP0', new THREE.InstancedBufferAttribute(p0, 3));
    geo.setAttribute('aP1', new THREE.InstancedBufferAttribute(p1, 3));
    geo.setAttribute('aU', new THREE.InstancedBufferAttribute(u, 2));
    geo.setAttribute('aLine', new THREE.InstancedBufferAttribute(lineId, 1));
    geo.setAttribute('aWidth', new THREE.InstancedBufferAttribute(width, 1));

    this.mesh.geometry.dispose();
    this.mesh.geometry = geo;
  }

  get instanceCount(): number {
    return this.mesh.geometry.instanceCount;
  }

  /* --- line generators, so a stage does not have to hand-roll curves --- */

  /**
   * A planar grid, optionally sagging like a catenary so it reads as a field
   * rather than as graph paper. `rows` run along X, `cols` along Z.
   */
  static grid(o: {
    width: number;
    depth: number;
    rows: number;
    cols: number;
    center?: THREE.Vector3;
    sag?: number;
    samples?: number;
  }): THREE.Curve<THREE.Vector3>[] {
    const c = o.center ?? new THREE.Vector3();
    const sag = o.sag ?? 0;
    const n = Math.max(2, o.samples ?? 8);
    const out: THREE.Curve<THREE.Vector3>[] = [];

    const arc = (a: THREE.Vector3, b: THREE.Vector3): THREE.Curve<THREE.Vector3> => {
      if (sag === 0) return new THREE.LineCurve3(a, b);
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const p = a.clone().lerp(b, t);
        p.y -= Math.sin(Math.PI * t) * sag;
        pts.push(p);
      }
      return new THREE.CatmullRomCurve3(pts);
    };

    for (let r = 0; r < o.rows; r++) {
      const z = c.z + (o.rows === 1 ? 0 : (r / (o.rows - 1) - 0.5) * o.depth);
      out.push(arc(
        new THREE.Vector3(c.x - o.width / 2, c.y, z),
        new THREE.Vector3(c.x + o.width / 2, c.y, z),
      ));
    }
    for (let k = 0; k < o.cols; k++) {
      const x = c.x + (o.cols === 1 ? 0 : (k / (o.cols - 1) - 0.5) * o.width);
      out.push(arc(
        new THREE.Vector3(x, c.y, c.z - o.depth / 2),
        new THREE.Vector3(x, c.y, c.z + o.depth / 2),
      ));
    }
    return out;
  }

  /**
   * Streamlines traced through a smooth analytic curl field inside a box —
   * current moving through a volume rather than across a surface.
   */
  static streamlines(o: {
    size: THREE.Vector3;
    count: number;
    center?: THREE.Vector3;
    samples?: number;
    swirl?: number;
    seed?: number;
  }): THREE.Curve<THREE.Vector3>[] {
    const c = o.center ?? new THREE.Vector3();
    const n = Math.max(4, o.samples ?? 14);
    const swirl = o.swirl ?? 1;
    const rand = rng(o.seed ?? 9001);
    const out: THREE.Curve<THREE.Vector3>[] = [];
    const step = o.size.length() / (n * 3);

    for (let i = 0; i < o.count; i++) {
      const p = new THREE.Vector3(
        c.x + (rand() - 0.5) * o.size.x,
        c.y + (rand() - 0.5) * o.size.y,
        c.z + (rand() - 0.5) * o.size.z,
      );
      const pts: THREE.Vector3[] = [p.clone()];
      for (let s = 0; s < n; s++) {
        // A divergence-free-ish field: cheap, smooth, and it never knots.
        const v = new THREE.Vector3(
          Math.sin(p.z * 0.17) * swirl + 0.6,
          Math.sin(p.x * 0.21) * swirl * 0.5,
          Math.cos(p.y * 0.19) * swirl,
        ).normalize();
        p.addScaledVector(v, step);
        pts.push(p.clone());
      }
      out.push(new THREE.CatmullRomCurve3(pts));
    }
    return out;
  }
}

/* ================================================================== *
 * 4. ChargeMotes — ambient charged cloud
 * ================================================================== */

export interface ChargeMotesOptions extends ElectricOptions {
  /** Box the cloud fills, in the primitive's parent space. */
  size: THREE.Vector3;
  /** Box centre. Default origin. */
  center?: THREE.Vector3;
  /** Motes as a fraction of `settings.particleCount`. Default 0.45. */
  density?: number;
  /** Hard mote count, overriding `density`. */
  count?: number;
  /** Drift amplitude in world units. Default: 4% of the box. */
  drift?: number;
  /** Drift rate. Default 0.25. */
  driftSpeed?: number;
  /** Upward creep in world units per second. Default 0. */
  rise?: number;
  /** Mote radius in world units. Default: sized from the box. */
  moteSize?: number;
  /** Spark attempts per second per mote. Default 0.35. */
  sparkRate?: number;
  /** Chance an attempt fires at intensity 1. Default 0.22. */
  sparkChance?: number;
  /** Fraction of the cloud visible at intensity 0. Default 0.4. */
  minDensity?: number;
}

const MOTE_TIER: Record<ParticleTier, { size: number; maxPx: number }> = {
  HIGH: { size: 1, maxPx: 4.5 },
  MEDIUM: { size: 1.1, maxPx: 4.2 },
  // Slightly larger motes at a lower count so the cloud still reads as a
  // cloud on a phone, with a tighter pixel ceiling so it cannot burn fill.
  LOW: { size: 1.25, maxPx: 3.6 },
};

const MOTE_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform float uEmit;
  uniform float uDrift;
  uniform float uDriftSpeed;
  uniform float uRise;
  uniform float uHeight;
  uniform float uSparkRate;
  uniform float uSparkChance;
  uniform float uSizeScale;
  uniform float uPixelRatio;
  uniform float uMotePx;   // floor, CSS px
  uniform float uMaxPx;    // ceiling, CSS px
  uniform float uStill;

  attribute vec3  aSeed;
  attribute float aSize;
  attribute float aRank;

  varying float vSpark;
  varying float vAlive;

  ${GLSL_HASH}
  ${GLSL_RELAY}

  void main(){
    vAlive = step(aRank, uEmit);

    // Closed-form drift. No integration, so scrubbing scroll backwards puts
    // every mote back exactly where it was.
    float t = uTime * uDriftSpeed;
    vec3 p = position;
    p.x += sin(t * (0.7 + aSeed.x) + aSeed.y * 6.2831) * uDrift;
    p.y += sin(t * (0.5 + aSeed.y) + aSeed.z * 6.2831) * uDrift * 0.75;
    p.z += cos(t * (0.6 + aSeed.z) + aSeed.x * 6.2831) * uDrift;
    if (uRise > 0.0) {
      float h = max(uHeight, 0.001);
      p.y = uRelayCenter.y - h * 0.5 + mod(p.y - uRelayCenter.y + h * 0.5 + uTime * uRise, h);
    }

    // Spark: an attempt every 1/uSparkRate seconds, most of which fail.
    float sp = uTime * uSparkRate * (0.6 + 0.8 * aSeed.x) + aSeed.y * 11.0;
    float k = floor(sp);
    float l = fract(sp);
    float fire = step(h11(k + aSeed.z * 97.0), uSparkChance * (0.25 + 0.75 * uIntensity));
    float spark = fire * smoothstep(0.0, 0.05, l) * exp(-l * 9.0);
    // Still frames keep a scattered subset lit rather than freezing them all.
    spark = mix(spark, fire * 0.7, uStill);
    vSpark = spark;

    vec4 mv = modelViewMatrix * vec4(relay(p), 1.0);
    gl_Position = projectionMatrix * mv;
    float px = aSize * (1.0 + spark * 2.0) * uSizeScale / max(-mv.z, 0.01);
    // Clamped in device pixels: a 3x phone must not get 3x-fat motes, and a
    // mote that drifts past the near plane must not become a screen-filler.
    gl_PointSize = clamp(px, uMotePx * uPixelRatio, uMaxPx * uPixelRatio) * vAlive;
  }
`;

const MOTE_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3  uColor;
  uniform vec3  uHot;
  uniform float uIntensity;
  uniform float uStrength;
  varying float vSpark;
  varying float vAlive;

  void main(){
    if (vAlive < 0.5) discard;
    vec2 c = gl_PointCoord - 0.5;
    float d2 = dot(c, c);
    if (d2 > 0.25) discard;
    // A tight disc with a hard centre, not a soft blob: a blob is what
    // explodes under bloom, and a hard core is what the bloom wants to catch.
    float disc = 1.0 - smoothstep(0.05, 0.25, d2);
    float core = 1.0 - smoothstep(0.0, 0.035, d2);

    vec3 col = mix(uColor, uHot, min(vSpark * 0.8, 0.7));
    // Cap 0.55 at rest, 0.90 mid-spark. A resting cloud is hundreds of quads
    // of ambience and must stay well under the knee; a spark is one point for
    // a tenth of a second and can be allowed to bloom.
    float cap = mix(0.55, 0.90, clamp(vSpark, 0.0, 1.0));
    float a = min((disc * 0.34 + core * 0.55) * (0.35 + 0.65 * uIntensity) * (0.55 + vSpark * 1.5) * uStrength, cap);
    if (a <= 0.003) discard;
    gl_FragColor = vec4(col, a);
  }
`;

/**
 * A drifting cloud of charged points with occasional spark events.
 *
 * One THREE.Points, one draw call. Drift is a closed form of the clock, the
 * spark is a hash-gated attack/decay, and the size is resolved and clamped in
 * device pixels so the cloud costs the same on a 3x phone as on a desktop.
 */
export class ChargeMotes extends ElectricPrimitive {
  private points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly uEmit: UF = { value: 1 };
  private readonly uDrift: UF = { value: 0.4 };
  private readonly uDriftSpeed: UF = { value: 0.25 };
  private readonly uRise: UF = { value: 0 };
  private readonly uHeight: UF = { value: 1 };
  private readonly uSparkRate: UF = { value: 0.35 };
  private readonly uSparkChance: UF = { value: 0.22 };
  private readonly uSizeScale: UF = { value: 450 };
  /** Motes size themselves in CSS px directly, so they keep their own floor:
   *  the streaks' narrow-viewport floor would turn ambience into confetti. */
  private readonly uMotePx: UF = { value: 1.2 };
  private readonly uMaxPx: UF = { value: 4.5 };
  private readonly uStill: UF = { value: 0 };

  private readonly size: THREE.Vector3;
  private readonly densityOpt: number;
  private readonly countOpt: number | undefined;
  private readonly moteSizeOpt: number | undefined;
  private readonly minDensity: number;

  constructor(opts: ChargeMotesOptions) {
    super(opts);
    this.stillTime = 5.5;
    this.size = opts.size.clone();
    this.densityOpt = opts.density ?? 0.45;
    this.countOpt = opts.count;
    this.moteSizeOpt = opts.moteSize;
    this.minDensity = clamp(opts.minDensity ?? 0.4, 0, 1);
    this.uDrift.value = opts.drift ?? Math.max(this.size.x, this.size.y, this.size.z) * 0.04;
    this.uDriftSpeed.value = opts.driftSpeed ?? 0.25;
    this.uRise.value = Math.max(0, opts.rise ?? 0);
    this.uHeight.value = this.size.y;
    this.uSparkRate.value = Math.max(0, opts.sparkRate ?? 0.35);
    this.uSparkChance.value = clamp(opts.sparkChance ?? 0.22, 0, 1);
    this.uStill.value = this.reducedMotion ? 1 : 0;
    this.uRelayCenter.value.copy(opts.center ?? new THREE.Vector3());
    this.uMaxPx.value = MOTE_TIER[this.tier].maxPx;

    const mat = additiveMaterial(MOTE_VERT, MOTE_FRAG, {
      uTime: this.uTime,
      uIntensity: this.uIntensity,
      uStrength: this.uStrength,
      uColor: this.uColor,
      uHot: this.uHot,
      uMotePx: this.uMotePx,
      uPixelRatio: this.uPixelRatio,
      uRelayCenter: this.uRelayCenter,
      uRelayAxis: this.uRelayAxis,
      uRelayScale: this.uRelayScale,
      uEmit: this.uEmit,
      uDrift: this.uDrift,
      uDriftSpeed: this.uDriftSpeed,
      uRise: this.uRise,
      uHeight: this.uHeight,
      uSparkRate: this.uSparkRate,
      uSparkChance: this.uSparkChance,
      uSizeScale: this.uSizeScale,
      uMaxPx: this.uMaxPx,
      uStill: this.uStill,
    });

    this.points = new THREE.Points(new THREE.BufferGeometry(), mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = opts.renderOrder ?? 4;
    this.object3d.add(this.points);

    this.onTier();
  }

  override setReducedMotion(v: boolean): void {
    super.setReducedMotion(v);
    this.uStill.value = v ? 1 : 0;
  }

  protected override onViewport(_width: number, _height: number): void {
    // gl_PointSize = aSize * uSizeScale / -viewZ. uPxScale is world units per
    // CSS pixel per unit depth, so its reciprocal converts world radius to
    // CSS pixels directly; the ratio then takes it to device pixels.
    this.uSizeScale.value = this.uPixelRatio.value / Math.max(this.uPxScale.value, 1e-9);
  }

  protected override onUpdate(_time: number, _delta: number): void {
    const floorD = this.reducedMotion ? Math.max(this.minDensity, 0.7) : this.minDensity;
    this.uEmit.value = floorD + (1 - floorD) * this.uIntensity.value;
  }

  protected onTier(): void {
    const t = MOTE_TIER[this.tier];
    this.uMaxPx.value = t.maxPx;
    const count = Math.max(
      16,
      Math.min(4000, Math.round(this.countOpt ?? this.settings.particleCount * this.densityOpt)),
    );

    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const rank = new Float32Array(count);

    const c = this.uRelayCenter.value;
    const base = this.moteSizeOpt ?? Math.max(this.size.x, this.size.y, this.size.z) * 0.0035;
    const rand = rng(this.seed ^ 0x3c0a7);

    for (let i = 0; i < count; i++) {
      // Stratified along the long axis so a thinned cloud stays even instead
      // of clumping — this is what keeps a still frame well distributed.
      const strat = (i + rand()) / count - 0.5;
      pos[i * 3] = c.x + (rand() - 0.5) * this.size.x;
      pos[i * 3 + 1] = c.y + strat * this.size.y;
      pos[i * 3 + 2] = c.z + (rand() - 0.5) * this.size.z;
      seed[i * 3] = rand();
      seed[i * 3 + 1] = rand();
      seed[i * 3 + 2] = rand();
      size[i] = base * t.size * (0.6 + rand() * 0.9);
      rank[i] = rand();
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aRank', new THREE.BufferAttribute(rank, 1));

    this.points.geometry.dispose();
    this.points.geometry = geo;
  }

  get instanceCount(): number {
    return this.points.geometry.getAttribute('position')?.count ?? 0;
  }
}
