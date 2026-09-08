/**
 * Stage 1 — THE LAND.
 *
 * Thirty acres of Bryan County read from above at first light, rendered with
 * the reference experience's technique rather than as a landscape: a broad,
 * almost-flat field whose form is carried by a caustic network of dawn light
 * rippling across it, a drifting film of ground mist over that, an atmosphere
 * behind it, and one luminous stand of growth on a rise that gives the eye a
 * subject. Everything is procedural — no glTF, no texture atlases, zero bytes
 * of media above the fold — and one uniform scrubs the whole colour world
 * from the land to the interconnection queue and back.
 *
 * Layers, back to front (six draw calls):
 *   1. backdrop  — screen-space sky, sun bloom, high striations
 *   2. ground    — displaced field, caustics, creek beds, raking sun
 *   3. growth    — instanced fronds, the stand of light
 *   4. mist      — drifting mid-layer water film
 *   5. glow      — camera-facing bloom halo around the stand
 *   6. motes     — dawn pollen
 */

import * as THREE from 'three';
import type { SceneContext, StageScene, TierSettings } from './types';

/* ------------------------------------------------------------------ *
 * World constants. The camera framing in `frame()` is composed around
 * these, so they are the one place the geometry of the shot lives.
 * ------------------------------------------------------------------ */

const GROUND_W = 340;
const GROUND_D = 380;
const GROUND_Z = -110;

const AMP = 6.0;       // swale amplitude, deliberately low — light does the work
const KNOLL = 0.95;    // the rise the stand grows out of, in AMP units
const KNOLL_R = 46;

const FOCUS_Z = -64;
const FOCUS_X_WIDE = 24;
const FOCUS_X_NARROW = 6;

const STAND_R = 22;
const MAX_FRONDS = 900;
const FROND_SEGS = 4;
const MAX_MOTES = 1200;
const MAX_CHARGE = 340;

const MIST_Y = 3.0;

/* ------------------------------------------------------------------ *
 * Shared GLSL
 * ------------------------------------------------------------------ */

const NOISE = /* glsl */ `
  const float TAU = 6.28318530718;

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
  float fbm3(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { v += a * noise(p); p *= 2.07; a *= 0.5; } return v; }
  float fbm5(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
  /* Ridged fbm — the creek beds, fence lines and section roads that scar a
     section of Oklahoma pasture read as thin dark filaments, not as hills. */
  float ridge3(vec2 p){
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 3; i++) { v += a * (1.0 - abs(noise(p)) * 2.4); p *= 2.13; a *= 0.5; }
    return v;
  }
`;

/**
 * The caustic network. Warp a point by its own sine field a few times and take
 * the reciprocal distance to the warped grid: bright filaments appear where the
 * warps cross, and they crawl. CAUSTIC_STEPS is the tier's main fragment lever.
 */
const CAUSTIC = /* glsl */ `
  float caustic(vec2 q, float t){
    vec2 p = mod(q * TAU, TAU) - 250.0;
    vec2 i = p;
    float c = 0.0;
    const float inten = 0.0045;
    for (int n = 0; n < CAUSTIC_STEPS; n++){
      float tt = t * (1.0 - 3.5 / (float(n) + 1.0));
      i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
      c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
    }
    c /= float(CAUSTIC_STEPS);
    c = 1.17 - pow(c, 1.4);
    return clamp(pow(abs(c), 8.0) * 0.42, 0.0, 1.20);
  }
`;

/**
 * The latent field. A handful of nodes buried under the parcel — the strongest
 * one directly beneath the stand, because that is where the site's own story
 * starts — whose combined potential is read by two things at once: the ground
 * draws its equipotential contours, and the charge crawling over it walks down
 * its gradient. One function, so the lines and the charge can never disagree.
 *
 * It is deliberately tiny in amplitude. This is the opening frame; a few volts
 * under the grass, not a storm.
 */
const BURIED = /* glsl */ `
  uniform float uCharge;

  float buried(vec2 p){
    vec2 a = uFocus;
    vec2 b = uFocus + vec2(-92.0, 52.0);
    vec2 c = uFocus + vec2(104.0, -34.0);
    float v = 1.30 * exp(-dot(p - a, p - a) / 5400.0);
    v -= 0.86 * exp(-dot(p - b, p - b) / 9200.0);
    v += 0.68 * exp(-dot(p - c, p - c) / 7400.0);
    // The ground is not a lab bench: let the field wander with the land.
    v += fbm3(p * 0.0062 + 21.0) * 0.95;
    return v;
  }
`;

/**
 * Film pass shared by the ground and the backdrop so the grain, the vignette
 * and the volumetric shafts are one continuous effect across the whole frame
 * rather than something that stops at the horizon.
 */
const FILM = /* glsl */ `
  float hash1(float n){ return fract(sin(n) * 43758.5453123); }

  float shafts(vec2 suv){
    float s = 0.0;
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      float x  = hash1(fi * 12.7) * 1.4 - 0.2;
      float w  = 0.012 + hash1(fi * 31.3) * 0.05;
      float sway = sin(uTime * (0.10 + hash1(fi * 5.1) * 0.14) + fi) * 0.025;
      float band = smoothstep(w, 0.0, abs(suv.x - x - sway));
      s += band * (0.35 + 0.65 * hash1(fi * 77.7));
    }
    return s * smoothstep(0.0, 0.75, suv.y);
  }

  vec3 film(vec3 col, vec2 suv){
    float g = fract(sin(dot(gl_FragCoord.xy + uTime, vec2(12.9898, 78.233))) * 43758.5453);
    col += (g - 0.5) * 0.035;
    vec2 c = suv - 0.5;
    c.x *= 0.82;
    col *= max(0.0, 1.0 - dot(c, c) * 0.92);
    return col;
  }
`;

/* ------------------------------------------------------------------ *
 * Backdrop — a screen-space quad behind everything.
 * ------------------------------------------------------------------ */

const BACKDROP_VERT = /* glsl */ `
  varying vec2 vNdc;
  void main(){
    vNdc = position.xy;
    gl_Position = vec4(position.xy, 0.99999, 1.0);
  }
`;

const BACKDROP_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uWorld;
  uniform vec2  uResolution;
  uniform float uHorizon;
  uniform vec2  uSunScreen;
  uniform vec3  uSkyHigh;  uniform vec3 uSkyHighW;
  uniform vec3  uSkyLow;   uniform vec3 uSkyLowW;
  uniform vec3  uLight;    uniform vec3 uLightW;
  varying vec2  vNdc;

  ${NOISE}
  ${FILM}

  void main(){
    vec2 suv = gl_FragCoord.xy / uResolution;
    float aspect = uResolution.x / uResolution.y;

    vec3 cHigh  = mix(uSkyHigh, uSkyHighW, uWorld);
    vec3 cLow   = mix(uSkyLow,  uSkyLowW,  uWorld);
    vec3 cLight = mix(uLight,   uLightW,   uWorld);

    // Height above the horizon, in units of half the frame.
    float a = vNdc.y - uHorizon;

    vec3 col = mix(cLow, cHigh, smoothstep(0.0, 1.05, a));
    // Below the horizon the ground covers us; keep the seam continuous anyway.
    col = mix(col, cLow * 0.55, smoothstep(0.0, -0.45, a));

    // Atmospheric striations: high cloud drifting slowly across the dawn.
    float band = fbm3(vec2(vNdc.x * 1.7 + uTime * 0.009, a * 6.0 - uTime * 0.004));
    col += smoothstep(0.02, 0.40, band) * smoothstep(-0.03, 0.55, a) * cLight * 0.16;

    // Low sun sitting just clear of the horizon, with its bloom.
    vec2 d = (vNdc - uSunScreen) * vec2(aspect, 1.0);
    float disc   = exp(-dot(d, d) * 7.0);
    float halo   = exp(-length(d) * 1.9);
    float streak = exp(-abs(d.x) * 1.25 - abs(d.y) * 15.0);
    col += (disc * 0.85 + halo * 0.42 + streak * 0.26) * cLight;

    col += shafts(suv) * cLight * 0.07;
    col = film(col, suv);
    gl_FragColor = vec4(col, 1.0);
  }
`;

/* ------------------------------------------------------------------ *
 * Ground
 * ------------------------------------------------------------------ */

/** The one height field. The mist sheet rides it so the two never intersect. */
const LAND_H = /* glsl */ `
  uniform float uTime;
  uniform float uAmp;
  uniform float uKnoll;
  uniform float uKnollR;
  uniform vec2  uFocus;

  float landH(vec2 p){
    // The swales ease off under the stand so the rise reads as one form and
    // the fronds can be planted on it from the CPU.
    float d = length(p - uFocus) / uKnollR;
    float flatten = 1.0 - 0.40 * exp(-d * d * 0.45);
    float h = fbm3(p * 0.0072 + vec2(uTime * 0.0032, uTime * 0.0011));
    h += fbm3(p * 0.026 + 11.0) * 0.42;
    return h * flatten + uKnoll * exp(-d * d * 1.5);
  }
`;

const GROUND_VERT = /* glsl */ `
  varying vec3  vWorld;
  varying vec3  vNrm;
  varying vec2  vUv;
  varying float vDepth;
  varying float vH;

  ${NOISE}
  ${LAND_H}

  void main(){
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    float h = landH(wp.xz);
    wp.y += h * uAmp;

    // World-space normal from two neighbours — the raking sun needs real slope.
    const float e = 2.4;
    float hx = landH(wp.xz + vec2(e, 0.0));
    float hz = landH(wp.xz + vec2(0.0, e));
    vNrm = normalize(vec3((h - hx) * uAmp, e, (h - hz) * uAmp));

    vH = h;
    vWorld = wp.xyz;
    vec4 mv = viewMatrix * wp;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const GROUND_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uWorld;
  uniform float uFog;
  uniform vec2  uResolution;
  uniform vec2  uFocus;
  uniform float uKnollR;
  uniform vec3  uSunDir;
  uniform vec3  uShadow; uniform vec3 uShadowW;
  uniform vec3  uGrass;  uniform vec3 uGrassW;
  uniform vec3  uDry;    uniform vec3 uDryW;
  uniform vec3  uLight;  uniform vec3 uLightW;
  uniform vec3  uCool;   uniform vec3 uCoolW;
  uniform vec3  uHaze;   uniform vec3 uHazeW;
  uniform vec3  uChargeA; uniform vec3 uChargeB;

  varying vec3  vWorld;
  varying vec3  vNrm;
  varying vec2  vUv;
  varying float vDepth;
  varying float vH;

  ${NOISE}
  ${CAUSTIC}
  ${BURIED}
  ${FILM}

  void main(){
    vec2 suv = gl_FragCoord.xy / uResolution;

    vec3 cShadow = mix(uShadow, uShadowW, uWorld);
    vec3 cGrass  = mix(uGrass,  uGrassW,  uWorld);
    vec3 cDry    = mix(uDry,    uDryW,    uWorld);
    vec3 cLight  = mix(uLight,  uLightW,  uWorld);
    vec3 cCool   = mix(uCool,   uCoolW,   uWorld);
    vec3 cHaze   = mix(uHaze,   uHazeW,   uWorld);

    vec3  n    = normalize(vNrm);
    float farD  = smoothstep(55.0, 250.0, vDepth);
    float nearD = smoothstep(58.0, 11.0, vDepth);
    float att  = 1.0 - farD;

    // --- the caustic network, two or three scales deep -------------------
    // Feature size is tuned for the mid field: ~5 world units at the stand,
    // which is a hand's width of screen. The finer scales die into the
    // distance, where they would only alias, and bloom back up close.
    float c1 = caustic(vWorld.xz * 0.030, uTime * 0.13 + 9.3);
    float c2 = caustic(vWorld.xz * 0.082 + 17.0, uTime * 0.21 + 3.1) * att;
    float caus = c1 * 0.78 + c2 * 0.46;
    #if CAUSTIC_STEPS > 3
      caus += caustic(vWorld.xz * 0.205 + 41.0, uTime * 0.34 + 22.0)
            * 0.48 * att * (0.30 + 0.70 * nearD);
    #endif

    // --- creek beds and section lines ------------------------------------
    float veins = smoothstep(0.44, 0.88, ridge3(vWorld.xz * 0.016 + 5.0));
    float fine  = smoothstep(0.66, 0.98, ridge3(vWorld.xz * 0.058)) * att;

    // --- a low sun raking almost along the surface ------------------------
    float rake  = smoothstep(-0.03, 0.13, dot(n, uSunDir));
    float parcel = fbm3(vWorld.xz * 0.0044 + 3.7) + 0.5;
    float h01   = clamp(vH * 0.55 + 0.5, 0.0, 1.0);

    vec3 col = mix(cShadow, cGrass, smoothstep(0.18, 0.82, parcel * 0.6 + h01 * 0.4));
    col = mix(col, cDry, smoothstep(0.22, 0.92, rake) * 0.62);
    col = mix(col, col * 0.36 + cShadow * 0.64, veins * 0.92);

    // Colour temperature runs with the light: the shadowed troughs of the
    // ripple stay cool, only what the sun actually reaches goes warm.
    vec3 lightCol = mix(cCool, cLight, smoothstep(0.15, 0.85, rake));
    col += fine * 0.05 * lightCol;

    // The sun is off the top-left of the frame; the field has to know that.
    float sunward = smoothstep(-120.0, 150.0, dot(normalize(uSunDir.xz), vWorld.xz));
    col += sunward * lightCol * 0.085;

    float lit = caus * (0.34 + 0.66 * rake) * (0.72 + 0.55 * sunward);
    col += lit * lightCol * 0.62;
    // Cheap bloom — the broad scale blooms where the network is already hot.
    col += c1 * smoothstep(0.62, 1.30, caus) * lightCol * 0.40;

    // --- latent charge under the ground ----------------------------------
    // Equipotential contours of the buried field, drifting outward at a
    // fraction of the speed of anything else in the frame. The caustics own
    // every warm highlight here, so a brighter warm line would simply vanish
    // into them: the contour is drawn COOL, and each one is engraved with a
    // faint trough on either side. A hue that is not already in the frame,
    // plus a light/dark pair, reads at an amplitude a purely additive line
    // could never survive at — which is what keeps this a few volts and not
    // a storm. Dies into the haze, and held out of the near field so the lede
    // and the hold ring always land on quiet ground.
    float pot = buried(vWorld.xz);
    float band = abs(fract(pot * 5.2 - uTime * 0.030) - 0.5) * 2.0;
    float core = smoothstep(0.925, 1.0, band);
    float trough = smoothstep(0.60, 0.925, band) * (1.0 - core);
    float charge = uCharge * att * (1.0 - nearD * 0.90);
    col *= 1.0 - trough * 0.055 * charge;
    col += core * mix(uChargeA, uChargeB, uWorld) * 0.100 * charge;

    #if SHADOW
      // The stand throws a long shadow away from a sun this low.
      vec2 sv = vWorld.xz - uFocus + uSunDir.xz * uKnollR * 1.6;
      float shd = smoothstep(uKnollR * 1.45, uKnollR * 0.30, length(sv * vec2(1.0, 0.62)));
      col *= 1.0 - shd * 0.22;
    #endif

    col = mix(col, cHaze, farD * mix(0.55, 0.97, uFog));
    // The near field falls away so the lede and the hold ring always land on
    // dark ground.
    col *= 1.0 - nearD * 0.26;

    col += shafts(suv) * cLight * 0.07;
    col = film(col, suv);
    gl_FragColor = vec4(col, 1.0);
  }
`;

/* ------------------------------------------------------------------ *
 * Mist — the mid layer. A drifting film of water-light between the
 * ground and the camera; the layer that makes the frame feel deep.
 * ------------------------------------------------------------------ */

const MIST_VERT = /* glsl */ `
  varying vec3  vWorld;
  varying float vDepth;

  ${NOISE}
  ${LAND_H}

  void main(){
    // The sheet rides the height field a few metres up, so it never cuts into
    // the ground and never draws a shoreline.
    vec4 wp = modelMatrix * vec4(position, 1.0);
    wp.y += landH(wp.xz) * uAmp;
    wp.y += sin(wp.x * 0.020 + uTime * 0.17) * 0.9 + cos(wp.z * 0.017 - uTime * 0.12) * 0.8;
    vWorld = wp.xyz;
    vec4 mv = viewMatrix * wp;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const MIST_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uWorld;
  uniform vec3  uMist;  uniform vec3 uMistW;
  uniform vec3  uLight; uniform vec3 uLightW;
  uniform vec3  uHaze;  uniform vec3 uHazeW;
  varying vec3  vWorld;
  varying float vDepth;

  ${NOISE}
  ${CAUSTIC}

  void main(){
    vec3 cMist  = mix(uMist,  uMistW,  uWorld);
    vec3 cLight = mix(uLight, uLightW, uWorld);
    vec3 cHaze  = mix(uHaze,  uHazeW,  uWorld);

    vec2 p = vWorld.xz;
    float m = fbm5(p * 0.010 + vec2(uTime * 0.014, uTime * 0.005));
    float a = smoothstep(-0.02, 0.34, m);

    // A coarser caustic scale lives up here, so the ripple reads as a film of
    // light lying over the field rather than as painted terrain.
    float c = caustic(p * 0.018 + 63.0, uTime * 0.10 + 47.0);

    float farD  = smoothstep(70.0, 260.0, vDepth);
    float nearF = smoothstep(74.0, 26.0, vDepth);
    a *= (1.0 - nearF) * (1.0 - farD * 0.35);

    vec3 col = mix(cMist, cLight, clamp(c * 0.55, 0.0, 1.0));
    col = mix(col, cHaze, farD * 0.85);
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0) * 0.34);
  }
`;

/* ------------------------------------------------------------------ *
 * Growth — the focal form. A stand of tapered fronds on the rise,
 * lobed and asymmetric so it reads as vegetation waking, never as a
 * mark or a dome.
 * ------------------------------------------------------------------ */

const GROWTH_VERT = /* glsl */ `
  attribute vec3  aOffset;
  attribute vec3  aParam;   // height, width, phase
  attribute float aSeed;

  uniform float uTime;
  uniform vec3  uSunDir;

  varying float vT;
  varying float vSide;
  varying float vSeed;
  varying float vLight;

  void main(){
    float t    = position.y;
    float side = position.x;

    float hgt = aParam.x;
    float wid = aParam.y;
    float ph  = aParam.z;

    float breathe = 0.88 + 0.12 * sin(uTime * 0.42 + ph * 1.7);
    float sway = sin(uTime * 0.52 + ph) * 0.6 + sin(uTime * 0.26 + ph * 2.3) * 0.4;
    // Every frond leans its own way, so the stand is a thicket and not a fan.
    vec3  lean = vec3(sway * 0.9 + sin(ph * 3.1) * 2.4, 0.0, cos(ph * 1.9) * 2.4);

    vec3 p = aOffset + vec3(lean.x * t * t, hgt * breathe * t, lean.z * t * t);
    vec4 wp = modelMatrix * vec4(p, 1.0);

    // Camera-facing ribbon: a frond never disappears edge-on.
    vec3 axis  = normalize(vec3(lean.x * 0.5, hgt, lean.z * 0.5));
    vec3 toCam = normalize(cameraPosition - wp.xyz);
    vec3 right = normalize(cross(axis, toCam) + vec3(1e-4, 0.0, 0.0));
    // A lens profile rather than a wedge: soft at the root, widest a third of
    // the way up, drawn to a point. Wedges read as shards.
    float w = wid * pow(max(0.0, sin((0.14 + 0.86 * t) * 3.14159265)), 0.55);
    wp.xyz += right * side * w * breathe;

    vT = t;
    vSide = side;
    vSeed = aSeed;
    vLight = clamp(dot(normalize(cross(right, axis)), uSunDir) * 0.45 + 0.68, 0.25, 1.25);

    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const GROWTH_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uWorld;
  uniform vec3  uBase;  uniform vec3 uBaseW;
  uniform vec3  uTip;   uniform vec3 uTipW;
  uniform vec3  uLight; uniform vec3 uLightW;

  varying float vT;
  varying float vSide;
  varying float vSeed;
  varying float vLight;

  void main(){
    float edge = 1.0 - abs(vSide) * 2.0;
    if (edge < 0.16) discard;

    vec3 cBase  = mix(uBase,  uBaseW,  uWorld);
    vec3 cTip   = mix(uTip,   uTipW,   uWorld);
    vec3 cLight = mix(uLight, uLightW, uWorld);

    vec3 col = mix(cBase, cTip, smoothstep(0.02, 0.80, vT));
    col *= vLight;

    // A slow pulse of light climbing the stand — the land coming awake, and
    // the one thing in the frame that is unmistakably alive.
    float pulse = smoothstep(0.18, 0.0, abs(vT - fract(uTime * 0.085 + vSeed * 0.37)));
    col += pulse * cLight * 0.40;
    col += smoothstep(0.35, 1.0, vT) * cLight * 0.46;
    col *= 0.46 + 0.60 * edge * edge;

    gl_FragColor = vec4(col, 1.0);
  }
`;

/* ------------------------------------------------------------------ *
 * Charge — the second half of the latent field. Sparks that ride the
 * surface of the land, walking down the gradient of the same buried
 * potential the ground is drawing contours of, so they always run
 * across the lines rather than beside them. Quiet, sparse, held out
 * of the near field. One draw call.
 * ------------------------------------------------------------------ */

const CHARGE_VERT = /* glsl */ `
  attribute float aPhase;
  attribute float aScale;

  uniform float uPointScale;
  uniform vec2  uResolution;

  varying float vA;

  ${NOISE}
  ${LAND_H}
  ${BURIED}

  vec2 gradBuried(vec2 p){
    const float e = 3.0;
    float c0 = buried(p);
    return vec2(buried(p + vec2(e, 0.0)) - c0, buried(p + vec2(0.0, e)) - c0);
  }

  void main(){
    float t = fract(aPhase + uTime * 0.017);

    // A charge follows the potential, so a couple of Euler steps down its
    // gradient trace exactly the field the ground is already showing.
    vec2 p = position.xz;
    float len = t * 44.0 / float(CHARGE_STEPS);
    for (int i = 0; i < CHARGE_STEPS; i++){
      p -= normalize(gradBuried(p) + vec2(1e-5)) * len;
    }

    // Ride the height field, barely clear of it: read as light inside the
    // ground rather than as something floating over it. The mist sheet above
    // finishes the job of burying them.
    vec3 wp = vec3(p.x, landH(p) * uAmp + 0.45, p.y);
    vec4 mv = viewMatrix * vec4(wp, 1.0);
    float d = -mv.z;

    vA = smoothstep(0.0, 0.14, t) * smoothstep(1.0, 0.78, t)
       * smoothstep(20.0, 52.0, d) * (1.0 - smoothstep(150.0, 265.0, d))
       * uCharge;

    // Attenuated the same way three's own PointsMaterial does it: half the
    // DEVICE-pixel height over view depth. And hard-capped, because
    // devicePixelRatio is commonly 3 on a phone and an unbounded attenuated
    // point is exactly how an additive layer eats a mid-range GPU's fill rate.
    gl_PointSize = min(aScale * uPointScale * 1.3 * (uResolution.y * 0.5 / max(d, 1.0)),
                       18.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const CHARGE_FRAG = /* glsl */ `
  precision mediump float;
  uniform float uWorld;
  uniform vec3  uChargeA;
  uniform vec3  uChargeB;
  varying float vA;
  void main(){
    // Kill the fragment before it can cost a blend, not after.
    if (vA <= 0.003) discard;
    vec2 d = gl_PointCoord - 0.5;
    float a = exp(-dot(d, d) * 9.0) * vA;
    gl_FragColor = vec4(mix(uChargeA, uChargeB, uWorld), a);
  }
`;

/* ------------------------------------------------------------------ *
 * Glow — the bloom halo. There is no post chain (the host owns the
 * renderer), so the bright areas bloom through an additive billboard
 * plus the in-shader highlight bleed on the ground.
 * ------------------------------------------------------------------ */

const GLOW_VERT = /* glsl */ `
  varying vec2 vUv;
  void main(){
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const GLOW_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uWorld;
  uniform vec3  uGlow;  uniform vec3 uGlowW;
  varying vec2  vUv;
  void main(){
    vec2 d = vUv - 0.5;
    float r = length(d) * 2.0;
    float breathe = 0.86 + 0.14 * sin(uTime * 0.23);
    float g = (exp(-r * r * 3.4) * 0.8 + exp(-r * 5.0) * 0.45) * smoothstep(1.0, 0.72, r);
    g *= breathe * 0.85;
    vec3 col = mix(uGlow, uGlowW, uWorld);
    gl_FragColor = vec4(col * g, g);
  }
`;

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/** Deterministic PRNG so the stand is the same shape on every load and tier. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

/** Fragment-shader caustic budget, driven off the same knob as the mesh. */
function causticSteps(settings: TierSettings): number {
  if (settings.terrainSegments >= 300) return 4;
  if (settings.terrainSegments >= 180) return 3;
  return 2;
}

/** Euler steps per charge spark. One still traces the field; it just cuts corners. */
function chargeSteps(settings: TierSettings): number {
  return settings.terrainSegments >= 180 ? 2 : 1;
}

function chargeCount(settings: TierSettings): number {
  return Math.max(48, Math.min(MAX_CHARGE, Math.round(settings.particleCount * 0.30)));
}

function frondCount(settings: TierSettings): number {
  return Math.max(220, Math.min(MAX_FRONDS, Math.round(settings.particleCount * 0.8)));
}

export class LandScene implements StageScene {
  readonly id = 'land';

  private group = new THREE.Group();

  private backdrop!: THREE.Mesh;
  private ground!: THREE.Mesh;
  private mist!: THREE.Mesh;
  private growth!: THREE.Mesh;
  private glow!: THREE.Mesh;
  private motes!: THREE.Points;
  private charge!: THREE.Points;

  private backdropMat!: THREE.ShaderMaterial;
  private groundMat!: THREE.ShaderMaterial;
  private mistMat!: THREE.ShaderMaterial;
  private growthMat!: THREE.ShaderMaterial;
  private glowMat!: THREE.ShaderMaterial;
  private moteMat!: THREE.PointsMaterial;
  private moteTex!: THREE.Texture;
  private chargeMat!: THREE.ShaderMaterial;

  // Uniform objects shared across materials, so one write updates the world.
  private uTime: THREE.IUniform<number> = { value: 0 };
  private uWorld: THREE.IUniform<number> = { value: 0 };
  private uRes: THREE.IUniform<THREE.Vector2> = { value: new THREE.Vector2(1, 1) };
  private uFocus: THREE.IUniform<THREE.Vector2> = { value: new THREE.Vector2(FOCUS_X_WIDE, FOCUS_Z) };
  private uSunDir: THREE.IUniform<THREE.Vector3> = {
    value: new THREE.Vector3(-0.309, 0.035, -0.950).normalize(),
  };
  private uHorizon: THREE.IUniform<number> = { value: 0.7 };
  private uSunScreen: THREE.IUniform<THREE.Vector2> = { value: new THREE.Vector2(-0.5, 0.8) };
  private uFog: THREE.IUniform<number> = { value: 1 };
  /** How much latent charge the ground is showing. Derived from scroll. */
  private uCharge: THREE.IUniform<number> = { value: 0.5 };
  private uPointScale: THREE.IUniform<number> = { value: 1 };

  // Preallocated scratch — update() and setWorldMix() must never allocate.
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector2();
  private moteLand = new THREE.Color('#cfe6d4');
  private moteWait = new THREE.Color('#f0a58c');

  // Camera composition, set by frame() and dollied by update(). The pitch is
  // steep enough that the horizon never enters the frame at any scroll
  // position — a horizon is what turns a rippling surface into a seascape.
  private camY = 48;
  private camZ = 34;
  private lookY = -2;
  private lookZ = -40;

  private segments = 320;

  build(ctx: SceneContext, settings: TierSettings): void {
    this.segments = settings.terrainSegments;
    this.uFog.value = settings.fog ? 1 : 0;

    // Warm dawn light and the cool/warm ends of the field, then the same five
    // roles again in the interconnection queue's blood red. Every colour in the
    // scene is one of these mixed by uWorld, which is why setWorldMix is one
    // number and is exactly reversible.
    const light = { value: new THREE.Color('#f0d9ae') };
    const lightW = { value: new THREE.Color('#ff8a5c') };
    const cool = { value: new THREE.Color('#a2c8a8') };
    const coolW = { value: new THREE.Color('#c04a30') };
    const haze = { value: new THREE.Color('#a9c2b0') };
    const hazeW = { value: new THREE.Color('#9c3a24') };
    // The one hue in the frame that the dawn does not already own.
    const chargeA = { value: new THREE.Color('#5fe0d0') };
    const chargeB = { value: new THREE.Color('#ff7a54') };

    /* --- backdrop ---------------------------------------------------- */
    this.backdropMat = new THREE.ShaderMaterial({
      vertexShader: BACKDROP_VERT,
      fragmentShader: BACKDROP_FRAG,
      // Drawn at maximum depth AFTER the ground, so early-Z throws away every
      // pixel the land already covers. It exists as the atmosphere the frame
      // dissolves into, and as the guarantee that no clear colour ever shows.
      depthWrite: false,
      uniforms: {
        uTime: this.uTime,
        uWorld: this.uWorld,
        uResolution: this.uRes,
        uHorizon: this.uHorizon,
        uSunScreen: this.uSunScreen,
        uSkyHigh: { value: new THREE.Color('#476760') },
        uSkyHighW: { value: new THREE.Color('#2a0705') },
        uSkyLow: haze,
        uSkyLowW: hazeW,
        uLight: light,
        uLightW: lightW,
      },
    });
    this.backdrop = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.backdropMat);
    this.backdrop.frustumCulled = false;
    this.backdrop.renderOrder = 5;
    this.group.add(this.backdrop);

    /* --- ground ------------------------------------------------------ */
    this.groundMat = new THREE.ShaderMaterial({
      vertexShader: GROUND_VERT,
      fragmentShader: GROUND_FRAG,
      defines: {
        CAUSTIC_STEPS: String(causticSteps(settings)),
        SHADOW: settings.shadows ? '1' : '0',
      },
      uniforms: {
        uTime: this.uTime,
        uWorld: this.uWorld,
        uResolution: this.uRes,
        uFocus: this.uFocus,
        uSunDir: this.uSunDir,
        uFog: this.uFog,
        uCharge: this.uCharge,
        uAmp: { value: AMP },
        uKnoll: { value: KNOLL },
        uKnollR: { value: KNOLL_R },
        uShadow: { value: new THREE.Color('#1a392c') },
        uShadowW: { value: new THREE.Color('#2a0503') },
        uGrass: { value: new THREE.Color('#35603f') },
        uGrassW: { value: new THREE.Color('#4d0806') },
        uDry: { value: new THREE.Color('#8ba585') },
        uDryW: { value: new THREE.Color('#8c110c') },
        uLight: light,
        uLightW: lightW,
        uCool: cool,
        uCoolW: coolW,
        uHaze: haze,
        uHazeW: hazeW,
        uChargeA: chargeA,
        uChargeB: chargeB,
      },
    });
    this.ground = new THREE.Mesh(this.groundGeometry(this.segments), this.groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.z = GROUND_Z;
    this.ground.frustumCulled = false;
    this.group.add(this.ground);

    /* --- growth ------------------------------------------------------ */
    this.growthMat = new THREE.ShaderMaterial({
      vertexShader: GROWTH_VERT,
      fragmentShader: GROWTH_FRAG,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: this.uTime,
        uWorld: this.uWorld,
        uSunDir: this.uSunDir,
        uBase: { value: new THREE.Color('#1d4038') },
        uBaseW: { value: new THREE.Color('#33060a') },
        uTip: { value: new THREE.Color('#b5cf8c') },
        uTipW: { value: new THREE.Color('#c8321c') },
        uLight: light,
        uLightW: lightW,
      },
    });
    this.growth = new THREE.Mesh(this.growthGeometry(), this.growthMat);
    this.growth.frustumCulled = false;
    this.setFrondCount(frondCount(settings));
    this.group.add(this.growth);

    /* --- mist -------------------------------------------------------- */
    this.mistMat = new THREE.ShaderMaterial({
      vertexShader: MIST_VERT,
      fragmentShader: MIST_FRAG,
      defines: { CAUSTIC_STEPS: String(causticSteps(settings)) },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: this.uTime,
        uWorld: this.uWorld,
        uFocus: this.uFocus,
        uAmp: { value: AMP },
        uKnoll: { value: KNOLL },
        uKnollR: { value: KNOLL_R },
        uMist: { value: new THREE.Color('#c2d6c4') },
        uMistW: { value: new THREE.Color('#8e2f20') },
        uLight: light,
        uLightW: lightW,
        uHaze: haze,
        uHazeW: hazeW,
      },
    });
    this.mist = new THREE.Mesh(new THREE.PlaneGeometry(GROUND_W, GROUND_D, 56, 56), this.mistMat);
    this.mist.rotation.x = -Math.PI / 2;
    this.mist.position.set(0, MIST_Y, GROUND_Z);
    this.mist.frustumCulled = false;
    this.mist.renderOrder = 2;
    this.mist.visible = settings.fog;
    this.group.add(this.mist);

    /* --- glow -------------------------------------------------------- */
    this.glowMat = new THREE.ShaderMaterial({
      vertexShader: GLOW_VERT,
      fragmentShader: GLOW_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: this.uTime,
        uWorld: this.uWorld,
        uGlow: { value: new THREE.Color('#c6dfae') },
        uGlowW: { value: new THREE.Color('#ff6a3c') },
      },
    });
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(88, 88), this.glowMat);
    this.glow.renderOrder = 6;
    this.glow.frustumCulled = false;
    this.group.add(this.glow);

    /* --- charge ------------------------------------------------------ */
    // Drawn after the ground and before the mist, so the sheet above finishes
    // burying it. Depth-tested against the land, so a rise still hides it.
    this.chargeMat = new THREE.ShaderMaterial({
      vertexShader: CHARGE_VERT,
      fragmentShader: CHARGE_FRAG,
      defines: { CHARGE_STEPS: String(chargeSteps(settings)) },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: this.uTime,
        uWorld: this.uWorld,
        uFocus: this.uFocus,
        uCharge: this.uCharge,
        uPointScale: this.uPointScale,
        uResolution: this.uRes,
        uAmp: { value: AMP },
        uKnoll: { value: KNOLL },
        uKnollR: { value: KNOLL_R },
        uChargeA: chargeA,
        uChargeB: chargeB,
      },
    });
    this.charge = new THREE.Points(this.chargeGeometry(settings), this.chargeMat);
    this.charge.frustumCulled = false;
    this.charge.renderOrder = 1;
    this.group.add(this.charge);

    /* --- motes ------------------------------------------------------- */
    this.moteTex = makeMoteTexture();
    this.motes = this.buildMotes(settings);
    this.motes.renderOrder = 7;
    this.group.add(this.motes);

    ctx.scene.add(this.group);
  }

  private groundGeometry(segments: number): THREE.PlaneGeometry {
    return new THREE.PlaneGeometry(GROUND_W, GROUND_D, segments, segments);
  }

  /**
   * One tapered ribbon, instanced. Positions are laid out on the rise with a
   * lobed, asymmetric density and one spur running off to the side, so the
   * silhouette is a thicket rather than a dome or a mark.
   */
  private growthGeometry(): THREE.InstancedBufferGeometry {
    const rows = FROND_SEGS + 1;
    const pos = new Float32Array(rows * 2 * 3);
    for (let r = 0; r < rows; r++) {
      const t = r / (rows - 1);
      pos[r * 6 + 0] = -0.5; pos[r * 6 + 1] = t; pos[r * 6 + 2] = 0;
      pos[r * 6 + 3] = 0.5; pos[r * 6 + 4] = t; pos[r * 6 + 5] = 0;
    }
    const idx: number[] = [];
    for (let r = 0; r < rows - 1; r++) {
      const a = r * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }

    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(idx);

    const offset = new Float32Array(MAX_FRONDS * 3);
    const param = new Float32Array(MAX_FRONDS * 3);
    const seed = new Float32Array(MAX_FRONDS);

    const rnd = mulberry32(0x51ea7);
    let i = 0;
    let guard = 0;
    while (i < MAX_FRONDS && guard < MAX_FRONDS * 60) {
      guard++;
      const a = rnd() * Math.PI * 2;
      const rr = Math.pow(rnd(), 0.55) * STAND_R;
      const lobe = 0.42 + 0.58 * Math.abs(Math.sin(a * 1.5 + 0.7)) * (0.6 + 0.4 * Math.cos(a * 3.0 - 1.1));
      const spur = Math.exp(-Math.pow((a - 2.35) * 1.5, 2)) * 0.85;
      const density = Math.min(1, lobe + spur) * (1 - (rr / STAND_R) * 0.5);
      if (rnd() > density) continue;

      const x = Math.cos(a) * rr;
      const z = Math.sin(a) * rr;
      // Plant the base on the knoll the ground shader raises at the same spot.
      const d = rr / KNOLL_R;
      const y = KNOLL * Math.exp(-d * d * 1.5) * AMP - 1.4;

      const fall = Math.pow(Math.max(0, 1 - rr / STAND_R), 1.25);
      const spire = Math.exp(-(rr * rr) / (2 * 5.5 * 5.5));
      const height = 3.4 + 7.6 * fall * (0.55 + 0.7 * rnd()) + 4.0 * spire * rnd();

      offset[i * 3] = x; offset[i * 3 + 1] = y; offset[i * 3 + 2] = z;
      param[i * 3] = height;
      param[i * 3 + 1] = (0.36 + 0.70 * rnd()) / 0.84;
      param[i * 3 + 2] = rnd() * Math.PI * 2;
      seed[i] = rnd();
      i++;
    }
    // If rejection sampling came up short, the tail instances stay at the
    // origin with zero height; clamp the count instead of drawing them.
    this.availableFronds = i;

    geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offset, 3));
    geo.setAttribute('aParam', new THREE.InstancedBufferAttribute(param, 3));
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1));
    return geo;
  }

  private availableFronds = MAX_FRONDS;

  private setFrondCount(n: number): void {
    (this.growth.geometry as THREE.InstancedBufferGeometry).instanceCount =
      Math.min(n, this.availableFronds);
  }

  /**
   * Seeds for the charge. Allocated once at MAX_CHARGE and drawn with a range,
   * so changing tier never reallocates and the land — the first screen on a
   * phone — pays for this exactly once.
   */
  private chargeGeometry(settings: TierSettings): THREE.BufferGeometry {
    const pos = new Float32Array(MAX_CHARGE * 3);
    const phase = new Float32Array(MAX_CHARGE);
    const scale = new Float32Array(MAX_CHARGE);
    const rnd = mulberry32(0x3a17e);
    for (let i = 0; i < MAX_CHARGE; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 12 + Math.pow(rnd(), 0.55) * 126;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = 0;
      pos[i * 3 + 2] = -55 + Math.sin(a) * r;
      phase[i] = rnd();
      scale[i] = 0.55 + rnd() * 0.75;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    geo.setAttribute('aScale', new THREE.BufferAttribute(scale, 1));
    geo.setDrawRange(0, chargeCount(settings));
    return geo;
  }

  private buildMotes(settings: TierSettings): THREE.Points {
    const pos = new Float32Array(MAX_MOTES * 3);
    const rnd = mulberry32(0x9c3f1);
    for (let i = 0; i < MAX_MOTES; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 10 + Math.pow(rnd(), 0.6) * 110;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = 1 + Math.pow(rnd(), 1.7) * 26;
      pos[i * 3 + 2] = -50 + Math.sin(a) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setDrawRange(0, Math.min(settings.particleCount, MAX_MOTES));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 14, -50), 180);

    this.moteMat = new THREE.PointsMaterial({
      size: 0.62,
      map: this.moteTex,
      color: this.moteLand.clone(),
      transparent: true,
      opacity: 0.30,
      depthWrite: false,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
    });
    return new THREE.Points(geo, this.moteMat);
  }

  /** gl_FragCoord is in device pixels — so is the resolution the film uses. */
  private syncResolution(ctx: SceneContext): void {
    ctx.renderer.getDrawingBufferSize(this.tmp2);
    this.uRes.value.set(Math.max(1, this.tmp2.x), Math.max(1, this.tmp2.y));
  }

  update(elapsed: number, _delta: number, scroll: number, ctx: SceneContext): void {
    const t = ctx.reducedMotion ? 0 : elapsed;
    this.uTime.value = t;
    // Latent, then a little less latent as the visitor comes down toward the
    // land. Derived from scroll rather than accumulated, so scrolling back up
    // quietens the ground again instead of leaving it charged.
    this.uCharge.value = 0.5 + 0.5 * Math.min(Math.max(scroll, 0), 1);
    this.syncResolution(ctx);

    // Scroll flies the camera down toward the land and tilts it up. This is
    // user-driven, not time-driven, so it stays live under reduced motion.
    const cam = ctx.camera;
    cam.position.set(0, this.camY - scroll * 18, this.camZ - scroll * 20);
    // Pan a little toward the stand as we drop, so the dolly closes on the
    // subject instead of sliding it off the edge.
    cam.lookAt(this.uFocus.value.x * 0.5 * scroll, this.lookY - scroll * 4, this.lookZ - scroll * 12);
    cam.rotateZ(scroll * 0.02);

    // The backdrop is screen-space, so it needs to be told where the camera
    // put the horizon and the sun this frame.
    cam.getWorldDirection(this.tmp);
    const pitch = Math.asin(Math.max(-1, Math.min(1, this.tmp.y)));
    const halfFov = (cam.fov * Math.PI) / 360;
    this.uHorizon.value = Math.max(-4, Math.min(4, Math.tan(-pitch) / Math.tan(halfFov)));

    this.tmp.copy(this.uSunDir.value).multiplyScalar(900).add(cam.position).project(cam);
    this.uSunScreen.value.set(this.tmp.x, this.tmp.y);

    this.glow.position.set(this.uFocus.value.x, 11, this.uFocus.value.y);
    this.glow.quaternion.copy(cam.quaternion);

    if (ctx.reducedMotion) return;
    this.motes.rotation.y = t * 0.006;
    this.motes.position.y = Math.sin(t * 0.11) * 1.2;
  }

  setWorldMix(t: number): void {
    this.uWorld.value = t;
    this.moteMat.color.lerpColors(this.moteLand, this.moteWait, t);
  }

  onTier(settings: TierSettings, _ctx: SceneContext): void {
    this.uFog.value = settings.fog ? 1 : 0;
    this.mist.visible = settings.fog;

    const steps = String(causticSteps(settings));
    this.groundMat.defines.CAUSTIC_STEPS = steps;
    this.groundMat.defines.SHADOW = settings.shadows ? '1' : '0';
    this.groundMat.needsUpdate = true;
    this.mistMat.defines.CAUSTIC_STEPS = steps;
    this.mistMat.needsUpdate = true;

    if (settings.terrainSegments !== this.segments) {
      this.segments = settings.terrainSegments;
      const old = this.ground.geometry;
      this.ground.geometry = this.groundGeometry(this.segments);
      old.dispose();
    }

    const cSteps = String(chargeSteps(settings));
    if (this.chargeMat.defines.CHARGE_STEPS !== cSteps) {
      this.chargeMat.defines.CHARGE_STEPS = cSteps;
      this.chargeMat.needsUpdate = true;
    }
    this.charge.geometry.setDrawRange(0, chargeCount(settings));

    this.setFrondCount(frondCount(settings));
    this.motes.geometry.setDrawRange(0, Math.min(settings.particleCount, MAX_MOTES));
  }

  frame(ctx: SceneContext): void {
    // Re-compose for portrait rather than shrinking the desktop framing: a
    // wider lens, a steeper pitch that lifts the horizon further above the top
    // edge so the tall frame is all ground, and the stand pulled in off the
    // edge toward the centre.
    const narrow = ctx.width < 700;
    this.camY = narrow ? 44 : 48;
    this.camZ = narrow ? 26 : 34;
    this.lookY = narrow ? -10 : -2;
    this.lookZ = narrow ? -34 : -40;

    // Portrait holds the same ground from a wider lens, so a spark sized for
    // the desktop framing loses about a third of its screen area. Give it back.
    this.uPointScale.value = narrow ? 1.45 : 1.0;

    this.uFocus.value.set(narrow ? FOCUS_X_NARROW : FOCUS_X_WIDE, FOCUS_Z);
    this.growth.position.set(this.uFocus.value.x, 0, this.uFocus.value.y);
    this.syncResolution(ctx);

    ctx.camera.fov = narrow ? 58 : 38;
    ctx.camera.position.set(0, this.camY, this.camZ);
    ctx.camera.lookAt(0, this.lookY, this.lookZ);
    ctx.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.backdrop.geometry.dispose();
    this.ground.geometry.dispose();
    this.growth.geometry.dispose();
    this.mist.geometry.dispose();
    this.glow.geometry.dispose();
    this.motes.geometry.dispose();
    this.charge.geometry.dispose();

    this.backdropMat.dispose();
    this.groundMat.dispose();
    this.growthMat.dispose();
    this.mistMat.dispose();
    this.glowMat.dispose();
    this.moteMat.dispose();
    this.moteTex.dispose();
    this.chargeMat.dispose();

    this.group.removeFromParent();
    this.group.clear();
  }
}
