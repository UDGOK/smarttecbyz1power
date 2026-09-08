/**
 * Entry gate.
 *
 * The reference gates its experience behind a drawn zero — a freehand stroke
 * over the live scene, with a bright head at the tip of the pen. Ours asks you
 * to close the circuit instead: same gesture, same drawn line, and the site
 * powers on when the turn closes.
 *
 * Two halves:
 *
 *   1. The *rule* — unchanged. Pointer travel accumulates **signed** angular
 *      sweep about the centre of the viewport, so scrubbing back and forth
 *      cancels itself out and you have to actually go round once.
 *   2. The *drawing* — a 2D canvas the pointer paints into directly. Every
 *      sample the browser gives us (coalesced events included) becomes a point,
 *      so the line on screen is literally the path the pointer took, not a
 *      geometric arc snapped to a ring. The oldest points fade so a long
 *      scribble thins out behind you instead of turning to mush.
 */

import { audio } from './audio';
import { prefersReducedMotion } from './hold-button';

interface InkPoint {
  x: number;
  y: number;
  /** Starts a new subpath — set on the first point after the pen lifts. */
  cut: boolean;
}

const TAU = Math.PI * 2;

/** Ring buffer size. Long enough for a generous scribble, short enough to stay cheap. */
const MAX_POINTS = 1100;
/** Samples closer together than this are dropped — the pointer barely moved. */
const MIN_STEP = 1.1;
/** Newest N points stay at full strength before the tail starts to fade. */
const FADE_HOLD = 110;
/** Points over which the tail decays from full to FADE_FLOOR. */
const FADE_SPAN = 340;
const FADE_FLOOR = 0.18;
/** Alpha is quantised into this many bands so each band strokes as one path. */
const BANDS = 12;
/**
 * Inside this radius the sweep does not count. Without it a tight wiggle on the
 * exact centre would rack up a full turn in a few pixels.
 */
const DEAD_ZONE = 46;

/** Exit flare, then the gate fades. */
const BLOOM_MS = 420;
const FADE_MS = 900;

export function initLoader(onComplete: () => void): void {
  const el = document.querySelector<HTMLElement>('#loader');
  if (!el) { onComplete(); return; }

  const canvas = el.querySelector<HTMLCanvasElement>('.loader__ink');
  const skip = el.querySelector<HTMLButtonElement>('#loader-skip');
  const ctx = canvas ? canvas.getContext('2d') : null;
  if (!canvas || !ctx) {
    // No paint surface, no gesture to ask for. Let them straight in.
    el.hidden = true;
    onComplete();
    return;
  }

  // Ink colours come off the element, so the palette lives in tokens.css.
  const styles = getComputedStyle(el);
  const core = styles.getPropertyValue('--ink-core').trim() || 'white';
  const glow = styles.getPropertyValue('--ink-glow').trim() || core;

  // --- Surface ------------------------------------------------------------
  let dpr = 1;
  let w = 0;
  let h = 0;
  let cx = 0;
  let cy = 0;

  const resize = (): void => {
    const r = el.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = Math.max(1, r.width);
    h = Math.max(1, r.height);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    cx = w / 2;
    cy = h / 2;
  };
  resize();

  // --- State --------------------------------------------------------------
  const pts: InkPoint[] = [];
  let swept = 0;
  let lastAngle: number | null = null;
  let drawing = false;
  let done = false;
  /** 0..1 progress round the turn. Brightens the ink — no widget, just heat. */
  let charge = 0;
  /** 0..1 exit flare along the drawn path. */
  let bloom = 0;
  let bloomAt = 0;
  let raf = 0;

  // --- Painting -----------------------------------------------------------

  /** How bright a point that is `age` samples behind the tip should be. */
  const ageAlpha = (age: number): number => {
    if (age <= FADE_HOLD) return 1;
    const t = Math.min(1, (age - FADE_HOLD) / FADE_SPAN);
    return FADE_FLOOR + (1 - FADE_FLOOR) * (1 - t);
  };

  const band = (age: number): number => Math.round(ageAlpha(age) * BANDS) / BANDS;

  /** Trace pts[from..to] as one path, honouring pen lifts. */
  const trace = (from: number, to: number): void => {
    ctx.beginPath();
    let pen = false;
    for (let k = from; k <= to; k++) {
      const p = pts[k];
      if (!pen || p.cut) {
        ctx.moveTo(p.x, p.y);
        pen = true;
      } else {
        ctx.lineTo(p.x, p.y);
      }
    }
  };

  /**
   * One pass over the whole stroke at a given width/blur. Points are grouped
   * into runs of equal alpha so the fade costs a dozen strokes, not hundreds.
   */
  const pass = (width: number, alpha: number, colour: string, blur: number): void => {
    const n = pts.length;
    if (n < 2) return;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = width;
    ctx.strokeStyle = colour;
    ctx.shadowColor = colour;
    // shadowBlur is not affected by the canvas transform, so scale it by hand.
    ctx.shadowBlur = blur * dpr;

    let i = 0;
    while (i < n - 1) {
      const a = band(n - 1 - i);
      let j = i + 1;
      while (j < n - 1 && band(n - 1 - j) === a) j++;
      ctx.globalAlpha = Math.min(1, a * alpha);
      trace(i, j);
      ctx.stroke();
      // Overlap by one point so consecutive bands join without a seam.
      i = j;
    }
  };

  /** The pen tip: a hot little disc that the line trails out of. */
  const head = (): void => {
    const p = pts[pts.length - 1];
    if (!p) return;
    const r = 6.5 + charge * 2.5 + bloom * 12;
    ctx.shadowColor = core;
    ctx.shadowBlur = (22 + charge * 10 + bloom * 60) * dpr;
    ctx.fillStyle = core;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 1.7, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, TAU);
    ctx.fill();
  };

  const paint = (): void => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    // Additive, so overlapping passes read as light rather than paint.
    ctx.globalCompositeOperation = 'lighter';

    const heat = 1 + charge * 0.5 + bloom * 2.2;
    pass(24 + bloom * 16, 0.075 * heat, glow, 34 + bloom * 34);
    pass(9 + bloom * 6, 0.2 * heat, glow, 16);
    pass(2.4 + bloom * 2.5, Math.min(1, 0.85 + bloom * 0.6), core, 7 + bloom * 22);
    if (drawing || bloom > 0) head();

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = 'source-over';
  };

  const stop = (): void => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
  };

  const loop = (): void => {
    raf = requestAnimationFrame(loop);
    if (done && bloomAt) {
      const t = Math.min(1, (performance.now() - bloomAt) / BLOOM_MS);
      // Snap up, ease down: a flare, not a pulse.
      bloom = t < 0.18 ? t / 0.18 : 1 - (t - 0.18) / 0.82;
      if (t >= 1) { bloom = 0; stop(); }
    }
    paint();
  };

  const start = (): void => {
    if (!raf) raf = requestAnimationFrame(loop);
  };

  // --- The rule -----------------------------------------------------------

  /** Fold one pointer sample into the stroke and into the signed sweep. */
  const sample = (x: number, y: number, cut: boolean): void => {
    const prev = pts[pts.length - 1];
    if (!cut && prev && Math.hypot(x - prev.x, y - prev.y) < MIN_STEP) return;
    pts.push({ x, y, cut });
    if (pts.length > MAX_POINTS) pts.shift();

    const dx = x - cx;
    const dy = y - cy;
    if (Math.hypot(dx, dy) < DEAD_ZONE) {
      // Crossing the middle: drop the reference angle so re-entering the ring
      // does not book a phantom jump.
      lastAngle = null;
      return;
    }

    const a = Math.atan2(dy, dx);
    if (lastAngle !== null) {
      let d = a - lastAngle;
      // Unwrap across the ±π seam so one continuous turn reads as one turn.
      if (d > Math.PI) d -= TAU;
      if (d < -Math.PI) d += TAU;
      swept += d;
    }
    lastAngle = a;

    charge = Math.min(1, Math.abs(swept) / TAU);
    if (charge >= 1) finish();
  };

  const onDown = (e: PointerEvent): void => {
    if (done) return;
    // Browsers want a gesture before they will make a sound.
    audio.unlock();
    // The escape hatch is a button, not part of the canvas.
    if ((e.target as HTMLElement | null)?.closest('#loader-skip')) return;
    drawing = true;
    lastAngle = null;
    el.classList.add('is-drawing');
    sample(e.clientX, e.clientY, true);
    start();
  };

  const onMove = (e: PointerEvent): void => {
    if (!drawing || done) return;
    // Coalesced events carry every sample the digitiser took between frames,
    // which is what makes the line the real path rather than a polygon.
    const batch = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    if (batch.length) {
      for (const s of batch) sample(s.clientX, s.clientY, false);
    } else {
      sample(e.clientX, e.clientY, false);
    }
  };

  const onUp = (): void => {
    if (!drawing) return;
    drawing = false;
    lastAngle = null;
    el.classList.remove('is-drawing');
  };

  const onSkip = (): void => finish(true);

  const teardown = (): void => {
    stop();
    el.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    window.removeEventListener('resize', resize);
    skip?.removeEventListener('click', onSkip);
  };

  const finish = (immediate = false): void => {
    if (done) return;
    done = true;
    drawing = false;
    lastAngle = null;
    charge = 1;
    el.classList.remove('is-drawing');
    audio.unlock();
    audio.play('whoosh');

    const flare = immediate || prefersReducedMotion() ? 0 : BLOOM_MS * 0.72;
    if (flare) { bloomAt = performance.now(); start(); }

    // The stroke flares, then the whole gate goes.
    window.setTimeout(() => el.classList.add('is-done'), flare);
    window.setTimeout(() => {
      teardown();
      el.hidden = true;
      onComplete();
    }, flare + FADE_MS);
  };

  el.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  window.addEventListener('resize', resize);
  skip?.addEventListener('click', onSkip);

  // Anyone who cannot perform a drag gesture gets in without one.
  if (prefersReducedMotion()) {
    el.classList.add('is-ready');
    skip?.focus();
  }

  // Stand in for real asset loading until there are assets to load.
  window.setTimeout(() => el.classList.add('is-ready'), 900);
}
