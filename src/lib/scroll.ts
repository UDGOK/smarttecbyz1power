/**
 * Damped virtual scroll + camera parallax rig.
 *
 * The document never scrolls. Wheel, touch and keyboard input accumulate into
 * a `targetScrollPos`, and `scrollPos` chases it with frame-rate independent
 * damping — that lag is the whole feel. Reading `window.scrollY` straight into
 * the camera, as this site did before, gives you the input with none of the
 * inertia, which is why the motion read as harsh.
 *
 * The constants below are the reference experience's own, decompiled from its
 * bundle. Do not "tune" them casually — the ruler, the crossings and the
 * camera dolly are all calibrated against this exact response curve.
 *
 * Damping is `1 - exp(-rate * dt)` rather than a raw per-frame lerp so that a
 * 30 Hz frame and a 144 Hz frame travel the same distance in the same wall
 * time. `rate` is derived from the reference's per-frame factor at 60 Hz:
 *
 *     rate = -ln(1 - LERP) * 60
 *
 * so at exactly 60 fps this reproduces the original lerp to the last bit.
 *
 * Usage:
 *
 *     const scroll = new ScrollManager();
 *     scroll.setActiveStage(stageScrollLength);
 *     const off = scroll.onScrub((p) => host.setScrollProgress(p));
 *     // in the render loop, dt in seconds:
 *     scroll.update(dt);
 *
 * The rig is deliberately passive: it hands you a smoothed, clamped offset and
 * a focal distance, and never touches a camera. The host translates the camera
 * along its own right/up axes by the offset and points it at a target
 * `focalDistance` ahead, so the motion reads as parallax rather than a slide.
 */

/** The reference's scroll + rig configuration, verbatim. */
export const SCROLL_CONFIG = {
  /**
   * Raised from the reference's 0.075. Theirs damps a short stage; ours damps
   * a longer one, and at 0.075 a fast scroll visibly lagged the input — the
   * glide became a delay. 0.13 keeps the ease and drops the wait.
   */
  SCROLL_LERP: 0.13,
  CAMERA_LERP: 0.08,
  SCROLL_VELOCITY_SMOOTHING: 0.1,
  CAMERA_RIG: {
    FOCAL_DISTANCE: 1,
    MAX_OFFSET: 0.18,
    SMOOTH_TC: 0.12,
    GYRO_RANGE: 20,
  },
} as const;

/** Wheel/touch deltas are clamped to this magnitude before scaling. */
export const MAX_DELTA = 500;
/** …then multiplied by this into `targetScrollPos`. */
export const DELTA_SCALE = 35;

/**
 * Fast input has to cover more ground than slow input, or a long stage feels
 * like wading. A flick and a nudge both arrive as wheel deltas; without this
 * they differ only in how many events fire, and the damping smears the
 * difference away. The boost is applied to the delta, not to the damping, so
 * precision at a crawl is untouched.
 */
export const BOOST_MAX = 3.4;
/** Input rate, in raw delta units per second, at which the boost is at full. */
export const BOOST_REF = 2600;
/** How quickly the measured input rate decays once the flick stops. */
const RATE_TC = 0.12;

/** Below this the release was a stop, not a throw. Raw delta units per event. */
const TOUCH_FLING_MIN = 2.2;
/** How much of the release velocity is carried on. */
const TOUCH_FLING_GAIN = 9;
/** Smoothing on the measured swipe velocity. */
const TOUCH_V_TC = 0.055;
/** Closer than this and we snap, which kills the asymptotic tail. */
const SNAP_EPSILON = 0.5;

/** Arrow-key step, as a fraction of the active stage's scroll length. */
const KEY_LINE_FRACTION = 0.04;
/** Page Up/Down and Space step, as a fraction of the scroll length. */
const KEY_PAGE_FRACTION = 0.2;

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/**
 * Convert a per-frame-at-60Hz lerp factor into a continuous rate, so that
 * `1 - exp(-rate * dt)` matches it at dt = 1/60 and stays correct elsewhere.
 */
function rateFromLerp(lerpFactor: number): number {
  return -Math.log(1 - lerpFactor) * 60;
}

/** Smoothstep — the reference's auto-scroll easing. */
function smoothstep(n: number): number {
  return n * n * (3 - 2 * n);
}

function detectReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Keys typed into a control belong to that control, not to the page. */
function isInteractiveTarget(target: EventTarget | null): boolean {
  if (target === null || typeof HTMLElement === 'undefined') return false;
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  switch (target.tagName) {
    case 'INPUT':
    case 'TEXTAREA':
    case 'SELECT':
    case 'BUTTON':
    case 'A':
    case 'SUMMARY':
    case 'OPTION':
      return true;
    default:
      return false;
  }
}

export type ScrubListener = (progress: number) => void;

export interface ScrollManagerOptions {
  /**
   * Force reduced motion on or off. Omit to read
   * `prefers-reduced-motion: reduce` from the platform.
   */
  reducedMotion?: boolean;
  /** Element the input listeners bind to. Defaults to `window`. */
  target?: Window | HTMLElement;
  /** Bind keyboard navigation. Defaults to true — turning it off is an a11y regression. */
  keyboard?: boolean;
  /** Arrow-key step as a fraction of the scroll length. Default 0.04. */
  lineStepFraction?: number;
  /** Page/Space step as a fraction of the scroll length. Default 0.2. */
  pageStepFraction?: number;
}

/**
 * Virtual scroll position with damped follow.
 *
 * Every public mutator works in scroll-length units; `progress` is the only
 * normalised value and the only thing subscribers are handed.
 */
export class ScrollManager {
  /** Damped position. Chases `targetScrollPos`. */
  private scrollPos = 0;
  /** Where input has put us. Always inside the active clamp. */
  private targetScrollPos = 0;
  private scrollLength = 1;
  private _progress = 0;
  private _velocity = 0;
  private _positionVelocity = 0;
  /** Smoothed input rate, delta units per second — drives the fast-scroll boost. */
  private _inputRate = 0;
  private _lastInputAt = 0;
  /** Smoothed per-event touch delta, used to throw on release. */
  private _touchVelocity = 0;

  private readonly _smoothSpeed: number;
  private readonly _velocitySpeed: number;

  private enabled = true;
  private held = false;
  private _reducedMotion: boolean;

  private clampMin: number | null = null;
  private clampMax: number | null = null;

  private lastTouchY = 0;
  private touching = false;

  // Auto-scroll state. Kept as flat fields so `update` allocates nothing.
  private autoActive = false;
  private autoFrom = 0;
  private autoTo = 0;
  private autoDuration = 0;
  private autoElapsed = 0;
  private autoResolve: (() => void) | null = null;

  // Null slots are unsubscribed listeners; they are compacted outside the
  // hot path so notification never allocates an iterator.
  private scrubs: Array<ScrubListener | null> = [];
  private scrubsDirty = false;

  private readonly target: Window | HTMLElement;
  private readonly keyboard: boolean;
  private readonly lineStepFraction: number;
  private readonly pageStepFraction: number;
  private destroyed = false;

  constructor(opts: ScrollManagerOptions = {}) {
    this._reducedMotion = opts.reducedMotion ?? detectReducedMotion();
    this._smoothSpeed = rateFromLerp(SCROLL_CONFIG.SCROLL_LERP);
    this._velocitySpeed = rateFromLerp(SCROLL_CONFIG.SCROLL_VELOCITY_SMOOTHING);
    this.keyboard = opts.keyboard ?? true;
    this.lineStepFraction = opts.lineStepFraction ?? KEY_LINE_FRACTION;
    this.pageStepFraction = opts.pageStepFraction ?? KEY_PAGE_FRACTION;

    const fallback = (typeof window !== 'undefined' ? window : null) as Window | null;
    this.target = opts.target ?? (fallback as Window);
    if (this.target) this.attach();
  }

  // --- Reads -------------------------------------------------------------

  /** 0..1 through the active stage's scroll track. */
  get progress(): number { return this._progress; }

  /** Smoothed progress per second — signed. Drives blur, stretch, audio. */
  get velocity(): number { return this._velocity; }

  /** Smoothed scroll units per second, for hosts that want raw speed. */
  get positionVelocity(): number { return this._positionVelocity; }

  /** Damped position in scroll units. */
  get position(): number { return this.scrollPos; }

  /** Input position in scroll units — where we are heading. */
  get targetPosition(): number { return this.targetScrollPos; }

  get length(): number { return this.scrollLength; }

  get isEnabled(): boolean { return this.enabled; }

  get isHeld(): boolean { return this.held; }

  get isAutoScrolling(): boolean { return this.autoActive; }

  get reducedMotion(): boolean { return this._reducedMotion; }

  // --- Lifecycle ---------------------------------------------------------

  private attach(): void {
    const t = this.target;
    // Wheel is passive: the document has nothing to scroll, so there is
    // nothing to preventDefault, and we keep the fast path.
    t.addEventListener('wheel', this.onWheel as EventListener, { passive: true });
    t.addEventListener('touchstart', this.onTouchStart as EventListener, { passive: true });
    // Touchmove must be non-passive — this one really does have to cancel the
    // browser's own overscroll/rubber-band.
    t.addEventListener('touchmove', this.onTouchMove as EventListener, { passive: false });
    t.addEventListener('touchend', this.onTouchEnd as EventListener, { passive: true });
    t.addEventListener('touchcancel', this.onTouchEnd as EventListener, { passive: true });
    if (this.keyboard) {
      t.addEventListener('keydown', this.onKeyDown as EventListener);
    }
  }

  /** Removes every listener this manager installed and resolves any pending auto-scroll. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    const t = this.target;
    if (t) {
      t.removeEventListener('wheel', this.onWheel as EventListener);
      t.removeEventListener('touchstart', this.onTouchStart as EventListener);
      t.removeEventListener('touchmove', this.onTouchMove as EventListener);
      t.removeEventListener('touchend', this.onTouchEnd as EventListener);
      t.removeEventListener('touchcancel', this.onTouchEnd as EventListener);
      t.removeEventListener('keydown', this.onKeyDown as EventListener);
    }
    this.finishAuto();
    this.scrubs.length = 0;
    this.scrubsDirty = false;
    this.enabled = false;
  }

  /** Resume responding to input. */
  enable(): void { this.enabled = true; }

  /**
   * Stop responding to input and stop cancelling touchmove, so the page
   * behaves natively again. This is the escape hatch for assistive tech,
   * in-page overlays and any route that wants the real scrollbar back.
   */
  disable(): void { this.enabled = false; this.touching = false; }

  /**
   * While held, wheel and touch deltas are dropped — but touch tracking still
   * follows the finger, so releasing does not produce a jump from a stale
   * `lastTouchY`.
   */
  setHeld(held: boolean): void { this.held = held; }

  setReducedMotion(reduced: boolean): void {
    this._reducedMotion = reduced;
    if (reduced) this.scrollPos = this.targetScrollPos;
  }

  /**
   * Enter a stage: adopt its scroll length and rewind everything to the top.
   * Position, target, progress and velocity all reset, and any auto-scroll in
   * flight is settled.
   */
  setActiveStage(scrollLength: number): void {
    this.finishAuto();
    this.scrollLength = scrollLength > 0 ? scrollLength : 1;
    this.scrollPos = 0;
    this.targetScrollPos = 0;
    this._velocity = 0;
    this._positionVelocity = 0;
    if (this._progress !== 0) {
      this._progress = 0;
      this.notify(0);
    }
  }

  // --- Clamps ------------------------------------------------------------

  private get min(): number { return this.clampMin ?? 0; }
  private get max(): number { return this.clampMax ?? this.scrollLength; }

  /**
   * Restrict input to a sub-range of the track — used to hold the visitor at a
   * crossing until it has resolved. Pass null for either bound to fall back to
   * 0 / scrollLength. The target is pulled inside the new range immediately.
   */
  setScrollClamp(min: number | null, max: number | null): void {
    this.clampMin = min;
    this.clampMax = max;
    this.targetScrollPos = clamp(this.targetScrollPos, this.min, this.max);
  }

  clearScrollClamp(): void {
    this.clampMin = null;
    this.clampMax = null;
    this.targetScrollPos = clamp(this.targetScrollPos, this.min, this.max);
  }

  /** Teleport. Both positions move, nothing animates, subscribers are told. */
  setScrollImmediate(value: number): void {
    this.finishAuto();
    const v = clamp(value, this.min, this.max);
    this.scrollPos = v;
    this.targetScrollPos = v;
    this._velocity = 0;
    this._positionVelocity = 0;
    this.emitProgress();
  }

  // --- Subscription ------------------------------------------------------

  /** Subscribe to progress. Returns the unsubscribe. */
  onScrub(fn: ScrubListener): () => void {
    this.scrubs.push(fn);
    let live = true;
    return () => {
      if (!live) return;
      live = false;
      const i = this.scrubs.indexOf(fn);
      if (i >= 0) {
        this.scrubs[i] = null;
        this.scrubsDirty = true;
      }
    };
  }

  private notify(p: number): void {
    const list = this.scrubs;
    for (let i = 0; i < list.length; i++) {
      const fn = list[i];
      if (fn) fn(p);
    }
    // Only allocates when someone actually unsubscribed — never per frame.
    if (this.scrubsDirty) {
      this.scrubsDirty = false;
      this.scrubs = list.filter((f): f is ScrubListener => f !== null);
    }
  }

  private emitProgress(): void {
    const p = this.scrollLength > 0 ? this.scrollPos / this.scrollLength : 0;
    if (p !== this._progress) {
      this._progress = p;
      this.notify(p);
    }
  }

  // --- Input -------------------------------------------------------------

  /** Accepts a raw pointer delta in the same units a wheel reports. */
  private applyDelta(rawDelta: number): void {
    const now = performance.now();
    const gap = this._lastInputAt > 0 ? Math.min(0.25, (now - this._lastInputAt) / 1000) : 0.016;
    this._lastInputAt = now;

    // Rate is measured in delta units per second, so it means the same thing
    // to a 120Hz trackpad emitting small deltas and a wheel emitting large
    // ones — the thing that differs between a flick and a nudge is the rate,
    // not the event count.
    const instantRate = Math.abs(rawDelta) / Math.max(gap, 0.004);
    const k = 1 - Math.exp(-gap / RATE_TC);
    this._inputRate += (instantRate - this._inputRate) * k;

    const boost = 1 + Math.min(BOOST_MAX - 1, this._inputRate / BOOST_REF);
    const d = clamp(rawDelta, -MAX_DELTA, MAX_DELTA) * DELTA_SCALE * boost;
    this.targetScrollPos = clamp(this.targetScrollPos + d, this.min, this.max);
    // With reduced motion there is no glide: the two positions move as one.
    if (this._reducedMotion) this.scrollPos = this.targetScrollPos;
  }

  private get acceptsInput(): boolean {
    return this.enabled && !this.held && !this.autoActive && !this.destroyed;
  }

  private onWheel = (e: WheelEvent): void => {
    if (!this.acceptsInput) return;
    this.applyDelta(e.deltaY);
  };

  private onTouchStart = (e: TouchEvent): void => {
    if (!this.enabled) return;
    const touch = e.touches[0];
    if (!touch) return;
    this.touching = true;
    this.lastTouchY = touch.clientY;
  };

  private onTouchMove = (e: TouchEvent): void => {
    if (!this.enabled) return;
    const touch = e.touches[0];
    if (!touch) return;
    // The document is not the thing that scrolls here.
    if (e.cancelable) e.preventDefault();
    const y = touch.clientY;
    if (!this.touching) {
      this.touching = true;
      this.lastTouchY = y;
      return;
    }
    const delta = this.lastTouchY - y;
    // Tracking continues while held so the release does not jump.
    this.lastTouchY = y;
    if (!this.acceptsInput) return;
    // Smoothed so one stuttering sample cannot become the whole throw.
    this._touchVelocity += (delta - this._touchVelocity)
      * (1 - Math.exp(-0.016 / TOUCH_V_TC));
    this.applyDelta(delta);
  };

  private onTouchEnd = (): void => {
    this.touching = false;
    // Carry the gesture on after the finger leaves. Without this a swipe
    // stops dead at release, so a thumb has to make roughly four times as
    // many gestures as a trackpad to cross the same ground.
    if (!this.acceptsInput || this._reducedMotion) return;
    const v = this._touchVelocity;
    if (Math.abs(v) < TOUCH_FLING_MIN) return;
    const fling = clamp(v, -MAX_DELTA, MAX_DELTA) * DELTA_SCALE * TOUCH_FLING_GAIN;
    this.targetScrollPos = clamp(this.targetScrollPos + fling, this.min, this.max);
    this._touchVelocity = 0;
  };

  /**
   * Keyboard access. Hijacking the wheel removes the page's native keyboard
   * scrolling, so we put it back: Page Up/Down, Home/End, Space and
   * Shift+Space, and the arrow keys — all mapped onto `targetScrollPos`, so
   * they inherit exactly the same damping as the wheel.
   */
  private onKeyDown = (e: KeyboardEvent): void => {
    if (!this.acceptsInput) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (isInteractiveTarget(e.target)) return;

    const line = this.scrollLength * this.lineStepFraction;
    const page = this.scrollLength * this.pageStepFraction;
    let next = this.targetScrollPos;
    let handled = true;

    switch (e.key) {
      case 'PageDown':      next += page; break;
      case 'PageUp':        next -= page; break;
      case 'Home':          next = this.min; break;
      case 'End':           next = this.max; break;
      case 'ArrowDown':
      case 'ArrowRight':    next += line; break;
      case 'ArrowUp':
      case 'ArrowLeft':     next -= line; break;
      case ' ':
      case 'Spacebar':
        next += e.shiftKey ? -page : page;
        break;
      default:
        handled = false;
    }

    if (!handled) return;
    e.preventDefault();
    this.targetScrollPos = clamp(next, this.min, this.max);
    if (this._reducedMotion) this.scrollPos = this.targetScrollPos;
  };

  // --- Auto-scroll -------------------------------------------------------

  /**
   * Drive the scroll to `target` over `duration` seconds on a smoothstep,
   * moving both positions so the damping does not fight it. Resolves when it
   * lands. Starting a new one settles the previous one.
   */
  startAutoScroll(target: number, duration: number): Promise<void> {
    const to = clamp(target, this.min, this.max);
    this.finishAuto();
    if (duration <= 0 || this._reducedMotion || this.destroyed) {
      this.setScrollImmediate(to);
      return Promise.resolve();
    }
    this.autoActive = true;
    this.autoFrom = this.scrollPos;
    this.autoTo = to;
    this.autoDuration = duration;
    this.autoElapsed = 0;
    return new Promise<void>((resolve) => {
      this.autoResolve = resolve;
    });
  }

  /** Settle an auto-scroll without jumping, resolving its promise. */
  private finishAuto(): void {
    this.autoActive = false;
    const resolve = this.autoResolve;
    this.autoResolve = null;
    if (resolve) resolve();
  }

  // --- Frame -------------------------------------------------------------

  /**
   * Advance the damping. `dt` is in seconds. Allocates nothing.
   *
   * Frame-rate independence lives in the two `1 - exp(-rate * dt)` factors:
   * at 30, 60 or 144 Hz the position reaches the same place at the same wall
   * time, which a bare per-frame lerp does not.
   */
  update(dt: number): void {
    if (this.destroyed) return;
    const previous = this.scrollPos;

    if (this.autoActive) {
      this.autoElapsed += dt;
      const n = this.autoDuration > 0
        ? clamp(this.autoElapsed / this.autoDuration, 0, 1)
        : 1;
      const eased = smoothstep(n);
      const pos = this.autoFrom + (this.autoTo - this.autoFrom) * eased;
      this.scrollPos = pos;
      this.targetScrollPos = pos;
      if (n >= 1) {
        this.scrollPos = this.autoTo;
        this.targetScrollPos = this.autoTo;
        this.finishAuto();
      }
    } else if (this._reducedMotion) {
      // Nothing glides: the position is the input.
      this.scrollPos = this.targetScrollPos;
    } else {
      const t = dt > 0
        ? 1 - Math.exp(-this._smoothSpeed * dt)
        : SCROLL_CONFIG.SCROLL_LERP;
      this.scrollPos = this.scrollPos + (this.targetScrollPos - this.scrollPos) * t;
      // Snap out of the asymptote — without this the tail runs for seconds
      // and every downstream consumer keeps repainting for a sub-pixel move.
      if (Math.abs(this.scrollPos - this.targetScrollPos) < SNAP_EPSILON) {
        this.scrollPos = this.targetScrollPos;
      }
    }

    const instant = dt > 0 ? (this.scrollPos - previous) / dt : 0;
    const vt = dt > 0
      ? 1 - Math.exp(-this._velocitySpeed * dt)
      : SCROLL_CONFIG.SCROLL_VELOCITY_SMOOTHING;
    this._positionVelocity += (instant - this._positionVelocity) * vt;
    this._velocity = this.scrollLength > 0
      ? this._positionVelocity / this.scrollLength
      : 0;

    this.emitProgress();
  }
}

// ---------------------------------------------------------------------------
// Camera rig
// ---------------------------------------------------------------------------

export interface CameraRigOptions {
  /** Force reduced motion. Omit to read the platform setting. */
  reducedMotion?: boolean;
  /** Element pointer input binds to. Defaults to `window`. */
  target?: Window | HTMLElement;
  /** Override the clamp on the normalised offset. Default 0.18. */
  maxOffset?: number;
  /** Override the smoothing time constant, in seconds. Default 0.12. */
  smoothTc?: number;
  /** Half-range of device tilt, in degrees, that maps to full offset. Default 20. */
  gyroRange?: number;
  /** Bind device orientation when it is available. Default true. */
  gyro?: boolean;
}

type PermissionCapableOrientation = {
  requestPermission?: () => Promise<'granted' | 'denied' | 'default'>;
};

/**
 * Pointer / gyro parallax offset.
 *
 * Half of why the reference's frame feels alive when nothing is happening: the
 * camera keeps drifting a fraction of a unit against the pointer. It is small
 * on purpose — MAX_OFFSET is 0.18 world units — and it is smoothed with the
 * same frame-rate independent shape as the scroll.
 *
 * The rig never touches a camera. Read `offsetX` / `offsetY` and apply them
 * along the camera's own right/up axes, then aim at a point `focalDistance`
 * ahead of the rig's centre; that pivot is what makes the drift read as
 * parallax rather than the whole frame sliding.
 */
export class CameraRig {
  /** Look at a point this far ahead so the offset reads as parallax. */
  readonly focalDistance: number = SCROLL_CONFIG.CAMERA_RIG.FOCAL_DISTANCE;

  private readonly maxOffset: number;
  private readonly smoothTc: number;
  private readonly gyroRange: number;
  private readonly target: Window | HTMLElement;
  private readonly wantsGyro: boolean;

  private _offsetX = 0;
  private _offsetY = 0;
  private targetX = 0;
  private targetY = 0;

  private enabled = true;
  private _reducedMotion: boolean;
  private gyroBound = false;
  private gyroActive = false;
  private baseBeta = 0;
  private baseGamma = 0;
  private destroyed = false;

  constructor(opts: CameraRigOptions = {}) {
    const cfg = SCROLL_CONFIG.CAMERA_RIG;
    this.maxOffset = opts.maxOffset ?? cfg.MAX_OFFSET;
    this.smoothTc = opts.smoothTc ?? cfg.SMOOTH_TC;
    this.gyroRange = opts.gyroRange ?? cfg.GYRO_RANGE;
    this.wantsGyro = opts.gyro ?? true;
    this._reducedMotion = opts.reducedMotion ?? detectReducedMotion();

    const fallback = (typeof window !== 'undefined' ? window : null) as Window | null;
    this.target = opts.target ?? (fallback as Window);
    if (!this.target) return;

    this.target.addEventListener('pointermove', this.onPointerMove as EventListener, { passive: true });
    this.target.addEventListener('pointerleave', this.onPointerOut as EventListener, { passive: true });
    if (typeof window !== 'undefined') {
      window.addEventListener('blur', this.onPointerOut);
    }
    if (this.wantsGyro && !this.needsGyroPermission) this.bindGyro();
  }

  /** Smoothed horizontal offset, in the same units as MAX_OFFSET. */
  get offsetX(): number { return this._offsetX; }
  /** Smoothed vertical offset. Positive is up. */
  get offsetY(): number { return this._offsetY; }

  get isGyroActive(): boolean { return this.gyroActive; }

  get reducedMotion(): boolean { return this._reducedMotion; }

  /**
   * True when the platform gates device orientation behind a user gesture
   * (iOS 13+). The host must call `requestGyroPermission()` from a real click
   * or tap; we never ask on our own.
   */
  get needsGyroPermission(): boolean {
    if (typeof window === 'undefined') return false;
    if (typeof DeviceOrientationEvent === 'undefined') return false;
    const ctor = DeviceOrientationEvent as unknown as PermissionCapableOrientation;
    return typeof ctor.requestPermission === 'function';
  }

  /** Ask for gyro access. Call from a user gesture; resolves to whether it bound. */
  async requestGyroPermission(): Promise<boolean> {
    if (typeof window === 'undefined' || typeof DeviceOrientationEvent === 'undefined') return false;
    const ctor = DeviceOrientationEvent as unknown as PermissionCapableOrientation;
    if (typeof ctor.requestPermission !== 'function') {
      this.bindGyro();
      return this.gyroBound;
    }
    try {
      const state = await ctor.requestPermission();
      if (state !== 'granted') return false;
      this.bindGyro();
      return this.gyroBound;
    } catch {
      return false;
    }
  }

  private bindGyro(): void {
    if (this.gyroBound || this.destroyed) return;
    if (typeof window === 'undefined') return;
    // Feature-detected, never assumed: desktops without a sensor simply never
    // fire the event, and browsers without the constructor never get a listener.
    if (typeof DeviceOrientationEvent === 'undefined') return;
    if (!('ondeviceorientation' in window)) return;
    window.addEventListener('deviceorientation', this.onOrientation as EventListener, { passive: true });
    this.gyroBound = true;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) { this.targetX = 0; this.targetY = 0; }
  }

  setReducedMotion(reduced: boolean): void {
    this._reducedMotion = reduced;
    if (reduced) {
      this.targetX = 0;
      this.targetY = 0;
      this._offsetX = 0;
      this._offsetY = 0;
    }
  }

  /** Re-zero the gyro against however the device is being held right now. */
  recentreGyro(): void {
    this.gyroActive = false;
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.enabled || this._reducedMotion || this.gyroActive) return;
    const w = typeof window !== 'undefined' ? window.innerWidth : 0;
    const h = typeof window !== 'undefined' ? window.innerHeight : 0;
    if (w <= 0 || h <= 0) return;
    // -1..1 across the viewport, then clamped into the offset budget.
    const nx = (e.clientX / w) * 2 - 1;
    const ny = (e.clientY / h) * 2 - 1;
    this.targetX = clamp(nx * this.maxOffset, -this.maxOffset, this.maxOffset);
    this.targetY = clamp(-ny * this.maxOffset, -this.maxOffset, this.maxOffset);
  };

  private onPointerOut = (): void => {
    this.targetX = 0;
    this.targetY = 0;
  };

  private onOrientation = (e: DeviceOrientationEvent): void => {
    if (!this.enabled || this._reducedMotion) return;
    const beta = e.beta;
    const gamma = e.gamma;
    if (beta === null || gamma === null) return;
    if (!this.gyroActive) {
      // First reading is "neutral" — however the device happens to be held.
      this.gyroActive = true;
      this.baseBeta = beta;
      this.baseGamma = gamma;
    }
    const nx = clamp((gamma - this.baseGamma) / this.gyroRange, -1, 1);
    const ny = clamp((beta - this.baseBeta) / this.gyroRange, -1, 1);
    this.targetX = nx * this.maxOffset;
    this.targetY = -ny * this.maxOffset;
  };

  /** Advance the smoothing. `dt` in seconds. Allocates nothing. */
  update(dt: number): void {
    if (this.destroyed) return;
    if (this._reducedMotion) {
      this._offsetX = 0;
      this._offsetY = 0;
      return;
    }
    const t = dt > 0 ? 1 - Math.exp(-dt / this.smoothTc) : 1;
    this._offsetX += (this.targetX - this._offsetX) * t;
    this._offsetY += (this.targetY - this._offsetY) * t;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.target) {
      this.target.removeEventListener('pointermove', this.onPointerMove as EventListener);
      this.target.removeEventListener('pointerleave', this.onPointerOut as EventListener);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('blur', this.onPointerOut);
      if (this.gyroBound) {
        window.removeEventListener('deviceorientation', this.onOrientation as EventListener);
        this.gyroBound = false;
      }
    }
    this._offsetX = 0;
    this._offsetY = 0;
  }
}
