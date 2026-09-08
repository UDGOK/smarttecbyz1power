/**
 * Stage 5 — THE CAMPUS.
 *
 * The payoff. Four worlds of dark ground open into daylight: an explorable
 * isometric model of Site 01 at 8460 US-70, Mead, Oklahoma — thirty acres of
 * Bryan County with three buildings, a 3 MVA transformer, ~500 kW of solar,
 * Z1Power LFP storage, and the open land that Phase 2 and 3 grow into.
 *
 * Everything here is generated: no glTF, no texture atlas, no downloads. The
 * parcel is one displaced plane driven by fbm in a shader (same trick as stage
 * 1, re-pointed at prairie instead of first light); the built work is a handful
 * of boxes with edge lines, which is what gives it the flat, drawn, isometric
 * register rather than a photoreal one.
 *
 * Scale is stylised, not survey-accurate. Thirty acres is ~1,140 ft square and
 * a 3,000 sqft building is ~55 ft on a side — at true ratio the buildings would
 * be four pixels wide. The parcel keeps its proportion; the built work is drawn
 * at the size the story needs it.
 *
 * `setWorldMix(t)` runs BACKWARDS here compared with the earlier stages: this is
 * the last world, so there is nothing to dissolve toward. t = 1 means "still
 * arriving out of the compute hall", t = 0 means "arrived". It is driven live
 * and must be fully reversible, so every frame recomputes from stored base
 * values rather than accumulating.
 *
 * The host owns the renderer, camera and rAF loop. This module owns a Group,
 * a clamped orbit rig, and eight hotspots it will project to screen space on
 * request — it never touches the DOM.
 */

import * as THREE from 'three';
import { power, site } from '../../data/site';
import type { SceneContext, StageScene, TierSettings } from './types';

/* ============================================================
   Parcel layout. Shared by the geometry and by the ground
   shader (passed in as uniforms so the two can never drift).
   x = east, z = south toward US-70, y = up.
   ============================================================ */

const PARCEL_C = new THREE.Vector2(0, 0);
const PARCEL_H = new THREE.Vector2(65, 52);   // half-extents of the 30 acres
const PAD_C = new THREE.Vector2(-4, -4);      // graded caliche apron
const PAD_H = new THREE.Vector2(48, 24);
const ROAD_Z = 62;                            // US-70 centreline
const ROAD_HALF = 5.5;
const SPUR_X = -18;                           // access road off the highway
const SPUR_HALF = 3.6;
const SPUR_END_Z = -2;
const GROUND_SIZE = 320;                      // surrounding county, for horizon

const BUILDING_Z = -8;
const BUILDING_X = [-32, -4, 24] as const;
const BUILDING_W = 20;
const BUILDING_D = 12;
const BUILDING_H = 6.5;

const TRANSFORMER_P = new THREE.Vector3(-26, 0, 12);
const BATTERY_P = new THREE.Vector3(-6, 0, 14);
const SOLAR_P = new THREE.Vector3(14, 0, -36);

/* ============================================================
   Palette. Tuned against tokens.css: --c-campus #eef1ef is the
   world colour, so the sky and the far haze sit just under it
   and the ground carries the only saturation on screen.
   ============================================================ */

const C_SKY = '#e4ebe9';
const C_HAZE = '#dfe7e6';
const C_GRASS_LO = '#7e8f66';
const C_GRASS_HI = '#c3c69c';
const C_PAD = '#d8d2c2';
const C_ASPHALT = '#5f6468';
const C_LINE = '#2d6a54';       // --c-moss, the survey line
const C_ARRIVE = '#10161f';     // --c-machine, the world we came from
const C_SHELL = '#cfd3ce';
const C_HALL = '#e8eae6';
const C_ROOF = '#b9bfba';
const C_EDGE = '#2a3230';
const C_GLOW = '#ffd9a0';
const C_GOLD = '#ffc832';       // --c-gold, stored energy
const C_PANEL = '#2e3d52';
const C_CONCRETE = '#c6c4bb';
const C_STEEL = '#9aa2a4';

/* ============================================================
   Camera rig limits. The whole point of this stage is that it
   is explorable, and the whole risk is that the visitor orbits
   under the ground or out to a horizon of nothing. Everything
   is clamped; nothing here can produce a bad frame.
   ============================================================ */

const THETA_BASE = Math.PI * 0.25;   // viewed from the highway side, south-east
const THETA_RANGE = 0.62;
const PHI_MIN = 0.42;                // near top-down
const PHI_MAX = 1.04;                // never below ~30° elevation
const RADIUS_MIN = 42;
const RADIUS_MAX = 340;   // portrait genuinely needs this much to fit the parcel
const PAN_X = 58;
const PAN_Z_MIN = -48;
const PAN_Z_MAX = 56;
const ORBIT_SPEED = 0.0052;          // radians per CSS pixel of drag
const PAN_SPEED = 0.085;

/** A named place on the campus the host can label or fly to. */
export interface CampusHotspot {
  readonly id: string;
  readonly label: string;
  readonly worldPosition: THREE.Vector3;
}

/** A hotspot resolved to CSS pixels for the frame the host is about to draw. */
export interface ProjectedHotspot {
  id: string;
  label: string;
  x: number;
  y: number;
  visible: boolean;
}

/* ============================================================
   Ground shader. One plane, one draw call: prairie, the graded
   pad, US-70 and its access spur, the parcel boundary and the
   arrival dissolve all live in here.
   ============================================================ */

const GROUND_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uAmp;
  uniform vec2  uPadC;
  uniform vec2  uPadH;
  uniform float uRoadZ;
  uniform float uRoadHalf;
  uniform float uSpurX;
  uniform float uSpurHalf;
  varying vec2  vW;     // world XZ — the geometry is pre-rotated into the ground plane
  varying float vShade;
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
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.07; a *= 0.5; }
    return v;
  }

  float sdBox(vec2 p, vec2 b){
    vec2 d = abs(p) - b;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  }

  // The site is graded flat where anything is built or driven on; the rest of
  // Bryan County is allowed to roll. Without this the buildings float.
  float flatten(vec2 w){
    float pad  = 1.0 - smoothstep(-2.0, 9.0, sdBox(w - uPadC, uPadH));
    float road = 1.0 - smoothstep(uRoadHalf, uRoadHalf + 7.0, abs(w.y - uRoadZ));
    float spur = (1.0 - smoothstep(uSpurHalf, uSpurHalf + 6.0, abs(w.x - uSpurX)))
               * step(-8.0, w.y) * step(w.y, uRoadZ);
    return clamp(max(pad, max(road, spur)), 0.0, 1.0);
  }

  float height(vec2 w){
    float h = fbm(w * 0.011) * 1.0 + fbm(w * 0.043) * 0.28;
    return h * (1.0 - flatten(w));
  }

  void main(){
    vW = position.xz;
    float h = height(vW);
    vH = h;

    // Analytic-ish normal from two extra taps. Cheaper than a normal map and
    // it keeps the light on the prairie consistent with the lit boxes.
    float e = 2.2;
    float hx = height(vW + vec2(e, 0.0));
    float hz = height(vW + vec2(0.0, e));
    vec3 n = normalize(vec3((h - hx) * uAmp, e, (h - hz) * uAmp));
    vec3 sun = normalize(vec3(-0.45, 0.78, 0.44));
    vShade = clamp(dot(n, sun), 0.0, 1.0);

    vec3 pos = position;
    pos.y += h * uAmp;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const GROUND_FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uArrive;    // 1 = still dissolving in from the compute hall
  uniform float uFog;
  uniform vec2  uParcelC;
  uniform vec2  uParcelH;
  uniform vec2  uPadC;
  uniform vec2  uPadH;
  uniform float uRoadZ;
  uniform float uRoadHalf;
  uniform float uSpurX;
  uniform float uSpurHalf;
  uniform float uSpurEndZ;
  uniform vec3  uGrassLo;
  uniform vec3  uGrassHi;
  uniform vec3  uPad;
  uniform vec3  uAsphalt;
  uniform vec3  uLine;
  uniform vec3  uHaze;
  uniform vec3  uArriveCol;
  varying vec2  vW;
  varying float vShade;
  varying float vH;

  float sdBox(vec2 p, vec2 b){
    vec2 d = abs(p) - b;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  }
  float hash1(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

  // The renderer converts lit materials from linear to sRGB for us; a raw
  // ShaderMaterial writes straight to the framebuffer, so this plane has to do
  // its own encode or it would sit a full gamma darker than the buildings.
  vec3 toSRGB(vec3 c){
    c = max(c, vec3(0.0));
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
  }

  void main(){
    // --- Prairie ---
    float tuft = hash1(floor(vW * 0.9)) * 0.5 + hash1(floor(vW * 0.31)) * 0.5;
    float g = clamp(vH * 0.9 + 0.5 + tuft * 0.18, 0.0, 1.0);
    vec3 col = mix(uGrassLo, uGrassHi, smoothstep(0.18, 0.86, g));
    col *= 0.72 + vShade * 0.46;

    // --- The 30 acres: graded apron, then the surveyed boundary ---
    float pad = 1.0 - smoothstep(-1.0, 5.5, sdBox(vW - uPadC, uPadH));
    col = mix(col, uPad * (0.80 + vShade * 0.30), pad * 0.92);

    float dParcel = sdBox(vW - uParcelC, uParcelH);
    float onBorder = 1.0 - smoothstep(0.35, 1.25, abs(dParcel));
    // Dash the boundary along whichever axis the edge runs.
    vec2 q = abs(vW - uParcelC) - uParcelH;
    float run = (q.x > q.y) ? vW.y : vW.x;
    float dash = step(0.42, fract(run * 0.11));
    col = mix(col, uLine, onBorder * dash * 0.85);

    // Faint section grid inside the parcel: reads as a survey, not a game floor.
    float grid = max(
      1.0 - smoothstep(0.05, 0.30, abs(fract(vW.x / 16.25 + 0.5) - 0.5) * 16.25),
      1.0 - smoothstep(0.05, 0.30, abs(fract(vW.y / 13.00 + 0.5) - 0.5) * 13.00));
    col = mix(col, col * 0.90, grid * step(dParcel, 0.0) * 0.55);

    // --- US-70 and the access spur ---
    float hwy = 1.0 - smoothstep(uRoadHalf, uRoadHalf + 0.7, abs(vW.y - uRoadZ));
    float spur = (1.0 - smoothstep(uSpurHalf, uSpurHalf + 0.7, abs(vW.x - uSpurX)))
               * step(uSpurEndZ, vW.y) * step(vW.y, uRoadZ + uRoadHalf);
    // Rounded head where the spur opens into the yard.
    float head = 1.0 - smoothstep(6.5, 7.4, length(vW - vec2(uSpurX, uSpurEndZ)));
    float road = clamp(max(hwy, max(spur, head)), 0.0, 1.0);
    col = mix(col, uAsphalt * (0.86 + vShade * 0.18), road);

    // Centreline on the highway, edge line on the spur.
    float cl = (1.0 - smoothstep(0.28, 0.55, abs(vW.y - uRoadZ)))
             * step(0.45, fract(vW.x * 0.075)) * hwy;
    col = mix(col, vec3(0.94, 0.90, 0.68), cl * 0.75);

    // --- Distance haze so the county dissolves instead of ending ---
    float d = length(vW) ;
    float haze = smoothstep(90.0, 155.0, d) * uFog;
    col = mix(col, uHaze, haze * 0.94);
    // Even with fog off the far field has to fall away or the plane edge shows.
    col = mix(col, uHaze, smoothstep(120.0, 158.0, d) * (1.0 - uFog));

    // --- Arrival: the parcel resolves out of the compute hall's dark ---
    // A noise-thresholded wipe, so it dissolves rather than cross-fades.
    // Threshold rides a hair past the noise field's maximum so t = 1 is fully
    // covered and t = 0 is fully clear — the dissolve has to bottom out at both
    // ends or the hold ring would never finish arriving.
    float n = hash1(floor(vW * 0.7)) * 0.55 + hash1(floor(vW * 0.17)) * 0.45;
    float seed = n * 0.85 + smoothstep(-60.0, 90.0, vW.y) * 0.25;
    float wipe = smoothstep(uArrive * 1.36 - 0.30, uArrive * 1.36 + 0.06, seed);
    col = mix(uArriveCol, col, clamp(wipe, 0.0, 1.0));
    col = mix(col, uArriveCol, uArrive * 0.35);

    // Grain keeps the big flat pad from banding on 8-bit displays.
    float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    col += (grain - 0.5) * 0.012;

    gl_FragColor = vec4(toSRGB(col), 1.0);
  }
`;

/** Soft round falloff — used for the cheap contact shadows and the dust motes. */
function makeRadialTexture(inner: number, mid: number): THREE.Texture {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, `rgba(255,255,255,${inner})`);
  g.addColorStop(0.55, `rgba(255,255,255,${mid})`);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

/** Deterministic PRNG — the scrub must land in the same place on every rebuild. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export class CampusScene implements StageScene {
  readonly id = 'campus';

  /** Every named place on the campus, in the order the DOM should list them. */
  readonly hotspots: readonly CampusHotspot[] = [
    {
      id: 'building-1',
      label: `Building 1 · ${site.buildings[0].sqft.toLocaleString('en-US')} sqft · ${site.buildings[0].role}`,
      worldPosition: new THREE.Vector3(BUILDING_X[0], BUILDING_H + 3.4, BUILDING_Z),
    },
    {
      id: 'building-2',
      label: `Building 2 · ${site.buildings[1].sqft.toLocaleString('en-US')} sqft · ${site.buildings[1].role}`,
      worldPosition: new THREE.Vector3(BUILDING_X[1], BUILDING_H + 3.4, BUILDING_Z),
    },
    {
      id: 'building-3',
      label: `Building 3 · ${site.buildings[2].sqft.toLocaleString('en-US')} sqft · ${site.buildings[2].role}`,
      worldPosition: new THREE.Vector3(BUILDING_X[2], BUILDING_H + 3.4, BUILDING_Z),
    },
    {
      id: 'transformer',
      label: `${power.transformer} transformer · ${power.voltage}`,
      worldPosition: new THREE.Vector3(TRANSFORMER_P.x, 6.4, TRANSFORMER_P.z),
    },
    {
      id: 'solar',
      label: `Solar · ${power.solarPlanned}`,
      worldPosition: new THREE.Vector3(SOLAR_P.x, 3.6, SOLAR_P.z),
    },
    {
      id: 'storage',
      label: 'Storage · Z1Power LFP battery cabinets',
      worldPosition: new THREE.Vector3(BATTERY_P.x, 4.4, BATTERY_P.z),
    },
    {
      id: 'road',
      label: `Access road · ${site.address}`,
      worldPosition: new THREE.Vector3(SPUR_X, 1.6, 44),
    },
    {
      id: 'land',
      label: `${site.acres} acres · ${site.ownership} · room for Phase 2 and 3`,
      worldPosition: new THREE.Vector3(46, 2.0, 28),
    },
  ];

  // --- Scene graph -------------------------------------------------------
  private root = new THREE.Group();
  private ground!: THREE.Mesh;
  private groundMat!: THREE.ShaderMaterial;
  private shadowCatcher!: THREE.Mesh;
  private solar: THREE.InstancedMesh | null = null;
  private scrub: THREE.InstancedMesh | null = null;
  private motes: THREE.Points | null = null;
  private beacon!: THREE.Mesh;
  private glow!: THREE.Mesh;
  private key!: THREE.DirectionalLight;
  private hemi!: THREE.HemisphereLight;
  private fill!: THREE.DirectionalLight;
  private contactMat!: THREE.MeshBasicMaterial;

  // --- Bookkeeping -------------------------------------------------------
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];
  private textures: THREE.Texture[] = [];
  /** Materials that fade during the arrival dissolve, with their rest opacity. */
  private fades: { mat: THREE.Material; base: number }[] = [];
  private built = false;
  private settings: TierSettings | null = null;
  private ctx: SceneContext | null = null;

  // --- Saved host state, restored on dispose -----------------------------
  private prevBackground: THREE.Scene['background'] = null;
  private prevFog: THREE.Scene['fog'] = null;
  private prevShadows = false;
  private prevShadowType: THREE.ShadowMapType = THREE.PCFShadowMap;
  private prevTouchAction = '';
  private prevNear = 0.1;
  private prevFar = 2000;
  private prevFov = 50;

  // --- Camera rig --------------------------------------------------------
  private target = new THREE.Vector3(0, 2, -2);
  private goalTarget = new THREE.Vector3(0, 2, -2);
  private radius = 150;
  private goalRadius = 150;
  private theta = THETA_BASE;
  private goalTheta = THETA_BASE;
  private phi = 0.86;
  private goalPhi = 0.86;
  private baseRadius = 150;
  private basePhi = 0.86;
  private engaged = false;      // the visitor has taken the wheel; stop drifting
  private interactive = true;
  private arrive = 0;

  // --- Pointer state -----------------------------------------------------
  private dom: HTMLElement | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;
  private pinchMid = { x: 0, y: 0 };

  // Scratch, so the per-frame projection allocates nothing.
  private v3 = new THREE.Vector3();
  private spherical = new THREE.Spherical();

  /* ==========================================================
     StageScene
     ========================================================== */

  build(ctx: SceneContext, settings: TierSettings): void {
    if (this.built) return;
    this.built = true;
    this.ctx = ctx;
    this.settings = settings;

    this.prevBackground = ctx.scene.background;
    this.prevFog = ctx.scene.fog;
    this.prevShadows = ctx.renderer.shadowMap.enabled;
    this.prevShadowType = ctx.renderer.shadowMap.type;
    this.prevNear = ctx.camera.near;
    this.prevFar = ctx.camera.far;
    this.prevFov = ctx.camera.fov;

    ctx.scene.background = new THREE.Color(C_SKY);
    this.root.name = 'stage-campus';
    ctx.scene.add(this.root);

    this.buildLights(settings);
    this.buildGround(settings);
    this.buildBuildings();
    this.buildTransformer();
    this.buildBattery();
    this.buildSolar(settings);
    this.buildScatter(settings);
    this.applyTier(settings, ctx);

    this.bindPointer(ctx);
    this.frame(ctx);
    this.setWorldMix(1);   // the host cross-fades us in from the compute hall
  }

  update(elapsed: number, delta: number, scroll: number, ctx: SceneContext): void {
    this.ctx = ctx;
    const dt = clamp(delta, 0, 0.1);
    const t = ctx.reducedMotion ? 0 : elapsed;

    this.groundMat.uniforms.uTime.value = t;

    if (!ctx.reducedMotion) {
      // Idle: a slow parallax drift until the visitor takes over, and a scroll
      // that eases the camera in toward the pad as the copy block arrives.
      if (!this.engaged) {
        this.goalTheta = THETA_BASE + Math.sin(elapsed * 0.06) * 0.16;
        this.goalRadius = clamp(
          this.baseRadius * (1.06 - 0.14 * clamp(scroll, 0, 1)),
          RADIUS_MIN, RADIUS_MAX,
        );
        this.goalPhi = this.basePhi - 0.06 * clamp(scroll, 0, 1);
      }
      // The Phase 1A beacon, and a breath on the lit bay of Building 1.
      const pulse = 0.5 + 0.5 * Math.sin(elapsed * 2.1);
      (this.beacon.material as THREE.MeshBasicMaterial).opacity = (0.35 + pulse * 0.65) * (1 - this.arrive);
      (this.glow.material as THREE.MeshBasicMaterial).opacity = (0.62 + pulse * 0.12) * (1 - this.arrive);
      if (this.motes) this.motes.rotation.y = elapsed * 0.012;
    }

    // Critically-damped-enough smoothing, frame-rate independent.
    const k = ctx.reducedMotion ? 1 : 1 - Math.exp(-dt * 7.5);
    this.theta += (this.goalTheta - this.theta) * k;
    this.phi += (this.goalPhi - this.phi) * k;
    this.radius += (this.goalRadius - this.radius) * k;
    this.target.lerp(this.goalTarget, k);

    this.applyCamera(ctx);
  }

  /**
   * ARRIVAL, not departure — this is the last world. 1 = still dissolving in
   * out of the compute hall, 0 = fully arrived. Reversible: every value is
   * recomputed from a stored base, nothing accumulates.
   */
  setWorldMix(t: number): void {
    const a = clamp(t, 0, 1);
    this.arrive = a;
    if (!this.built) return;   // the ring can fire before the stage is entered
    this.groundMat.uniforms.uArrive.value = a;

    for (const f of this.fades) {
      const m = f.mat as THREE.Material & { opacity: number };
      m.opacity = f.base * (1 - a);
      m.visible = m.opacity > 0.004;
    }

    // Daylight itself arrives: the sun comes up as the dark world lets go.
    const lit = 1 - a;
    this.key.intensity = 2.15 * lit;
    this.fill.intensity = 0.42 * lit;
    this.hemi.intensity = 1.15 * lit + 0.1;

    const ctx = this.ctx;
    if (ctx) {
      const sky = new THREE.Color(C_SKY).lerp(new THREE.Color(C_ARRIVE), a);
      if (ctx.scene.background instanceof THREE.Color) ctx.scene.background.copy(sky);
      else ctx.scene.background = sky;
      if (ctx.scene.fog) ctx.scene.fog.color.copy(sky);
    }
  }

  onTier(settings: TierSettings, ctx: SceneContext): void {
    this.settings = settings;
    this.ctx = ctx;
    this.rebuildGroundGeometry(settings);
    this.buildSolar(settings);
    this.buildScatter(settings);
    this.applyTier(settings, ctx);
    this.setWorldMix(this.arrive);
  }

  /**
   * Re-compose for the viewport. Portrait pulls the camera back and lifts the
   * isometric angle toward plan so the whole parcel still reads in a tall,
   * narrow frame instead of a cropped strip of pad.
   */
  frame(ctx: SceneContext): void {
    this.ctx = ctx;
    const narrow = ctx.width < 700;
    const aspect = ctx.width / Math.max(ctx.height, 1);

    ctx.camera.fov = narrow ? 52 : 40;
    ctx.camera.near = 0.5;
    ctx.camera.far = 900;

    // Portrait raises the isometric angle toward plan; the parcel then reads as
    // a shape rather than as a strip, which is what a tall frame can hold.
    this.basePhi = narrow ? 0.66 : 0.86;

    // Fit distance = whichever screen axis is the tighter constraint. The depth
    // of the parcel foreshortens by sin(elevation), so it is not simply 2·half.
    const fovY = THREE.MathUtils.degToRad(ctx.camera.fov);
    const fovX = 2 * Math.atan(Math.tan(fovY / 2) * aspect);
    const elev = Math.PI / 2 - this.basePhi;
    const margin = narrow ? 1.16 : 1.26;
    const fitW = (PARCEL_H.x * margin) / Math.tan(fovX / 2);
    const fitH = ((PARCEL_H.y * Math.sin(elev) + 9) * margin) / Math.tan(fovY / 2);
    this.baseRadius = clamp(Math.max(fitW, fitH), RADIUS_MIN, RADIUS_MAX);

    if (!this.engaged) {
      this.goalRadius = this.baseRadius;
      this.goalPhi = this.basePhi;
      this.goalTheta = THETA_BASE;
      this.goalTarget.set(0, 2, narrow ? -4 : -2);
      this.radius = this.goalRadius;
      this.phi = this.goalPhi;
      this.theta = this.goalTheta;
      this.target.copy(this.goalTarget);
    } else {
      this.goalRadius = clamp(this.goalRadius, RADIUS_MIN, RADIUS_MAX);
    }

    ctx.camera.updateProjectionMatrix();
    this.applyCamera(ctx);
  }

  dispose(): void {
    this.unbindPointer();

    const ctx = this.ctx;
    if (ctx) {
      ctx.scene.remove(this.root);
      ctx.scene.background = this.prevBackground;
      ctx.scene.fog = this.prevFog;
      ctx.renderer.shadowMap.enabled = this.prevShadows;
      ctx.renderer.shadowMap.type = this.prevShadowType;
      ctx.camera.near = this.prevNear;
      ctx.camera.far = this.prevFar;
      ctx.camera.fov = this.prevFov;
      ctx.camera.updateProjectionMatrix();
    }
    this.root.clear();

    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    for (const t of this.textures) t.dispose();
    this.geometries = [];
    this.materials = [];
    this.textures = [];
    this.fades = [];
    this.solar = null;
    this.scrub = null;
    this.motes = null;
    this.ctx = null;
    this.built = false;
  }

  /* ==========================================================
     Public interaction. The DOM chrome drives these directly;
     the pointer handlers below are thin wrappers over them.
     ========================================================== */

  /** Orbit by a drag in CSS pixels. Clamped to the isometric envelope. */
  orbit(dx: number, dy: number): void {
    this.engaged = true;
    this.goalTheta = clamp(
      this.goalTheta - dx * ORBIT_SPEED,
      THETA_BASE - THETA_RANGE,
      THETA_BASE + THETA_RANGE,
    );
    this.goalPhi = clamp(this.goalPhi - dy * ORBIT_SPEED, PHI_MIN, PHI_MAX);
  }

  /** Positive zooms in, negative out. ~1 unit ≈ one wheel notch. */
  zoom(delta: number): void {
    this.engaged = true;
    this.goalRadius = clamp(this.goalRadius * Math.pow(0.86, delta), RADIUS_MIN, RADIUS_MAX);
  }

  /** Slide the look-at point across the parcel, in CSS pixels of drag. */
  pan(dx: number, dy: number): void {
    this.engaged = true;
    // Move in the camera's ground basis so a drag pushes the land, not the axes.
    const scale = PAN_SPEED * (this.radius / 150);
    const sin = Math.sin(this.theta);
    const cos = Math.cos(this.theta);
    this.goalTarget.x = clamp(this.goalTarget.x - (dx * cos - dy * sin) * scale, -PAN_X, PAN_X);
    this.goalTarget.z = clamp(this.goalTarget.z + (dx * sin + dy * cos) * scale, PAN_Z_MIN, PAN_Z_MAX);
  }

  /** Fly to a named hotspot. Unknown ids are ignored. */
  focusHotspot(id: string): void {
    const h = this.hotspots.find((s) => s.id === id);
    if (!h) return;
    this.engaged = true;
    this.goalTarget.set(
      clamp(h.worldPosition.x, -PAN_X, PAN_X),
      2,
      clamp(h.worldPosition.z, PAN_Z_MIN, PAN_Z_MAX),
    );
    // Wide features want a wider shot than a single cabinet does.
    const wide = id === 'land' || id === 'solar' || id === 'road';
    this.goalRadius = clamp(wide ? this.baseRadius * 0.62 : this.baseRadius * 0.40, RADIUS_MIN, RADIUS_MAX);
    this.goalPhi = clamp(this.basePhi + 0.10, PHI_MIN, PHI_MAX);
    this.goalTheta = THETA_BASE + (h.worldPosition.x > 0 ? 0.20 : -0.20);
  }

  /** Back to the establishing shot, and let the idle drift resume. */
  resetView(): void {
    this.engaged = false;
    this.goalRadius = this.baseRadius;
    this.goalPhi = this.basePhi;
    this.goalTheta = THETA_BASE;
    this.goalTarget.set(0, 2, -2);
  }

  /**
   * Gate the built-in pointer handling. The host should switch this off while
   * the page is still scroll-driven — wheel zoom has to call preventDefault,
   * and that would otherwise eat the narrative scroll.
   */
  setInteractive(on: boolean): void {
    this.interactive = on;
    if (!on) this.pointers.clear();
  }

  /**
   * Hotspots resolved to CSS pixels for the frame about to be drawn. The host
   * renders the labels; this module never creates DOM.
   */
  projectHotspots(ctx: SceneContext): ProjectedHotspot[] {
    ctx.camera.updateMatrixWorld();
    this.root.updateMatrixWorld();
    const out: ProjectedHotspot[] = [];
    const settled = this.arrive < 0.35;
    for (const h of this.hotspots) {
      this.v3.copy(h.worldPosition).project(ctx.camera);
      const behind = this.v3.z > 1 || this.v3.z < -1;
      const x = (this.v3.x * 0.5 + 0.5) * ctx.width;
      const y = (-this.v3.y * 0.5 + 0.5) * ctx.height;
      out.push({
        id: h.id,
        label: h.label,
        x,
        y,
        visible: settled && !behind
          && x > -80 && x < ctx.width + 80
          && y > -60 && y < ctx.height + 60,
      });
    }
    return out;
  }

  /* ==========================================================
     Camera
     ========================================================== */

  private applyCamera(ctx: SceneContext): void {
    this.spherical.set(this.radius, clamp(this.phi, PHI_MIN, PHI_MAX), this.theta);
    this.v3.setFromSpherical(this.spherical).add(this.target);
    // Hard floor: nothing may put the eye under the prairie.
    this.v3.y = Math.max(this.v3.y, 8);
    ctx.camera.position.copy(this.v3);
    ctx.camera.lookAt(this.target);
  }

  /* ==========================================================
     Pointer / wheel / pinch. Written by hand rather than pulled
     from three/examples so the clamps above are the only truth
     and touch never fights the page.
     ========================================================== */

  private bindPointer(ctx: SceneContext): void {
    const dom = ctx.renderer.domElement as HTMLElement;
    this.dom = dom;
    this.prevTouchAction = dom.style.touchAction;
    dom.style.touchAction = 'none';   // or pointermove never fires on touch
    dom.addEventListener('pointerdown', this.onPointerDown);
    dom.addEventListener('pointermove', this.onPointerMove);
    dom.addEventListener('pointerup', this.onPointerUp);
    dom.addEventListener('pointercancel', this.onPointerUp);
    dom.addEventListener('pointerleave', this.onPointerUp);
    dom.addEventListener('wheel', this.onWheel, { passive: false });
  }

  private unbindPointer(): void {
    const dom = this.dom;
    if (!dom) return;
    dom.removeEventListener('pointerdown', this.onPointerDown);
    dom.removeEventListener('pointermove', this.onPointerMove);
    dom.removeEventListener('pointerup', this.onPointerUp);
    dom.removeEventListener('pointercancel', this.onPointerUp);
    dom.removeEventListener('pointerleave', this.onPointerUp);
    dom.removeEventListener('wheel', this.onWheel);
    dom.style.touchAction = this.prevTouchAction;
    this.pointers.clear();
    this.dom = null;
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (!this.interactive) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) this.readPinch();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.interactive) return;
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    prev.x = e.clientX;
    prev.y = e.clientY;

    if (this.pointers.size >= 2) {
      // Two fingers: pinch to zoom, and the midpoint pans.
      const before = this.pinchDist;
      const beforeMid = { ...this.pinchMid };
      this.readPinch();
      if (before > 0 && this.pinchDist > 0) {
        // Ratio -> notches, so a 2× spread is roughly five wheel clicks in.
        this.zoom(Math.log(this.pinchDist / before) / Math.log(1 / 0.86));
      }
      this.pan(this.pinchMid.x - beforeMid.x, this.pinchMid.y - beforeMid.y);
      return;
    }

    // Secondary button, middle button or a held modifier pans instead.
    if (e.buttons === 2 || e.buttons === 4 || e.shiftKey) this.pan(dx, dy);
    else this.orbit(dx, dy);
  };

  private onPointerUp = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size === 2) this.readPinch();
    else this.pinchDist = 0;
  };

  private onWheel = (e: WheelEvent): void => {
    if (!this.interactive) return;
    e.preventDefault();
    // deltaMode 1 is lines, 2 is pages — normalise both to something like px.
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1;
    this.zoom((-e.deltaY * unit) / 240);
  };

  private readPinch(): void {
    const pts = [...this.pointers.values()];
    if (pts.length < 2) { this.pinchDist = 0; return; }
    const a = pts[0]!;
    const b = pts[1]!;
    this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    this.pinchMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  /* ==========================================================
     Construction helpers
     ========================================================== */

  private geo<T extends THREE.BufferGeometry>(g: T): T {
    this.geometries.push(g);
    return g;
  }

  private mat<T extends THREE.Material>(m: T, fadeBase?: number): T {
    this.materials.push(m);
    if (fadeBase !== undefined) {
      m.transparent = true;
      m.opacity = fadeBase;
      this.fades.push({ mat: m, base: fadeBase });
    }
    return m;
  }

  private tex(t: THREE.Texture): THREE.Texture {
    this.textures.push(t);
    return t;
  }

  private buildLights(settings: TierSettings): void {
    // A warm low-afternoon key from the north-west, so the highway frontage
    // stays lit and the buildings throw their shadows back into the pad.
    this.key = new THREE.DirectionalLight(new THREE.Color('#fff1d8'), 2.15);
    this.key.position.set(-70, 96, 58);
    this.key.target.position.set(0, 0, -4);
    this.root.add(this.key, this.key.target);

    // Sky-tinted ambient: campus white above, dry grass bounce below.
    this.hemi = new THREE.HemisphereLight(new THREE.Color('#e9f1f4'), new THREE.Color('#9c9a7d'), 1.15);
    this.root.add(this.hemi);

    // Cool fill from the opposite side so the shadow sides never go to mud.
    this.fill = new THREE.DirectionalLight(new THREE.Color('#cfe0ea'), 0.42);
    this.fill.position.set(60, 40, -70);
    this.root.add(this.fill);

    if (settings.shadows) this.configureShadows(true);
  }

  private configureShadows(on: boolean): void {
    this.key.castShadow = on;
    if (on) {
      this.key.shadow.mapSize.set(1024, 1024);
      const cam = this.key.shadow.camera;
      cam.left = -90; cam.right = 90; cam.top = 90; cam.bottom = -90;
      cam.near = 10; cam.far = 260;
      cam.updateProjectionMatrix();
      this.key.shadow.bias = -0.0012;
      this.key.shadow.normalBias = 0.6;
    }
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o.userData.casts) (o as THREE.Mesh).castShadow = on;
    });
    if (this.shadowCatcher) this.shadowCatcher.visible = on;
    // Real shadow maps replace most of the cheap contact darkening.
    if (this.contactMat) {
      const base = on ? 0.16 : 0.34;
      const entry = this.fades.find((f) => f.mat === this.contactMat);
      if (entry) entry.base = base;
      this.contactMat.opacity = base * (1 - this.arrive);
    }
  }

  private buildGround(settings: TierSettings): void {
    this.groundMat = this.mat(new THREE.ShaderMaterial({
      vertexShader: GROUND_VERT,
      fragmentShader: GROUND_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uAmp: { value: 3.4 },
        uArrive: { value: 0 },
        uFog: { value: settings.fog ? 1 : 0 },
        uParcelC: { value: PARCEL_C.clone() },
        uParcelH: { value: PARCEL_H.clone() },
        uPadC: { value: PAD_C.clone() },
        uPadH: { value: PAD_H.clone() },
        uRoadZ: { value: ROAD_Z },
        uRoadHalf: { value: ROAD_HALF },
        uSpurX: { value: SPUR_X },
        uSpurHalf: { value: SPUR_HALF },
        uSpurEndZ: { value: SPUR_END_Z },
        uGrassLo: { value: new THREE.Color(C_GRASS_LO) },
        uGrassHi: { value: new THREE.Color(C_GRASS_HI) },
        uPad: { value: new THREE.Color(C_PAD) },
        uAsphalt: { value: new THREE.Color(C_ASPHALT) },
        uLine: { value: new THREE.Color(C_LINE) },
        uHaze: { value: new THREE.Color(C_HAZE) },
        uArriveCol: { value: new THREE.Color(C_ARRIVE) },
      },
    }));
    this.ground = new THREE.Mesh(this.groundGeometry(settings), this.groundMat);
    this.ground.renderOrder = -1;
    this.root.add(this.ground);

    // A ShaderMaterial cannot receive shadow maps without the lights chunks, so
    // real shadows land on a dedicated catcher a hair above the prairie.
    this.shadowCatcher = new THREE.Mesh(
      this.geo(new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE).rotateX(-Math.PI / 2)),
      this.mat(new THREE.ShadowMaterial({ opacity: 0.22 }), 0.22),
    );
    this.shadowCatcher.position.y = 0.02;
    this.shadowCatcher.receiveShadow = true;
    this.shadowCatcher.visible = false;
    this.root.add(this.shadowCatcher);

    // One soft blob, reused under everything that stands up. Cheap contact
    // shadow: it is what keeps the model from looking like floating boxes on
    // the two tiers that cannot afford a shadow map.
    this.contactMat = this.mat(new THREE.MeshBasicMaterial({
      map: this.tex(makeRadialTexture(0.85, 0.34)),
      color: new THREE.Color('#2b3128'),
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    }), 0.34);
  }

  private groundGeometry(settings: TierSettings): THREE.PlaneGeometry {
    // Half the terrain budget: this plane is flatter and closer than stage 1's.
    const seg = clamp(Math.round(settings.terrainSegments * 0.55), 48, 220);
    return this.geo(new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE, seg, seg).rotateX(-Math.PI / 2));
  }

  private rebuildGroundGeometry(settings: TierSettings): void {
    const old = this.ground.geometry;
    this.ground.geometry = this.groundGeometry(settings);
    const i = this.geometries.indexOf(old);
    if (i >= 0) this.geometries.splice(i, 1);
    old.dispose();
  }

  /** A flat blob of contact shadow on the pad. */
  private contact(x: number, z: number, w: number, d: number): THREE.Mesh {
    const m = new THREE.Mesh(
      this.geo(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2)),
      this.contactMat,
    );
    m.position.set(x, 0.04, z);
    m.renderOrder = 1;
    this.root.add(m);
    return m;
  }

  /** Dark edge lines over a box — the whole isometric-drawing register. */
  private edges(box: THREE.BufferGeometry, opacity: number): THREE.LineSegments {
    return new THREE.LineSegments(
      this.geo(new THREE.EdgesGeometry(box, 25)),
      this.mat(new THREE.LineBasicMaterial({ color: new THREE.Color(C_EDGE), depthWrite: false }), opacity),
    );
  }

  private buildBuildings(): void {
    for (let i = 0; i < 3; i++) {
      const x = BUILDING_X[i]!;
      const live = i === 0;                        // Building 1 = Phase 1A, energised
      const g = new THREE.Group();
      g.position.set(x, 0, BUILDING_Z);
      this.root.add(g);

      const boxGeo = this.geo(new THREE.BoxGeometry(BUILDING_W, BUILDING_H, BUILDING_D));
      const shell = new THREE.Mesh(boxGeo, this.mat(new THREE.MeshStandardMaterial({
        color: new THREE.Color(live ? C_HALL : C_SHELL),
        roughness: 0.88,
        metalness: 0.02,
      }), 1));
      shell.position.y = BUILDING_H / 2;
      shell.userData.casts = true;
      g.add(shell);

      // Low parapet roof cap, slightly proud of the walls.
      const cap = new THREE.Mesh(
        this.geo(new THREE.BoxGeometry(BUILDING_W + 0.8, 0.5, BUILDING_D + 0.8)),
        this.mat(new THREE.MeshStandardMaterial({
          color: new THREE.Color(C_ROOF), roughness: 0.92, metalness: 0.0,
        }), 1),
      );
      cap.position.y = BUILDING_H + 0.2;
      cap.userData.casts = true;
      g.add(cap);

      const e = this.edges(boxGeo, live ? 0.5 : 0.34);
      e.position.y = BUILDING_H / 2;
      g.add(e);

      if (live) {
        // Phase 1A: roof plant for the direct-to-chip loop, a lit bay door,
        // and a beacon. This is the only building that is switched on.
        const cduGeo = this.geo(new THREE.BoxGeometry(2.6, 1.5, 3.4));
        const cduMat = this.mat(new THREE.MeshStandardMaterial({
          color: new THREE.Color(C_STEEL), roughness: 0.55, metalness: 0.35,
        }), 1);
        for (let k = 0; k < 3; k++) {
          const cdu = new THREE.Mesh(cduGeo, cduMat);
          cdu.position.set(-5.5 + k * 5.5, BUILDING_H + 1.2, -1.2);
          cdu.userData.casts = true;
          g.add(cdu);
        }
        const vent = new THREE.Mesh(
          this.geo(new THREE.BoxGeometry(14, 0.7, 1.2)),
          cduMat,
        );
        vent.position.set(0, BUILDING_H + 0.8, 3.4);
        g.add(vent);

        this.glow = new THREE.Mesh(
          this.geo(new THREE.PlaneGeometry(13, 2.2)),
          this.mat(new THREE.MeshBasicMaterial({
            color: new THREE.Color(C_GLOW), transparent: true, depthWrite: false,
          }), 0.68),
        );
        this.glow.position.set(0, 1.5, BUILDING_D / 2 + 0.06);
        g.add(this.glow);

        this.beacon = new THREE.Mesh(
          this.geo(new THREE.SphereGeometry(0.55, 10, 8)),
          this.mat(new THREE.MeshBasicMaterial({
            color: new THREE.Color(C_GOLD), transparent: true, depthWrite: false,
          }), 0.9),
        );
        this.beacon.position.set(BUILDING_W / 2 - 1.4, BUILDING_H + 1.6, BUILDING_D / 2 - 1.4);
        g.add(this.beacon);
      } else {
        // Shells: a roll-up door outline and nothing behind it yet.
        const door = new THREE.Mesh(
          this.geo(new THREE.PlaneGeometry(5.4, 4.2)),
          this.mat(new THREE.MeshStandardMaterial({
            color: new THREE.Color('#a9aeaa'), roughness: 0.95,
          }), 1),
        );
        door.position.set(0, 2.1, BUILDING_D / 2 + 0.05);
        g.add(door);
      }

      this.contact(x, BUILDING_Z + 1.6, BUILDING_W + 9, BUILDING_D + 9);
    }
  }

  private buildTransformer(): void {
    const g = new THREE.Group();
    g.position.copy(TRANSFORMER_P);
    this.root.add(g);

    const pad = new THREE.Mesh(
      this.geo(new THREE.BoxGeometry(11, 0.4, 9)),
      this.mat(new THREE.MeshStandardMaterial({
        color: new THREE.Color(C_CONCRETE), roughness: 0.95,
      }), 1),
    );
    pad.position.y = 0.2;
    g.add(pad);

    // 3 MVA pad-mount: tank, radiator fins, three bushings on the HV side.
    const tankGeo = this.geo(new THREE.BoxGeometry(6.4, 4.0, 4.6));
    const steel = this.mat(new THREE.MeshStandardMaterial({
      color: new THREE.Color('#8b9598'), roughness: 0.5, metalness: 0.45,
    }), 1);
    const tank = new THREE.Mesh(tankGeo, steel);
    tank.position.y = 2.4;
    tank.userData.casts = true;
    g.add(tank);
    const te = this.edges(tankGeo, 0.45);
    te.position.y = 2.4;
    g.add(te);

    const finGeo = this.geo(new THREE.BoxGeometry(0.3, 3.0, 1.9));
    for (let i = 0; i < 5; i++) {
      const fin = new THREE.Mesh(finGeo, steel);
      fin.position.set(-3.4, 2.3, -1.6 + i * 0.8);
      g.add(fin);
    }

    const bushGeo = this.geo(new THREE.CylinderGeometry(0.22, 0.3, 1.9, 8));
    const bushMat = this.mat(new THREE.MeshStandardMaterial({
      color: new THREE.Color('#d8d2c6'), roughness: 0.4,
    }), 1);
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(bushGeo, bushMat);
      b.position.set(-1.6 + i * 1.6, 5.3, 1.4);
      g.add(b);
    }

    // Nameplate stripe, gold — the one figure this whole site is built on.
    const plate = new THREE.Mesh(
      this.geo(new THREE.PlaneGeometry(4.6, 0.5)),
      this.mat(new THREE.MeshBasicMaterial({
        color: new THREE.Color(C_GOLD), transparent: true, depthWrite: false,
      }), 0.8),
    );
    plate.position.set(0, 1.1, 2.32);
    g.add(plate);

    this.contact(TRANSFORMER_P.x, TRANSFORMER_P.z + 0.6, 17, 15);
  }

  private buildBattery(): void {
    const g = new THREE.Group();
    g.position.copy(BATTERY_P);
    this.root.add(g);

    const pad = new THREE.Mesh(
      this.geo(new THREE.BoxGeometry(21, 0.35, 8)),
      this.mat(new THREE.MeshStandardMaterial({
        color: new THREE.Color(C_CONCRETE), roughness: 0.95,
      }), 1),
    );
    pad.position.y = 0.18;
    g.add(pad);

    // Six Z1Power LFP cabinets in a row, at manufacturer cost.
    const cabGeo = this.geo(new THREE.BoxGeometry(2.6, 3.2, 1.9));
    const cabMat = this.mat(new THREE.MeshStandardMaterial({
      color: new THREE.Color('#dfe2e0'), roughness: 0.7, metalness: 0.12,
    }), 1);
    const stripeGeo = this.geo(new THREE.PlaneGeometry(2.1, 0.28));
    const stripeMat = this.mat(new THREE.MeshBasicMaterial({
      color: new THREE.Color(C_GOLD), transparent: true, depthWrite: false,
    }), 0.85);
    for (let i = 0; i < 6; i++) {
      const x = -8.0 + i * 3.2;
      const cab = new THREE.Mesh(cabGeo, cabMat);
      cab.position.set(x, 1.95, 0);
      cab.userData.casts = true;
      g.add(cab);
      const ed = this.edges(cabGeo, 0.4);
      ed.position.set(x, 1.95, 0);
      g.add(ed);
      const st = new THREE.Mesh(stripeGeo, stripeMat);
      st.position.set(x, 2.9, 0.96);
      g.add(st);
    }

    this.contact(BATTERY_P.x, BATTERY_P.z + 0.4, 27, 14);
  }

  /**
   * ~500 kW of on-site solar, drawn as tilted rows. The panel count rides
   * `particleCount` so a low-tier device gets the same read at a fifth of the
   * instances rather than a different picture.
   */
  private buildSolar(settings: TierSettings): void {
    if (this.solar) {
      this.root.remove(this.solar);
      this.disposeInstanced(this.solar);
      this.solar = null;
    }
    const count = clamp(Math.round(settings.particleCount / 11), 24, 132);
    const cols = Math.max(4, Math.round(Math.sqrt(count * 2.6)));
    const rows = Math.ceil(count / cols);

    const geo = this.geo(new THREE.BoxGeometry(3.0, 0.16, 1.7));
    const mat = this.mat(new THREE.MeshStandardMaterial({
      color: new THREE.Color(C_PANEL),
      roughness: 0.28,
      metalness: 0.55,
    }), 1);
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const dummy = new THREE.Object3D();
    let n = 0;
    for (let r = 0; r < rows && n < count; r++) {
      for (let c = 0; c < cols && n < count; c++) {
        dummy.position.set(
          SOLAR_P.x + (c - (cols - 1) / 2) * 3.5,
          1.35,
          SOLAR_P.z + (r - (rows - 1) / 2) * 3.0,
        );
        dummy.rotation.set(-0.42, 0, 0);   // tilted toward the southern sun
        dummy.updateMatrix();
        mesh.setMatrixAt(n++, dummy.matrix);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.userData.casts = true;
    mesh.castShadow = settings.shadows;
    this.solar = mesh;
    this.root.add(mesh);

    // One soft blob under the whole array — 130 individual blobs would cost
    // more than the panels do.
    if (!this.solarPadDone) {
      this.contact(SOLAR_P.x, SOLAR_P.z, cols * 3.9, rows * 3.6);
      this.solarPadDone = true;
    }
  }
  private solarPadDone = false;

  /** Scrub on the open land, and a little dust in the air. Both tier-scaled. */
  private buildScatter(settings: TierSettings): void {
    if (this.scrub) {
      this.root.remove(this.scrub);
      this.disposeInstanced(this.scrub);
      this.scrub = null;
    }
    if (this.motes) {
      this.root.remove(this.motes);
      this.motes.geometry.dispose();
      const gi = this.geometries.indexOf(this.motes.geometry);
      if (gi >= 0) this.geometries.splice(gi, 1);
      const pm = this.motes.material as THREE.PointsMaterial;
      if (pm.map) {
        pm.map.dispose();
        const ti = this.textures.indexOf(pm.map);
        if (ti >= 0) this.textures.splice(ti, 1);
      }
      pm.dispose();
      const mi = this.materials.indexOf(pm);
      if (mi >= 0) this.materials.splice(mi, 1);
      const fi = this.fades.findIndex((f) => f.mat === pm);
      if (fi >= 0) this.fades.splice(fi, 1);
      this.motes = null;
    }

    // --- Scrub ---
    const bushes = clamp(Math.round(settings.particleCount / 14), 18, 90);
    const geo = this.geo(new THREE.IcosahedronGeometry(1, 0));
    const mat = this.mat(new THREE.MeshStandardMaterial({
      color: new THREE.Color('#6f8257'), roughness: 1, flatShading: true,
    }), 1);
    const mesh = new THREE.InstancedMesh(geo, mat, bushes);
    const dummy = new THREE.Object3D();
    const rand = rng(0x5ead1);
    let placed = 0;
    let guard = 0;
    while (placed < bushes && guard++ < bushes * 24) {
      const x = (rand() * 2 - 1) * (PARCEL_H.x + 42);
      const z = (rand() * 2 - 1) * (PARCEL_H.y + 42);
      // Keep it off the graded pad, the roads and the array.
      if (Math.abs(x - PAD_C.x) < PAD_H.x + 5 && Math.abs(z - PAD_C.y) < PAD_H.y + 5) continue;
      if (Math.abs(z - ROAD_Z) < ROAD_HALF + 5) continue;
      if (Math.abs(x - SPUR_X) < SPUR_HALF + 5 && z > SPUR_END_Z - 5 && z < ROAD_Z) continue;
      if (Math.abs(x - SOLAR_P.x) < 34 && Math.abs(z - SOLAR_P.z) < 24) continue;
      const s = 0.7 + rand() * 1.2;
      dummy.position.set(x, s * 0.42, z);
      dummy.scale.set(s * 1.25, s * 0.62, s * 1.25);
      dummy.rotation.y = rand() * Math.PI;
      dummy.updateMatrix();
      mesh.setMatrixAt(placed++, dummy.matrix);
    }
    // Park any unplaced instances far below the camera's clamped floor.
    for (let i = placed; i < bushes; i++) {
      dummy.position.set(0, -500, 0);
      dummy.scale.setScalar(0.001);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.scrub = mesh;
    this.root.add(mesh);

    // --- Dust ---
    const dust = clamp(Math.round(settings.particleCount / 5), 60, 240);
    const pos = new Float32Array(dust * 3);
    for (let i = 0; i < dust; i++) {
      pos[i * 3] = (rand() * 2 - 1) * 130;
      pos[i * 3 + 1] = 2 + rand() * 34;
      pos[i * 3 + 2] = (rand() * 2 - 1) * 120;
    }
    const pg = this.geo(new THREE.BufferGeometry());
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.motes = new THREE.Points(pg, this.mat(new THREE.PointsMaterial({
      size: 0.9,
      sizeAttenuation: true,
      map: this.tex(makeRadialTexture(1, 0.3)),
      color: new THREE.Color('#ffffff'),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }), 0.24));
    this.root.add(this.motes);
  }

  private disposeInstanced(m: THREE.InstancedMesh): void {
    m.geometry.dispose();
    const gi = this.geometries.indexOf(m.geometry);
    if (gi >= 0) this.geometries.splice(gi, 1);
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mm of mats) {
      mm.dispose();
      const mi = this.materials.indexOf(mm);
      if (mi >= 0) this.materials.splice(mi, 1);
      const fi = this.fades.findIndex((f) => f.mat === mm);
      if (fi >= 0) this.fades.splice(fi, 1);
    }
    m.dispose();
  }

  private applyTier(settings: TierSettings, ctx: SceneContext): void {
    this.groundMat.uniforms.uFog.value = settings.fog ? 1 : 0;

    if (settings.fog) {
      const sky = new THREE.Color(C_HAZE);
      if (ctx.scene.fog instanceof THREE.Fog) {
        ctx.scene.fog.color.copy(sky);
        ctx.scene.fog.near = 120;
        ctx.scene.fog.far = 420;
      } else {
        ctx.scene.fog = new THREE.Fog(sky, 120, 420);
      }
    } else {
      ctx.scene.fog = null;
    }

    ctx.renderer.shadowMap.enabled = settings.shadows;
    if (settings.shadows) ctx.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.configureShadows(settings.shadows);
    if (this.solar) this.solar.castShadow = settings.shadows;
  }
}

/** Convenience factory, so the stage registry can stay declarative. */
export function createCampusScene(): CampusScene {
  return new CampusScene();
}

export default CampusScene;
