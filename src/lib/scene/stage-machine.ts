/**
 * Stage 4 — THE MACHINE.
 *
 * Phase 1A compute: 8 × NVIDIA HGX B200, 64 GPUs, ~114 kW of IT load, direct
 * -to-chip liquid cooled, drawing about 4% of the 3 MVA transformer already
 * standing on the site. The emotional beat is *controlled density* — cold,
 * quiet, immense — so the world is graphite and deep blue with cyan-white heat
 * as the only accent. No warmth anywhere except the coolant return.
 *
 * Same rules as stage 1 (`experience.ts`): no glTF, no texture atlases, no
 * downloads. Every rack, LED, coolant run, shimmer veil and haze slab is a
 * Three.js primitive with a hand-written shader on it, so the payload stays at
 * zero bytes and the whole colour world can be scrubbed by the hold ring on a
 * single uniform.
 *
 * `setWorldMix(t)` dissolves this corridor toward stage 5 (the daylight
 * campus): the racks erode away rack-by-rack, every additive layer folds to
 * nothing, and the wall at the vanishing point opens into blown-out daylight.
 * It is uniform writes only — cheap enough for the 60fps hold ring, and
 * perfectly reversible.
 *
 * The host owns the renderer, the camera and the loop. This file owns one
 * THREE.Group and the contents of `ctx.scene` it added.
 */

import * as THREE from 'three';
import type { SceneContext, StageScene, TierSettings } from './types';

/* ------------------------------------------------------------------ palette */

/** Read straight off `tokens.css` so the canvas and the chrome never drift. */
const PAL = {
  machine: '#10161f',   // --c-machine, the hall
  deep: '#070a0f',      // --c-machine-deep, the void at the end of the aisle
  campus: '#eef1ef',    // --c-campus, what we are dissolving toward
  cyan: '#8fe9ff',      // heat / activity accent
  ice: '#e8f8ff',       // hottest LEDs, near-white
  coolant: '#39d7ff',   // supply
  ret: '#ff9a5a',       // return, the one warm thing in the room
  gold: '#ffc832',      // --c-gold, the rare fault/attention light
} as const;

/* ------------------------------------------------------------------ shaders */

/**
 * Value noise + fbm, identical in spirit to the terrain in `experience.ts`.
 * Cheap, stable, and plenty at the distances this corridor is read from.
 */
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

/*
 * `ctx.scene` is shared with the other four stages, so this stage never
 * touches `scene.fog`. Every material below fades itself in view space instead.
 */

/* --- racks ------------------------------------------------------------- */

const RACK_VERT = /* glsl */ `
  attribute float iSeed;
  attribute float iSide;   // +1 = left row (door faces +x), -1 = right row
  attribute float iDepth;  // 0 at the mouth of the aisle, 1 at the far end

  varying vec3  vNrm;
  varying vec3  vLocal;
  varying float vSeed;
  varying float vSide;
  varying float vDepth;
  varying float vView;

  void main(){
    mat4 im = mat4(1.0);
    #ifdef USE_INSTANCING
      im = instanceMatrix;
    #endif
    vNrm   = normal;
    vLocal = position;
    vSeed  = iSeed;
    vSide  = iSide;
    vDepth = iDepth;
    vec4 mv = modelViewMatrix * im * vec4(position, 1.0);
    vView = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const RACK_FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uWorld;
  uniform float uFog;
  uniform float uRackH;
  uniform float uTraffic;
  uniform vec3  uGraphite;
  uniform vec3  uDeep;
  uniform vec3  uCyan;
  uniform vec3  uCampus;

  varying vec3  vNrm;
  varying vec3  vLocal;
  varying float vSeed;
  varying float vSide;
  varying float vDepth;
  varying float vView;

  ${NOISE}

  void main(){
    vec3  n     = normalize(vNrm);
    float front = step(0.5, n.x * vSide);   // the door, facing the cold aisle
    float up    = max(n.y, 0.0);
    float ends  = abs(n.z);

    // Per-rack load. The hall must read as unevenly worked, not uniformly "on".
    float load = 0.42 + 0.58 * hash11(vSeed * 7.31);

    float y01 = clamp(vLocal.y / uRackH + 0.5, 0.0, 1.0);

    // Cold-rolled steel, lit by nothing but the corridor it stands in.
    vec3 col = mix(uDeep, uGraphite, 0.26 + 0.50 * up + 0.24 * front);
    col *= 0.82 + 0.18 * ends;

    // 42U of perforated door. Slots tighten toward the top, where the hot air
    // leaves — the one bit of real datacentre grammar in the silhouette.
    float slots = smoothstep(0.40, 0.50, abs(fract(y01 * 42.0) - 0.5));
    col *= mix(1.0, mix(0.80, 1.0, slots), front);

    // Heat bleeding back through the mesh.
    float breathe = 0.86 + 0.14 * sin(uTime * (0.55 + load * 0.8) + vSeed * 19.0);
    col += front * uCyan * (0.030 + 0.070 * (1.0 - slots)) * load * breathe;

    // One light bar per door — the only hard edge anywhere on the rack.
    float bar = 1.0 - smoothstep(0.0, 0.012, abs(y01 - 0.935));
    col += front * bar * uCyan * 0.85 * load;

    // Power draw. A band of current climbing the cabinet as a job lands on it,
    // clocked off the same per-rack `load` the door LEDs already run from, so
    // the busiest cabinets surge most often and hardest. The phase is seeded
    // per rack, which means under reduced motion (uTime pinned at 0) the hall
    // holds a still frame with the surges frozen at forty different heights
    // rather than all forty racks flashing on one line.
    float sPhase = fract(uTime * (0.11 + 0.13 * load) + hash11(vSeed * 5.09));
    float sHead  = sPhase * 1.30 - 0.15;
    float surge  = smoothstep(0.14, 0.0, abs(y01 - sHead));
    // Squared for a hard crest, gated at both ends of the sweep so it reads as
    // a discrete event with a gap after it rather than a travelling sine.
    surge *= surge * smoothstep(0.0, 0.10, sPhase) * smoothstep(1.0, 0.86, sPhase);
    // Capped at ~0.5 of the cyan accent: the crest kisses the 0.62 bloom
    // threshold this stage is graded at without ever clipping the door white.
    col += front * surge * load * uCyan * (0.16 + 0.34 * uTraffic);

    // Plinth shadow: the racks should feel heavy where they meet the floor.
    col *= 0.35 + 0.65 * smoothstep(0.0, 0.09, y01);

    // Distance haze toward the void at the vanishing point, or toward daylight
    // once the world starts turning over.
    vec3 far = mix(uDeep, uCampus, uWorld * 0.85);
    col = mix(col, far, 1.0 - exp(-vView * 0.055 * uFog));

    // The dissolve. Racks erode from the far end forward on a per-rack hash,
    // so the corridor empties into the next world instead of fading flat.
    float d = hash11(vSeed * 3.77 + floor(y01 * 9.0) * 4.13);
    if (d < uWorld * (0.75 + 0.55 * vDepth) * 1.45) discard;

    col = mix(col, uCampus, uWorld * 0.55);

    // Grain, same reason as stage 1: large flat graphite bands will otherwise
    // stair-step on 8-bit displays.
    float g = fract(sin(dot(gl_FragCoord.xy + uTime, vec2(12.9898, 78.233))) * 43758.5453);
    col += (g - 0.5) * 0.030;

    gl_FragColor = vec4(col, 1.0);
  }
`;

/* --- status LEDs -------------------------------------------------------- */

const LED_VERT = /* glsl */ `
  attribute float aSeed;
  attribute float aRate;
  attribute float aKind;
  attribute float aRack;   // the parent rack's own iSeed
  attribute float aY01;    // height up that rack, 0..1

  varying vec2  vUv;
  varying float vSeed;
  varying float vRate;
  varying float vKind;
  varying float vView;
  varying float vRack;
  varying float vY01;

  void main(){
    mat4 im = mat4(1.0);
    #ifdef USE_INSTANCING
      im = instanceMatrix;
    #endif
    vUv = uv; vSeed = aSeed; vRate = aRate; vKind = aKind;
    vRack = aRack; vY01 = aY01;
    vec4 mv = modelViewMatrix * im * vec4(position, 1.0);
    vView = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const LED_FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uWorld;
  uniform float uFog;
  uniform float uTraffic;
  uniform vec3  uCyan;
  uniform vec3  uIce;
  uniform vec3  uGold;

  varying vec2  vUv;
  varying float vSeed;
  varying float vRate;
  varying float vKind;
  varying float vView;
  varying float vRack;
  varying float vY01;

  ${NOISE}

  void main(){
    // Local clock. Under reduced motion uTime is pinned at 0, which leaves
    // every light held at its own seeded phase — a still pattern, not a dark
    // wall of dead LEDs.
    float t = uTime * vRate + vSeed * 31.0;

    float level;
    if (vKind < 0.58) {
      // Traffic. Stepped so it flickers like a link light, not like a sine.
      float step1 = hash11(floor(t * 9.0) + vSeed * 3.0);
      float step2 = hash11(floor(t * 3.0) + vSeed * 11.0);
      level = 0.10 + 0.90 * step(0.34, step1 * 0.65 + step2 * 0.35);
    } else if (vKind < 0.92) {
      // Link / power. Solid, with a slow breath so it is never dead flat.
      level = 0.72 + 0.24 * sin(t * 1.7 + vSeed * 6.0);
    } else {
      // Attention. Rare, slower, and the only place gold appears in the hall.
      level = 0.30 + 0.70 * pow(0.5 + 0.5 * sin(t * 0.9), 6.0);
    }

    // Sympathetic surge. When the cabinet's current pulse sweeps past this
    // LED's height the row lifts with it — same `load`, same clock and same
    // seed as RACK_FRAG, so the door and its lights read as one event instead
    // of two effects running side by side. This only ever adds to `level`;
    // every light keeps the rate, kind and phase it was built with.
    float rLoad  = 0.42 + 0.58 * hash11(vRack * 7.31);
    float sPhase = fract(uTime * (0.11 + 0.13 * rLoad) + hash11(vRack * 5.09));
    float sHead  = sPhase * 1.30 - 0.15;
    float surge  = smoothstep(0.16, 0.0, abs(vY01 - sHead));
    surge *= surge * smoothstep(0.0, 0.10, sPhase) * smoothstep(1.0, 0.86, sPhase);
    level = min(1.0, level + surge * rLoad * (0.18 + 0.42 * uTraffic));

    // Rounded capsule with a soft bloom around it.
    vec2  p    = (vUv - 0.5) * vec2(1.0, 2.30);
    float d    = length(p);
    float core = smoothstep(0.46, 0.10, d);
    float halo = smoothstep(0.62, 0.0, d) * 0.42;

    vec3 tint = vKind > 0.92 ? uGold : mix(uCyan, uIce, level * 0.75);
    vec3 col  = tint * (core * (0.35 + level) + halo * level);

    float a = (core + halo) * (0.22 + 0.78 * level);

    // Individual LEDs stop resolving long before the racks do.
    a *= exp(-vView * 0.050 * uFog);
    a *= 1.0 - smoothstep(0.05, 0.75, uWorld);

    if (a < 0.004) discard;
    gl_FragColor = vec4(col, a);
  }
`;

/* --- liquid cooling ----------------------------------------------------- */

const COOLANT_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNrmW;
  varying vec3 vPosW;
  varying float vView;

  void main(){
    mat4 im = mat4(1.0);
    #ifdef USE_INSTANCING
      im = instanceMatrix;
    #endif
    vUv = uv;
    vec4 world = modelMatrix * im * vec4(position, 1.0);
    vPosW  = world.xyz;
    // Tubes and drops are placed by translation only, so the local normal is
    // already the world normal — no normal matrix needed.
    vNrmW  = normalize(normal);
    vec4 mv = viewMatrix * world;
    vView = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const COOLANT_FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uWorld;
  uniform float uFog;
  uniform float uAxis;    // 0 = flow along uv.x (tubes), 1 = along uv.y (drops)
  uniform float uDir;     // +1 supply, -1 return
  uniform float uRepeat;
  uniform float uGain;
  uniform vec3  uTintA;
  uniform vec3  uTintB;

  varying vec2  vUv;
  varying vec3  vNrmW;
  varying vec3  vPosW;
  varying float vView;

  void main(){
    vec3  v = normalize(cameraPosition - vPosW);
    float fres = pow(1.0 - abs(dot(normalize(vNrmW), v)), 2.2);

    // Travelling flow. Direct-to-chip means the fluid never stops, so the
    // banding is fast and tight rather than decorative.
    float s = mix(vUv.x, vUv.y, uAxis);
    float f = fract(s * uRepeat - uTime * 0.42 * uDir);
    float slug = smoothstep(0.44, 0.0, abs(f - 0.5)) ;
    slug = pow(slug, 2.4);

    vec3  col = mix(uTintA, uTintB, slug * 0.75);
    float a   = (0.070 + 0.150 * fres + 0.260 * slug) * uGain;

    // Overhead distribution should stay overhead. Anything closer than a few
    // metres is pipework crossing the lens, so fade it out entirely.
    a *= smoothstep(3.5, 8.0, vView);
    a *= exp(-vView * 0.042 * uFog);
    a *= 1.0 - smoothstep(0.10, 0.80, uWorld);
    col = mix(col, vec3(1.0), uWorld * 0.4);

    if (a < 0.004) discard;
    gl_FragColor = vec4(col, a);
  }
`;

/* --- heat shimmer ------------------------------------------------------- */

const SHIMMER_VERT = /* glsl */ `
  uniform float uTime;
  varying vec2  vUv;
  varying float vView;

  void main(){
    vUv = uv;
    vec3 pos = position;
    // No render target is available to this stage (the host owns the renderer),
    // so the "distortion" is real geometric wobble in the veil itself rather
    // than a screen-space refraction. At this grazing angle it reads the same.
    float rise = smoothstep(0.0, 0.6, uv.y);
    pos.x += sin(uv.y * 9.0 + uTime * 1.9 + uv.x * 12.0) * 0.030 * rise;
    pos.z += cos(uv.y * 7.0 - uTime * 1.4 + uv.x * 21.0) * 0.045 * rise;
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    vView = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const SHIMMER_FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uWorld;
  uniform float uFog;
  uniform float uAmount;
  uniform vec3  uCyan;
  uniform vec3  uWarm;

  varying vec2  vUv;
  varying float vView;

  ${NOISE}

  void main(){
    // Rising columns of disturbed air off the hot aisle side of the racks.
    vec2  q = vec2(vUv.x * 5.0, vUv.y * 2.6 - uTime * 0.30);
    float n = fbm(q) * 0.65 + fbm(q * 2.6 + 11.0) * 0.35;
    float a = smoothstep(0.02, 0.30, n);

    a *= smoothstep(0.0, 0.30, vUv.y) * smoothstep(1.0, 0.45, vUv.y);
    a *= smoothstep(0.0, 0.10, vUv.x) * smoothstep(1.0, 0.90, vUv.x);
    a *= uAmount * 0.30;

    vec3 col = mix(uCyan, uWarm, smoothstep(0.2, 0.9, vUv.y) * 0.45);

    a *= exp(-vView * 0.040 * uFog);
    a *= 1.0 - smoothstep(0.05, 0.65, uWorld);

    if (a < 0.003) discard;
    gl_FragColor = vec4(col, a);
  }
`;

/* --- volumetric haze ---------------------------------------------------- */

const HAZE_VERT = /* glsl */ `
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

const HAZE_FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uWorld;
  uniform float uFog;
  uniform vec3  uCyan;
  uniform vec3  uCampus;

  varying vec2  vUv;
  varying float vSeed;
  varying float vView;

  ${NOISE}

  void main(){
    // The shafts technique from stage 1, re-aimed: instead of sun through
    // cloud, these are the two rack faces throwing light into the airborne
    // dust of the cold aisle. Bands cluster at x = 0.5 +/- 0.30, where the
    // doors actually are.
    float shafts = 0.0;
    for (int i = 0; i < 5; i++) {
      float fi   = float(i);
      float side = (mod(fi, 2.0) < 1.0) ? -1.0 : 1.0;
      float x    = 0.5 + side * (0.24 + hash11(fi * 12.7 + vSeed) * 0.14);
      float w    = 0.035 + hash11(fi * 31.3 + vSeed) * 0.075;
      float sway = sin(uTime * (0.09 + hash11(fi * 5.1) * 0.13) + fi + vSeed * 6.0) * 0.020;
      float band = smoothstep(w, 0.0, abs(vUv.x - x - sway));
      shafts += band * (0.32 + 0.68 * hash11(fi * 77.7 + vSeed));
    }

    // Haze pools low in a cold aisle and thins toward the ceiling.
    shafts *= smoothstep(1.0, 0.12, vUv.y) * 0.55 + 0.18;

    float drift = fbm(vec2(vUv.x * 3.0 + vSeed * 9.0, vUv.y * 2.0 - uTime * 0.05));
    shafts *= 0.65 + 0.55 * (drift + 0.5);

    float a = shafts * 0.085;
    a *= smoothstep(0.0, 0.14, vUv.x) * smoothstep(1.0, 0.86, vUv.x);
    a *= smoothstep(0.0, 0.06, vUv.y);

    // A slab right on top of the lens is just fog on the glass — hold them off.
    a *= smoothstep(0.6, 3.0, vView) * exp(-vView * 0.030 * uFog);

    vec3 col = mix(uCyan, uCampus, uWorld * 0.8);
    a *= 1.0 - smoothstep(0.15, 0.90, uWorld);

    if (a < 0.002) discard;
    gl_FragColor = vec4(col, a);
  }
`;

/* --- floor / ceiling ---------------------------------------------------- */

const HALL_VERT = /* glsl */ `
  varying vec3  vPosW;
  varying float vView;

  void main(){
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPosW = world.xyz;
    vec4 mv = viewMatrix * world;
    vView = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const HALL_FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uWorld;
  uniform float uFog;
  uniform float uAisle;    // half-width of the cold aisle, in world units
  uniform float uContact;  // 1 on tiers that can afford contact shading
  uniform vec3  uDeep;
  uniform vec3  uGraphite;
  uniform vec3  uCyan;
  uniform vec3  uCampus;

  uniform float uCeil;
  varying vec3  vPosW;
  varying float vView;

  void main(){
    // Floor and ceiling share one material; height tells them apart.
    float floorward = step(vPosW.y, uCeil * 0.5);
    float ax = abs(vPosW.x);

    // The floor carries the depth cue in this shot, so it is lifted well clear
    // of the ceiling: a sealed screed reading two stops above the void.
    vec3 col = mix(uDeep, uGraphite, mix(0.30, 1.30, floorward));

    // 600mm floor tiles — the only thing in the room that measures the dolly.
    vec2 g = abs(fract(vPosW.xz / 0.6) - 0.5);
    float grid = smoothstep(0.024, 0.004, min(g.x, g.y));
    col += grid * uGraphite * 1.05 * floorward;

    // The doors, smeared into the sealed floor. Jittered along z so it reads
    // as spilled LED light rather than a painted stripe.
    float band = 1.0 - smoothstep(0.0, 1.45, abs(ax - uAisle));
    float spill = 0.5 + 0.5 * sin(vPosW.z * 3.3 + uTime * 0.7);
    col += uCyan * band * band * (0.085 + 0.060 * spill) * mix(0.30, 1.0, floorward);

    // A long specular sheen straight down the centre of the cold aisle.
    float sheen = 1.0 - smoothstep(0.0, uAisle * 1.15, ax);
    col += uCyan * sheen * sheen * 0.030 * floorward;

    // Contact shading under the rack line: the racks must sit, not hover.
    float contact = 1.0 - smoothstep(0.0, 0.50, ax - uAisle);
    col *= 1.0 - contact * 0.42 * uContact * floorward;

    vec3 far = mix(uDeep, uCampus, uWorld * 0.85);
    col = mix(col, far, 1.0 - exp(-vView * 0.058 * uFog));
    col = mix(col, uCampus, uWorld * 0.60);

    float n = fract(sin(dot(gl_FragCoord.xy + uTime, vec2(12.9898, 78.233))) * 43758.5453);
    col += (n - 0.5) * 0.026;

    gl_FragColor = vec4(col, 1.0);
  }
`;

/* --- the wall at the vanishing point ------------------------------------ */

const WALL_FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uWorld;
  uniform float uFog;
  uniform float uAisle;
  uniform vec3  uDeep;
  uniform vec3  uGraphite;
  uniform vec3  uCyan;
  uniform vec3  uCampus;

  varying vec2  vUv;
  varying vec3  vPosW;
  varying float vView;

  void main(){
    float ax = abs(vPosW.x);

    // At rest this is just the end of the room: the same graphite as the
    // ceiling, panelised, with the aisle light dying against it. It must never
    // read as a lighter rectangle sitting in the middle of the corridor.
    vec3 col = mix(uDeep, uGraphite, 0.30);

    // Panel seams and a datum line, at the hall's own scale.
    float seam = smoothstep(0.030, 0.0, abs(fract(vPosW.x / 1.2 + 0.5) - 0.5) * 1.2);
    float band = smoothstep(0.030, 0.0, abs(fract(vPosW.y / 0.9 + 0.5) - 0.5) * 0.9);
    col += (seam + band * 0.7) * uGraphite * 0.28;

    // Skirting where the wall meets the floor, so the corridor visibly ends
    // on the ground plane instead of floating.
    col *= 0.55 + 0.45 * smoothstep(0.0, 0.22, vPosW.y);

    // The last of the aisle light, pooled low and centred.
    float pool = (1.0 - smoothstep(0.0, uAisle * 2.4, ax)) * (1.0 - smoothstep(0.0, 2.2, vPosW.y));
    col += uCyan * pool * pool * 0.055;

    // Converge on exactly the colour the racks and floor fade to, so the join
    // at the vanishing point is invisible.
    vec3 far = mix(uDeep, uCampus, uWorld * 0.85);
    col = mix(col, far, 0.62);

    // Soft-edged, so the plane never shows its own rectangle against whatever
    // the host clears the frame to.
    float a = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x)
            * smoothstep(1.0, 0.72, vUv.y);

    // The aperture. Shut at rest — it only opens as the hold ring turns the
    // world over toward the daylight campus.
    float w  = smoothstep(0.06, 1.0, uWorld);
    vec2  q  = vUv - vec2(0.5, 0.16);
    float ap = smoothstep(0.02 + 0.85 * w, 0.0, length(q * vec2(1.0, 2.6)));
    col = mix(col, uCampus, ap * w);
    a = max(a, ap * w);
    col = mix(col, uCampus, smoothstep(0.80, 1.0, uWorld));

    float n = fract(sin(dot(gl_FragCoord.xy + uTime, vec2(12.9898, 78.233))) * 43758.5453);
    col += (n - 0.5) * 0.022;

    if (a < 0.004) discard;
    gl_FragColor = vec4(col, a);
  }
`;

const WALL_VERT = /* glsl */ `
  varying vec2  vUv;
  varying vec3  vPosW;
  varying float vView;
  void main(){
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPosW = world.xyz;
    vec4 mv = viewMatrix * world;
    vView = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

/* --- airborne motes ----------------------------------------------------- */

const MOTE_VERT = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  uniform float uHeight;
  uniform float uSize;
  uniform float uPixel;
  varying float vAlpha;

  void main(){
    vec3 p = position;
    p.y = mod(p.y + uTime * (0.035 + 0.075 * aSeed), uHeight);
    p.x += sin(uTime * 0.28 + aSeed * 21.0) * 0.16;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float d = max(-mv.z, 0.001);
    gl_PointSize = uSize * uPixel * (7.0 / d);
    // Hold them off the lens at the near end and let them dissolve at the far.
    vAlpha = smoothstep(0.8, 2.6, d) * exp(-d * 0.045);
    gl_Position = projectionMatrix * mv;
  }
`;

const MOTE_FRAG = /* glsl */ `
  precision mediump float;
  uniform sampler2D uMap;
  uniform float uWorld;
  uniform vec3  uTint;
  varying float vAlpha;

  void main(){
    float m = texture2D(uMap, gl_PointCoord).a;
    float a = m * vAlpha * 0.36 * (1.0 - smoothstep(0.1, 0.85, uWorld));
    if (a < 0.003) discard;
    gl_FragColor = vec4(uTint, a);
  }
`;

/* --- the fabric: fibre runs and the packets on them ---------------------- */

/*
 * One mesh draws both. A path is a straight or bowed segment between two
 * points, handed to the shader as instance attributes rather than baked into
 * geometry, so the same 12-segment ribbon serves as a fibre run (spanning the
 * whole path) and as a packet (spanning a 26cm window sliding along it). That
 * keeps the entire data-movement layer at one draw call, and it guarantees the
 * packets ride exactly on the runs, because they are solving the same curve.
 *
 * Nothing here integrates: the head of a packet is `fract(phase + t * speed)`
 * and the traffic level is read straight off `scroll`, so scrubbing backwards
 * quietens the hall exactly as scrubbing forward filled it, and reduced motion
 * (uTime pinned at 0 by the host) leaves every packet parked at its own seeded
 * phase — spread along the fabric, simply not moving.
 */

const FABRIC_VERT = /* glsl */ `
  attribute vec3  aFrom;
  attribute vec3  aTo;
  attribute float aBow;
  attribute float aKind;    // 0 = fibre run, 1 = packet
  attribute float aPhase;
  attribute float aRank;    // traffic level at which this instance wakes
  attribute float aSeed;

  uniform float uTime;
  uniform float uWorld;
  uniform float uTraffic;
  uniform float uPx;        // view-space size of one drawing-buffer pixel, per unit depth
  uniform float uFibreW;
  uniform float uPacketW;
  uniform float uStreakLen;
  uniform float uSpeed;

  varying float vS;
  varying float vAlong;
  varying float vAcross;
  varying float vKind;
  varying float vSeed;
  varying float vView;
  varying float vAtten;
  varying float vGain;
  varying float vBurst;

  float h11(float n){ return fract(sin(n * 17.13) * 43758.5453123); }

  vec3 pathAt(float t){
    vec3 p = mix(aFrom, aTo, t);
    // Cross-aisle links bow up over the cold aisle, so a hop between rows
    // reads as a hop and not as a wire strung through the lens.
    p.y += aBow * 4.0 * t * (1.0 - t);
    return p;
  }

  void main(){
    vKind   = aKind;
    vSeed   = aSeed;
    vAlong  = uv.x;
    vAcross = uv.y;

    // Traffic gate. Ranks are spread 0..1, so raising uTraffic wakes the
    // fabric progressively instead of switching it on.
    vGain = smoothstep(aRank, aRank + 0.08, uTraffic);

    float len3 = max(length(aTo - aFrom), 0.05);

    // Link saturation. A windowed hash makes this a rare, short, discrete
    // event on one path rather than a modulation running on all of them.
    float win   = floor(uTime * 0.31 + aSeed * 6.0);
    float bt    = fract(uTime * 0.31 + aSeed * 6.0);
    float burst = step(0.87, h11(win + aSeed * 53.0)) * pow(max(0.0, 1.0 - bt * 4.5), 2.0);
    vBurst = burst;

    float t;
    if (aKind < 0.5) {
      t = uv.x;                       // the run spans its whole path
    } else {
      // Speed and streak are specified in metres, then divided by the path
      // length, so a 90cm riser and a 13m aisle run carry packets of the same
      // physical size travelling at the same physical speed.
      float sp   = uSpeed * (0.55 + 0.95 * h11(aSeed * 11.7)) / len3;
      float head = fract(aPhase + uTime * sp * (1.0 + burst * 1.8));
      float len  = (uStreakLen * (0.7 + 0.7 * h11(aSeed * 3.1))) / len3;
      t = mix(head - len, head, uv.x);
    }
    vS = t;

    vec4 mv  = modelViewMatrix * vec4(pathAt(t), 1.0);
    vec4 mvn = modelViewMatrix * vec4(pathAt(t + 0.02), 1.0);
    vView = -mv.z;

    // Ribbon billboarded in view space along its own direction of travel.
    // Constant world thickness, floored at ~1.7 drawing-buffer pixels so a
    // hairline cannot scintillate on a renderer built with antialias:false —
    // with alpha scaled back by exactly the widening, so a distant run loses
    // brightness rather than gaining it.
    vec2  d2  = mvn.xy - mv.xy;
    float dl  = length(d2);
    vec2  dir = dl > 1e-5 ? d2 / dl : vec2(1.0, 0.0);
    vec2  nrm = vec2(-dir.y, dir.x);

    float wWorld = mix(uFibreW, uPacketW, step(0.5, aKind));
    float w      = max(wWorld, max(vView, 0.05) * uPx);
    vAtten       = wWorld / w;

    mv.xy += nrm * (uv.y - 0.5) * w;

    // A dormant instance is thrown outside the frustum whole. This is the
    // cheapest cull there is: no fragment is ever raised for it, which is what
    // keeps the fill-rate cost of this layer proportional to `uTraffic` on a
    // phone rather than to the instance count.
    if (vGain <= 0.002 || uWorld > 0.94) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }

    gl_Position = projectionMatrix * mv;
  }
`;

const FABRIC_FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uWorld;
  uniform float uFog;
  uniform float uTraffic;
  uniform float uNear;
  uniform float uFar;
  uniform vec3  uCyan;
  uniform vec3  uIce;
  uniform vec3  uGold;

  varying float vS;
  varying float vAlong;
  varying float vAcross;
  varying float vKind;
  varying float vSeed;
  varying float vView;
  varying float vAtten;
  varying float vGain;
  varying float vBurst;

  void main(){
    float across = 1.0 - abs(vAcross * 2.0 - 1.0);
    vec3  col;
    float a;

    if (vKind < 0.5) {
      // The run itself: structure, not an effect. Nearly dark at rest, with a
      // light walking it, and the whole length flashing when the link saturates.
      float pulse = 0.0;
      for (int i = 0; i < 2; i++) {
        float fi = float(i);
        float ph = fract(uTime * (0.15 + 0.11 * fi) + vSeed * (3.0 + fi * 7.0));
        pulse += smoothstep(0.11, 0.0, abs(vS - ph));
      }
      pulse = min(pulse, 1.0);
      col = mix(uCyan, uIce, min(1.0, pulse * 0.55 + vBurst * 0.8));
      a   = pow(across, 1.5)
          * (0.040 + 0.045 * uTraffic
             + 0.150 * pulse * (0.35 + 0.65 * uTraffic)
             + 0.420 * vBurst);
      // Only a saturation burst is allowed over the 0.62 bloom threshold.
      a = min(a, 0.62);
    } else {
      // A quantum with a short wake. Hard head, sixth-power falloff: it has to
      // read as one thing arriving, never as a smear of light.
      float s     = clamp(vAlong, 0.0, 1.0);
      float head  = pow(s, 6.0);
      float wake  = pow(s, 1.6) * 0.16;
      float shape = (head + wake) * pow(across, 1.8);
      col = mix(uCyan, uIce, 0.30 + 0.55 * head);
      // The one attention colour in the hall, on about one packet in thirty.
      col = mix(col, uGold, step(0.966, vSeed) * 0.65);
      a   = shape * (0.42 + 0.26 * uTraffic + 0.30 * vBurst);
      // Peak add is ~0.72 x a sub-unity tint, so a packet sits around 0.8 over
      // the aisle floor: comfortably above the 0.62 threshold this stage is
      // graded at, comfortably below clipping to white.
      a = min(a, 0.72);
    }

    // Fade both ends of the run so nothing pops into existence in mid-air.
    a *= smoothstep(0.0, 0.035, vS) * smoothstep(1.0, 0.962, vS);
    a *= vGain * vAtten;
    // Off the lens at the near end, into the haze at the far. Both are
    // re-composed for portrait, where the copy owns the middle of the frame
    // and the traffic has to live in the near bands above and below the type.
    a *= smoothstep(uNear * 0.25, uNear, vView);
    a *= exp(-vView * uFar * uFog);
    a *= 1.0 - smoothstep(0.05, 0.75, uWorld);
    col = mix(col, vec3(1.0), uWorld * 0.35);

    // Discards the transparent margin of every ribbon, which is most of the
    // quad — the blend unit never touches those fragments.
    if (a < 0.005) discard;
    gl_FragColor = vec4(col, a);
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

interface Plan {
  racksPerRow: number;
  ledRows: number;
  hazeSlabs: number;
  motes: number;
  shimmer: boolean;
  fog: number;
  contact: number;
}

/** Fixed rack dimensions, in metres, because that is what a rack is. */
const RACK_W = 0.60;   // door width, along the corridor
const RACK_D = 1.05;   // depth, away from the aisle
const RACK_H = 2.05;
const PITCH = 0.68;    // rack centre to rack centre
const CEIL_Y = 3.55;
const TUBE_Y = 3.02;   // overhead coolant run, well clear of the rack tops
const TUBE_Z0 = -3.2;  // where the run starts — never in front of the camera

/* -------------------------------------------------------------------- scene */

export class MachineScene implements StageScene {
  readonly id = 'machine';

  private root = new THREE.Group();
  private plan: Plan = {
    racksPerRow: 19, ledRows: 14, hazeSlabs: 10, motes: 660,
    shimmer: true, fog: 1, contact: 1,
  };

  /** Everything this stage allocated, so `dispose()` can be exhaustive. */
  private trash: Array<{ dispose(): void }> = [];
  private mats: THREE.ShaderMaterial[] = [];

  private racks: THREE.InstancedMesh | null = null;
  private leds: THREE.InstancedMesh | null = null;
  private drops: THREE.InstancedMesh | null = null;
  private hazeSlabs: THREE.InstancedMesh | null = null;
  private tubes: THREE.Mesh[] = [];
  private shimmers: THREE.Mesh[] = [];
  private motes: THREE.Points | null = null;
  private wall: THREE.Mesh | null = null;
  private floorMesh: THREE.Mesh | null = null;
  private ceilMesh: THREE.Mesh | null = null;
  private hallMat: THREE.ShaderMaterial | null = null;
  private wallMat: THREE.ShaderMaterial | null = null;

  private worldMix = 0;
  private scroll = 0;
  private time = 0;

  // Framing. Portrait tightens the aisle and widens the lens rather than
  // shrinking the desktop composition down to a letterbox.
  private aisleHalf = 1.80;
  private narrow = false;
  private camY = 1.56;
  private startZ = 2.6;
  private travel = 12;

  private get corridorLen(): number {
    return 0.7 + this.plan.racksPerRow * PITCH;
  }

  /* --------------------------------------------------------------- build */

  build(ctx: SceneContext, settings: TierSettings): void {
    this.plan = this.makePlan(settings);
    this.root.name = 'stage-machine';
    ctx.scene.add(this.root);
    this.buildContent();
    this.frame(ctx);
    this.applyWorldMix();
  }

  private makePlan(s: TierSettings): Plan {
    // `terrainSegments` is the tier's geometry budget dial in this project, so
    // the corridor length rides on it: 19 racks a side at HIGH, 7 at LOW.
    const racksPerRow = THREE.MathUtils.clamp(Math.round(s.terrainSegments / 17), 6, 22);
    return {
      racksPerRow,
      ledRows: s.shadows ? 14 : s.fog ? 9 : 5,
      hazeSlabs: s.shadows ? 10 : s.fog ? 7 : 4,
      motes: Math.max(80, Math.round(s.particleCount * 0.6)),
      // No heat shimmer at all on LOW — it is the one layer that costs
      // overdraw across the whole upper half of the frame.
      shimmer: s.fog,
      fog: s.fog ? 1 : 0.45,
      contact: s.shadows ? 1 : 0.45,
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

  private buildContent(): void {
    this.buildHall();
    this.buildRacks();
    this.buildLeds();
    this.buildCoolant();
    this.buildShimmer();
    this.buildHaze();
    this.buildMotes();
    this.layout();
  }

  private buildHall(): void {
    const len = this.corridorLen + 10;
    const geoF = this.track(new THREE.PlaneGeometry(14, len, 1, 1));
    const geoC = this.track(new THREE.PlaneGeometry(14, len, 1, 1));
    const m = this.mat(new THREE.ShaderMaterial({
      vertexShader: HALL_VERT,
      fragmentShader: HALL_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uWorld: { value: 0 },
        uFog: { value: this.plan.fog },
        uAisle: { value: this.aisleHalf },
        uCeil: { value: CEIL_Y },
        uContact: { value: this.plan.contact },
        uDeep: { value: new THREE.Color(PAL.deep) },
        uGraphite: { value: new THREE.Color(PAL.machine) },
        uCyan: { value: new THREE.Color(PAL.cyan) },
        uCampus: { value: new THREE.Color(PAL.campus) },
      },
    }));
    this.hallMat = m;

    const z = -this.corridorLen / 2 + 2;
    this.floorMesh = new THREE.Mesh(geoF, m);
    this.floorMesh.rotation.x = -Math.PI / 2;
    this.floorMesh.position.set(0, 0, z);
    this.floorMesh.frustumCulled = false;

    this.ceilMesh = new THREE.Mesh(geoC, m);
    this.ceilMesh.rotation.x = Math.PI / 2;
    this.ceilMesh.position.set(0, CEIL_Y, z);
    this.ceilMesh.frustumCulled = false;

    // The end of the aisle. A wall rather than clear colour, so this stage
    // never has to reach into the renderer the host owns.
    const wallGeo = this.track(new THREE.PlaneGeometry(18, 10, 1, 1));
    const wallMat = this.mat(new THREE.ShaderMaterial({
      vertexShader: WALL_VERT,
      fragmentShader: WALL_FRAG,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uWorld: { value: 0 },
        uFog: { value: this.plan.fog },
        uAisle: { value: this.aisleHalf },
        uDeep: { value: new THREE.Color(PAL.deep) },
        uGraphite: { value: new THREE.Color(PAL.machine) },
        uCyan: { value: new THREE.Color(PAL.cyan) },
        uCampus: { value: new THREE.Color(PAL.campus) },
      },
    }));
    this.wallMat = wallMat;
    this.wall = new THREE.Mesh(wallGeo, wallMat);
    // Geometry is centred, so sitting it at y = 5 puts its base on the floor.
    this.wall.position.set(0, 5, -this.corridorLen - 2.2);
    this.wall.frustumCulled = false;

    this.root.add(this.floorMesh, this.ceilMesh, this.wall);
  }

  private buildRacks(): void {
    const n = this.plan.racksPerRow * 2;
    const geo = this.track(new THREE.BoxGeometry(RACK_D, RACK_H, RACK_W));

    const seed = new Float32Array(n);
    const side = new Float32Array(n);
    const depth = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const row = i % 2 === 0 ? 1 : -1;             // even = left row
      const idx = Math.floor(i / 2);
      seed[i] = Math.random() * 97 + idx * 0.37;
      side[i] = row;
      depth[i] = this.plan.racksPerRow > 1 ? idx / (this.plan.racksPerRow - 1) : 0;
    }
    geo.setAttribute('iSeed', new THREE.InstancedBufferAttribute(seed, 1));
    geo.setAttribute('iSide', new THREE.InstancedBufferAttribute(side, 1));
    geo.setAttribute('iDepth', new THREE.InstancedBufferAttribute(depth, 1));

    const m = this.mat(new THREE.ShaderMaterial({
      vertexShader: RACK_VERT,
      fragmentShader: RACK_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uWorld: { value: 0 },
        uFog: { value: this.plan.fog },
        uRackH: { value: RACK_H },
        uGraphite: { value: new THREE.Color(PAL.machine) },
        uDeep: { value: new THREE.Color(PAL.deep) },
        uCyan: { value: new THREE.Color(PAL.cyan) },
        uCampus: { value: new THREE.Color(PAL.campus) },
      },
    }));

    this.racks = new THREE.InstancedMesh(geo, m, n);
    this.racks.frustumCulled = false;
    this.root.add(this.racks);
  }

  private buildLeds(): void {
    const perRack = this.plan.ledRows * 2;
    const n = this.plan.racksPerRow * 2 * perRack;
    const geo = this.track(new THREE.PlaneGeometry(0.052, 0.020, 1, 1));

    const seed = new Float32Array(n);
    const rate = new Float32Array(n);
    const kind = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      seed[i] = Math.random();
      // Varied rates are the whole point: a wall of lights on one clock reads
      // as decoration, a wall on forty clocks reads as work being done.
      rate[i] = 0.35 + Math.random() * Math.random() * 5.5;
      const r = Math.random();
      kind[i] = r > 0.985 ? 0.97 : r > 0.58 ? 0.75 : Math.random() * 0.5;
    }
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1));
    geo.setAttribute('aRate', new THREE.InstancedBufferAttribute(rate, 1));
    geo.setAttribute('aKind', new THREE.InstancedBufferAttribute(kind, 1));

    const m = this.mat(new THREE.ShaderMaterial({
      vertexShader: LED_VERT,
      fragmentShader: LED_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uWorld: { value: 0 },
        uFog: { value: this.plan.fog },
        uCyan: { value: new THREE.Color(PAL.cyan) },
        uIce: { value: new THREE.Color(PAL.ice) },
        uGold: { value: new THREE.Color(PAL.gold) },
      },
    }));

    this.leds = new THREE.InstancedMesh(geo, m, n);
    this.leds.frustumCulled = false;
    this.leds.renderOrder = 2;
    this.root.add(this.leds);
  }

  private buildCoolant(): void {
    const len = this.corridorLen;
    const seg = Math.max(12, this.plan.racksPerRow * 2);

    const makeMat = (dir: number, axis: number, a: string, b: string, repeat: number, gain: number) =>
      this.mat(new THREE.ShaderMaterial({
        vertexShader: COOLANT_VERT,
        fragmentShader: COOLANT_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: {
          uTime: { value: 0 },
          uWorld: { value: 0 },
          uFog: { value: this.plan.fog },
          uAxis: { value: axis },
          uDir: { value: dir },
          uRepeat: { value: repeat },
          uGain: { value: gain },
          uTintA: { value: new THREE.Color(a) },
          uTintB: { value: new THREE.Color(b) },
        },
      }));

    // Supply runs cold toward the far end; return runs warm back toward us.
    this.builtAisleHalf = this.aisleHalf;
    const supply = makeMat(1, 0, PAL.coolant, PAL.ice, 26, 1);
    const ret = makeMat(-1, 0, PAL.ret, PAL.gold, 22, 0.85);

    for (const sgn of [-1, 1]) {
      for (const [mat, off, r] of [[supply, 0.30, 0.022], [ret, 0.62, 0.019]] as const) {
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= seg; i++) {
          const t = i / seg;
          // The run begins well down the hall, not at the lens: at rest the
          // camera should be looking *under* it, never through it.
          const z = TUBE_Z0 - t * (len + TUBE_Z0 + 1.6);
          // A hair of sag between hangers. Perfectly straight pipe looks CG.
          const y = TUBE_Y + Math.sin(t * seg * 0.9) * 0.010;
          pts.push(new THREE.Vector3(sgn * (this.aisleHalf + off), y, z));
        }
        const curve = new THREE.CatmullRomCurve3(pts);
        const geo = this.track(new THREE.TubeGeometry(curve, seg, r, 7, false));
        const mesh = new THREE.Mesh(geo, mat);
        mesh.frustumCulled = false;
        mesh.renderOrder = 1;
        this.tubes.push(mesh);
        this.root.add(mesh);
      }
    }

    // One drop per rack, manifold down to the cold plates.
    const n = this.plan.racksPerRow * 2;
    const dropGeo = this.track(new THREE.CylinderGeometry(0.013, 0.013, TUBE_Y - RACK_H, 6, 1, true));
    const dropMat = makeMat(1, 1, PAL.coolant, PAL.ice, 5, 0.60);
    this.drops = new THREE.InstancedMesh(dropGeo, dropMat, n);
    this.drops.frustumCulled = false;
    this.drops.renderOrder = 1;
    this.root.add(this.drops);
  }

  private buildShimmer(): void {
    if (!this.plan.shimmer) return;
    const len = this.corridorLen;
    for (const sgn of [-1, 1]) {
      const geo = this.track(new THREE.PlaneGeometry(len, 1.25, 24, 10));
      const m = this.mat(new THREE.ShaderMaterial({
        vertexShader: SHIMMER_VERT,
        fragmentShader: SHIMMER_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uWorld: { value: 0 },
          uFog: { value: this.plan.fog },
          uAmount: { value: this.plan.contact },
          uCyan: { value: new THREE.Color(PAL.cyan) },
          uWarm: { value: new THREE.Color(PAL.ret) },
        },
      }));
      const mesh = new THREE.Mesh(geo, m);
      mesh.rotation.y = sgn > 0 ? -Math.PI / 2 : Math.PI / 2;
      mesh.position.set(sgn * (this.aisleHalf + 0.06), RACK_H + 0.58, -len / 2 + 0.4);
      mesh.frustumCulled = false;
      mesh.renderOrder = 3;
      this.shimmers.push(mesh);
      this.root.add(mesh);
    }
  }

  private buildHaze(): void {
    const n = this.plan.hazeSlabs;
    const geo = this.track(new THREE.PlaneGeometry(9, CEIL_Y, 1, 1));
    const seeds = new Float32Array(n);
    for (let i = 0; i < n; i++) seeds[i] = Math.random() * 13;
    geo.setAttribute('sSeed', new THREE.InstancedBufferAttribute(seeds, 1));

    const m = this.mat(new THREE.ShaderMaterial({
      vertexShader: HAZE_VERT,
      fragmentShader: HAZE_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uWorld: { value: 0 },
        uFog: { value: this.plan.fog },
        uCyan: { value: new THREE.Color(PAL.cyan) },
        uCampus: { value: new THREE.Color(PAL.campus) },
      },
    }));

    this.hazeSlabs = new THREE.InstancedMesh(geo, m, n);
    this.hazeSlabs.frustumCulled = false;
    this.hazeSlabs.renderOrder = 4;
    this.root.add(this.hazeSlabs);
  }

  private buildMotes(): void {
    const n = this.plan.motes;
    const len = this.corridorLen;
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * (this.aisleHalf * 2.6);
      pos[i * 3 + 1] = Math.random() * CEIL_Y;
      pos[i * 3 + 2] = 1.5 - Math.random() * (len + 3);
      seed[i] = Math.random();
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
        uTime: { value: 0 },
        uWorld: { value: 0 },
        uHeight: { value: CEIL_Y },
        uSize: { value: 2.6 },
        uPixel: { value: 1 },
        uMap: { value: tex },
        uTint: { value: new THREE.Color(PAL.ice) },
      },
    }));

    this.motes = new THREE.Points(geo, m);
    this.motes.frustumCulled = false;
    this.motes.renderOrder = 5;
    this.root.add(this.motes);
  }

  /**
   * Place every instance. Split out from `build` because portrait re-composes
   * by tightening the aisle, and that only means rewriting ~40 matrices — far
   * cheaper than rebuilding the corridor.
   */
  private layout(): void {
    const d = new THREE.Object3D();
    const rows = this.plan.racksPerRow;
    const half = this.aisleHalf;

    if (this.racks) {
      for (let i = 0; i < rows * 2; i++) {
        const left = i % 2 === 0;
        const idx = Math.floor(i / 2);
        const z = -(0.7 + idx * PITCH);
        d.position.set((left ? -1 : 1) * (half + RACK_D / 2), RACK_H / 2, z);
        d.rotation.set(0, 0, 0);
        d.scale.set(1, 1, 1);
        d.updateMatrix();
        this.racks.setMatrixAt(i, d.matrix);
      }
      this.racks.instanceMatrix.needsUpdate = true;
    }

    if (this.leds) {
      const cols = 2;
      let k = 0;
      for (let i = 0; i < rows * 2; i++) {
        const left = i % 2 === 0;
        const idx = Math.floor(i / 2);
        const z = -(0.7 + idx * PITCH);
        const x = (left ? -1 : 1) * half + (left ? 0.004 : -0.004);
        for (let r = 0; r < this.plan.ledRows; r++) {
          const y = 0.30 + (r / Math.max(1, this.plan.ledRows - 1)) * 1.42;
          for (let c = 0; c < cols; c++) {
            d.position.set(x, y, z + (c === 0 ? -0.135 : 0.135));
            d.rotation.set(0, left ? Math.PI / 2 : -Math.PI / 2, 0);
            d.scale.set(1, 1, 1);
            d.updateMatrix();
            this.leds.setMatrixAt(k++, d.matrix);
          }
        }
      }
      this.leds.instanceMatrix.needsUpdate = true;
    }

    if (this.drops) {
      for (let i = 0; i < rows * 2; i++) {
        const left = i % 2 === 0;
        const idx = Math.floor(i / 2);
        const z = -(0.7 + idx * PITCH);
        d.position.set((left ? -1 : 1) * (half + 0.30), (TUBE_Y + RACK_H) / 2, z);
        d.rotation.set(0, 0, 0);
        // Racks in front of where the run starts get no drop, so a manifold
        // never hangs from nothing.
        const on = z <= TUBE_Z0 ? 1 : 0;
        d.scale.set(on, on, on);
        d.updateMatrix();
        this.drops.setMatrixAt(i, d.matrix);
      }
      this.drops.instanceMatrix.needsUpdate = true;
    }

    if (this.hazeSlabs) {
      const n = this.plan.hazeSlabs;
      const len = this.corridorLen;
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        d.position.set(0, CEIL_Y / 2, 1.0 - t * (len + 2.0));
        d.rotation.set(0, 0, 0);
        d.scale.set(1, 1, 1);
        d.updateMatrix();
        this.hazeSlabs.setMatrixAt(i, d.matrix);
      }
      this.hazeSlabs.instanceMatrix.needsUpdate = true;
    }

    // Tubes and shimmer veils are whole meshes, so a change in aisle width is
    // just an offset on them — the curve keeps the width it was built at.
    for (let i = 0; i < this.tubes.length; i++) {
      const sgn = i < 2 ? -1 : 1;
      this.tubes[i]!.position.x = sgn * (half - this.builtAisleHalf);
    }
    for (let i = 0; i < this.shimmers.length; i++) {
      const sgn = i === 0 ? -1 : 1;
      this.shimmers[i]!.position.x = sgn * (half + 0.06);
    }

    if (this.hallMat) this.hallMat.uniforms.uAisle!.value = half;
    if (this.wallMat) this.wallMat.uniforms.uAisle!.value = half;
  }

  /** Aisle half-width baked into the tube curves at build time. */
  private builtAisleHalf = 1.80;

  /* -------------------------------------------------------------- runtime */

  update(elapsed: number, _delta: number, scroll: number, ctx: SceneContext): void {
    this.scroll = THREE.MathUtils.clamp(scroll, 0, 1);
    // Reduced motion pins the clock. Blinking LEDs hold at their seeded phase,
    // coolant stops travelling, the haze stops drifting — the room still reads
    // as a finished, deliberate image, just a still one.
    this.time = ctx.reducedMotion ? 0 : elapsed;

    for (const m of this.mats) {
      const u = m.uniforms.uTime;
      if (u) u.value = this.time;
    }
    if (this.motes) {
      const mm = this.motes.material as THREE.ShaderMaterial;
      const p = mm.uniforms.uPixel;
      if (p) p.value = ctx.renderer.getPixelRatio();
    }

    this.dolly(ctx);
  }

  /** Scroll flies the camera down the cold aisle. */
  private dolly(ctx: SceneContext): void {
    const cam = ctx.camera;
    const p = this.scroll;
    const eased = p * p * (3 - 2 * p);
    const z = this.startZ - eased * this.travel;

    // A slow handheld drift so the corridor never feels like a rail. Frozen
    // under reduced motion; the scroll dolly still works, because that is the
    // user's own input rather than autonomous motion.
    const t = this.time;
    const swayX = Math.sin(t * 0.21) * 0.045 + Math.sin(t * 0.07) * 0.03;
    const bobY = Math.sin(t * 0.31) * 0.022;

    cam.position.set(swayX, this.camY + bobY, z);
    cam.rotation.z = Math.sin(t * 0.13) * 0.004;
    cam.lookAt(swayX * 0.4, this.camY - 0.34 + bobY, z - 8);
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
    this.plan = this.makePlan(settings);
    this.clearContent();
    this.buildContent();
    this.frame(ctx);
    this.applyWorldMix();
  }

  frame(ctx: SceneContext): void {
    const narrow = ctx.width < 700;
    const changed = narrow !== this.narrow;
    this.narrow = narrow;

    // Portrait: widen the lens and pull the two rows in toward each other so
    // the corridor still fills the frame with racks. The desktop framing is
    // not scaled down — it is re-composed.
    this.aisleHalf = narrow ? 1.26 : 1.80;
    // Eye line lifted and the lens aimed a little further down the floor, so
    // the aisle reads as a floor receding rather than a slot of racks.
    this.camY = narrow ? 1.46 : 1.56;

    ctx.camera.fov = narrow ? 76 : 52;
    ctx.camera.aspect = ctx.height > 0 ? ctx.width / ctx.height : 1;
    if (ctx.camera.far < 60) ctx.camera.far = 60;
    ctx.camera.updateProjectionMatrix();

    this.startZ = narrow ? 2.2 : 2.6;
    this.travel = this.corridorLen - (narrow ? 1.4 : 1.9);

    if (changed || this.racks) this.layout();
    this.dolly(ctx);
  }

  /* -------------------------------------------------------------- teardown */

  private clearContent(): void {
    // InstancedMesh.dispose() releases the instance matrix buffers, which the
    // geometry/material sweep below does not cover.
    for (const m of [this.racks, this.leds, this.drops, this.hazeSlabs]) m?.dispose();
    this.root.clear();
    for (const item of this.trash) item.dispose();
    this.trash = [];
    this.mats = [];
    this.racks = null;
    this.leds = null;
    this.drops = null;
    this.hazeSlabs = null;
    this.tubes = [];
    this.shimmers = [];
    this.motes = null;
    this.wall = null;
    this.floorMesh = null;
    this.ceilMesh = null;
    this.hallMat = null;
    this.wallMat = null;
  }

  dispose(): void {
    this.clearContent();
    this.root.removeFromParent();
  }
}

/** Factory, for hosts that would rather not `new` a class from a registry. */
export function createMachineScene(): StageScene {
  return new MachineScene();
}

export default MachineScene;
