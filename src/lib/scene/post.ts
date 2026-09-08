/**
 * Post-processing chain.
 *
 * A self-contained replacement for `renderer.render(scene, camera)` built on
 * three core only — no `three/examples`, no `three/addons`, no `postprocessing`
 * package. Every pass is a full-screen triangle drawn with a hand-written
 * ShaderMaterial into a `THREE.WebGLRenderTarget`.
 *
 * ── Pass order ────────────────────────────────────────────────────────────
 *   0. scene   → sceneRT          (HDR, half-float, LINEAR light — see below)
 *   1. bright  → bloomWorkRT      threshold with a soft knee + 4-tap box down
 *   2. blur    → per mip level, separable Gaussian H then V (2 passes/level)
 *   3. sum     → bloomWorkRT      all mips composited with per-level weights
 *   4. final   → canvas           chromatic aberration, bloom add, vignette,
 *                                 exposure, ACES filmic, sRGB ENCODE, grain
 *
 * ── Colour management ─────────────────────────────────────────────────────
 * three writes LinearSRGB into any non-XR render target regardless of
 * `renderer.outputColorSpace` (see WebGLPrograms `outputColorSpace`), and the
 * clear colour is linearised the same way (`getUnlitUniformColorSpace`). So
 * every intermediate buffer here holds linear light, and NONE of these
 * ShaderMaterials include three's `<colorspace_fragment>` chunk, so three never
 * encodes for us. The one and only linear → sRGB encode happens at the very end
 * of the FINAL composite fragment shader (`linearToSRGB`, applied after ACES
 * tone mapping, just before film grain). Do not add another one anywhere.
 *
 * ── Tiers ─────────────────────────────────────────────────────────────────
 * The render targets are sized from `renderer.getPixelRatio()`, which the
 * quality manager already drops per tier (2 → 1.5 → 1, i.e. 4.0x → 2.25x → 1.0x
 * the pixel count). On top of that the bloom chain shrinks — see `PROFILES`.
 * LOW drops the bloom chain entirely and degrades to a single composite pass.
 *
 * ── Wiring ────────────────────────────────────────────────────────────────
 *   const post = new PostChain(renderer, w, h, quality.current);
 *   // in the loop, instead of renderer.render(scene, camera):
 *   post.render(scene, camera, elapsed);
 *   // on window resize:            post.setSize(w, h)
 *   // in quality.onChange(tier):   post.setQuality(tier)  ← also re-reads DPR
 *   // per stage:                   post.set({ bloomStrength: 1.4, ... })
 */

import * as THREE from 'three';

export type PostQuality = 'HIGH' | 'MEDIUM' | 'LOW';

export interface PostSettings {
  /** Multiplier on the summed bloom before it is added. 0 disables the add. */
  bloomStrength: number;
  /** Luminance above which pixels bloom. Soft-kneed, so it is not a hard cut. */
  bloomThreshold: number;
  /** 0..1 — biases the mip weights from tight (0) to wide, hazy (1). */
  bloomRadius: number;
  /** Radial chromatic aberration. UV units; the corner offset is ~0.35x this. */
  aberration: number;
  /** 0..1 — how much the corners are darkened, applied in linear light. */
  vignette: number;
  /** 0..1 — animated film grain, applied in display space after the encode. */
  grain: number;
  /** Linear exposure multiplier fed into the ACES curve. 1 = neutral. */
  exposure: number;
}

export const DEFAULT_POST_SETTINGS: Readonly<PostSettings> = Object.freeze({
  bloomStrength: 0.85,
  bloomThreshold: 0.72,
  bloomRadius: 0.55,
  aberration: 0.004,
  vignette: 0.35,
  grain: 0.035,
  exposure: 1.0,
});

interface TierProfile {
  /** Number of bloom mip levels. 0 disables the whole bloom chain. */
  levels: number;
  /** Bloom level 0 is the scene buffer divided by this. */
  divisor: number;
  aberration: boolean;
  grain: boolean;
}

const PROFILES: Record<PostQuality, TierProfile> = {
  HIGH:   { levels: 5, divisor: 2, aberration: true,  grain: true },
  MEDIUM: { levels: 3, divisor: 4, aberration: true,  grain: true },
  LOW:    { levels: 0, divisor: 4, aberration: false, grain: true },
};

/**
 * Hard ceiling on the scene buffer so a 5K display at DPR 2 cannot ask for a
 * half-gigabyte float target. Only bites well past any realistic viewport.
 */
const MAX_DEVICE_PIXELS = 5120 * 2880;

/* ─────────────────────────────── shaders ─────────────────────────────── */

/**
 * Full-screen triangle. Positions are already in clip space so no camera
 * matrices are involved — the ortho camera below exists only because
 * `renderer.render` demands one.
 */
const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/** Soft-knee luminance threshold + 4-tap box downsample. */
const FRAG_BRIGHT = /* glsl */ `
uniform sampler2D tScene;
uniform vec2 uTexel;      // 1 / source size, in device px
uniform float uThreshold;
uniform float uKnee;      // half-width of the soft knee, in luminance
uniform float uClamp;     // firefly clamp so one stray texel cannot dominate
varying vec2 vUv;

void main() {
  vec2 o = uTexel;
  vec3 s = texture2D(tScene, vUv + vec2(-o.x, -o.y)).rgb
         + texture2D(tScene, vUv + vec2( o.x, -o.y)).rgb
         + texture2D(tScene, vUv + vec2(-o.x,  o.y)).rgb
         + texture2D(tScene, vUv + vec2( o.x,  o.y)).rgb;
  vec3 c = min(max(s * 0.25, vec3(0.0)), vec3(uClamp));

  float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-5);
  float contrib = max(soft, br - uThreshold) / max(br, 1e-5);

  gl_FragColor = vec4(c * contrib, 1.0);
}
`;

/**
 * One half of a separable Gaussian. `KERNEL_RADIUS` is a compile-time define so
 * the loop unrolls; the H pass reads the previous (larger) level and so also
 * does the downsample, exactly like a mip-chain bloom.
 */
const FRAG_BLUR = /* glsl */ `
uniform sampler2D tSource;
uniform vec2 uInvSize;    // 1 / destination size
uniform vec2 uDirection;  // (1,0) horizontal, (0,1) vertical
varying vec2 vUv;

float gauss(float x, float sigma) {
  return 0.39894 * exp(-0.5 * x * x / (sigma * sigma)) / sigma;
}

void main() {
  float sigma = float(KERNEL_RADIUS);
  float w = gauss(0.0, sigma);
  vec3 sum = texture2D(tSource, vUv).rgb * w;
  float wsum = w;
  vec2 delta = uDirection * uInvSize;
  for (int i = 1; i < KERNEL_RADIUS; i++) {
    float x = float(i);
    float wi = gauss(x, sigma);
    vec2 off = delta * x;
    sum += (texture2D(tSource, vUv + off).rgb + texture2D(tSource, vUv - off).rgb) * wi;
    wsum += 2.0 * wi;
  }
  gl_FragColor = vec4(sum / wsum, 1.0);
}
`;

/** Sum shader is generated because the level count is tier-dependent. */
function bloomSumFrag(levels: number): string {
  let decls = '';
  let body = '';
  for (let i = 0; i < levels; i++) {
    decls += `uniform sampler2D tMip${i};\nuniform float uW${i};\n`;
    body += `  c += uW${i} * texture2D(tMip${i}, vUv).rgb;\n`;
  }
  return /* glsl */ `
${decls}varying vec2 vUv;
void main() {
  vec3 c = vec3(0.0);
${body}  gl_FragColor = vec4(c, 1.0);
}
`;
}

/**
 * Final composite. This is the ONLY stage that leaves linear light — it tone
 * maps, encodes to sRGB, then dithers with grain in display space.
 */
const FRAG_FINAL = /* glsl */ `
uniform sampler2D tScene;
uniform float uExposure;
uniform float uVignette;
uniform float uGrain;
uniform float uTime;
uniform vec2 uResolution;   // CSS px — keeps grain the same size at any DPR
#ifdef USE_BLOOM
uniform sampler2D tBloom;
uniform float uBloomStrength;
#endif
#ifdef USE_ABERRATION
uniform float uAberration;
#endif
varying vec2 vUv;

// Stephen Hill's ACES fit, matching three's ACESFilmicToneMapping so the look
// is identical to renderer.toneMapping = ACESFilmicToneMapping. Linear in,
// linear (display-referred, 0..1) out.
const mat3 ACES_IN = mat3(
  0.59719, 0.07600, 0.02840,
  0.35458, 0.90834, 0.13383,
  0.04823, 0.01566, 0.83777
);
const mat3 ACES_OUT = mat3(
   1.60475, -0.10208, -0.00327,
  -0.53108,  1.10813, -0.07276,
  -0.07367, -0.00605,  1.07602
);
vec3 rrtOdtFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 acesFilmic(vec3 c) {
  c = ACES_IN * c;
  c = rrtOdtFit(c);
  c = ACES_OUT * c;
  return clamp(c, 0.0, 1.0);
}

// The single linear -> sRGB encode of the whole chain.
vec3 linearToSRGB(vec3 c) {
  c = max(c, vec3(0.0));
  return mix(
    pow(c, vec3(0.41666)) * 1.055 - vec3(0.055),
    c * 12.92,
    vec3(lessThanEqual(c, vec3(0.0031308)))
  );
}

float hash21(vec2 p) {
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p.yx + 19.19);
  return fract((p.x + p.y) * p.x);
}

void main() {
  vec2 c = vUv - 0.5;
  float r2 = dot(c, c);

  vec3 col;
#ifdef USE_ABERRATION
  // Zero at the centre, ramping as r^3 toward the edge.
  vec2 dir = c * r2 * uAberration;
  col.r = texture2D(tScene, vUv + dir).r;
  col.g = texture2D(tScene, vUv).g;
  col.b = texture2D(tScene, vUv - dir).b;
  #ifdef USE_BLOOM
    vec3 b;
    b.r = texture2D(tBloom, vUv + dir).r;
    b.g = texture2D(tBloom, vUv).g;
    b.b = texture2D(tBloom, vUv - dir).b;
    col += b * uBloomStrength;
  #endif
#else
  col = texture2D(tScene, vUv).rgb;
  #ifdef USE_BLOOM
    col += texture2D(tBloom, vUv).rgb * uBloomStrength;
  #endif
#endif

  // Vignette is lens falloff, so it belongs in linear light before the curve.
  float d = length(c) * 1.41421356;
  col *= 1.0 - uVignette * smoothstep(0.35, 1.05, d);

  // three folds in the same 1/0.6 pre-scale; keep it so exposure 1.0 matches.
  col *= uExposure / 0.6;
  col = acesFilmic(col);

  vec3 outColor = linearToSRGB(col);

#ifdef USE_GRAIN
  float n = hash21(vUv * uResolution + vec2(uTime * 37.13, uTime * 91.71));
  float lum = dot(outColor, vec3(0.299, 0.587, 0.114));
  outColor += (n - 0.5) * uGrain * (1.0 - 0.6 * lum);
#endif

  gl_FragColor = vec4(outColor, 1.0);
}
`;

/* ──────────────────────────────── chain ──────────────────────────────── */

type UF = { value: number };
type UV2 = { value: THREE.Vector2 };
type UT = { value: THREE.Texture | null };

interface BlurLevel {
  h: THREE.WebGLRenderTarget;
  v: THREE.WebGLRenderTarget;
  mat: THREE.ShaderMaterial;
  uSource: UT;
  uInvSize: UV2;
  uDirection: UV2;
  width: number;
  height: number;
}

export class PostChain {
  private readonly renderer: THREE.WebGLRenderer;

  /** Viewport in CSS px. Device px are derived via renderer.getPixelRatio(). */
  private cssW = 1;
  private cssH = 1;
  private bufW = 1;
  private bufH = 1;

  private q: PostQuality;
  private profile: TierProfile;
  private enabled = true;

  /** True when the context can render to a half-float target (HDR bloom). */
  private readonly hdr: boolean;
  private readonly rtType: THREE.TextureDataType;

  private readonly settings: PostSettings = { ...DEFAULT_POST_SETTINGS };

  // Full-screen triangle, reused by every pass.
  private readonly quadGeo: THREE.BufferGeometry;
  private readonly quadScene: THREE.Scene;
  private readonly quadCam: THREE.OrthographicCamera;
  private readonly quad: THREE.Mesh;

  // Targets.
  private sceneRT!: THREE.WebGLRenderTarget;
  /** Bloom level-0-sized scratch: prefilter output first, then the mip sum. */
  private bloomWorkRT: THREE.WebGLRenderTarget | null = null;
  private levels: BlurLevel[] = [];

  // Bright pass.
  private brightMat: THREE.ShaderMaterial | null = null;
  private readonly uBrightScene: UT = { value: null };
  private readonly uBrightTexel: UV2 = { value: new THREE.Vector2() };
  private readonly uThreshold: UF = { value: DEFAULT_POST_SETTINGS.bloomThreshold };
  private readonly uKnee: UF = { value: 0.2 };
  private readonly uClamp: UF = { value: 12 };

  // Sum pass.
  private sumMat: THREE.ShaderMaterial | null = null;
  private sumWeights: UF[] = [];

  // Final pass.
  private finalMat!: THREE.ShaderMaterial;
  private readonly uFinalScene: UT = { value: null };
  private readonly uFinalBloom: UT = { value: null };
  private readonly uBloomStrength: UF = { value: DEFAULT_POST_SETTINGS.bloomStrength };
  private readonly uAberration: UF = { value: DEFAULT_POST_SETTINGS.aberration };
  private readonly uVignette: UF = { value: DEFAULT_POST_SETTINGS.vignette };
  private readonly uGrain: UF = { value: DEFAULT_POST_SETTINGS.grain };
  private readonly uExposure: UF = { value: DEFAULT_POST_SETTINGS.exposure };
  private readonly uTime: UF = { value: 0 };
  private readonly uResolution: UV2 = { value: new THREE.Vector2(1, 1) };

  constructor(
    renderer: THREE.WebGLRenderer,
    width: number,
    height: number,
    quality: PostQuality = 'HIGH',
  ) {
    this.renderer = renderer;
    this.q = quality;
    this.profile = PROFILES[quality];

    // WebGL2 exposes half-float colour buffers through either extension.
    this.hdr =
      renderer.extensions.has('EXT_color_buffer_half_float') ||
      renderer.extensions.has('EXT_color_buffer_float');
    this.rtType = this.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;

    this.quadGeo = new THREE.BufferGeometry();
    this.quadGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
    );
    this.quadGeo.setAttribute(
      'uv',
      new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2),
    );
    this.quad = new THREE.Mesh(this.quadGeo, new THREE.ShaderMaterial());
    this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quad);
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.cssW = Math.max(1, width);
    this.cssH = Math.max(1, height);
    this.measure();
    this.sceneRT = this.makeTarget(this.bufW, this.bufH, true);
    this.uFinalScene.value = this.sceneRT.texture;
    this.uBrightScene.value = this.sceneRT.texture;
    this.buildBloom();
    this.buildFinal();
    this.applySettings();
  }

  /* ───────────────────────────── public API ──────────────────────────── */

  /** Drop-in replacement for `renderer.render`. Allocates nothing. */
  render(scene: THREE.Scene, camera: THREE.Camera, elapsed: number): void {
    const r = this.renderer;

    if (!this.enabled) {
      r.render(scene, camera);
      return;
    }

    const prevTarget = r.getRenderTarget();
    const prevAutoClear = r.autoClear;

    // 0 — scene into the HDR buffer. three forces LinearSRGB output for any
    //     non-XR target, so everything downstream is linear light.
    r.autoClear = true;
    r.setRenderTarget(this.sceneRT);
    r.render(scene, camera);

    // Every remaining pass writes all of its pixels; clearing would be waste.
    r.autoClear = false;

    if (this.profile.levels > 0 && this.bloomWorkRT !== null && this.sumMat !== null) {
      // 1 — threshold + downsample into the level-0-sized scratch target.
      r.setRenderTarget(this.bloomWorkRT);
      this.draw(this.brightMat!);

      // 2 — separable Gaussian per level. The H pass reads the previous level
      //     (which is larger) and so performs the downsample as it blurs.
      let src: THREE.Texture = this.bloomWorkRT.texture;
      for (let i = 0; i < this.levels.length; i++) {
        const lv = this.levels[i]!;
        lv.uSource.value = src;
        lv.uDirection.value.set(1, 0);
        r.setRenderTarget(lv.h);
        this.draw(lv.mat);

        lv.uSource.value = lv.h.texture;
        lv.uDirection.value.set(0, 1);
        r.setRenderTarget(lv.v);
        this.draw(lv.mat);

        src = lv.v.texture;
      }

      // 3 — weighted sum of every level back into the scratch target. Safe to
      //     reuse: its prefilter contents were consumed by the level-0 H pass.
      r.setRenderTarget(this.bloomWorkRT);
      this.draw(this.sumMat);
    }

    // 4 — composite to the canvas. Tone map + the chain's only sRGB encode.
    this.uTime.value = elapsed % 1000;
    r.setRenderTarget(null);
    this.draw(this.finalMat);

    r.autoClear = prevAutoClear;
    r.setRenderTarget(prevTarget);
  }

  /** `width`/`height` are CSS px, as the host reports them. */
  setSize(width: number, height: number): void {
    this.cssW = Math.max(1, width);
    this.cssH = Math.max(1, height);
    this.measure();

    this.sceneRT.setSize(this.bufW, this.bufH);
    this.uBrightTexel.value.set(1 / this.bufW, 1 / this.bufH);
    this.uResolution.value.set(this.cssW, this.cssH);

    let w = Math.max(1, Math.round(this.bufW / this.profile.divisor));
    let h = Math.max(1, Math.round(this.bufH / this.profile.divisor));
    this.bloomWorkRT?.setSize(w, h);
    for (const lv of this.levels) {
      lv.width = w;
      lv.height = h;
      lv.h.setSize(w, h);
      lv.v.setSize(w, h);
      lv.uInvSize.value.set(1 / w, 1 / h);
      w = Math.max(1, Math.floor(w / 2));
      h = Math.max(1, Math.floor(h / 2));
    }
  }

  /**
   * Rebuilds the bloom targets and the composite shader for the new tier.
   * Also re-reads `renderer.getPixelRatio()`, so call it after the quality
   * manager has applied the tier's pixel ratio.
   */
  setQuality(q: PostQuality): void {
    if (q === this.q) {
      // Same tier, but the pixel ratio may still have moved under us.
      this.setSize(this.cssW, this.cssH);
      return;
    }
    this.q = q;
    this.profile = PROFILES[q];
    this.measure();
    this.sceneRT.setSize(this.bufW, this.bufH);
    this.disposeBloom();
    this.buildBloom();
    this.disposeFinal();
    this.buildFinal();
    this.applySettings();
  }

  get quality(): PostQuality {
    return this.q;
  }

  /** Per-world look tuning. Cheap — uniforms only, never rebuilds a target. */
  set(next: Partial<PostSettings>): void {
    Object.assign(this.settings, next);
    this.applySettings();
  }

  /** Snapshot of the live settings. */
  get(): Readonly<PostSettings> {
    return this.settings;
  }

  /** `false` bypasses the chain completely — a straight `renderer.render`. */
  setEnabled(on: boolean): void {
    this.enabled = on;
  }

  /** True when the chain has an HDR (half-float) scene buffer. */
  get isHDR(): boolean {
    return this.hdr;
  }

  dispose(): void {
    this.sceneRT.dispose();
    this.disposeBloom();
    this.disposeFinal();
    this.quadScene.remove(this.quad);
    this.quadGeo.dispose();
  }

  /* ────────────────────────────── internals ──────────────────────────── */

  private draw(mat: THREE.ShaderMaterial): void {
    this.quad.material = mat;
    this.renderer.render(this.quadScene, this.quadCam);
  }

  private measure(): void {
    const dpr = this.renderer.getPixelRatio() || 1;
    let w = Math.max(1, Math.round(this.cssW * dpr));
    let h = Math.max(1, Math.round(this.cssH * dpr));
    const total = w * h;
    if (total > MAX_DEVICE_PIXELS) {
      const k = Math.sqrt(MAX_DEVICE_PIXELS / total);
      w = Math.max(1, Math.floor(w * k));
      h = Math.max(1, Math.floor(h * k));
    }
    this.bufW = w;
    this.bufH = h;
    this.uBrightTexel.value.set(1 / w, 1 / h);
    this.uResolution.value.set(this.cssW, this.cssH);
  }

  private makeTarget(w: number, h: number, depth: boolean): THREE.WebGLRenderTarget {
    const rt = new THREE.WebGLRenderTarget(w, h, {
      type: this.rtType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: depth,
      stencilBuffer: false,
      generateMipmaps: false,
      // Bookkeeping: everything in this chain is linear until the final pass.
      colorSpace: THREE.LinearSRGBColorSpace,
    });
    rt.texture.name = depth ? 'post.scene' : 'post.bloom';
    return rt;
  }

  private buildBloom(): void {
    const n = this.profile.levels;
    if (n <= 0) {
      this.bloomWorkRT = null;
      this.levels = [];
      this.brightMat = null;
      this.sumMat = null;
      this.sumWeights = [];
      this.uFinalBloom.value = null;
      return;
    }

    let w = Math.max(1, Math.round(this.bufW / this.profile.divisor));
    let h = Math.max(1, Math.round(this.bufH / this.profile.divisor));

    this.bloomWorkRT = this.makeTarget(w, h, false);
    this.uFinalBloom.value = this.bloomWorkRT.texture;

    this.brightMat = new THREE.ShaderMaterial({
      uniforms: {
        tScene: this.uBrightScene,
        uTexel: this.uBrightTexel,
        uThreshold: this.uThreshold,
        uKnee: this.uKnee,
        uClamp: this.uClamp,
      },
      vertexShader: VERT,
      fragmentShader: FRAG_BRIGHT,
      depthTest: false,
      depthWrite: false,
    });

    this.levels = [];
    for (let i = 0; i < n; i++) {
      const uSource: UT = { value: null };
      const uInvSize: UV2 = { value: new THREE.Vector2(1 / w, 1 / h) };
      const uDirection: UV2 = { value: new THREE.Vector2(1, 0) };
      const mat = new THREE.ShaderMaterial({
        defines: { KERNEL_RADIUS: 3 + i * 2 },
        uniforms: { tSource: uSource, uInvSize, uDirection },
        vertexShader: VERT,
        fragmentShader: FRAG_BLUR,
        depthTest: false,
        depthWrite: false,
      });
      this.levels.push({
        h: this.makeTarget(w, h, false),
        v: this.makeTarget(w, h, false),
        mat,
        uSource,
        uInvSize,
        uDirection,
        width: w,
        height: h,
      });
      w = Math.max(1, Math.floor(w / 2));
      h = Math.max(1, Math.floor(h / 2));
    }

    const sumUniforms: Record<string, THREE.IUniform> = {};
    this.sumWeights = [];
    for (let i = 0; i < n; i++) {
      const weight: UF = { value: 1 };
      this.sumWeights.push(weight);
      sumUniforms[`tMip${i}`] = { value: this.levels[i]!.v.texture };
      sumUniforms[`uW${i}`] = weight;
    }
    this.sumMat = new THREE.ShaderMaterial({
      uniforms: sumUniforms,
      vertexShader: VERT,
      fragmentShader: bloomSumFrag(n),
      depthTest: false,
      depthWrite: false,
    });
  }

  private buildFinal(): void {
    const p = this.profile;
    const defines: Record<string, string> = {};
    if (p.levels > 0) defines.USE_BLOOM = '';
    if (p.aberration) defines.USE_ABERRATION = '';
    if (p.grain) defines.USE_GRAIN = '';

    const uniforms: Record<string, THREE.IUniform> = {
      tScene: this.uFinalScene,
      uExposure: this.uExposure,
      uVignette: this.uVignette,
      uGrain: this.uGrain,
      uTime: this.uTime,
      uResolution: this.uResolution,
    };
    if (p.levels > 0) {
      uniforms.tBloom = this.uFinalBloom;
      uniforms.uBloomStrength = this.uBloomStrength;
    }
    if (p.aberration) uniforms.uAberration = this.uAberration;

    this.finalMat = new THREE.ShaderMaterial({
      defines,
      uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG_FINAL,
      depthTest: false,
      depthWrite: false,
      transparent: false,
    });
  }

  private applySettings(): void {
    const s = this.settings;
    // Without a float target the scene buffer clamps at 1.0, so a threshold at
    // or above 1 would mean nothing ever blooms.
    const maxT = this.hdr ? 8 : 0.9;
    this.uThreshold.value = Math.min(Math.max(s.bloomThreshold, 0), maxT);
    this.uKnee.value = Math.max(0.05, this.uThreshold.value * 0.35);
    this.uBloomStrength.value = Math.max(0, s.bloomStrength);
    this.uAberration.value = Math.max(0, s.aberration);
    this.uVignette.value = THREE.MathUtils.clamp(s.vignette, 0, 1);
    this.uGrain.value = THREE.MathUtils.clamp(s.grain, 0, 1);
    this.uExposure.value = Math.max(0.001, s.exposure);

    // UnrealBloom-style mip weighting: `radius` leans the sum from the tight
    // near-source levels toward the wide, hazy ones.
    const n = this.sumWeights.length;
    if (n > 0) {
      const radius = THREE.MathUtils.clamp(s.bloomRadius, 0, 1);
      const step = n > 1 ? 0.8 / (n - 1) : 0;
      for (let i = 0; i < n; i++) {
        const f = 1 - i * step;
        this.sumWeights[i]!.value = f * (1 - radius) + (1.2 - f) * radius;
      }
    }
  }

  private disposeBloom(): void {
    this.bloomWorkRT?.dispose();
    this.bloomWorkRT = null;
    for (const lv of this.levels) {
      lv.h.dispose();
      lv.v.dispose();
      lv.mat.dispose();
    }
    this.levels = [];
    this.brightMat?.dispose();
    this.brightMat = null;
    this.sumMat?.dispose();
    this.sumMat = null;
    this.sumWeights = [];
    this.uFinalBloom.value = null;
  }

  private disposeFinal(): void {
    this.finalMat.dispose();
  }
}
