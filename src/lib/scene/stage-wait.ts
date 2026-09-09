/**
 * Stage 2 — THE WAIT.
 *
 * The pressure beat. Everyone else who wants to build an AI data centre is
 * standing in an interconnection queue waiting for energised capacity, and
 * the GPUs were never the constraint. This world is that queue — a file of
 * identical waiting forms receding to a vanishing point that never arrives,
 * under volumetric shafts that rake down and never move anything along.
 *
 * The register is the reference's stage 2: a deep blood-red field, hard light
 * columns, one form standing monumentally in them, and nothing at all
 * happening. The stages either side of this one travel; this one is held. Its
 * only rhythm is the grudging shuffle the visitor drags out of it by scrolling.
 *
 * Same rules as the other four stages: everything procedural, no glTF, no
 * texture atlases, no downloads. Every form, shaft, mist slab and mote is a
 * Three.js primitive with a hand-written shader on it, so the payload is zero
 * bytes and the whole colour world scrubs on one shared uniform.
 *
 * `setWorldMix(t)` dissolves the queue toward stage 3 (behind-the-meter solar):
 * the file empties from the far end forward, the blood red desaturates to dark
 * gold, and a low sun burns through exactly where the vanishing point was —
 * the queue we never joined, opening onto the power we already own. Uniform
 * writes only: allocation-free, and exactly reversible under the hold ring.
 *
 * The host owns the renderer, the camera and the loop. This file owns one
 * THREE.Group, the camera framing it borrows back on dispose, and nothing else.
 */

import * as THREE from 'three';
import type { SceneContext, StageScene, TierSettings } from './types';

/* ------------------------------------------------------------------ palette */

/** Read straight off `tokens.css` so the canvas and the chrome never drift. */
const PAL = {
  wait: '#8c110c',      // --c-wait, the queue
  deep: '#4d0806',      // --c-wait-deep, the ground it stands on
  pit: '#1a0402',       // below the horizon, where the chrome has to read
  ember: '#ff4a22',     // the light itself — the only hot thing in the world
  ash: '#ffb9a0',       // settling dust
  power: '#f2b705',     // --c-power, the world we dissolve toward
  powerDeep: '#7a5a02', // --c-power-deep
} as const;

/* --------------------------------------------------------------- composition
 *
 * Fixed dimensions. A tier changes how *many* forms are in the file and how
 * finely the ground is tessellated — never how the shot is composed.
 */

const FORM_H = 3.6;        // a waiting form, roughly two and a half people tall
const PITCH = 3.4;         // pair to pair down the file
const QUEUE_Z0 = 5.0;      // the first pair, already alongside the lens
const CURTAIN_R = 200;     // the red wall the world ends against
const CURTAIN_H = 520;
const FLOOR_W = 560;
const FLOOR_D = 620;
const FLOOR_Z = -200;

/** Uniform-array slots for the shafts. Unused slots carry zero intensity. */
const MAX_SHAFTS = 8;

/** Shaft throw. Tall enough that the open top of the cone is never in shot. */
const CONE_H = 150;

/**
 * The clock is pinned here when the visitor asked for no motion. Not zero —
 * at t=0 the shafts sit at their seeded phase but the slow descending tick on
 * the curtain would be parked at the top of frame. Eight seconds in, the still
 * frame reads as a composed photograph rather than a first frame.
 */
const STILL_T = 8.0;

/* ------------------------------------------------------------------ shaders */

/** Value noise + fbm, same construction as the stage-1 terrain. */
const NOISE = /* glsl */ `
  float hash11(float n){ return fract(sin(n * 17.13) * 43758.5453123); }
  vec2 hash22(vec2 p){
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  }
  float vnoise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(dot(hash22(i + vec2(0.0,0.0)), f - vec2(0.0,0.0)),
                   dot(hash22(i + vec2(1.0,0.0)), f - vec2(1.0,0.0)), u.x),
               mix(dot(hash22(i + vec2(0.0,1.0)), f - vec2(0.0,1.0)),
                   dot(hash22(i + vec2(1.0,1.0)), f - vec2(1.0,1.0)), u.x), u.y);
  }
  float fbm(vec2 p){
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * vnoise(p); p *= 2.07; a *= 0.5; }
    return v;
  }
`;

/**
 * The shaft table. Positions are computed once in TypeScript and shared by
 * every material that has to agree with them — the cones themselves, the pools
 * they burn into the ground, and the side-light on the forms. Nothing
 * re-derives them from a hash, because a float hash does not survive the trip
 * between double-precision JS and single-precision GLSL.
 */
const SHAFTS = /* glsl */ `
  uniform float uShaftX[${MAX_SHAFTS}];
  uniform float uShaftZ[${MAX_SHAFTS}];
  uniform float uShaftW[${MAX_SHAFTS}];
  uniform float uShaftI[${MAX_SHAFTS}];

  /** How lit a point on the ground plane is, ignoring occlusion. */
  float shaftPool(vec2 xz, float spreadX, float spreadZ){
    float lit = 0.0;
    for (int i = 0; i < ${MAX_SHAFTS}; i++) {
      float w  = max(uShaftW[i], 0.001);
      float dx = (xz.x - uShaftX[i]) / (w * spreadX);
      float dz = (xz.y - uShaftZ[i]) / (w * spreadZ);
      lit += uShaftI[i] * exp(-(dx * dx + dz * dz));
    }
    return lit;
  }
`;

/* --- the curtain: the red wall the world ends against -------------------- */

const CURTAIN_VERT = /* glsl */ `
  varying vec2 vUv;
  void main(){
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const CURTAIN_FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uWorld;
  uniform float uSunU;     // azimuth of the vanishing point, in uv.x
  uniform float uHTop;     // uv.y the top of the frame lands on, at this lens
  uniform vec2  uRes;
  uniform vec3  uWait;
  uniform vec3  uDeep;
  uniform vec3  uPit;
  uniform vec3  uEmber;
  uniform vec3  uPower;
  uniform vec3  uPowerDeep;

  varying vec2 vUv;

  ${NOISE}

  void main(){
    // The cylinder is centred on the origin, so uv.y = 0.5 is exactly the
    // horizon the ground plane meets. hh renormalises that to 0 at the
    // horizon and 1 at the top of the frame, so every ramp below is written
    // in the frame the visitor actually sees rather than in cylinder space —
    // which is also what lets portrait re-compose by changing one uniform.
    float hh = clamp((vUv.y - 0.5) / max(uHTop - 0.5, 0.001), 0.0, 1.0);

    // This must be exactly the colour the ground fades to, or the horizon
    // shows as a seam across the whole width of the frame.
    vec3 horizon = mix(uDeep * 0.95, uPowerDeep * 0.9, uWorld * 0.85);

    // Blood red, climbing out of the horizon into the light.
    vec3 col = mix(horizon, uWait, smoothstep(-0.06, 0.52, hh));
    col = mix(col, uWait * 1.06, smoothstep(0.30, 1.0, hh));

    // The light columns. Clustered on the vanishing point rather than spread
    // evenly, so the brightest part of the wall is the part of the queue you
    // can never reach. The cluster is a third of the way around the
    // cylinder, which is a frame and a half wide.
    float cols = 0.0;
    for (int i = 0; i < 11; i++) {
      float fi = float(i);
      float x  = uSunU + (hash11(fi * 3.31) - 0.5) * 0.34;
      float w  = 0.006 + hash11(fi * 7.71) * 0.020;
      // A sway so slow it barely registers as motion at all. That is the point.
      float sway = sin(uTime * (0.031 + hash11(fi * 2.37) * 0.043) + fi * 2.1) * 0.0042;
      float dx = abs(fract(vUv.x - x - sway + 0.5) - 0.5);
      float band = smoothstep(w, 0.0, dx);
      cols += band * (0.30 + 0.70 * hash11(fi * 11.93));
    }
    // Raking down: full strength overhead, thinning out before the ground.
    cols *= smoothstep(0.02, 0.62, hh);
    float breath = 0.86 + 0.14 * fbm(vec2(vUv.x * 7.0, hh * 2.2 - uTime * 0.021));
    cols *= breath;

    // Held well off clipping. The host grades this stage through a bloom pass,
    // and a wall already at full red would bloom into a flat sheet with no
    // columns left in it at all.
    col += cols * uEmber * 0.26;
    // A general plume of light behind the file, so the vanishing point is the
    // brightest thing in the frame and the rest of the wall falls away from it.
    float plume = exp(-pow((abs(fract(vUv.x - uSunU + 0.5) - 0.5)) * 13.0, 2.0));
    col += uEmber * plume * smoothstep(0.0, 0.8, hh) * 0.06;

    // One slow band descending the wall — a clock in a room where nothing else
    // keeps time. Roughly a minute a pass; you notice it only if you wait.
    float band = 1.06 - fract(uTime * 0.0165) * 1.20;
    float tick = exp(-pow((hh - band) * 5.0, 2.0));
    col += tick * uEmber * 0.075;

    /* --- the turn toward the gold world ---------------------------------- */
    float w = smoothstep(0.03, 1.0, uWorld);

    // Dark gold, low key: this is dusk over a solar field, not daylight.
    vec3 gold = mix(horizon, uPowerDeep, smoothstep(0.0, 0.45, hh));
    gold = mix(gold, uPowerDeep * 0.72, smoothstep(0.35, 1.0, hh));

    // The low sun, sitting on the horizon exactly where the file vanished.
    vec2 sp = vec2(abs(fract(vUv.x - uSunU + 0.5) - 0.5) * 3.1,
                   (hh - 0.045) * 0.62);
    float disc = exp(-dot(sp, sp) * 900.0);
    float glow = exp(-dot(sp, sp) * 26.0);
    gold += uPower * (disc * 2.2 + glow * 0.45);
    // The columns survive the turn as a warm haze rather than hard shafts.
    gold += cols * uPower * 0.20;

    col = mix(col, gold, w);

    // Grain, same reason as every other stage: large flat fields of one hue
    // stair-step on 8-bit displays long before anything else in the frame does.
    float g = fract(sin(dot(gl_FragCoord.xy + uTime, vec2(12.9898, 78.233))) * 43758.5453);
    col += (g - 0.5) * 0.040;

    // Vignette, so the display type and the hold ring always have ground.
    vec2 q = gl_FragCoord.xy / max(uRes, vec2(1.0)) - 0.5;
    q.x *= 1.05;
    col *= 1.0 - dot(q, q) * 0.95;

    gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
  }
`;

/* --- the ground the queue stands on -------------------------------------- */

const FLOOR_VERT = /* glsl */ `
  uniform float uAmp;
  uniform float uQx;
  varying vec3  vPosW;
  varying float vView;

  ${NOISE}

  void main(){
    vec3 pos = position;
    // A long, low swell — a dry pan, not terrain. Flattened along the file so
    // no form ever floats above the ground or sinks into it.
    float swell = fbm(pos.xy * 0.0085) * 1.4 + fbm(pos.xy * 0.031) * 0.35;
    float keep = smoothstep(0.0, 16.0, abs(pos.x - uQx));
    pos.z += swell * uAmp * keep;

    vec4 world = modelMatrix * vec4(pos, 1.0);
    vPosW = world.xyz;
    vec4 mv = viewMatrix * world;
    vView = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const FLOOR_FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uWorld;
  uniform float uFog;
  uniform float uQx;
  uniform float uRank;     // half-gap between the two files
  uniform float uPitch;
  uniform float uContact;  // 1 on tiers that can afford contact shading
  uniform vec2  uRes;
  uniform vec3  uDeep;
  uniform vec3  uPit;
  uniform vec3  uEmber;
  uniform vec3  uPower;
  uniform vec3  uPowerDeep;

  varying vec3  vPosW;
  varying float vView;

  ${NOISE}
  ${SHAFTS}

  void main(){
    // Dry and compacted. The ground is never the subject here — it exists to
    // carry the pools of light and to give the near-field somewhere to go dark.
    float grit = fbm(vPosW.xz * 0.42) * 0.5 + 0.5;
    vec3 col = mix(uPit, uDeep * 0.92, 0.20 + 0.55 * grit);

    // Where the shafts land. Elongated along the file, because the cones are
    // read at a grazing angle from this camera.
    float pool = shaftPool(vPosW.xz, 1.35, 2.60);
    col += uEmber * pool * (0.22 + 0.22 * grit);

    // Queue positions, scored into the ground at the pitch of the file. Faint:
    // it is a ledger, not a road marking, and it fades out with distance so it
    // never turns into a moire at the vanishing point.
    float ax = abs(vPosW.x - uQx);
    float tick = smoothstep(0.075, 0.0, abs(fract(vPosW.z / uPitch + 0.5) - 0.5) * uPitch);
    tick *= smoothstep(uRank * 3.4, uRank * 0.4, ax);
    tick *= exp(-vView * 0.026);
    col += uEmber * tick * 0.055;

    // The two files press their weight into the ground. Without this the forms
    // hover, and a hovering queue is not oppressive, it is decorative.
    float contact = exp(-pow((ax - uRank) * 1.55, 2.0));
    col *= 1.0 - contact * 0.55 * uContact;

    /* --- the turn toward the gold world ---------------------------------- */
    float w = smoothstep(0.03, 1.0, uWorld);
    // Dirt under a low sun, plus the long streak the sun lays down the axis of
    // the file — the road out, arriving where the queue used to be.
    vec3 gold = mix(uPowerDeep * 0.28, uPowerDeep * 1.05, 0.28 + 0.50 * grit);
    float streak = exp(-pow((vPosW.x - uQx) * 0.055, 2.0)) * smoothstep(-40.0, -170.0, vPosW.z);
    gold += uPower * streak * 0.34;
    col = mix(col, gold, w);

    // Atmospheric perspective, applied after the turn so both worlds recede
    // into exactly the horizon the curtain paints. Do it before the mix and
    // the gold ground meets the gold sky at a hard line across the frame.
    vec3 far = mix(uDeep * 0.95, uPowerDeep * 0.9, uWorld * 0.85);
    col = mix(col, far, 1.0 - exp(-vView * (uFog > 0.5 ? 0.0200 : 0.0140)));

    float g = fract(sin(dot(gl_FragCoord.xy + uTime, vec2(12.9898, 78.233))) * 43758.5453);
    col += (g - 0.5) * 0.030;

    // The near ground falls away into shadow: the lede, the ruler and the hold
    // button all land down here and all of them are white.
    vec2 q = gl_FragCoord.xy / max(uRes, vec2(1.0)) - 0.5;
    col *= 1.0 - smoothstep(0.06, 0.46, -q.y) * 0.58;
    q.x *= 1.05;
    col *= 1.0 - dot(q, q) * 0.95;

    gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
  }
`;

/* --- the forms in the file ----------------------------------------------- */

const FORM_VERT = /* glsl */ `
  attribute float iSeed;
  attribute float iDepth;   // 0 at the lens, 1 at the vanishing point

  varying vec3  vPosW;
  varying vec3  vNrmW;
  varying vec3  vLocal;
  varying float vSeed;
  varying float vDepth;
  varying float vView;

  void main(){
    mat4 im = mat4(1.0);
    #ifdef USE_INSTANCING
      im = instanceMatrix;
    #endif
    vLocal = position;
    vSeed  = iSeed;
    vDepth = iDepth;

    vec4 world = modelMatrix * im * vec4(position, 1.0);
    vPosW = world.xyz;
    // Placement is translation plus a scale that is uniform in x/z, so the
    // rotation-free upper 3x3 is all the normal transform this needs.
    vNrmW = normalize(mat3(modelMatrix * im) * normal);

    vec4 mv = viewMatrix * world;
    vView = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const FORM_FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uWorld;
  uniform float uFog;
  uniform float uHeight;    // the form's own height, for the local y ramp
  uniform float uGain;      // how hard this material takes the light
  uniform float uHold;      // 0 = dissolves with the file, 1 = goes last
  uniform vec3  uDeep;
  uniform vec3  uPit;
  uniform vec3  uEmber;
  uniform vec3  uPower;
  uniform vec3  uPowerDeep;

  varying vec3  vPosW;
  varying vec3  vNrmW;
  varying vec3  vLocal;
  varying float vSeed;
  varying float vDepth;
  varying float vView;

  ${SHAFTS}

  void main(){
    vec3  n  = normalize(vNrmW);
    vec3  v  = normalize(cameraPosition - vPosW);
    float y01 = clamp(vLocal.y / uHeight, 0.0, 1.0);

    // At rest a form is a silhouette. Nothing in this world emits.
    vec3 col = mix(uPit * 0.85, uDeep * 0.30, 0.25 + 0.55 * y01);

    // Side-light from the shafts, sampled at the form's own footprint. The
    // light comes down, so the shoulders take it and the legs stay in the dark.
    float lit = shaftPool(vPosW.xz, 1.15, 2.10) * uGain;
    float down = 0.30 + 0.70 * max(n.y, 0.0);
    col += uEmber * lit * down * (0.10 + 0.90 * smoothstep(0.15, 0.95, y01)) * 1.45;

    // Rim. This is what makes a black shape in red fog read as a *body* and
    // not as a hole cut in the frame. Kept low: against a wall this bright the
    // silhouette does the work, and a hot outline would make them ornaments.
    float rim = pow(1.0 - abs(dot(n, v)), 3.6);
    col += uEmber * rim * (0.07 + 0.26 * lit) * (0.35 + 0.65 * y01);

    /* --- the turn toward the gold world ---------------------------------- */
    // The file empties from the far end forward, so the vanishing point clears
    // first and the low sun arrives through the gap it leaves.
    vec3  cell = floor(vPosW * 16.0);
    float d = fract(sin(mod(dot(cell, vec3(12.9898, 78.233, 37.719)) + vSeed, 6283.0))
                    * 43758.5453);
    // uHold buys the hero a long stay of execution and then takes it anyway:
    // at mix 1 every form in this world is gone, or the handoff to the gold
    // world would arrive with a red silhouette still standing in it.
    float w2 = pow(uWorld, 1.0 + uHold * 3.5);
    float bite = w2 * (0.75 + 0.90 * vDepth + uHold * 0.55) * 1.60;
    if (d < bite) discard;

    col = mix(col, uPowerDeep * 0.7 + uPower * 0.10, smoothstep(0.0, 0.9, uWorld) * 0.55);

    // Atmospheric perspective last, for the same reason as the ground: the
    // far end of the file has to dissolve into the wall in either world.
    vec3 far = mix(uDeep * 0.95, uPowerDeep * 0.9, uWorld * 0.85);
    col = mix(col, far, 1.0 - exp(-vView * (uFog > 0.5 ? 0.0200 : 0.0140)));

    float g = fract(sin(dot(gl_FragCoord.xy + uTime, vec2(12.9898, 78.233))) * 43758.5453);
    col += (g - 0.5) * 0.028;

    gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
  }
`;

/* --- the shafts themselves ----------------------------------------------- */

const CONE_VERT = /* glsl */ `
  attribute float sSeed;

  varying vec2  vUv;
  varying vec3  vPosW;
  varying vec3  vNrmW;
  varying float vSeed;
  varying float vView;

  void main(){
    mat4 im = mat4(1.0);
    #ifdef USE_INSTANCING
      im = instanceMatrix;
    #endif
    vUv = uv; vSeed = sSeed;
    vec4 world = modelMatrix * im * vec4(position, 1.0);
    vPosW = world.xyz;
    // Cones are scaled uniformly in x/z, so the side normals stay correct.
    vNrmW = normalize(mat3(modelMatrix * im) * normal);
    vec4 mv = viewMatrix * world;
    vView = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const CONE_FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uWorld;
  uniform float uFog;
  uniform float uGain;
  uniform vec3  uEmber;
  uniform vec3  uWait;
  uniform vec3  uPower;

  varying vec2  vUv;
  varying vec3  vPosW;
  varying vec3  vNrmW;
  varying float vSeed;
  varying float vView;

  ${NOISE}

  void main(){
    // A shell standing in for a volume. The chord the eye takes through a cone
    // is longest through its axis and zero at the silhouette, which is exactly
    // |dot(N, V)| on the shell — the opposite of a fresnel, and the reason
    // these read as light in air rather than as glowing tubes.
    vec3  v = normalize(cameraPosition - vPosW);
    float a = pow(abs(dot(normalize(vNrmW), v)), 1.30);

    // Falls from above and thins out before the ground: a shaft, not a
    // spotlight. Shaped on world height rather than on uv, so the cone can be
    // built tall enough that its open top is always out of frame at any lens.
    float hy = clamp(vPosW.y / 42.0, 0.0, 1.0);
    a *= mix(0.05, 1.0, smoothstep(0.0, 0.62, hy));

    // Dust turning over inside the beam, at the speed of a room nobody is in.
    float dust = fbm(vec2(vUv.x * 6.0 + vSeed * 17.0, hy * 3.4 - uTime * 0.045));
    a *= 0.62 + 0.62 * (dust + 0.5);

    a *= uGain * 0.30;
    // Anything this close is fog on the lens rather than light in the room.
    a *= smoothstep(1.5, 9.0, vView);
    a *= exp(-vView * (uFog > 0.5 ? 0.0055 : 0.0022));

    vec3 col = mix(uWait, uEmber, smoothstep(0.0, 0.7, hy));
    // In the gold world these stop being shafts and become the light of a sky.
    col = mix(col, uPower, smoothstep(0.0, 0.85, uWorld));
    a *= 1.0 - smoothstep(0.35, 1.0, uWorld) * 0.55;

    if (a < 0.003) discard;
    gl_FragColor = vec4(col, a);
  }
`;

/* --- ground mist --------------------------------------------------------- */

const MIST_VERT = /* glsl */ `
  attribute float sSeed;
  varying vec2  vUv;
  varying float vSeed;
  varying float vView;

  void main(){
    mat4 im = mat4(1.0);
    #ifdef USE_INSTANCING
      im = instanceMatrix;
    #endif
    vUv = uv; vSeed = sSeed;
    vec4 mv = modelViewMatrix * im * vec4(position, 1.0);
    vView = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const MIST_FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uWorld;
  uniform float uFog;
  uniform vec3  uWait;
  uniform vec3  uPowerDeep;

  varying vec2  vUv;
  varying float vSeed;
  varying float vView;

  ${NOISE}

  void main(){
    // Slabs across the view, each holding a slice of standing air. They give
    // the file its depth separation without a second render target.
    vec2 q = vec2(vUv.x * 3.4 + vSeed * 11.0, vUv.y * 1.9 - uTime * 0.014);
    float n = fbm(q) * 0.7 + fbm(q * 2.7 + 5.0) * 0.3;
    float a = smoothstep(0.00, 0.34, n);

    // Mist pools low and thins out well below the tops of the forms.
    a *= smoothstep(1.0, 0.20, vUv.y);
    a *= smoothstep(0.0, 0.16, vUv.x) * smoothstep(1.0, 0.84, vUv.x);
    a *= 0.085;

    a *= smoothstep(2.0, 12.0, vView) * exp(-vView * (uFog > 0.5 ? 0.0075 : 0.0035));
    a *= 1.0 - smoothstep(0.20, 0.95, uWorld) * 0.6;

    vec3 col = mix(uWait, uPowerDeep, smoothstep(0.0, 0.9, uWorld));

    if (a < 0.002) discard;
    gl_FragColor = vec4(col, a);
  }
`;

/* --- settling ash -------------------------------------------------------- */

const MOTE_VERT = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  uniform float uHeight;
  uniform float uSize;
  uniform float uPixel;
  varying float vAlpha;

  void main(){
    vec3 p = position;
    // Falling, not rising. Nothing in this world goes up.
    p.y = mod(p.y - uTime * (0.10 + 0.22 * aSeed), uHeight);
    p.x += sin(uTime * 0.09 + aSeed * 31.0) * 0.5;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float d = max(-mv.z, 0.001);
    gl_PointSize = uSize * uPixel * (14.0 / d);
    vAlpha = smoothstep(2.0, 9.0, d) * exp(-d * 0.014);
    gl_Position = projectionMatrix * mv;
  }
`;

const MOTE_FRAG = /* glsl */ `
  precision mediump float;
  uniform sampler2D uMap;
  uniform float uWorld;
  uniform vec3  uTint;
  uniform vec3  uPower;
  varying float vAlpha;

  void main(){
    float m = texture2D(uMap, gl_PointCoord).a;
    float a = m * vAlpha * 0.34 * (1.0 - smoothstep(0.20, 0.95, uWorld) * 0.7);
    if (a < 0.003) discard;
    gl_FragColor = vec4(mix(uTint, uPower, smoothstep(0.0, 0.9, uWorld)), a);
  }
`;

/* ------------------------------------------------------------------ helpers */

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

/**
 * Deterministic PRNG. The composition must be identical every time this stage
 * is entered and across every tier change — a queue that reshuffles when the
 * frame rate dips is a queue nobody believes in.
 */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The silhouette of one waiting form: a base, a shaft, a shoulder, a hooded
 * crown. Deliberately close to a person and deliberately not one — this is a
 * queue of applications, not of bodies.
 */
function formProfile(): THREE.Vector2[] {
  return [
    new THREE.Vector2(0.00, 0.00),
    new THREE.Vector2(0.60, 0.00),   // plinth
    new THREE.Vector2(0.58, 0.20),
    new THREE.Vector2(0.43, 0.82),
    new THREE.Vector2(0.40, 2.06),   // body
    new THREE.Vector2(0.63, 2.44),   // a hard shoulder, wider than the body —
    new THREE.Vector2(0.59, 2.88),   // this is what stops it reading as a pill
    new THREE.Vector2(0.25, 2.97),   // and steps in sharply to the head
    new THREE.Vector2(0.235, 3.34),
    new THREE.Vector2(0.145, 3.52),
    new THREE.Vector2(0.00, 3.60),
  ];
}

interface Plan {
  /** Pairs in the file; two forms per pair, one in each rank. */
  pairs: number;
  floorSegments: number;
  shafts: number;
  mistSlabs: number;
  motes: number;
  fog: number;
  contact: number;
}

/** The composition, re-derived whenever the viewport changes orientation. */
interface Shot {
  qx: number;        // world x of the axis of the file
  rank: number;      // half-gap between the two ranks
  camX: number;
  camY: number;
  camZ: number;
  lookX: number;
  lookY: number;
  heroX: number;
  heroZ: number;
  heroScale: number;
  spread: number;    // how wide the shafts are thrown across the frame
  fov: number;
  travel: number;    // how far the whole scroll track moves the camera
}

const SHOT_WIDE: Shot = {
  qx: 6.2, rank: 2.9,
  // Tipped up about five degrees, which drops the horizon to the lower third
  // and hands the top two thirds of the frame to the wall of light. That is
  // the shape of the beat: the queue is a line along the bottom of a very
  // large red room, and the room is the point.
  camX: 0, camY: 2.35, camZ: 15,
  lookX: -6.2, lookY: 6.8,
  heroX: 2.6, heroZ: -46, heroScale: 6.0,
  spread: 1.0, fov: 46, travel: 9.5,
};

/**
 * Portrait is a re-composition, not a crop. A tall frame at fov 70 is barely
 * 37° wide, so the file is walked in toward the axis, the hero is brought
 * closer and made taller, the lens opens up, and the camera lifts and tips
 * further up so the wall of light — the part that carries the beat — still
 * owns the top two thirds.
 */
const SHOT_TALL: Shot = {
  qx: 4.2, rank: 2.2,
  camX: 0, camY: 2.60, camZ: 13,
  lookX: -2.4, lookY: 11.5,
  heroX: 2.2, heroZ: -37, heroScale: 6.4,
  spread: 0.55, fov: 70, travel: 7.5,
};

/* -------------------------------------------------------------------- scene */

export class WaitScene implements StageScene {
  readonly id = 'wait';

  private root = new THREE.Group();
  private plan: Plan = {
    pairs: 48, floorSegments: 160, shafts: 8, mistSlabs: 6,
    motes: 600, fog: 1, contact: 1,
  };
  private shot: Shot = SHOT_WIDE;

  /** Everything this stage allocated, so `dispose()` can be exhaustive. */
  private trash: Array<{ dispose(): void }> = [];
  private mats: THREE.ShaderMaterial[] = [];

  private curtain: THREE.Mesh | null = null;
  private floor: THREE.Mesh | null = null;
  private forms: THREE.InstancedMesh | null = null;
  private hero: THREE.InstancedMesh | null = null;
  private cones: THREE.InstancedMesh | null = null;
  private mist: THREE.InstancedMesh | null = null;
  private motes: THREE.Points | null = null;
  private floorMat: THREE.ShaderMaterial | null = null;
  private moteMat: THREE.ShaderMaterial | null = null;

  /**
   * The shaft table, shared by reference with every material that samples it.
   * Written in `layout()`, read by the cones, the ground pools and the light
   * on the forms — one source of truth, no float-hash round trips.
   */
  private shaftX = new Float32Array(MAX_SHAFTS);
  private shaftZ = new Float32Array(MAX_SHAFTS);
  private shaftW = new Float32Array(MAX_SHAFTS);
  private shaftI = new Float32Array(MAX_SHAFTS);
  /** Normalised shaft placement, generated once and mapped into any shot. */
  private shaftSeeds: { u: number; d: number; w: number; i: number }[] = [];

  private res = new THREE.Vector2(1, 1);

  private worldMix = 0;
  private scroll = 0;
  private time = STILL_T;
  private narrow = false;

  // Saved host state, handed back untouched on dispose.
  private ctxRef: SceneContext | null = null;
  private prevNear = 0.1;
  private prevFar = 400;
  private prevFov = 38;
  private borrowed = false;

  // Scratch, so nothing in the per-frame path allocates.
  private dummy = new THREE.Object3D();
  private camTarget = new THREE.Vector3();

  private get queueLen(): number {
    return this.plan.pairs * PITCH;
  }

  /* --------------------------------------------------------------- build */

  build(ctx: SceneContext, settings: TierSettings): void {
    this.ctxRef = ctx;
    if (!this.borrowed) {
      this.prevNear = ctx.camera.near;
      this.prevFar = ctx.camera.far;
      this.prevFov = ctx.camera.fov;
      this.borrowed = true;
    }

    this.plan = this.makePlan(settings);
    this.seedShafts();
    this.root.name = 'stage-wait';
    ctx.scene.add(this.root);

    this.buildContent();
    this.frame(ctx);
    this.applyWorldMix();
  }

  private makePlan(s: TierSettings): Plan {
    // `terrainSegments` is this project's geometry budget dial, so both the
    // depth of the file and the tessellation of the ground ride on it:
    // 48 pairs and a 160² ground at HIGH, 18 pairs and 60² at LOW.
    const pairs = THREE.MathUtils.clamp(Math.round(s.terrainSegments * 0.15), 14, 56);
    const floorSegments = THREE.MathUtils.clamp(Math.round(s.terrainSegments * 0.5), 48, 176);
    return {
      pairs,
      floorSegments,
      // The cones are the one layer that costs overdraw across the whole upper
      // half of the frame, so they are the first thing a tier drop takes.
      shafts: s.shadows ? MAX_SHAFTS : s.fog ? 5 : 3,
      mistSlabs: s.shadows ? 6 : s.fog ? 4 : 2,
      motes: Math.max(90, Math.round(s.particleCount * 0.55)),
      fog: s.fog ? 1 : 0,
      contact: s.shadows ? 1 : 0.5,
    };
  }

  private track<T extends { dispose(): void }>(x: T): T {
    this.trash.push(x);
    return x;
  }

  private mat(m: THREE.ShaderMaterial): THREE.ShaderMaterial {
    this.mats.push(m);
    this.trash.push(m);
    return m;
  }

  /** Uniform block every material in this stage shares. */
  private common(): Record<string, THREE.IUniform> {
    return {
      uTime: { value: this.time },
      uWorld: { value: this.worldMix },
      uFog: { value: this.plan.fog },
    };
  }

  private shaftUniforms(): Record<string, THREE.IUniform> {
    return {
      uShaftX: { value: this.shaftX },
      uShaftZ: { value: this.shaftZ },
      uShaftW: { value: this.shaftW },
      uShaftI: { value: this.shaftI },
    };
  }

  /**
   * Normalised shaft placement. Generated once from a fixed seed so the light
   * in this room is the same light every time anybody sees it.
   */
  private seedShafts(): void {
    if (this.shaftSeeds.length) return;
    const r = rng(0x5747_1a2b);
    for (let i = 0; i < MAX_SHAFTS; i++) {
      this.shaftSeeds.push({
        u: r() * 2 - 1,               // lateral, relative to the file
        d: 0.06 + r() * 0.92,         // depth along the file
        w: 0.55 + r() * 0.85,         // width multiplier
        i: 0.45 + r() * 0.55,         // intensity
      });
    }
  }

  private buildContent(): void {
    this.buildCurtain();
    this.buildFloor();
    this.buildForms();
    this.buildCones();
    this.buildMist();
    this.buildMotes();
    this.layout();
  }

  private buildCurtain(): void {
    // Open-ended, back side, camera inside. A cylinder rather than a sphere
    // because the whole subject of this wall is *vertical* light, and a
    // cylinder's uv.x is azimuth with no pole to distort it.
    const geo = this.track(new THREE.CylinderGeometry(
      CURTAIN_R, CURTAIN_R, CURTAIN_H, 48, 1, true,
    ));
    const m = this.mat(new THREE.ShaderMaterial({
      vertexShader: CURTAIN_VERT,
      fragmentShader: CURTAIN_FRAG,
      side: THREE.BackSide,
      depthWrite: true,
      uniforms: {
        ...this.common(),
        // uv.x = 0 faces +z on a three cylinder, so the -z vanishing point,
        // and therefore the low sun that replaces it, sits at exactly 0.5.
        uSunU: { value: 0.5 },
        uHTop: { value: 0.72 },
        uRes: { value: this.res },
        uWait: { value: new THREE.Color(PAL.wait) },
        uDeep: { value: new THREE.Color(PAL.deep) },
        uPit: { value: new THREE.Color(PAL.pit) },
        uEmber: { value: new THREE.Color(PAL.ember) },
        uPower: { value: new THREE.Color(PAL.power) },
        uPowerDeep: { value: new THREE.Color(PAL.powerDeep) },
      },
    }));
    this.curtain = new THREE.Mesh(geo, m);
    this.curtain.frustumCulled = false;
    this.root.add(this.curtain);
  }

  private buildFloor(): void {
    const seg = this.plan.floorSegments;
    const geo = this.track(new THREE.PlaneGeometry(FLOOR_W, FLOOR_D, seg, seg));
    const m = this.mat(new THREE.ShaderMaterial({
      vertexShader: FLOOR_VERT,
      fragmentShader: FLOOR_FRAG,
      uniforms: {
        ...this.common(),
        ...this.shaftUniforms(),
        uAmp: { value: 0.32 },
        uQx: { value: this.shot.qx },
        uRank: { value: this.shot.rank },
        uPitch: { value: PITCH },
        uContact: { value: this.plan.contact },
        uRes: { value: this.res },
        uDeep: { value: new THREE.Color(PAL.deep) },
        uPit: { value: new THREE.Color(PAL.pit) },
        uEmber: { value: new THREE.Color(PAL.ember) },
        uPower: { value: new THREE.Color(PAL.power) },
        uPowerDeep: { value: new THREE.Color(PAL.powerDeep) },
      },
    }));
    this.floorMat = m;
    this.floor = new THREE.Mesh(geo, m);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.set(0, 0, FLOOR_Z);
    this.floor.frustumCulled = false;
    this.root.add(this.floor);
  }

  private buildForms(): void {
    const profile = formProfile();
    const n = this.plan.pairs * 2;

    const geo = this.track(new THREE.LatheGeometry(profile, 8));
    const seed = new Float32Array(n);
    const depth = new Float32Array(n);
    const r = rng(0x1c48_3901);
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(i / 2);
      seed[i] = r() * 97;
      depth[i] = this.plan.pairs > 1 ? idx / (this.plan.pairs - 1) : 0;
    }
    geo.setAttribute('iSeed', new THREE.InstancedBufferAttribute(seed, 1));
    geo.setAttribute('iDepth', new THREE.InstancedBufferAttribute(depth, 1));

    const makeMat = (gain: number, hold: number) =>
      this.mat(new THREE.ShaderMaterial({
        vertexShader: FORM_VERT,
        fragmentShader: FORM_FRAG,
        uniforms: {
          ...this.common(),
          ...this.shaftUniforms(),
          uHeight: { value: FORM_H },
          uGain: { value: gain },
          uHold: { value: hold },
          uDeep: { value: new THREE.Color(PAL.deep) },
          uPit: { value: new THREE.Color(PAL.pit) },
          uEmber: { value: new THREE.Color(PAL.ember) },
          uPower: { value: new THREE.Color(PAL.power) },
          uPowerDeep: { value: new THREE.Color(PAL.powerDeep) },
        },
      }));

    this.forms = new THREE.InstancedMesh(geo, makeMat(1.0, 0.0), n);
    this.forms.frustumCulled = false;
    this.root.add(this.forms);

    // The hero: the same form, monumental, standing apart from the file and
    // taking the light the file never gets. A finer lathe because it is the one
    // silhouette in the frame that is read at close range. It is an
    // InstancedMesh of one purely so it can share the file's shader program.
    const heroGeo = this.track(new THREE.LatheGeometry(profile, 22));
    const hs = new Float32Array([13]);
    const hd = new Float32Array([0]);
    heroGeo.setAttribute('iSeed', new THREE.InstancedBufferAttribute(hs, 1));
    heroGeo.setAttribute('iDepth', new THREE.InstancedBufferAttribute(hd, 1));
    this.hero = new THREE.InstancedMesh(heroGeo, makeMat(1.55, 1.0), 1);
    this.hero.frustumCulled = false;
    this.root.add(this.hero);
  }

  private buildCones(): void {
    const n = this.plan.shafts;
    // Open-ended so there are no caps to catch the eye, and the top sits far
    // above the frame so its rim is never in shot.
    const geo = this.track(new THREE.CylinderGeometry(0.30, 1.0, 1, 16, 1, true));
    const seeds = new Float32Array(n);
    for (let i = 0; i < n; i++) seeds[i] = this.shaftSeeds[i]!.u * 7 + i * 3.1;
    geo.setAttribute('sSeed', new THREE.InstancedBufferAttribute(seeds, 1));

    const m = this.mat(new THREE.ShaderMaterial({
      vertexShader: CONE_VERT,
      fragmentShader: CONE_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        ...this.common(),
        uGain: { value: 1 },
        uEmber: { value: new THREE.Color(PAL.ember) },
        uWait: { value: new THREE.Color(PAL.wait) },
        uPower: { value: new THREE.Color(PAL.power) },
      },
    }));

    this.cones = new THREE.InstancedMesh(geo, m, n);
    this.cones.frustumCulled = false;
    this.cones.renderOrder = 2;
    this.root.add(this.cones);
  }

  private buildMist(): void {
    const n = this.plan.mistSlabs;
    const geo = this.track(new THREE.PlaneGeometry(120, 14, 1, 1));
    const seeds = new Float32Array(n);
    const r = rng(0x0d0e_7711);
    for (let i = 0; i < n; i++) seeds[i] = r() * 19;
    geo.setAttribute('sSeed', new THREE.InstancedBufferAttribute(seeds, 1));

    const m = this.mat(new THREE.ShaderMaterial({
      vertexShader: MIST_VERT,
      fragmentShader: MIST_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        ...this.common(),
        uWait: { value: new THREE.Color(PAL.wait) },
        uPowerDeep: { value: new THREE.Color(PAL.powerDeep) },
      },
    }));

    this.mist = new THREE.InstancedMesh(geo, m, n);
    this.mist.frustumCulled = false;
    this.mist.renderOrder = 3;
    this.root.add(this.mist);
  }

  private buildMotes(): void {
    const n = this.plan.motes;
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    const r = rng(0x00ab_1234);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (r() - 0.5) * 120;
      pos[i * 3 + 1] = r() * 26;
      pos[i * 3 + 2] = 12 - r() * 190;
      seed[i] = r();
    }
    const geo = this.track(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));

    const tex = this.track(makeMoteTexture());
    const m = this.mat(new THREE.ShaderMaterial({
      vertexShader: MOTE_VERT,
      fragmentShader: MOTE_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        ...this.common(),
        uHeight: { value: 26 },
        uSize: { value: 1.5 },
        uPixel: { value: 1 },
        uMap: { value: tex },
        uTint: { value: new THREE.Color(PAL.ash) },
        uPower: { value: new THREE.Color(PAL.power) },
      },
    }));
    this.moteMat = m;
    this.motes = new THREE.Points(geo, m);
    this.motes.frustumCulled = false;
    this.motes.renderOrder = 4;
    this.root.add(this.motes);
  }

  /**
   * Place every instance for the current shot. Split out from `build` because
   * portrait re-composes by walking the file in toward the axis and pulling the
   * shafts together, and that is a couple of hundred matrix writes — far
   * cheaper, and far more reversible, than rebuilding the world.
   */
  private layout(): void {
    const d = this.dummy;
    const shot = this.shot;
    const pairs = this.plan.pairs;
    const len = this.queueLen;

    // --- the shaft table, written before anything that samples it ---------
    // Thrown to the left of the file rather than over it. The queue owns the
    // right of the frame and the light owns the left, which is where the
    // display type lands — the type reads as lit from behind, not stencilled
    // onto a dead field.
    for (let i = 0; i < MAX_SHAFTS; i++) {
      const s = this.shaftSeeds[i]!;
      const on = i < this.plan.shafts;
      this.shaftX[i] = shot.qx + (s.u * 0.62 - 0.42) * 26 * shot.spread;
      this.shaftZ[i] = QUEUE_Z0 - s.d * (len * 0.82);
      this.shaftW[i] = (5.0 + s.w * 9.0) * (0.7 + 0.3 * shot.spread);
      this.shaftI[i] = on ? s.i : 0;
    }

    if (this.cones) {
      for (let i = 0; i < this.plan.shafts; i++) {
        const w = this.shaftW[i]!;
        d.position.set(this.shaftX[i]!, CONE_H / 2, this.shaftZ[i]!);
        d.rotation.set(0, 0, 0);
        // Unit cylinder: x/z scale is the mouth radius, y is the throw. Kept
        // uniform in x/z so the shell normals stay exact in the shader, and
        // tall enough that the open top never crosses the frame at any lens.
        d.scale.set(w, CONE_H, w);
        d.updateMatrix();
        this.cones.setMatrixAt(i, d.matrix);
      }
      this.cones.instanceMatrix.needsUpdate = true;
    }

    if (this.forms) {
      const r = rng(0x77aa_0031);
      for (let i = 0; i < pairs * 2; i++) {
        const left = i % 2 === 0;
        const idx = Math.floor(i / 2);
        const z = QUEUE_Z0 - idx * PITCH;
        // A hand of jitter, and no more. A queue is not a crowd: the whole
        // horror of it is how nearly identical every position is.
        const jx = (r() - 0.5) * 0.55;
        const jz = (r() - 0.5) * 0.45;
        const h = 1.12 + r() * 0.26;
        d.position.set(shot.qx + (left ? -shot.rank : shot.rank) + jx, 0, z + jz);
        d.rotation.set(0, (r() - 0.5) * 0.5, 0);
        d.scale.set(h, h, h);
        d.updateMatrix();
        this.forms.setMatrixAt(i, d.matrix);
      }
      this.forms.instanceMatrix.needsUpdate = true;
    }

    if (this.hero) {
      d.position.set(shot.heroX, 0, shot.heroZ);
      // Turned a few degrees off the file. It is not queueing with them.
      d.rotation.set(0, -0.34, 0);
      d.scale.setScalar(shot.heroScale);
      d.updateMatrix();
      this.hero.setMatrixAt(0, d.matrix);
      this.hero.instanceMatrix.needsUpdate = true;
    }

    if (this.mist) {
      const n = this.plan.mistSlabs;
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        d.position.set(shot.qx * 0.5, 5.4, QUEUE_Z0 - t * (len + 12));
        d.rotation.set(0, 0, 0);
        d.scale.set(1, 1, 1);
        d.updateMatrix();
        this.mist.setMatrixAt(i, d.matrix);
      }
      this.mist.instanceMatrix.needsUpdate = true;
    }

    if (this.floorMat) {
      const u = this.floorMat.uniforms;
      if (u.uQx) u.uQx.value = shot.qx;
      if (u.uRank) u.uRank.value = shot.rank;
    }
  }

  /* -------------------------------------------------------------- runtime */

  update(elapsed: number, _delta: number, scroll: number, ctx: SceneContext): void {
    this.ctxRef = ctx;
    this.scroll = THREE.MathUtils.clamp(scroll, 0, 1);
    // Reduced motion pins the clock at a chosen phase rather than at zero: the
    // shafts hold their dust, the descending tick holds mid-wall, and the frame
    // reads as a photograph of a queue instead of the first frame of one.
    this.time = ctx.reducedMotion ? STILL_T : elapsed;

    for (const m of this.mats) {
      const u = m.uniforms.uTime;
      if (u) u.value = this.time;
    }
    if (this.moteMat) {
      const p = this.moteMat.uniforms.uPixel;
      if (p) p.value = ctx.renderer.getPixelRatio();
    }

    this.dolly(ctx);
  }

  /**
   * Scroll inches the camera down the file.
   *
   * Most of the track is a plain eased creep, but a little over half of it is
   * quantised into four grudging steps that move and then hold — the rhythm of
   * shuffling forward in a line. It is deliberately a short move: three hundred
   * units of queue and the visitor gets nine of them.
   */
  private dolly(ctx: SceneContext): void {
    const cam = ctx.camera;
    const shot = this.shot;
    const p = this.scroll;

    const glide = p * p * (3 - 2 * p);

    const steps = 4;
    const s = p * steps;
    const i = Math.min(Math.floor(s), steps);
    const f = s - i;
    // Each step moves through the first half of its slot, then waits.
    const fe = f <= 0 ? 0 : f >= 0.5 ? 1 : (f / 0.5) * (f / 0.5) * (3 - 2 * (f / 0.5));
    const shuffle = (i + fe) / steps;

    const eased = glide * 0.45 + shuffle * 0.55;
    const z = shot.camZ - eased * shot.travel;

    // A drift so slow it is almost a held frame. Frozen under reduced motion;
    // the scroll dolly above still runs, because that is the visitor's own hand.
    const t = ctx.reducedMotion ? 0 : this.time;
    const swayX = Math.sin(t * 0.062) * 0.10 + Math.sin(t * 0.021) * 0.07;
    const bobY = Math.sin(t * 0.047) * 0.045;

    cam.position.set(shot.camX + swayX, shot.camY + bobY - eased * 0.35, z);
    cam.rotation.z = Math.sin(t * 0.033) * 0.0035;
    this.camTarget.set(
      shot.lookX + swayX * 0.5,
      shot.lookY + bobY - eased * 0.55,
      z - 60,
    );
    cam.lookAt(this.camTarget);
  }

  setWorldMix(t: number): void {
    this.worldMix = THREE.MathUtils.clamp(t, 0, 1);
    this.applyWorldMix();
  }

  /** Uniform writes only — no allocation, no rebuild, exactly reversible. */
  private applyWorldMix(): void {
    for (const m of this.mats) {
      const u = m.uniforms.uWorld;
      if (u) u.value = this.worldMix;
    }
  }

  onTier(settings: TierSettings, ctx: SceneContext): void {
    this.ctxRef = ctx;
    this.plan = this.makePlan(settings);
    this.clearContent();
    this.buildContent();
    this.frame(ctx);
    this.applyWorldMix();
  }

  frame(ctx: SceneContext): void {
    this.ctxRef = ctx;
    const narrow = ctx.width < 700;
    const changed = narrow !== this.narrow || this.shot !== (narrow ? SHOT_TALL : SHOT_WIDE);
    this.narrow = narrow;
    this.shot = narrow ? SHOT_TALL : SHOT_WIDE;

    const dpr = ctx.renderer.getPixelRatio();
    this.res.set(Math.max(ctx.width * dpr, 1), Math.max(ctx.height * dpr, 1));

    ctx.camera.fov = this.shot.fov;
    ctx.camera.aspect = ctx.height > 0 ? ctx.width / ctx.height : 1;
    ctx.camera.near = 0.5;
    // The curtain stands 200 units out and the file runs most of the way to it.
    ctx.camera.far = Math.max(ctx.camera.far, 600);
    ctx.camera.updateProjectionMatrix();

    // Tell the curtain where the top of the frame lands on it. Every ramp in
    // that shader is written against the visible band, so widening the lens
    // for portrait genuinely re-composes the wall instead of stretching it.
    if (this.curtain) {
      const pitch = Math.atan2(this.shot.lookY - this.shot.camY, 60);
      const top = THREE.MathUtils.degToRad(this.shot.fov) / 2 + pitch;
      const u = (this.curtain.material as THREE.ShaderMaterial).uniforms.uHTop;
      if (u) u.value = 0.5 + (CURTAIN_R * Math.tan(Math.min(top, 1.35))) / CURTAIN_H;
    }

    if (changed || this.forms) this.layout();
    this.dolly(ctx);
  }

  /* -------------------------------------------------------------- teardown */

  private clearContent(): void {
    // InstancedMesh.dispose() releases the instance matrix buffers, which the
    // geometry/material sweep below does not cover.
    for (const m of [this.forms, this.hero, this.cones, this.mist]) m?.dispose();
    this.root.clear();
    for (const item of this.trash) item.dispose();
    this.trash = [];
    this.mats = [];
    this.curtain = null;
    this.floor = null;
    this.forms = null;
    this.hero = null;
    this.cones = null;
    this.mist = null;
    this.motes = null;
    this.floorMat = null;
    this.moteMat = null;
  }

  dispose(): void {
    this.clearContent();
    this.root.removeFromParent();

    const ctx = this.ctxRef;
    if (ctx && this.borrowed) {
      ctx.camera.near = this.prevNear;
      ctx.camera.far = this.prevFar;
      ctx.camera.fov = this.prevFov;
      ctx.camera.updateProjectionMatrix();
    }
    this.borrowed = false;
    this.ctxRef = null;
  }
}

/** Factory, for hosts that would rather not `new` a class from a registry. */
export function createWaitScene(): StageScene {
  return new WaitScene();
}

export default WaitScene;
