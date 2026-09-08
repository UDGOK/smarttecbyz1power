/**
 * Stage-transition set pieces.
 *
 * The reference experience does not cross-fade between its worlds, it *stages*
 * the crossing: a pane of glass shatters toward you, a tunnel swallows the
 * frame, a dissolve eats the picture from one corner. This module is that
 * layer for our five worlds.
 *
 * Implementation: a single full-screen quad drawn in its own tiny scene after
 * the stage has rendered, with `autoClear` off so it composites straight over
 * the live frame. No render targets, no framebuffer read-back, no glTF, no
 * textures — the shards, the corridor and the dissolve threshold are all
 * evaluated procedurally in the fragment shader. One draw call, one program
 * bound per frame, and the expensive branches (the voronoi passes) are keyed
 * off a uniform so they are wavefront-coherent and skip entirely at the ends
 * of the range.
 *
 * Everything is a pure function of `uProgress`. The hold ring scrubs it up and
 * down at 60fps and the picture is identical for identical `p`, so releasing
 * the button runs the whole set piece backwards frame for frame. There is no
 * timeline, no tween, no integrator and no per-frame allocation — `elapsed` is
 * used only for a shimmer that carries no state.
 *
 * Layers, back to front:
 *   shatter — destination bleeding through the gaps, cracked pane, crack
 *             filaments, then debris flying at the lens
 *   tunnel  — a closing iris of ribbed corridor with the destination glowing
 *             at the far end
 *   wipe    — a noise-broken directional threshold with a hot leading rim
 *   plain   — the reduced-motion fallback: a flat cross-dissolve
 */

import * as THREE from 'three';

export type TransitionKind = 'shatter' | 'tunnel' | 'wipe';

export interface TransitionOptions {
  /** Collapses every kind to a plain cross-dissolve. */
  reducedMotion?: boolean;
}

/* ------------------------------------------------------------------ *
 * Shared GLSL
 * ------------------------------------------------------------------ */

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const COMMON = /* glsl */ `
  uniform float uProgress;
  uniform float uTime;
  uniform float uAspect;
  uniform float uSeed;
  uniform vec3 uFrom;
  uniform vec3 uTo;
  uniform vec2 uOrigin;
  uniform vec2 uParallax;
  varying vec2 vUv;

  const float TAU = 6.28318530718;

  float hash11(float n) { return fract(sin(n * 78.233) * 43758.5453123); }

  vec2 hash22(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453123);
  }

  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash22(i).x;
    float b = hash22(i + vec2(1.0, 0.0)).x;
    float c = hash22(i + vec2(0.0, 1.0)).x;
    float d = hash22(i + vec2(1.0, 1.0)).x;
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float fbm3(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 3; i++) { v += a * vnoise(p); p *= 2.07; a *= 0.5; }
    return v;
  }

  float ease(float x) { return x * x * (3.0 - 2.0 * x); }

  /* The stage grounds are very dark once they are in linear space (#0e2419 is
     0.018 at its brightest channel), so anything built by adding a constant to
     them comes out neutral grey. Normalise the hue and set the level instead —
     the set pieces then read in the colour of the world they are leaving or
     arriving at. Raw uFrom/uTo are still used wherever the value has to land
     exactly on the stage's ground colour. */
  vec3 lift(vec3 c, float level) {
    return c / max(max(c.r, max(c.g, c.b)), 0.02) * level;
  }

  /* Premultiplied back-to-front compositing: each call puts c in FRONT. */
  void layer(inout vec4 dst, vec3 c, float a) {
    a = clamp(a, 0.0, 1.0);
    dst = vec4(c * a, a) + dst * (1.0 - a);
  }

  /* Un-premultiply, encode for the renderer's output space, re-premultiply.
     The material runs with premultipliedAlpha so the encode has to happen on
     straight colour or the transfer function is applied to the wrong value. */
  void writeOut(vec4 acc) {
    float a = clamp(acc.a, 0.0, 1.0);
    gl_FragColor = vec4(acc.rgb / max(a, 1e-4), a);
    #include <colorspace_fragment>
    gl_FragColor.rgb *= gl_FragColor.a;
  }
`;

/* ------------------------------------------------------------------ *
 * 1. SHATTER — the frame cracks and comes at you.
 *
 * The fracture is a voronoi over a POLAR RING GRID centred on the impact: a
 * stack of concentric rings, each subdivided into its own number of angular
 * cells. That is the one construction that survives the strike point. A plain
 * log-polar grid (rings at a constant *ratio* of radius) collapses toward the
 * centre — cell size goes to zero, the middle of the frame turns into sub-pixel
 * scribble, and the ring offsets read as a spiral vortex rather than a strike.
 * Here the ring heights come from `u^0.75`, so they are TALLEST at the impact
 * and tighten toward the rim, and the angular count grows ring by ring
 * (4, 9, 14, 19 …) so cells stay roughly square all the way out: big plates
 * around the strike, finer fragments at the edge of the frame, about 120 shards
 * in the whole frame rather than several hundred.
 *
 * Candidate cells are compared in SCREEN units — angular offsets multiplied by
 * arc length, radial offsets by ring height — so the border distance that comes
 * back is a real distance on screen. That is what lets crack weight be
 * specified in pixels and vary with radius without guesswork.
 *
 * Four things are driven off `p`, all monotonic and all pure:
 *   - the crack front races outward from the impact (per-ring delay), each
 *     crack arriving thin and faint and thickening as its shard lets go
 *   - the pulverised core at the strike itself
 *   - each shard erodes from its own edges, opening a gap onto the destination
 *   - a separate CARTESIAN voronoi, magnified and falling, is the debris. A
 *     cartesian field is scale invariant, so blowing it up reads as shards
 *     coming at the lens; blowing up the polar field would just resubdivide it.
 * ------------------------------------------------------------------ */

const SHATTER_FRAG = /* glsl */ `
  ${COMMON}

  const float RMAX = 0.95;    // reference radius: roughly the far corner
  const float RINGS = 6.0;    // rings out to RMAX (the grid continues past it)
  const float RPOW = 0.75;    // <1 puts the tall rings at the impact
  const float NBASE = 4.0;    // angular cells in the innermost ring
  const float NSTEP = 5.0;    // and how many more each ring out

  float ringCount(float j) { return NBASE + NSTEP * max(j, 0.0); }

  /* Offset from the sample point to the centre of ring cell (kk, jj), in
     screen units. Every candidate uses the sample's own metric, so the
     partition is a proper voronoi in the sample's local frame. */
  vec2 cellVec(float kk, float jj, float n, float a, float v, float arcS, float radS) {
    float kw = mod(kk, n);
    vec2 h = hash22(vec2(kw, jj) + uSeed);
    float da = (kw + 0.28 + 0.44 * h.x) / n - a;
    da -= floor(da + 0.5);                       // shortest way round the ring
    float dv = jj + 0.28 + 0.44 * h.y - v;
    return vec2(da * arcS, dv * radS);
  }

  /* x: distance to the nearest straight cell border, in screen units
     y: per-shard random
     z: the shard's ring as a fraction of RINGS — linear in ring index, which
        is what the departure schedule wants; ring RADIUS is wildly non-linear
        (ring 3 of 6 sits at 0.49 of the radius) and keying the delay to it
        empties the middle of the frame far too early
     w: distance to the cell centre, in screen units                  */
  vec4 fracture(vec2 q) {
    float rs = max(length(q), 0.033);
    float u = rs / RMAX;
    float a = atan(q.y, q.x) / TAU;
    float v = pow(u, RPOW) * RINGS;
    float arcS = TAU * rs;                                  // screen units per turn
    float radS = pow(u, 1.0 - RPOW) * RMAX / (RPOW * RINGS); // screen units per ring
    float j0 = floor(v);

    vec2 mr = vec2(0.0);
    float md = 1e9, mk = 0.0, mj = 0.0, mn = NBASE;
    for (int dj = -1; dj <= 1; dj++) {
      float jj = j0 + float(dj);
      if (jj >= 0.0) {
        float n = ringCount(jj);
        float k0 = floor(a * n);
        for (int dk = -1; dk <= 1; dk++) {
          float kk = k0 + float(dk);
          vec2 o = cellVec(kk, jj, n, a, v, arcS, radS);
          float d = dot(o, o);
          if (d < md) { md = d; mr = o; mk = kk; mj = jj; mn = n; }
        }
      }
    }

    float border = 1e9;
    for (int dj = -1; dj <= 1; dj++) {
      float jj = j0 + float(dj);
      if (jj >= 0.0) {
        float n = ringCount(jj);
        float k0 = floor(a * n);
        for (int dk = -1; dk <= 1; dk++) {
          vec2 o = cellVec(k0 + float(dk), jj, n, a, v, arcS, radS);
          vec2 diff = o - mr;
          float l = dot(diff, diff);
          if (l > 1e-8) border = min(border, dot(0.5 * (mr + o), diff * inversesqrt(l)));
        }
      }
    }

    float rnd = hash11(mod(mk, mn) * 7.31 + mj * 23.17 + uSeed * 3.7);
    return vec4(border, rnd, (mj + 0.5) / RINGS, sqrt(md));
  }

  /* Plain jittered-grid voronoi, straight borders, for the debris plane. */
  vec3 chunks(vec2 x) {
    vec2 n = floor(x), f = fract(x);
    vec2 mg = vec2(0.0), mr = vec2(0.0);
    float md = 8.0;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j));
        vec2 o = 0.5 + 0.42 * (hash22(n + g + uSeed) * 2.0 - 1.0);
        vec2 rv = g + o - f;
        float d = dot(rv, rv);
        if (d < md) { md = d; mg = g; mr = rv; }
      }
    }
    float border = 8.0;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 g = mg + vec2(float(i), float(j));
        vec2 o = 0.5 + 0.42 * (hash22(n + g + uSeed) * 2.0 - 1.0);
        vec2 rv = g + o - f;
        vec2 diff = rv - mr;
        float l = dot(diff, diff);
        if (l > 1e-5) border = min(border, dot(0.5 * (mr + rv), diff * inversesqrt(l)));
      }
    }
    vec2 cell = n + mg;
    return vec3(border, hash11(cell.x * 17.13 + cell.y * 41.71 + uSeed * 5.7), sqrt(md));
  }

  void main() {
    float p = clamp(uProgress, 0.0, 1.0);
    vec2 q = vec2((vUv.x - uOrigin.x) * uAspect, vUv.y - uOrigin.y);
    float r = length(q);

    vec4 acc = vec4(0.0);

    /* --- the destination, seen through the gaps and then flooding ---
       Flat destination colour from 0.94 on: the host swaps the stage behind
       this layer at the top of the range, and the swap has to be invisible. */
    float veil = smoothstep(0.74, 0.94, p);
    float pane = 1.0 - smoothstep(0.78, 0.92, p);

    float shard = 0.0;
    float tint = 0.0;
    float crackA = 0.0;
    vec3 glass = uFrom;

    if (pane > 0.001) {
      vec4 v = fracture(q);

      /* The crack front leaves the impact and runs outward; each shard then
         lets go a beat later. Ring radius drives both, so a shard never
         disagrees with itself about when its turn is. */
      /* Spread the departures right across the range. Erode them all inside
         the first two thirds and the pane has effectively become the veil by
         p=0.7 — measured at 92% opaque — which throws the outgoing world away
         while the visitor is still only halfway through the hold. */
      float delay = min(v.z * 0.72, 0.58) + v.y * 0.14;
      float grow = smoothstep(delay, delay + 0.12, p);
      float fall = smoothstep(delay + 0.10, delay + 0.28, p);

      /* Crack weight in screen units: heavy where the pane is crushed, a
         hairline out at the rim, and tapering back to nothing at the moment
         of arrival so the front reads as a crack running rather than as a
         line switching on. */
      float lw = mix(0.0019, 0.0008, smoothstep(0.06, 0.70, r))
               * (0.45 + 0.40 * grow + 0.35 * fall);

      float erode = fall * 0.115;
      shard = smoothstep(erode, erode + 0.004, v.x) * pane;
      crackA = (1.0 - smoothstep(lw * 0.5, lw * 1.6, v.x))
             * grow * pane
             * smoothstep(0.012, 0.050, r);       // no moire in the crushed hub

      /* Facet: a soft dome across each shard plus a per-shard bias, so no two
         pieces catch the light the same way. Kept faint — the world has to
         stay legible through the glass until the shards actually leave. */
      float facet = 0.35 * v.y + 0.65 * (1.0 - clamp(v.w / 0.10, 0.0, 1.0));
      glass = mix(lift(uFrom, 0.10), vec3(1.0), 0.05 + 0.30 * facet);
      tint = shard * smoothstep(0.03, 0.28, p) * (0.04 + 0.19 * fall);
    }

    float gap = (1.0 - shard) * smoothstep(0.16, 0.72, p) * 0.90;
    layer(acc, uTo, max(veil, gap));
    layer(acc, glass, tint);
    layer(acc, mix(vec3(1.0), lift(uTo, 0.9), 0.40), crackA * 0.38);

    /* The strike: a pulverised core where the wedges converge, and one bloom
       out of it. Both are what stops the hub reading as aliasing. */
    float core = smoothstep(0.052, 0.010, r) * smoothstep(0.02, 0.12, p) * pane;
    layer(acc, mix(vec3(1.0), lift(uTo, 0.9), 0.18), core * 0.60);

    float ft = (p - 0.10) / 0.05;
    float flash = exp(-ft * ft) * smoothstep(0.22, 0.0, r);
    layer(acc, mix(vec3(1.0), lift(uTo, 0.8), 0.25), flash * 0.50);

    /* --- debris: a cartesian field, magnified and falling ------------ */
    float dw = smoothstep(0.22, 0.44, p) * (1.0 - smoothstep(0.60, 0.90, p));
    if (dw > 0.002) {
      /* Big and sparse. A dense debris field just lays a second mosaic over
         the pane and the two cancel each other out; a third of the cells,
         each already plate-sized, reads as glass tumbling past the lens. */
      const float DENS = 9.0;
      float dp = ease(clamp((p - 0.18) / 0.82, 0.0, 1.0));
      float spread = mix(0.70, 3.00, dp);          // screen size of one chunk
      vec2 dq = q + vec2(uParallax.x, uParallax.y - 0.40 * dp * dp);
      vec3 dv = chunks(dq * (DENS / spread) + vec2(11.3, 4.7));
      float dlw = 0.0016 * DENS / spread;          // constant weight on screen
      float keep = step(0.64, dv.y);
      float body = smoothstep(dlw * 1.0, dlw * 5.0, dv.x) * keep;
      float rim = (1.0 - smoothstep(dlw * 0.6, dlw * 2.2, dv.x)) * keep;
      vec3 dcol = mix(lift(uFrom, 0.13), vec3(1.0), 0.06 + 0.40 * dv.y);
      layer(acc, dcol, body * dw * 0.15);
      layer(acc, mix(vec3(1.0), lift(uTo, 0.9), 0.22), rim * dw * 0.34);
    }

    writeOut(acc);
  }
`;

/* ------------------------------------------------------------------ *
 * 2. TUNNEL — a closing iris of ribbed corridor.
 *
 * Screen radius is inverted into depth, so the centre of the frame is the far
 * end of the corridor. Ribs are `fract(depth - travel)`, flutes are a fold of
 * the angle, and the aperture — the hole you are still looking at the outgoing
 * world through — shrinks to nothing as `p` runs out.
 * ------------------------------------------------------------------ */

const TUNNEL_FRAG = /* glsl */ `
  ${COMMON}

  void main() {
    float p = clamp(uProgress, 0.0, 1.0);
    /* The vanishing point leans toward the strike point but nothing like as
       far — a corridor whose far end is a third of the way off frame stops
       reading as a corridor. */
    vec2 c = mix(vec2(0.5), uOrigin, 0.35);
    vec2 q = vec2((vUv.x - c.x) * uAspect, vUv.y - c.y) - uParallax * 0.35;
    float rmax = 0.5 * sqrt(1.0 + uAspect * uAspect);
    float r = length(q) / rmax;
    float ang = atan(q.y, q.x);

    float depth = 3.20 / max(r, 0.002);
    /* p carries the rush; uTime adds a slow idle drift so sitting at 0.4 still
       feels like forward motion. Neither accumulates. */
    float travel = p * 5.5 + uTime * 0.22;

    /* Rib frequency goes as 1/r^2, so past the throat it outruns the pixel
       grid and averages to grey. Fade the structure out before it aliases and
       let the aperture glow own the middle of the frame. */
    float aa = smoothstep(0.20, 0.44, r);

    float rib = abs(fract(depth - travel) - 0.5) * 2.0;
    float ribs = smoothstep(0.34, 0.96, rib) * aa;
    float flute = abs(fract(ang / TAU * 18.0 + uSeed) - 0.5) * 2.0;
    float flutes = smoothstep(0.20, 0.92, flute);
    float streak = fbm3(vec2(ang * 3.0, depth * 0.12 - travel * 1.6)) * aa;

    float shade = 0.34 + 0.95 * ribs * (0.35 + 0.65 * flutes) + 0.30 * streak;
    shade *= 0.93 + 0.07 * sin(uTime * 2.4 + depth * 0.6);

    float core = smoothstep(0.46, 0.03, r);
    vec3 wall = mix(lift(uFrom, 0.14), lift(uTo, 0.50), core) * shade;
    wall += lift(uTo, 0.70) * core * core * (0.40 + 0.60 * p);
    wall = mix(wall, uTo, smoothstep(0.70, 0.92, p));

    /* The iris: everything outside rInner is corridor, everything inside is
       still the outgoing world. rInner starts off-frame and closes past zero. */
    /* Starts a hair beyond the corners so p=0 is empty, then closes on a
       curve that bites immediately — an iris that does nothing for the first
       third of the hold is a third of the hold wasted. */
    float rInner = mix(1.16, -0.06, pow(p, 0.82));
    float a = smoothstep(rInner - 0.13, rInner, r);
    float e = (r - rInner) / 0.055;
    float rim = exp(-e * e) * (1.0 - smoothstep(0.82, 0.92, p)) * smoothstep(0.0, 0.05, p);

    vec4 acc = vec4(0.0);
    layer(acc, wall, a);
    layer(acc, mix(lift(uTo, 0.6), vec3(1.0), 0.30), rim * 0.32);
    writeOut(acc);
  }
`;

/* ------------------------------------------------------------------ *
 * 3. WIPE — a noise-broken directional threshold.
 *
 * The quiet option. A directional ramp is perturbed by two octaves of noise
 * (one to break the line into headlands, one to granulate it) and compared
 * against a threshold swept by `p`, with a hot rim tracking the boundary.
 * ------------------------------------------------------------------ */

const WIPE_FRAG = /* glsl */ `
  ${COMMON}

  void main() {
    float p = clamp(uProgress, 0.0, 1.0);
    float ang = uSeed * TAU;
    vec2 d = vec2(cos(ang), sin(ang));
    vec2 uv = vec2((vUv.x - 0.5) * uAspect, vUv.y - 0.5);
    float axis = clamp(dot(uv, d) / (0.5 * (uAspect + 1.0)) + 0.5, 0.0, 1.0);

    vec2 sp = vec2(vUv.x * uAspect, vUv.y);
    float coarse = fbm3(sp * 5.5 + uSeed * 13.0);
    float grain = fbm3(sp * 26.0 - uSeed * 7.0);
    float field = axis * 0.66 + coarse * 0.30 + grain * 0.10;

    float th = mix(-0.16, 1.20, p);
    float soft = 0.075;
    float cover = 1.0 - smoothstep(th - soft, th + soft, field);
    float e = (field - th) / (soft * 0.8);
    float rim = exp(-e * e) * smoothstep(0.0, 0.05, p) * (1.0 - smoothstep(0.86, 0.96, p));

    vec3 col = mix(lift(uFrom, 0.08), uTo, smoothstep(0.0, 0.60, p));

    vec4 acc = vec4(0.0);
    layer(acc, col, cover);
    layer(acc, mix(lift(uTo, 0.7), vec3(1.0), 0.5), rim * 0.62);
    writeOut(acc);
  }
`;

/* ------------------------------------------------------------------ *
 * 4. PLAIN — reduced motion. One colour, one ramp, nothing moving.
 * ------------------------------------------------------------------ */

const PLAIN_FRAG = /* glsl */ `
  ${COMMON}

  void main() {
    float p = clamp(uProgress, 0.0, 1.0);
    vec4 acc = vec4(0.0);
    layer(acc, mix(uFrom, uTo, smoothstep(0.10, 0.90, p)), ease(p));
    writeOut(acc);
  }
`;

type Slot = TransitionKind | 'plain';

interface TransitionUniforms {
  uProgress: THREE.IUniform<number>;
  uTime: THREE.IUniform<number>;
  uAspect: THREE.IUniform<number>;
  uSeed: THREE.IUniform<number>;
  uFrom: THREE.IUniform<THREE.Color>;
  uTo: THREE.IUniform<THREE.Color>;
  uOrigin: THREE.IUniform<THREE.Vector2>;
  uParallax: THREE.IUniform<THREE.Vector2>;
  [name: string]: THREE.IUniform;
}

const FRAG: Record<Slot, string> = {
  shatter: SHATTER_FRAG,
  tunnel: TUNNEL_FRAG,
  wipe: WIPE_FRAG,
  plain: PLAIN_FRAG,
};

export class Transition {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private geometry = new THREE.PlaneGeometry(2, 2);
  private materials = new Map<Slot, THREE.ShaderMaterial>();
  private meshes = new Map<Slot, THREE.Mesh>();

  private uniforms: TransitionUniforms;

  private kindRequested: TransitionKind = 'wipe';
  private running = false;
  private p = 0;
  private reduced: boolean;
  private disposed = false;

  /** Camera-forward at `begin()`, so the overlay can be parallaxed by the shot. */
  private anchorX = 0;
  private anchorY = 0;
  private anchored = false;

  constructor(
    renderer: THREE.WebGLRenderer,
    width: number,
    height: number,
    options: TransitionOptions = {},
  ) {
    this.renderer = renderer;
    this.reduced = options.reducedMotion ?? false;

    this.uniforms = {
      uProgress: { value: 0 },
      uTime: { value: 0 },
      uAspect: { value: 1 },
      uSeed: { value: 0.37 },
      uFrom: { value: new THREE.Color(0x000000) },
      uTo: { value: new THREE.Color(0x000000) },
      uOrigin: { value: new THREE.Vector2(0.5, 0.55) },
      uParallax: { value: new THREE.Vector2(0, 0) },
    };

    const slots: Slot[] = ['shatter', 'tunnel', 'wipe', 'plain'];
    for (const slot of slots) {
      const material = new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG[slot],
        uniforms: this.uniforms,
        transparent: true,
        premultipliedAlpha: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
        blending: THREE.NormalBlending,
      });
      const mesh = new THREE.Mesh(this.geometry, material);
      mesh.frustumCulled = false;
      mesh.matrixAutoUpdate = false;
      this.scene.add(mesh);
      this.materials.set(slot, material);
      this.meshes.set(slot, mesh);
    }

    // Compile every program up front — a shatter that stalls the frame the
    // first time the ring is held is worse than no shatter at all.
    try {
      this.renderer.compile(this.scene, this.cam);
    } catch {
      /* Compilation will happen lazily on first draw instead. */
    }
    for (const mesh of this.meshes.values()) mesh.visible = false;

    this.setSize(width, height);
  }

  /** True between `begin()` and `end()`. */
  get active(): boolean { return this.running; }

  /** The last progress handed to `setProgress`. */
  get progress(): number { return this.p; }

  /** The kind asked for, even when reduced motion is drawing `plain`. */
  get kind(): TransitionKind { return this.kindRequested; }

  /**
   * Arm a crossing. Safe to call while one is already running — it re-arms in
   * place. `p` is reset to 0, so call this before the first `setProgress`.
   */
  begin(
    kind: TransitionKind,
    fromColor: THREE.ColorRepresentation,
    toColor: THREE.ColorRepresentation,
  ): void {
    if (this.disposed) return;

    this.kindRequested = kind;
    const slot: Slot = this.reduced ? 'plain' : kind;
    for (const [key, mesh] of this.meshes) mesh.visible = key === slot;

    this.uniforms.uFrom.value.set(fromColor);
    this.uniforms.uTo.value.set(toColor);

    // One seed per crossing: the crack pattern, the flute phase and the wipe
    // direction differ every time, but stay fixed while the ring is scrubbed.
    const seed = Math.random();
    this.uniforms.uSeed.value = seed;
    // Push the impact well off centre, on a random bearing, so no two
    // crossings put the strike in the same place. Kept inside the safe area
    // so the rosette never lands under the chrome in a corner.
    const bearing = hash(seed) * Math.PI * 2;
    const spread = 0.20 + hash(seed + 0.5) * 0.11;
    this.uniforms.uOrigin.value.set(
      0.5 + Math.cos(bearing) * spread * 1.15,
      0.5 + Math.sin(bearing) * spread,
    );
    this.uniforms.uParallax.value.set(0, 0);
    this.uniforms.uProgress.value = 0;

    this.p = 0;
    this.anchored = false;
    this.running = true;
  }

  /**
   * 0 = not started, 1 = fully across. Pure: the same `p` always produces the
   * same frame, so the hold ring can run it backwards on release.
   * No allocation, no accumulation.
   */
  setProgress(p: number): void {
    const clamped = p < 0 ? 0 : p > 1 ? 1 : p;
    this.p = clamped;
    this.uniforms.uProgress.value = clamped;
  }

  /** Draw over the current frame. Call after the stage has rendered. */
  render(camera: THREE.Camera, elapsed: number): void {
    if (!this.running || this.disposed || this.p <= 0) return;

    this.uniforms.uTime.value = elapsed;

    // Parallax the overlay by however far the shot has turned since the
    // crossing was armed, so the shards feel pinned to the world, not the
    // screen. Reads matrix elements directly — no vector allocation.
    const e = camera.matrixWorld.elements;
    const fx = -e[8];
    const fy = -e[9];
    if (!this.anchored) {
      this.anchorX = fx;
      this.anchorY = fy;
      this.anchored = true;
    }
    const px = clamp((fx - this.anchorX) * 0.9, -0.08, 0.08);
    const py = clamp((fy - this.anchorY) * 0.9, -0.08, 0.08);
    this.uniforms.uParallax.value.set(px, py);

    const renderer = this.renderer;
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(this.scene, this.cam);
    renderer.autoClear = autoClear;
  }

  setSize(width: number, height: number): void {
    this.uniforms.uAspect.value = width / Math.max(1, height);
  }

  /** Under reduced motion every kind collapses to a plain cross-dissolve. */
  setReducedMotion(reduced: boolean): void {
    if (reduced === this.reduced) return;
    this.reduced = reduced;
    if (!this.running) return;
    const slot: Slot = reduced ? 'plain' : this.kindRequested;
    for (const [key, mesh] of this.meshes) mesh.visible = key === slot;
  }

  /** Stop drawing. Leaves nothing on screen and nothing to reset. */
  end(): void {
    this.running = false;
    this.p = 0;
    this.uniforms.uProgress.value = 0;
    this.anchored = false;
    for (const mesh of this.meshes.values()) mesh.visible = false;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.running = false;
    for (const mesh of this.meshes.values()) this.scene.remove(mesh);
    for (const material of this.materials.values()) material.dispose();
    this.materials.clear();
    this.meshes.clear();
    this.geometry.dispose();
    this.scene.clear();
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Cheap decorrelation of one seed into a second. */
function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}
