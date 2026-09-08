/**
 * Motion for the reading routes.
 *
 * Everything here is an enhancement on top of a page that is already complete
 * and already readable. The reveal itself deliberately lives inline in
 * Content.astro so that a failure to load this module can never leave content
 * hidden. What is left is punctuation: the nav's scroll state and progress
 * hairline, the hero rule's drift, the figures that count themselves up, and
 * the section rail that marks where you are.
 *
 * Timing follows the reference's vocabulary rather than ours: `power2.out` at
 * 0.3–0.65s is the default gesture, and every continuous value is *damped*
 * toward its target rather than assigned from the scroll position. The damping
 * is frame-rate independent — `1 - e^(-dt/tc)` with time constants of
 * 0.075–0.12s — so the same gesture reads identically at 60Hz and at 120Hz,
 * and a slow scroll produces the same easing as a fast one.
 *
 * Rules this file keeps:
 *  - transform and opacity only, so nothing triggers layout;
 *  - no scroll-jacking, no scroll-linked delays on reading;
 *  - `prefers-reduced-motion: reduce` disables every animated part, and the
 *    static end-state is what was already in the DOM. Under reduced motion the
 *    damped values are assigned outright, so the readouts stay truthful.
 */

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------------
   Damping. The reference never lerps by a fixed fraction per frame — it
   approaches exponentially against elapsed time, which is what makes the
   same motion hold together across refresh rates.
   ------------------------------------------------------------------ */

/** Time constants, in seconds, in the reference's 0.075–0.12 band. */
const TC_PROGRESS = 0.075; // the hairline tracks the thumb closely
const TC_LIFT = 0.09; // the nav's edge appearing under the bar
const TC_DRIFT = 0.1; // the hero rule's parallax
const TC_CONDENSE = 0.12; // the nav's own shape
const TC_VELOCITY = 0.12; // the smoothed reading of which way you are going

function damp(current: number, target: number, dt: number, tc: number): number {
  if (tc <= 0) return target;
  return current + (target - current) * (1 - Math.exp(-dt / tc));
}

function settled(current: number, target: number, eps: number): boolean {
  return Math.abs(target - current) < eps;
}

/* ------------------------------------------------------------------
   A single rAF loop for everything scroll-driven.

   Scroll events only wake the loop; the loop then runs until every damped
   value has arrived, and puts itself back to sleep. A frame returns true
   while it still has somewhere to go.
   ------------------------------------------------------------------ */

type Frame = (scrollY: number, dt: number) => boolean;

const scrollFrames: Frame[] = [];
let rafId = 0;
let lastTime = 0;

function tick(now: number): void {
  rafId = 0;
  // Clamp: a backgrounded tab or a long task must not hand the damping a
  // delta big enough to overshoot into a jump.
  const dt = lastTime === 0
    ? 1 / 60
    : Math.min(0.064, Math.max(0.001, (now - lastTime) / 1000));
  lastTime = now;

  const y = window.scrollY || window.pageYOffset || 0;

  let moving = false;
  for (const frame of scrollFrames) {
    if (frame(y, dt)) moving = true;
  }

  if (moving) rafId = window.requestAnimationFrame(tick);
  else lastTime = 0;
}

function wake(): void {
  if (rafId !== 0) return;
  lastTime = 0;
  rafId = window.requestAnimationFrame(tick);
}

function addFrame(frame: Frame): void {
  scrollFrames.push(frame);
}

/* ------------------------------------------------------------------
   Nav: condense on the way down, return on the way up, and carry a
   hairline that reports how far through the page you are.

   Both are continuous. The condense is driven by a damped reading of scroll
   velocity rather than by a per-frame pixel delta, so it behaves the same
   whether you are easing down the page or throwing it — the old test
   (`y > last + 4` between two frames) was both frame-rate dependent and
   invisible at slow speeds, which is what made it read as a switch.
   ------------------------------------------------------------------ */

function initNav(): void {
  const nav = document.querySelector<HTMLElement>('[data-nav]');
  if (!nav) return;

  const progress = nav.querySelector<HTMLElement>('[data-nav-progress]');

  let lastY = -1;
  let velocity = 0;
  let condense = 0;
  let condenseTo = 0;
  let lift = 0;
  let ratio = 0;

  addFrame((y, dt) => {
    // Read first, write second: everything below only sets custom properties
    // and transforms, so the frame never forces a second layout.
    const doc = document.documentElement;
    const span = progress ? doc.scrollHeight - window.innerHeight : 0;

    let moving = false;

    /* The hairline edge under the bar. A damped fade across the first ~24px
       instead of a class that snaps on at 4. */
    const liftTo = Math.min(1, Math.max(0, (y - 2) / 22));
    lift = reduced ? liftTo : damp(lift, liftTo, dt, TC_LIFT);
    if (settled(lift, liftTo, 0.0008)) lift = liftTo;
    else moving = true;
    nav.style.setProperty('--nav-lift', lift.toFixed(3));
    nav.classList.toggle('is-scrolled', y > 4);

    /* Which way, and how hard. Clamped so an anchor jump or a wake from
       sleep cannot register as a thousand-frame throw. */
    const raw = lastY < 0 ? 0 : Math.max(-6000, Math.min(6000, (y - lastY) / dt));
    lastY = y;
    velocity = reduced ? raw : damp(velocity, raw, dt, TC_VELOCITY);
    // Only park the reading once the page has actually stopped — zeroing it
    // on magnitude alone would clip the ramp of a slow scroll every frame and
    // the nav would never condense below a throw.
    if (raw === 0 && Math.abs(velocity) < 2) velocity = 0;
    else moving = true;

    // Intent, held between crossings: past the header and heading down it
    // condenses; heading up, or back near the top, it opens again. The
    // threshold is on smoothed px/s, so a slow deliberate scroll crosses it
    // just as surely as a fast one — only a page that is barely moving does
    // not.
    if (y < 160) condenseTo = 0;
    else if (y > 220 && velocity > 15) condenseTo = 1;
    else if (velocity < -15) condenseTo = 0;

    condense = reduced ? condenseTo : damp(condense, condenseTo, dt, TC_CONDENSE);
    if (settled(condense, condenseTo, 0.0008)) condense = condenseTo;
    else moving = true;
    nav.style.setProperty('--nav-condense', condense.toFixed(3));
    // Condensing the box itself is one state change rather than a per-frame
    // layout write; the class follows the damped value across its midpoint,
    // and the transition on it is timed to match.
    nav.classList.toggle('is-condensed', condense > 0.5);

    /* Progress. Damped so the hairline trails the thumb by a few frames and
       arrives, rather than being redrawn at whatever the scroll happened to
       be when the event fired. */
    if (progress) {
      const to = span > 0 ? Math.min(1, Math.max(0, y / span)) : 0;
      ratio = reduced ? to : damp(ratio, to, dt, TC_PROGRESS);
      if (settled(ratio, to, 0.0002)) ratio = to;
      else moving = true;
      progress.style.transform = `scaleX(${ratio.toFixed(4)})`;
    }

    return moving;
  });
}

/* ------------------------------------------------------------------
   Hero rule: a few pixels of drift against the scroll. Capped hard so it
   never separates from the header it belongs to, and damped so the cap is
   arrived at rather than hit.
   ------------------------------------------------------------------ */

function initHeroRule(): void {
  if (reduced) return;
  const rule = document.querySelector<HTMLElement>('[data-hero-rule]');
  if (!rule) return;

  let drift = 0;

  addFrame((y, dt) => {
    const to = Math.min(22, Math.max(0, y * 0.07));
    drift = damp(drift, to, dt, TC_DRIFT);
    if (settled(drift, to, 0.01)) {
      drift = to;
      rule.style.setProperty('--rule-drift', `${to.toFixed(2)}px`);
      return false;
    }
    rule.style.setProperty('--rule-drift', `${drift.toFixed(2)}px`);
    return true;
  });
}

/* ------------------------------------------------------------------
   Figures that count. The element's server-rendered text is the source of
   truth and the end state; the animation only replays the run up to it.
   ------------------------------------------------------------------ */

function initCounters(): void {
  if (reduced || !('IntersectionObserver' in window)) return;

  const els = Array.from(document.querySelectorAll<HTMLElement>('[data-count]'));
  if (els.length === 0) return;

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        io.unobserve(entry.target);
        run(entry.target as HTMLElement);
      }
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0.4 },
  );

  for (const el of els) io.observe(el);

  function run(el: HTMLElement): void {
    const text = (el.textContent ?? '').trim();
    const match = /^([\d,]+)/.exec(text);
    if (!match) return;

    const target = Number(match[1].replace(/,/g, ''));
    if (!Number.isFinite(target) || target <= 0) return;

    const grouped = match[1].includes(',');
    const tail = text.slice(match[1].length);

    // Freeze the box before the digits shrink, so nothing reflows around it.
    // Only inline runs need it — a block figure already fills its column.
    const width = el.getBoundingClientRect().width;
    if (width > 0 && window.getComputedStyle(el).display === 'inline') {
      el.style.display = 'inline-block';
      el.style.minWidth = `${Math.ceil(width)}px`;
    }

    // 0.65s is the long end of the reference's default gesture; the count is
    // punctuation on a reading page, not an event.
    const duration = 650;
    const start = performance.now();

    const step = (now: number): void => {
      const t = Math.min(1, (now - start) / duration);
      // power2.out — the reference's workhorse — so the count sits with the
      // rest of the page rather than snapping ahead of it.
      const eased = 1 - Math.pow(1 - t, 2);
      const value = Math.round(target * eased);
      el.textContent = (grouped ? value.toLocaleString() : String(value)) + tail;
      if (t < 1) window.requestAnimationFrame(step);
      else el.textContent = text;
    };

    window.requestAnimationFrame(step);
  }
}

/* ------------------------------------------------------------------
   Section rail: mark the section being read. Pure class toggling, so it is
   just as useful with reduced motion on.
   ------------------------------------------------------------------ */

function initRail(): void {
  const sections = Array.from(document.querySelectorAll<HTMLElement>('.doc > section'));
  if (sections.length === 0) return;

  let current: HTMLElement | null = null;
  let lastY = Number.NaN;

  addFrame((y) => {
    // The rail has no damped value of its own, so it only needs to look while
    // the page is actually moving — not while the other frames settle.
    if (y === lastY) return false;
    lastY = y;

    const line = window.innerHeight * 0.32;
    let found: HTMLElement | null = null;

    for (const section of sections) {
      if (section.getBoundingClientRect().top <= line) found = section;
    }
    if (found === current) return false;

    if (current) current.classList.remove('is-current');
    if (found) found.classList.add('is-current');
    current = found;
    return false;
  });
}

/* ------------------------------------------------------------------ */

function start(): void {
  initNav();
  initHeroRule();
  initCounters();
  initRail();

  if (scrollFrames.length > 0) {
    window.addEventListener('scroll', wake, { passive: true });
    window.addEventListener('resize', wake, { passive: true });
    wake();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}

/* This file is loaded as a module by Content.astro; the marker keeps the
   compiler treating it as one rather than as a global script. */
export {};
