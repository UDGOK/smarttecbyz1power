/**
 * Stage 3 — THE POWER.
 *
 * Behind-the-meter at Mead, Oklahoma. ~500 kW of on-site solar feeding Z1Power
 * LFP cabinets, feeding a 3 MVA transformer at 208V three-phase. Nobody applied
 * for an interconnection, so the whole world is built out of things we already
 * own: a field of trackers, a bank of cabinets, one block of iron.
 *
 * Everything here is a Three.js primitive plus a shader — no glTF, no textures,
 * no bytes over the wire. The palette is `--c-power` (#f2b705) over
 * `--c-power-deep` (#7a5a02) on near-black; the signal green is reserved for UI
 * that means "live" and never appears in the world.
 *
 * `setWorldMix(t)` blends this world (t=0) toward the graphite/blue compute hall
 * (t=1): the panels dither-dissolve row by row, the gold desaturates to a cool
 * machine cast, and the current turns blue. It is one shared uniform write, so
 * the hold-to-advance ring can scrub it at 60fps in both directions.
 */

import * as THREE from 'three';
import { TIER_SETTINGS } from '../quality';
import type { SceneContext, StageScene, TierSettings } from './types';

/* ------------------------------------------------------------------ *
 * World constants — the composition is fixed; only density is tiered.
 * ------------------------------------------------------------------ */

/** Direction *toward* the low sun. Just above the horizon, left of the axis. */
const SUN = new THREE.Vector3(-0.24, 0.032, -1).normalize();
/** Same azimuth the sky shader derives from a view ray, so shafts line up. */
const SUN_AZ = Math.atan2(SUN.x, -SUN.z) / (Math.PI * 2) + 0.5;

const FIELD_Z_NEAR = 0;     // first row of trackers, level with the camera
const ROW_SPACING = 4.3;    // fixed, so tier changes the field's depth, not its look
const COL_SPACING = 4.9;
const FIELD_X0 = -104;
const FIELD_X1 = 104;
const FIELD_COLS = Math.round((FIELD_X1 - FIELD_X0) / COL_SPACING) + 1;
const PANEL_W = 4.2;
const PANEL_H = 2.0;
const PANEL_TILT = 0.24;    // radians off horizontal, tipped toward the sun
const TORQUE_TUBE_Y = 1.55;

/** Graded clearing the plant stands in — no tracker is built inside it. */
const CLEAR_X0 = -24;
const CLEAR_X1 = 18;
const CLEAR_Z0 = -27;
const CLEAR_Z1 = 8;

const BANK_Z = -20;         // the cabinet bank, silhouetted against the field
const BANK_X0 = -16.5;
const BANK_X1 = -3.5;
const CAB_W = 1.55;
const CAB_H = 3.0;
const CAB_D = 1.9;

const XFMR = new THREE.Vector3(9.0, 0, -9.0); // 3 MVA, foreground right
const XFMR_W = 5.0;
const XFMR_H = 4.2;
const XFMR_D = 3.2;

/** Time the clock is pinned to when the user asked for no motion. */
const STILL_T = 8.0;

const C_GOLD = '#f2b705';       // --c-power
const C_GOLD_DEEP = '#7a5a02';  // --c-power-deep
const C_EMBER = '#ffc832';      // --c-gold, stored energy
const C_NIGHT = '#06070a';
const C_DIRT = '#2e2010';
const C_MACHINE = '#10161f';    // --c-machine, the world we dissolve toward
const C_BLUE = '#3f7fd0';

/* ------------------------------------------------------------------ *
 * Shared GLSL
 * ------------------------------------------------------------------ */

/** Value noise + fbm, same construction as the stage-1 terrain. */
const NOISE = /* glsl */ `
  vec2 hash2(vec2 p){
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(dot(hash2(i + vec2(0.0,0.0)), f - vec2(0.0,0.0)),
                   dot(hash2(i + vec2(1.0,0.0)), f - vec2(1.0,0.0)), u.x),
               mix(dot(hash2(i + vec2(0.0,1.0)), f - vec2(0.0,1.0)),
                   dot(hash2(i + vec2(1.0,1.0)), f - vec2(1.0,1.0)), u.x), u.y);
  }
  float fbm(vec2 p){
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }
`;

/**
 * One idiom for the whole stage: keep the luminance, throw the hue away, and
 * re-tint it graphite/blue. Every material calls this with the same uMix, which
 * is why the transition costs one uniform write.
 */
const COOL = /* glsl */ `
  vec3 coolDown(vec3 c, vec3 machine, vec3 blue, float m){
    float lum = dot(c, vec3(0.299, 0.587, 0.114));
    vec3 cool = machine * (0.40 + lum * 0.9) + lum * blue * 0.95;
    // Bias the crossfade early. A linear gold-to-blue mix spends its whole
    // middle sitting on neutral mud; front-loading it means the world has
    // visibly turned cold by the time the ring is half held.
    float k = pow(clamp(m, 0.0, 1.0), 0.55);
    return mix(c, cool, k) * (1.0 - 0.18 * m);
  }
`;

/** Ordered-ish hash dither, so a dissolve needs no alpha sorting. */
const DITHER = /* glsl */ `
  float dither(vec2 p){
    return fract(sin(dot(floor(p), vec2(12.9898, 78.233))) * 43758.5453);
  }
`;

const GRAIN = /* glsl */ `
  float grain(vec2 p, float t){
    return fract(sin(dot(p + t, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  }
`;

/* ------------------------------------------------------------------ *
 * Sky — the low sun and its shafts, on a backside sphere so it covers
 * the frame whatever the camera does.
 * ------------------------------------------------------------------ */

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main(){
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uMix;
  uniform float uFog;
  uniform float uSunAz;
  uniform vec2  uRes;
  uniform vec3  uSun;
  uniform vec3  uGold;
  uniform vec3  uGoldDeep;
  uniform vec3  uNight;
  uniform vec3  uMachine;
  uniform vec3  uBlue;
  varying vec3  vDir;

  float hash1(float n){ return fract(sin(n) * 43758.5453123); }
  ${COOL}
  ${GRAIN}

  void main(){
    vec3 d = normalize(vDir);
    float el = d.y;
    float az = atan(d.x, -d.z) * 0.15915494 + 0.5;

    // Overhead is almost black; the last few degrees above the horizon carry
    // the whole gold budget. Anything below the horizon is ground haze — the
    // dirt plane is drawn over it, this only has to hide the seam.
    vec3 high = uNight;
    vec3 low  = mix(uGoldDeep * 0.95, uGold * 0.34, 0.45);
    vec3 col  = mix(low, high, smoothstep(-0.012, 0.30, el));

    // A dust layer on the section line. It lifts the last two degrees of sky,
    // gives the horizon an edge to be an edge against, and is what the sun
    // has to burn through on its way down.
    float haze = smoothstep(0.085, 0.002, el);
    col = mix(col, mix(uGoldDeep * 0.80, uGold * 0.26, 0.4), haze * 0.65);
    col = mix(uGoldDeep * 0.34, col, smoothstep(-0.12, 0.004, el));

    // The sun, scattered over five decades of falloff instead of stamped as a
    // disc: a core, a corona, a glow, and a wash that reaches half the sky.
    // The lower limb is eaten by the same haze, so it sets *into* the horizon.
    float sd  = max(dot(d, uSun), 0.0);
    float ext = smoothstep(0.004, 0.036, el);
    float disc = smoothstep(0.99948, 0.99986, sd);
    float scatter = pow(sd, 2400.0) * 1.30
                  + pow(sd,  320.0) * 0.80
                  + pow(sd,   60.0) * 0.42
                  + pow(sd,   14.0) * 0.24
                  + pow(sd,    3.0) * 0.06;
    float smear = pow(max(1.0 - abs(el - uSun.y) * 7.0, 0.0), 3.0)
                * pow(max(1.0 - abs(az - uSunAz) * 1.7, 0.0), 2.0);
    col += (disc * 1.35 * ext + scatter * (0.30 + 0.70 * ext)) * uGold;
    col += smear * uGoldDeep * 1.15;

    // Volumetric shafts — the same five-tap loop as the land, but rooted on the
    // sun's azimuth instead of scattered across the frame.
    float shafts = 0.0;
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      float x  = uSunAz + (hash1(fi * 12.7) - 0.5) * 0.20;
      float w  = 0.004 + hash1(fi * 31.3) * 0.013;
      float sway = sin(uTime * (0.10 + hash1(fi * 5.1) * 0.14) + fi) * 0.005;
      float band = smoothstep(w, 0.0, abs(az - x - sway));
      shafts += band * (0.35 + 0.65 * hash1(fi * 77.7));
    }
    shafts *= smoothstep(-0.02, 0.60, el) * (0.55 + 0.45 * uFog);
    col += shafts * uGold * 0.55;

    col = coolDown(col, uMachine, uBlue, uMix);
    col += grain(gl_FragCoord.xy, uTime) * 0.03;

    // Vignette, so the floating chrome always has contrast to sit on.
    vec2 c = gl_FragCoord.xy / max(uRes, vec2(1.0)) - 0.5;
    col *= 1.0 - dot(c, c) * 0.92;

    gl_FragColor = vec4(col, 1.0);
  }
`;

/* ------------------------------------------------------------------ *
 * Ground — red Oklahoma dirt, raked by the sun, hazing to the horizon.
 * ------------------------------------------------------------------ */

const GROUND_VERT = /* glsl */ `
  varying vec3  vW;
  varying float vH;
  ${NOISE}
  void main(){
    vec3 pos = position;
    // Colour variation everywhere, relief only past 150 units. The site is
    // graded flat where the plant stands — which is also what keeps the
    // contact patches and the panel rows from sinking into the dirt.
    vH = fbm(pos.xy * 0.05) + fbm(pos.xy * 0.30) * 0.3;
    float relief = fbm(pos.xy * 0.012) * smoothstep(150.0, 320.0, length(pos.xy));
    pos.z += relief * 3.2;         // plane is rotated flat, so +z is up
    vec4 wp = modelMatrix * vec4(pos, 1.0);
    vW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const GROUND_FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uMix;
  uniform float uFog;
  uniform vec2  uRes;
  uniform vec3  uSun;
  uniform vec3  uGold;
  uniform vec3  uGoldDeep;
  uniform vec3  uDirt;
  uniform vec3  uMachine;
  uniform vec3  uBlue;
  varying vec3  vW;
  varying float vH;
  ${COOL}
  ${GRAIN}

  void main(){
    vec3 toCam = cameraPosition - vW;
    float dist = length(toCam);
    vec3 V = toCam / max(dist, 0.001);

    // Graded dirt lit by the whole gold sky, not by one lamp — a flat plane
    // under a sunset collects a lot of skylight, and without it the plant
    // reads as floating in black.
    float h = clamp(vH * 1.4 + 0.5, 0.0, 1.0);
    vec3 col = mix(uDirt * 0.62, uDirt * 1.30, smoothstep(0.20, 0.92, h));
    col += uGoldDeep * 0.30;

    // Grazing rake toward the sun: the section brightens hard where you look
    // down the sun's azimuth, which is what separates ground from sky.
    vec3 sunFlat = normalize(vec3(uSun.x, 0.0, uSun.z));
    float rake = pow(max(dot(-V, sunFlat), 0.0), 3.0);
    col += rake * uGoldDeep * 1.15 * smoothstep(8.0, 95.0, dist);

    // Base distance fade is always on — it is what hides the far edge of the
    // geometry. uFog only adds the extra volumetric lift on top.
    float fade = smoothstep(30.0, 178.0, dist);
    vec3 horizon = mix(uGoldDeep * 0.62, uGold * 0.22, 0.45);
    col = mix(col, horizon, fade * (0.72 + 0.28 * uFog));
    col += uFog * smoothstep(60.0, 190.0, dist) * uGoldDeep * 0.22;

    // The last few metres fall away so white type always has black to sit on.
    col *= 0.42 + 0.58 * smoothstep(5.0, 34.0, dist);

    col = coolDown(col, uMachine, uBlue, uMix);
    col += grain(gl_FragCoord.xy, uTime) * 0.028;

    vec2 c = gl_FragCoord.xy / max(uRes, vec2(1.0)) - 0.5;
    col *= 1.0 - dot(c, c) * 0.75;

    gl_FragColor = vec4(col, 1.0);
  }
`;

/* ------------------------------------------------------------------ *
 * Solar panels — instanced planes on single-axis trackers, with an
 * anisotropic sheen so the rows shimmer as the camera moves.
 * ------------------------------------------------------------------ */

const PANEL_VERT = /* glsl */ `
  uniform float uTime;
  attribute float aSeed;
  varying vec3  vW;
  varying vec3  vN;
  varying vec3  vT;
  varying vec2  vUv;
  varying float vSeed;

  void main(){
    vUv   = uv;
    vSeed = aSeed;

    // Single-axis tracking: rotate about the panel's own long axis before the
    // instance transform, so the whole row breathes without the field moving.
    float w = sin(uTime * 0.11 + aSeed * 6.2831) * 0.05;
    float cw = cos(w), sw = sin(w);
    mat2 rot = mat2(cw, -sw, sw, cw);

    vec3 p = position;  p.yz = rot * p.yz;
    vec3 n = normal;    n.yz = rot * n.yz;

    mat3 im = mat3(instanceMatrix);
    vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
    vW = wp.xyz;
    vN = normalize(mat3(modelMatrix) * im * n);
    vT = normalize(mat3(modelMatrix) * im * vec3(1.0, 0.0, 0.0));
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const PANEL_FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uMix;
  uniform float uFog;
  uniform float uFar;
  uniform vec3  uSun;
  uniform vec3  uGold;
  uniform vec3  uGoldDeep;
  uniform vec3  uGlass;
  uniform vec3  uSky;
  uniform vec3  uMachine;
  uniform vec3  uBlue;
  varying vec3  vW;
  varying vec3  vN;
  varying vec3  vT;
  varying vec2  vUv;
  varying float vSeed;
  ${COOL}
  ${DITHER}

  void main(){
    // Dither dissolve toward the compute hall. Row by row, back to front, and
    // perfectly reversible because the threshold is a pure function of uMix.
    float vis = 1.0 - smoothstep(vSeed * 0.55, vSeed * 0.55 + 0.45, uMix);
    if (vis < dither(gl_FragCoord.xy)) discard;

    vec3 toCam = cameraPosition - vW;
    float dist = length(toCam);
    vec3 V = toCam / max(dist, 0.001);
    vec3 Ng = normalize(vN);          // the glass side, always
    vec3 N  = gl_FrontFacing ? Ng : -Ng;
    vec3 T  = normalize(vT);

    // The array is tipped away from us, toward a sun sitting on the horizon.
    // So the glass is fully lit and we are looking at the backs of the rows —
    // which is exactly what a tracker field looks like into a low sun.
    float NoL = max(dot(Ng, uSun), 0.0);
    float NoV = max(dot(N, V), 0.0);

    vec2 g = abs(fract(vUv * vec2(6.0, 3.0)) - 0.5);
    float cell = 1.0 - smoothstep(0.40, 0.49, max(g.x, g.y)) * 0.55;
    vec2 e = abs(vUv - 0.5);
    float frame = smoothstep(0.448, 0.488, max(e.x, e.y));
    // Per-panel phase, so the array scintillates as the camera dollies rather
    // than flaring as one slab.
    float shim = 0.78 + 0.22 * sin(uTime * 1.7 + vSeed * 41.0);

    vec3 col;
    if (gl_FrontFacing) {
      // Glass. Reflect the view and probe the same sky the backdrop draws:
      // black overhead, gold at the horizon, one hot lobe on the sun.
      float bus = 1.0 - smoothstep(0.006, 0.016, abs(vUv.y - 0.5)) * 0.5;
      col = uGlass * (0.40 + 0.70 * NoL) * cell * bus;
      // Hemisphere: cool slate off the upper sky, gold off the horizon.
      col += mix(uSky * 0.30, uGoldDeep * 0.45, 0.35) * (0.35 + 0.65 * max(N.y, 0.0));

      vec3 R = reflect(-V, N);
      vec3 sky = mix(uGoldDeep * 0.85, vec3(0.0), smoothstep(-0.02, 0.45, R.y));
      sky = mix(uGoldDeep * 0.10, sky, smoothstep(-0.25, -0.02, R.y));

      // Anisotropy: the cells are laminated in strips, so the sun's reflected
      // image smears along the panel's long axis instead of staying a point.
      float rs = max(dot(R, uSun), 0.0);
      float RoT = abs(dot(R, T));
      float rsA = max(rs - RoT * 0.55, 0.0) / max(1.0 - RoT * 0.55, 0.001);
      sky += pow(rsA, 24.0) * uGold * 5.0;
      sky += pow(rs, 4.0) * uGold * 0.30;

      float fres = 0.045 + 0.955 * pow(1.0 - NoV, 5.0);
      col += sky * fres * 1.9 * shim;
      col = mix(col, uGoldDeep * (0.55 + 1.5 * NoL) + uGold * 0.05, frame);
    } else {
      // Backsheet: matte, near-black, with the sun bleeding around the frame.
      col = uGlass * (0.42 + 0.55 * NoV) * (0.85 + 0.15 * cell);
      col += uSky * 0.17 + uGoldDeep * 0.13;
      col += frame * (uGoldDeep * (0.55 + 1.3 * NoL) + uGold * NoL * 0.40);
    }

    // The signature of a backlit array: the far edge of every module burns as
    // a hard line, and thirty of those lines stack into the horizon.
    float lip = smoothstep(0.84, 1.0, vUv.y) * (0.35 + 1.9 * NoL);
    col += lip * mix(uGoldDeep, uGold, 0.65) * (0.45 + 0.75 * shim);

    float fade = smoothstep(uFar * 0.45, uFar, dist);
    vec3 horizon = mix(uGoldDeep * 0.30, uGold * 0.16, 0.5);
    col = mix(col, horizon, fade * (0.75 + 0.25 * uFog));

    col = coolDown(col, uMachine, uBlue, uMix);
    gl_FragColor = vec4(col, 1.0);
  }
`;

/* ------------------------------------------------------------------ *
 * Painted metal — cabinets, transformer tank, fins, bushings, bus duct.
 * ------------------------------------------------------------------ */

const METAL_VERT = /* glsl */ `
  attribute float aSeed;
  varying vec3  vW;
  varying vec3  vN;
  varying vec2  vUv;
  varying float vSeed;
  void main(){
    vUv = uv;
    #ifdef USE_INSTANCING
      vSeed = aSeed;
      mat3 im = mat3(instanceMatrix);
      vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
      vN = normalize(mat3(modelMatrix) * im * normal);
    #else
      vSeed = 0.55;
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vN = normalize(mat3(modelMatrix) * normal);
    #endif
    vW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const METAL_FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uMix;
  uniform float uFog;
  uniform float uRibs;
  uniform vec3  uSun;
  uniform vec3  uGold;
  uniform vec3  uGoldDeep;
  uniform vec3  uBody;
  uniform vec3  uMachine;
  uniform vec3  uBlue;
  varying vec3  vW;
  varying vec3  vN;
  varying vec2  vUv;
  varying float vSeed;
  ${COOL}
  ${DITHER}

  void main(){
    float vis = 1.0 - smoothstep(vSeed * 0.35 + 0.4, vSeed * 0.35 + 0.85, uMix);
    if (vis < dither(gl_FragCoord.xy)) discard;

    vec3 N = normalize(vN);
    vec3 V = normalize(cameraPosition - vW);
    float NoL = max(dot(N, uSun), 0.0);

    // Painted steel: a lambert term for the sun-facing sides, a hard rim where
    // the low sun catches an edge, and a sky term so the tops are not black.
    vec3 col = uBody * (0.45 + 1.0 * NoL);
    float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    col += rim * uGoldDeep * (0.55 + 1.0 * NoL);
    col += (0.35 + 0.65 * max(N.y, 0.0)) * uGoldDeep * 0.26;

    // Optional pressed ribs, for the cabinet doors and the tank sides.
    float ribs = 1.0 - uRibs * smoothstep(0.42, 0.5, abs(fract(vUv.x * 9.0) - 0.5)) * 0.35;
    col *= ribs;

    float fade = smoothstep(45.0, 150.0, length(cameraPosition - vW));
    col = mix(col, uGoldDeep * 0.55, fade * (0.6 + 0.4 * uFog));

    col = coolDown(col, uMachine, uBlue, uMix);
    gl_FragColor = vec4(col, 1.0);
  }
`;

/* ------------------------------------------------------------------ *
 * Emissive strips — LFP charge level, and the transformer's three phases.
 * ------------------------------------------------------------------ */

const STRIP_VERT = /* glsl */ `
  attribute float aSeed;
  varying vec2  vUv;
  varying float vSeed;
  void main(){
    vUv = uv;
    #ifdef USE_INSTANCING
      vSeed = aSeed;
      gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    #else
      vSeed = 0.0;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #endif
  }
`;

const STRIP_FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uMix;
  uniform float uCharge;
  uniform vec3  uGold;
  uniform vec3  uEmber;
  uniform vec3  uMachine;
  uniform vec3  uBlue;
  varying vec2  vUv;
  varying float vSeed;
  ${COOL}

  void main(){
    // Ten cells per cabinet, filling from the bottom. Each cabinet lags its
    // neighbour slightly so the bank fills as a bank, not as one bar.
    float charge = clamp(uCharge * 1.18 - vSeed * 0.16, 0.0, 1.0);
    float f = fract(vUv.y * 10.0);
    float gap = smoothstep(0.10, 0.20, f) * smoothstep(0.90, 0.80, f);
    float seg = floor(vUv.y * 10.0) * 0.1;
    float on = step(seg + 0.05, charge);

    float pulse = 0.70 + 0.30 * sin(uTime * 2.3 - vUv.y * 7.0 + vSeed * 6.283);
    vec3 col = uGold * (on * pulse * 1.6 + 0.05);

    // The live fill line, brighter and beating faster than the cells below it.
    float line = smoothstep(0.045, 0.0, abs(vUv.y - charge));
    col += line * uEmber * (1.1 + 0.7 * sin(uTime * 3.1 + vSeed * 4.0));

    float edge = smoothstep(0.5, 0.30, abs(vUv.x - 0.5));
    col *= gap * edge;

    col = coolDown(col, uMachine, uBlue, uMix);
    gl_FragColor = vec4(col * (1.0 - uMix * 0.85), 1.0);
  }
`;

const PHASE_FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uMix;
  uniform float uCharge;
  uniform vec3  uGold;
  uniform vec3  uEmber;
  uniform vec3  uMachine;
  uniform vec3  uBlue;
  varying vec2  vUv;
  varying float vSeed;
  ${COOL}

  void main(){
    // Three bars, 120 degrees apart: 208V three-phase, energising in order as
    // the transformer takes charge.
    float idx = floor(vUv.y * 3.0);
    float f = fract(vUv.y * 3.0);
    float bar = smoothstep(0.18, 0.30, f) * smoothstep(0.82, 0.70, f);
    float armed = smoothstep(idx * 0.22 + 0.10, idx * 0.22 + 0.34, uCharge);
    float phase = 0.55 + 0.45 * sin(uTime * 4.0 - idx * 2.0944);
    float run = smoothstep(0.55, 0.0, abs(fract(vUv.x - uTime * 0.35 + idx * 0.33) - 0.5));

    vec3 col = mix(uGold, uEmber, run) * bar * armed * (0.35 + 1.25 * phase * run + 0.35 * phase);
    col *= smoothstep(0.5, 0.42, abs(vUv.x - 0.5)) + 0.35;

    col = coolDown(col, uMachine, uBlue, uMix);
    gl_FragColor = vec4(col * (1.0 - uMix * 0.85), 1.0);
  }
`;

/** Bus duct: the run from the cabinet bank to the transformer, with current. */
const DUCT_FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uMix;
  uniform float uCharge;
  uniform vec3  uGold;
  uniform vec3  uEmber;
  uniform vec3  uBody;
  uniform vec3  uMachine;
  uniform vec3  uBlue;
  varying vec3  vW;
  varying vec3  vN;
  varying vec2  vUv;
  varying float vSeed;
  ${COOL}
  ${DITHER}

  void main(){
    float vis = 1.0 - smoothstep(0.55, 0.95, uMix);
    if (vis < dither(gl_FragCoord.xy)) discard;

    vec3 N = normalize(vN);
    float NoL = max(dot(N, normalize(vec3(-0.24, 0.085, -1.0))), 0.0);
    vec3 col = uBody * (0.55 + 0.9 * NoL) + vec3(0.035, 0.025, 0.010);

    // Three pulses chasing along the run. They only appear once the bank has
    // something to give.
    float pulses = 0.0;
    for (int i = 0; i < 3; i++) {
      float o = float(i) * 0.333;
      float t = fract(vUv.x - uTime * 0.28 + o);
      pulses += smoothstep(0.10, 0.0, abs(t - 0.5)) ;
    }
    col += pulses * mix(uGold, uEmber, 0.4) * 1.4 * smoothstep(0.05, 0.45, uCharge);

    col = coolDown(col, uMachine, uBlue, uMix);
    gl_FragColor = vec4(col, 1.0);
  }
`;

/* ------------------------------------------------------------------ *
 * Current — particles on quadratic beziers, panels -> cabinets -> tank.
 * Position is solved entirely in the vertex shader, so the CPU never
 * touches the buffer after build.
 * ------------------------------------------------------------------ */

const FLOW_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uSize;
  uniform float uPixelRatio;
  attribute vec3  aP1;
  attribute vec3  aP2;
  attribute float aOff;
  attribute float aSpeed;
  attribute float aLeg;
  varying float vFade;
  varying float vLeg;

  void main(){
    // The built-in position attribute is P0 — the emitter — so the bezier
    // costs three attributes, not four, and the CPU never touches the
    // buffer after build.
    float t = fract(aOff + uTime * aSpeed);
    vec3 p = mix(mix(position, aP1, t), mix(aP1, aP2, t), t);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    // Fade in and out at both ends so nothing pops at a junction.
    vFade = sin(3.14159265 * t);
    vLeg = aLeg;
    gl_PointSize = uSize * uPixelRatio * (0.55 + 0.75 * vFade) / max(0.001, -mv.z);
  }
`;

const FLOW_FRAG = /* glsl */ `
  precision highp float;
  uniform float uMix;
  uniform float uCharge;
  uniform vec3  uGold;
  uniform vec3  uEmber;
  uniform vec3  uMachine;
  uniform vec3  uBlue;
  varying float vFade;
  varying float vLeg;
  ${COOL}

  void main(){
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    a *= a;
    // The second leg — cabinets to transformer — runs hotter than the first.
    vec3 col = mix(uGold, uEmber, 0.25 + vLeg * 0.6);
    col *= (0.55 + 0.75 * uCharge) * vFade;
    col = coolDown(col, uMachine, uBlue, uMix);
    gl_FragColor = vec4(col, a * vFade * (0.35 + 0.65 * uCharge));
  }
`;

/** Fake contact shadow: a soft box falloff on the ground. */
const SHADOW_FRAG = /* glsl */ `
  precision highp float;
  uniform float uMix;
  uniform float uStripe;
  varying vec2 vUv;
  void main(){
    vec2 e = abs(vUv - 0.5) * 2.0;
    float a = (1.0 - smoothstep(0.35, 1.0, e.x)) * (1.0 - smoothstep(0.2, 1.0, e.y));
    // Row-spaced stripes for the field, flat for the plant.
    float s = mix(1.0, 0.45 + 0.55 * smoothstep(0.35, 0.5, abs(fract(vUv.y * 30.0) - 0.5)), uStripe);
    gl_FragColor = vec4(0.0, 0.0, 0.0, a * s * 0.78 * (1.0 - uMix));
  }
`;

const SHADOW_VERT = /* glsl */ `
  varying vec2 vUv;
  void main(){
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/* ------------------------------------------------------------------ *
 * Stage
 * ------------------------------------------------------------------ */

type Disposable = { dispose(): void };

export class PowerStage implements StageScene {
  readonly id = 'power';

  private ctx: SceneContext | null = null;
  private settings: TierSettings = TIER_SETTINGS.HIGH;
  private root = new THREE.Group();
  private trash: Disposable[] = [];

  /** Uniform objects deliberately shared across materials: one write updates
   *  every shader that cares. This is what keeps setWorldMix cheap. */
  private uTime = { value: 0 };
  private uMix = { value: 0 };
  private uFog = { value: 1 };
  private uCharge = { value: 0.2 };
  private uRes = { value: new THREE.Vector2(1, 1) };
  private uPixelRatio = { value: 1 };
  private uFar = { value: 190 };

  /** Rebuildable pieces — replaced wholesale when the tier changes. */
  private ground: THREE.Mesh | null = null;
  private panels: THREE.InstancedMesh | null = null;
  private posts: THREE.InstancedMesh | null = null;
  private postMat: THREE.ShaderMaterial | null = null;
  private shadowMat: THREE.ShaderMaterial | null = null;
  private shadowStripeMat: THREE.ShaderMaterial | null = null;
  private flow: THREE.Points | null = null;
  private shadows: THREE.Group | null = null;
  private trackers = 0;

  private charge = 0.2;
  private scroll = 0;
  private baseCam = new THREE.Vector3(0, 5.2, 22);
  private baseLook = new THREE.Vector3(0, 3.4, -30);
  private dollyZ = 16;
  private cabinetSeeds: Float32Array = new Float32Array(0);
  private cabinetPos: THREE.Vector3[] = [];

  /* ---------------------------------------------------------------- */

  build(ctx: SceneContext, settings: TierSettings): void {
    this.ctx = ctx;
    this.settings = settings;
    this.uFog.value = settings.fog ? 1 : 0;
    this.uPixelRatio.value = ctx.renderer.getPixelRatio();

    this.buildSky();
    this.buildGround(settings);
    this.buildPanels(settings);
    this.buildPlant(settings);
    this.buildFlow(settings);
    this.buildShadows(settings);

    ctx.scene.add(this.root);
    this.frame(ctx);
  }

  /* --- sky -------------------------------------------------------- */

  private buildSky(): void {
    const geo = this.keep(new THREE.SphereGeometry(300, 32, 20));
    const mat = this.keep(new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTime: this.uTime,
        uMix: this.uMix,
        uFog: this.uFog,
        uRes: this.uRes,
        uSunAz: { value: SUN_AZ },
        uSun: { value: SUN.clone() },
        uGold: { value: new THREE.Color(C_GOLD) },
        uGoldDeep: { value: new THREE.Color(C_GOLD_DEEP) },
        uNight: { value: new THREE.Color(C_NIGHT) },
        uMachine: { value: new THREE.Color(C_MACHINE) },
        uBlue: { value: new THREE.Color(C_BLUE) },
      },
    }));
    const sky = new THREE.Mesh(geo, mat);
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    this.root.add(sky);
  }

  /* --- ground ----------------------------------------------------- */

  private groundGeometry(settings: TierSettings): THREE.PlaneGeometry {
    // 400 square keeps every corner inside the sky sphere, so the dirt never
    // punches through the horizon.
    const seg = Math.max(24, Math.round(settings.terrainSegments * 0.35));
    return new THREE.PlaneGeometry(400, 400, seg, seg);
  }

  private buildGround(settings: TierSettings): void {
    const mat = this.keep(new THREE.ShaderMaterial({
      vertexShader: GROUND_VERT,
      fragmentShader: GROUND_FRAG,
      uniforms: {
        uTime: this.uTime,
        uMix: this.uMix,
        uFog: this.uFog,
        uRes: this.uRes,
        uSun: { value: SUN.clone() },
        uGold: { value: new THREE.Color(C_GOLD) },
        uGoldDeep: { value: new THREE.Color(C_GOLD_DEEP) },
        uDirt: { value: new THREE.Color(C_DIRT) },
        uMachine: { value: new THREE.Color(C_MACHINE) },
        uBlue: { value: new THREE.Color(C_BLUE) },
      },
    }));
    this.ground = new THREE.Mesh(this.keep(this.groundGeometry(settings)), mat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.renderOrder = -5;
    this.root.add(this.ground);
  }

  /* --- panels ----------------------------------------------------- */

  /** Rows scale with the tier; spacing does not. Lower tiers therefore end the
   *  field closer to camera rather than thinning it out — and the haze is
   *  pulled in to match, so the edge is never visible. */
  private rowsFor(settings: TierSettings): number {
    if (settings.terrainSegments >= 300) return 30;
    if (settings.terrainSegments >= 180) return 22;
    return 14;
  }

  /** True where the plant stands: graded flat, no trackers built. */
  private inClearing(x: number, z: number): boolean {
    return x > CLEAR_X0 && x < CLEAR_X1 && z > CLEAR_Z0 && z < CLEAR_Z1;
  }

  private buildPanels(settings: TierSettings): void {
    const rows = this.rowsFor(settings);
    const cols = FIELD_COLS;

    // Lay the field out first so the clearing can be cut before any buffer is
    // sized — the instance count has to be exact.
    const spots: number[] = [];
    for (let r = 0; r < rows; r++) {
      const z = FIELD_Z_NEAR - r * ROW_SPACING;
      for (let c = 0; c < cols; c++) {
        const x = FIELD_X0 + c * COL_SPACING;
        if (this.inClearing(x, z)) continue;
        spots.push(
          x + (Math.random() - 0.5) * 0.18,
          z + (Math.random() - 0.5) * 0.25,
          r / Math.max(1, rows - 1),
        );
      }
    }
    const count = spots.length / 3;
    this.trackers = count;

    const geo = this.keep(new THREE.PlaneGeometry(PANEL_W, PANEL_H, 1, 1));
    const seeds = new Float32Array(count);
    const mat = this.panels
      ? (this.panels.material as THREE.ShaderMaterial)
      : this.keep(new THREE.ShaderMaterial({
        vertexShader: PANEL_VERT,
        fragmentShader: PANEL_FRAG,
        side: THREE.DoubleSide,
        uniforms: {
          uTime: this.uTime,
          uMix: this.uMix,
          uFog: this.uFog,
          uFar: this.uFar,
          uSun: { value: SUN.clone() },
          uGold: { value: new THREE.Color(C_GOLD) },
          uGoldDeep: { value: new THREE.Color(C_GOLD_DEEP) },
          uGlass: { value: new THREE.Color('#1a2434') },
          uSky: { value: new THREE.Color('#39485c') },
          uMachine: { value: new THREE.Color(C_MACHINE) },
          uBlue: { value: new THREE.Color(C_BLUE) },
        },
      }));

    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.frustumCulled = false;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3(1, 1, 1);

    // Posts: one steel pile per tracker. Cheap, and without them the array
    // floats instead of standing on the section.
    const postGeo = this.keep(new THREE.BoxGeometry(0.12, TORQUE_TUBE_Y, 0.12));
    const postMat = this.postMat ?? this.keep(this.metalMaterial('#231b0f', 0));
    this.postMat = postMat;
    const posts = new THREE.InstancedMesh(postGeo, postMat, count);
    posts.frustumCulled = false;
    const postSeeds = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const x = spots[i * 3]!;
      const z = spots[i * 3 + 1]!;
      const rowT = spots[i * 3 + 2]!;
      // Rotate the plane flat, then tip it back toward the sun at -Z.
      e.set(-Math.PI / 2 - PANEL_TILT, (Math.random() - 0.5) * 0.03, 0);
      q.setFromEuler(e);
      p.set(x, TORQUE_TUBE_Y + (Math.random() - 0.5) * 0.08, z);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);

      q.identity();
      p.set(x, TORQUE_TUBE_Y * 0.5, z);
      m.compose(p, q, s);
      posts.setMatrixAt(i, m);

      // Seed carries the row, so the dissolve sweeps back to front.
      seeds[i] = rowT * 0.75 + Math.random() * 0.25;
      postSeeds[i] = 0.15 + rowT * 0.2;
    }
    mesh.instanceMatrix.needsUpdate = true;
    posts.instanceMatrix.needsUpdate = true;
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    postGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(postSeeds, 1));

    this.uFar.value = Math.abs(FIELD_Z_NEAR - (rows - 1) * ROW_SPACING) + this.baseCam.z + 24;

    this.panels = mesh;
    this.posts = posts;
    this.root.add(mesh);
    this.root.add(posts);
  }

  /* --- battery bank, transformer, bus duct ------------------------ */

  private buildPlant(settings: TierSettings): void {
    const cabinets = settings.terrainSegments >= 180 ? 12 : 8;
    const span = BANK_X1 - BANK_X0;
    const step = span / Math.max(1, cabinets - 1);

    const bodyMat = this.keep(this.metalMaterial('#20242b', 1));
    const tankMat = this.keep(this.metalMaterial('#282219', 0.55));
    const trimMat = this.keep(this.metalMaterial('#332a20', 0));

    /* Cabinets ---------------------------------------------------- */
    const cabGeo = this.keep(new THREE.BoxGeometry(CAB_W, CAB_H, CAB_D));
    const cabSeeds = new Float32Array(cabinets);
    const cabs = new THREE.InstancedMesh(cabGeo, bodyMat, cabinets);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(1, 1, 1);
    this.cabinetPos = [];
    for (let i = 0; i < cabinets; i++) {
      const x = BANK_X0 + i * step;
      const pos = new THREE.Vector3(x, CAB_H / 2, BANK_Z);
      m.compose(pos, q, s);
      cabs.setMatrixAt(i, m);
      cabSeeds[i] = i / Math.max(1, cabinets - 1);
      this.cabinetPos.push(pos.clone());
    }
    cabs.instanceMatrix.needsUpdate = true;
    cabGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(cabSeeds, 1));
    this.cabinetSeeds = cabSeeds;
    this.root.add(cabs);

    /* Charge strips ------------------------------------------------ */
    const stripGeo = this.keep(new THREE.PlaneGeometry(0.5, 2.1, 1, 1));
    const stripMat = this.keep(new THREE.ShaderMaterial({
      vertexShader: STRIP_VERT,
      fragmentShader: STRIP_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: this.emissiveUniforms(),
    }));
    const strips = new THREE.InstancedMesh(stripGeo, stripMat, cabinets);
    const stripSeeds = new Float32Array(cabinets);
    for (let i = 0; i < cabinets; i++) {
      const c = this.cabinetPos[i]!;
      m.compose(new THREE.Vector3(c.x, 1.62, c.z + CAB_D / 2 + 0.03), q, s);
      strips.setMatrixAt(i, m);
      stripSeeds[i] = cabSeeds[i]!;
    }
    strips.instanceMatrix.needsUpdate = true;
    stripGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(stripSeeds, 1));
    strips.renderOrder = 4;
    this.root.add(strips);

    /* Pad under the bank ------------------------------------------ */
    const padGeo = this.keep(new THREE.BoxGeometry(span + 3.2, 0.35, CAB_D + 1.6));
    const pad = new THREE.Mesh(padGeo, trimMat);
    pad.position.set((BANK_X0 + BANK_X1) / 2, 0.17, BANK_Z);
    this.root.add(pad);

    /* Transformer -------------------------------------------------- */
    const tankGeo = this.keep(new THREE.BoxGeometry(XFMR_W, XFMR_H, XFMR_D));
    const tank = new THREE.Mesh(tankGeo, tankMat);
    tank.position.set(XFMR.x, XFMR_H / 2 + 0.5, XFMR.z);
    this.root.add(tank);

    const baseGeo = this.keep(new THREE.BoxGeometry(XFMR_W + 1.6, 0.6, XFMR_D + 1.6));
    const base = new THREE.Mesh(baseGeo, trimMat);
    base.position.set(XFMR.x, 0.3, XFMR.z);
    this.root.add(base);

    // Radiator fins down the sun-facing side.
    const finGeo = this.keep(new THREE.BoxGeometry(0.14, 3.0, 1.2));
    const fins = new THREE.InstancedMesh(finGeo, trimMat, 9);
    const finSeeds = new Float32Array(9);
    for (let i = 0; i < 9; i++) {
      m.compose(
        new THREE.Vector3(XFMR.x - XFMR_W / 2 - 0.6, 2.4, XFMR.z - 1.2 + i * 0.3),
        q, s,
      );
      fins.setMatrixAt(i, m);
      finSeeds[i] = 0.6;
    }
    fins.instanceMatrix.needsUpdate = true;
    finGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(finSeeds, 1));
    this.root.add(fins);

    // Three bushings on the lid — 208V three-phase, one per phase.
    const bushGeo = this.keep(new THREE.CylinderGeometry(0.16, 0.24, 1.15, 8));
    const bush = new THREE.InstancedMesh(bushGeo, trimMat, 3);
    const bushSeeds = new Float32Array(3);
    for (let i = 0; i < 3; i++) {
      m.compose(new THREE.Vector3(XFMR.x - 1.3 + i * 1.3, XFMR_H + 1.05, XFMR.z), q, s);
      bush.setMatrixAt(i, m);
      bushSeeds[i] = 0.7;
    }
    bush.instanceMatrix.needsUpdate = true;
    bushGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(bushSeeds, 1));
    this.root.add(bush);

    // The phase board on the tank face — the thing that visibly charges.
    const phaseGeo = this.keep(new THREE.PlaneGeometry(2.6, 1.5, 1, 1));
    const phaseMat = this.keep(new THREE.ShaderMaterial({
      vertexShader: STRIP_VERT,
      fragmentShader: PHASE_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: this.emissiveUniforms(),
    }));
    const phase = new THREE.Mesh(phaseGeo, phaseMat);
    phase.position.set(XFMR.x, 3.0, XFMR.z + XFMR_D / 2 + 0.03);
    phase.renderOrder = 4;
    this.root.add(phase);

    /* Bus duct: bank -> transformer -------------------------------- */
    const a = new THREE.Vector3(BANK_X1 + 1.4, 0.85, BANK_Z);
    const b = new THREE.Vector3(XFMR.x - XFMR_W / 2 - 0.2, 1.15, XFMR.z);
    const len = a.distanceTo(b);
    const ductGeo = this.keep(new THREE.BoxGeometry(len, 0.34, 0.34));
    const ductMat = this.keep(new THREE.ShaderMaterial({
      vertexShader: METAL_VERT,
      fragmentShader: DUCT_FRAG,
      uniforms: {
        uTime: this.uTime,
        uMix: this.uMix,
        uCharge: this.uCharge,
        uGold: { value: new THREE.Color(C_GOLD) },
        uEmber: { value: new THREE.Color(C_EMBER) },
        uBody: { value: new THREE.Color('#241d12') },
        uMachine: { value: new THREE.Color(C_MACHINE) },
        uBlue: { value: new THREE.Color(C_BLUE) },
      },
    }));
    const duct = new THREE.Mesh(ductGeo, ductMat);
    duct.position.copy(a).add(b).multiplyScalar(0.5);
    duct.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
    duct.rotation.z = Math.asin(THREE.MathUtils.clamp((b.y - a.y) / len, -1, 1));
    this.root.add(duct);
  }

  private metalMaterial(body: string, ribs: number): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      vertexShader: METAL_VERT,
      fragmentShader: METAL_FRAG,
      uniforms: {
        uTime: this.uTime,
        uMix: this.uMix,
        uFog: this.uFog,
        uRibs: { value: ribs },
        uSun: { value: SUN.clone() },
        uGold: { value: new THREE.Color(C_GOLD) },
        uGoldDeep: { value: new THREE.Color(C_GOLD_DEEP) },
        uBody: { value: new THREE.Color(body) },
        uMachine: { value: new THREE.Color(C_MACHINE) },
        uBlue: { value: new THREE.Color(C_BLUE) },
      },
    });
  }

  private emissiveUniforms(): Record<string, THREE.IUniform> {
    return {
      uTime: this.uTime,
      uMix: this.uMix,
      uCharge: this.uCharge,
      uGold: { value: new THREE.Color(C_GOLD) },
      uEmber: { value: new THREE.Color(C_EMBER) },
      uMachine: { value: new THREE.Color(C_MACHINE) },
      uBlue: { value: new THREE.Color(C_BLUE) },
    };
  }

  /* --- energy flow ------------------------------------------------ */

  private buildFlow(settings: TierSettings): void {
    const count = Math.max(60, settings.particleCount);
    const legB = Math.round(count * 0.38);

    const p0 = new Float32Array(count * 3);
    const p1 = new Float32Array(count * 3);
    const p2 = new Float32Array(count * 3);
    const off = new Float32Array(count);
    const spd = new Float32Array(count);
    const leg = new Float32Array(count);

    const rows = this.rowsFor(settings);
    const fieldBack = FIELD_Z_NEAR - (rows - 1) * ROW_SPACING;
    const cabs = this.cabinetPos.length
      ? this.cabinetPos
      : [new THREE.Vector3((BANK_X0 + BANK_X1) / 2, 1.6, BANK_Z)];

    const a = new THREE.Vector3();
    const c = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const isB = i >= count - legB;
      const cab = cabs[Math.floor(Math.random() * cabs.length)]!;

      if (isB) {
        // Cabinets -> transformer: short, fast, low over the bus duct.
        a.set(cab.x, 1.7, cab.z + CAB_D / 2);
        c.set(XFMR.x - XFMR_W / 2 + 0.4, 2.4, XFMR.z + 0.4);
      } else {
        // Panels -> cabinets: long, lazy, arcing in from the field. Emitters
        // are rejection-sampled so nothing sets off from the empty clearing.
        let ex = 0, ez = 0;
        for (let k = 0; k < 8; k++) {
          ex = (Math.random() - 0.5) * 140;
          ez = FIELD_Z_NEAR - Math.random() * Math.abs(FIELD_Z_NEAR - fieldBack);
          if (!this.inClearing(ex, ez)) break;
        }
        a.set(ex, 1.7, ez);
        c.set(cab.x, 2.2, cab.z + CAB_D / 2);
      }

      p0[i * 3] = a.x; p0[i * 3 + 1] = a.y; p0[i * 3 + 2] = a.z;
      p2[i * 3] = c.x; p2[i * 3 + 1] = c.y; p2[i * 3 + 2] = c.z;
      // Control point lifts the arc and pushes it sideways a little, so the
      // stream reads as a braid rather than a wire.
      p1[i * 3] = (a.x + c.x) * 0.5 + (Math.random() - 0.5) * 6.0;
      p1[i * 3 + 1] = (a.y + c.y) * 0.5 + (isB ? 2.2 : 5.5) + Math.random() * 2.0;
      p1[i * 3 + 2] = (a.z + c.z) * 0.5 + (Math.random() - 0.5) * 4.0;

      off[i] = Math.random();
      spd[i] = isB ? 0.26 + Math.random() * 0.16 : 0.07 + Math.random() * 0.06;
      leg[i] = isB ? 1 : 0;
    }

    const geo = this.keep(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(p0, 3)); // P0 of the bezier
    geo.setAttribute('aP1', new THREE.BufferAttribute(p1, 3));
    geo.setAttribute('aP2', new THREE.BufferAttribute(p2, 3));
    geo.setAttribute('aOff', new THREE.BufferAttribute(off, 1));
    geo.setAttribute('aSpeed', new THREE.BufferAttribute(spd, 1));
    geo.setAttribute('aLeg', new THREE.BufferAttribute(leg, 1));

    const mat = this.flow
      ? (this.flow.material as THREE.ShaderMaterial)
      : this.keep(new THREE.ShaderMaterial({
        vertexShader: FLOW_VERT,
        fragmentShader: FLOW_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: this.uTime,
          uMix: this.uMix,
          uCharge: this.uCharge,
          uPixelRatio: this.uPixelRatio,
          uSize: { value: 90 },
          uGold: { value: new THREE.Color(C_GOLD) },
          uEmber: { value: new THREE.Color(C_EMBER) },
          uMachine: { value: new THREE.Color(C_MACHINE) },
          uBlue: { value: new THREE.Color(C_BLUE) },
        },
      }));

    this.flow = new THREE.Points(geo, mat);
    this.flow.frustumCulled = false;
    this.flow.renderOrder = 6;
    this.root.add(this.flow);
  }

  /* --- contact shadows -------------------------------------------- */

  /**
   * There is no shadow map here — every material in this stage is a custom
   * shader with no lights, so a real map would cost a depth pass and light
   * nothing. `settings.shadows` instead buys three baked-looking contact
   * patches, which is the part of a shadow this composition actually needs.
   */
  private buildShadows(settings: TierSettings): void {
    if (!settings.shadows) return;
    const group = new THREE.Group();
    const mat = this.shadowMat ?? this.keep(new THREE.ShaderMaterial({
      vertexShader: SHADOW_VERT,
      fragmentShader: SHADOW_FRAG,
      transparent: true,
      depthWrite: false,
      uniforms: { uMix: this.uMix, uStripe: { value: 0 } },
    }));
    this.shadowMat = mat;
    const stripeMat = this.shadowStripeMat ?? this.keep(new THREE.ShaderMaterial({
      vertexShader: SHADOW_VERT,
      fragmentShader: SHADOW_FRAG,
      transparent: true,
      depthWrite: false,
      uniforms: { uMix: this.uMix, uStripe: { value: 1 } },
    }));
    this.shadowStripeMat = stripeMat;

    const rows = this.rowsFor(settings);
    const back = FIELD_Z_NEAR - (rows - 1) * ROW_SPACING - 4;
    const depth = CLEAR_Z0 - back;
    const fieldGeo = this.keep(new THREE.PlaneGeometry(COL_SPACING * FIELD_COLS, depth, 1, 1));
    const field = new THREE.Mesh(fieldGeo, stripeMat);
    field.rotation.x = -Math.PI / 2;
    field.position.set(0, 0.09, CLEAR_Z0 - depth / 2);
    group.add(field);

    const bankGeo = this.keep(new THREE.PlaneGeometry(BANK_X1 - BANK_X0 + 8, 9, 1, 1));
    const bank = new THREE.Mesh(bankGeo, mat);
    bank.rotation.x = -Math.PI / 2;
    bank.position.set((BANK_X0 + BANK_X1) / 2, 0.08, BANK_Z + 1.6);
    group.add(bank);

    const xGeo = this.keep(new THREE.PlaneGeometry(XFMR_W + 7, XFMR_D + 7, 1, 1));
    const xs = new THREE.Mesh(xGeo, mat);
    xs.rotation.x = -Math.PI / 2;
    xs.position.set(XFMR.x, 0.08, XFMR.z + 1.4);
    group.add(xs);

    group.renderOrder = -1;
    this.shadows = group;
    this.root.add(group);
  }

  /* ---------------------------------------------------------------- */

  update(elapsed: number, delta: number, scroll: number, ctx: SceneContext): void {
    this.scroll = scroll;
    const still = ctx.reducedMotion;
    // Reduced motion pins the clock at a moment where the bank is part-charged
    // and the current is mid-flight, so the still frame still reads as a
    // working plant rather than a switched-off one.
    this.uTime.value = still ? STILL_T : elapsed;

    // The transformer takes charge as the stage is scrolled, with a slow swell
    // on top. Smoothed on delta so a scroll jump does not snap the strips.
    const target = still
      ? 0.72
      : THREE.MathUtils.clamp(0.24 + scroll * 0.62 + Math.sin(elapsed * 0.45) * 0.09, 0, 1);
    const k = still ? 1 : 1 - Math.exp(-Math.min(delta, 0.1) * 3.2);
    this.charge += (target - this.charge) * k;
    this.uCharge.value = this.charge;

    // Scroll walks the camera in among the rows and drops it toward the dirt.
    // The dolly is user-driven, so it survives reduced motion; only the idle
    // breathing on top of it is switched off.
    const p = scroll;
    const driftX = still ? 0 : Math.sin(elapsed * 0.13) * 0.5;
    const driftY = still ? 0 : Math.sin(elapsed * 0.21) * 0.09;
    ctx.camera.position.set(
      this.baseCam.x + driftX,
      this.baseCam.y - p * 1.4 + driftY,
      this.baseCam.z - p * this.dollyZ,
    );
    ctx.camera.rotation.z = p * 0.02;
    ctx.camera.lookAt(
      this.baseLook.x,
      this.baseLook.y + p * 0.9,
      this.baseLook.z - p * 6.0,
    );
  }

  /** One uniform object, shared by every material in the stage. */
  setWorldMix(t: number): void {
    this.uMix.value = THREE.MathUtils.clamp(t, 0, 1);
  }

  onTier(settings: TierSettings, ctx: SceneContext): void {
    this.settings = settings;
    this.ctx = ctx;
    this.uFog.value = settings.fog ? 1 : 0;
    this.uPixelRatio.value = ctx.renderer.getPixelRatio();

    if (this.ground) {
      const old = this.ground.geometry;
      const next = this.groundGeometry(settings);
      this.ground.geometry = next;
      this.untrack(old);
      old.dispose();
      this.keep(next);
    }

    if (this.panels) {
      const geo = this.panels.geometry;
      this.root.remove(this.panels);
      this.panels.dispose();
      this.untrack(geo);
      geo.dispose();
      if (this.posts) {
        const pgeo = this.posts.geometry;
        this.root.remove(this.posts);
        this.posts.dispose();
        this.untrack(pgeo);
        pgeo.dispose();
        this.posts = null;
      }
      this.buildPanels(settings);
    }

    if (this.flow) {
      const geo = this.flow.geometry;
      this.root.remove(this.flow);
      this.untrack(geo);
      geo.dispose();
      this.buildFlow(settings);
    }

    // Contact patches follow the field's new depth, and disappear entirely on
    // tiers that cannot afford them.
    if (this.shadows) {
      this.root.remove(this.shadows);
      // Materials are cached across tiers; only the patches themselves are
      // re-cut, so they have to be released here or a tier churn leaks them.
      this.shadows.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        this.untrack(mesh.geometry);
        mesh.geometry.dispose();
      });
      this.disposeGroup(this.shadows);
      this.shadows = null;
    }
    this.buildShadows(settings);
  }

  frame(ctx: SceneContext): void {
    this.ctx = ctx;
    const narrow = ctx.width < 700;
    const cam = ctx.camera;

    this.uRes.value.set(Math.max(1, ctx.width), Math.max(1, ctx.height));
    this.uPixelRatio.value = ctx.renderer.getPixelRatio();

    const aspect = Math.max(0.25, ctx.width / Math.max(1, ctx.height));

    // Portrait is re-composed, not shrunk: a much wider lens, the camera
    // higher and further back, and the aim dropped so the horizon lifts into
    // the upper third and the rows fill the bottom of a tall frame.
    if (narrow) {
      // A tall frame cannot hold the plant at the desktop distance, so portrait
      // steps back and climbs instead of cropping: bank, duct and transformer
      // all stay inside the width, the horizon lifts into the upper third, and
      // the rows fill the bottom.
      this.baseCam.set(-1.0, 11.5, 38);
      this.baseLook.set(-1.0, 2.6, -20);
      this.dollyZ = 9;
      cam.fov = 66;
    } else {
      this.baseCam.set(0, 8.5, 18);
      this.baseLook.set(0, 2.2, -32);
      this.dollyZ = 15;
      // This composition is read left to right — bank, duct, transformer — so
      // it is the *horizontal* angle that has to stay put. Solving the vertical
      // fov from the aspect keeps the plant off the frame edges on a 4:3 or a
      // half-width window instead of cropping it the way a fixed fov would.
      const tanH = 0.58;
      cam.fov = THREE.MathUtils.clamp(
        THREE.MathUtils.radToDeg(2 * Math.atan(tanH / aspect)), 33, 54,
      );
    }

    // The sky sphere sits at 300; the host's default far plane does not know
    // about it, so this stage owns the frustum while it is on screen.
    cam.near = 0.5;
    cam.far = 620;
    cam.aspect = aspect;
    cam.position.copy(this.baseCam);
    cam.rotation.z = 0;
    cam.lookAt(this.baseLook);
    cam.updateProjectionMatrix();

    // Re-apply the scroll dolly at the new framing so a resize mid-stage does
    // not jump the camera back to the top of the track.
    if (this.scroll > 0) {
      cam.position.z = this.baseCam.z - this.scroll * this.dollyZ;
      cam.position.y = this.baseCam.y - this.scroll * 1.4;
      cam.lookAt(this.baseLook.x, this.baseLook.y + this.scroll * 0.9, this.baseLook.z - this.scroll * 6.0);
    }
  }

  dispose(): void {
    this.root.removeFromParent();
    this.disposeGroup(this.root);
    for (const d of this.trash) d.dispose();
    this.trash = [];
    this.ground = null;
    this.panels = null;
    this.posts = null;
    this.postMat = null;
    this.shadowMat = null;
    this.shadowStripeMat = null;
    this.flow = null;
    this.shadows = null;
    this.cabinetPos = [];
    this.cabinetSeeds = new Float32Array(0);
    this.ctx = null;
  }

  /* --- bookkeeping ------------------------------------------------- */

  /** Register anything with a dispose() so `dispose()` can be exhaustive. */
  private keep<T extends Disposable>(x: T): T {
    this.trash.push(x);
    return x;
  }

  private untrack(x: Disposable): void {
    const i = this.trash.indexOf(x);
    if (i >= 0) this.trash.splice(i, 1);
  }

  /** InstancedMesh holds a per-instance buffer of its own; free it too. */
  private disposeGroup(group: THREE.Object3D): void {
    group.traverse((o) => {
      const im = o as THREE.InstancedMesh;
      if (im.isInstancedMesh) im.dispose();
    });
    group.clear();
  }

  /** Read-only accessors, handy for the host's debug overlay. */
  get trackerCount(): number { return this.trackers; }
  get tierSettings(): TierSettings { return this.settings; }
  get cabinetCount(): number { return this.cabinetSeeds.length; }
  get context(): SceneContext | null { return this.ctx; }
}

/** Factory, matching how the host lazily imports a stage module. */
export function createPowerStage(): StageScene {
  return new PowerStage();
}

export default PowerStage;
