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
 * Rules this file keeps:
 *  - transform and opacity only, so nothing triggers layout;
 *  - no scroll-jacking, no scroll-linked delays on reading;
 *  - `prefers-reduced-motion: reduce` disables every animated part, and the
 *    static end-state is what was already in the DOM.
 */

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------------
   A single rAF loop for everything scroll-driven.
   ------------------------------------------------------------------ */

type Frame = (scrollY: number) => void;

const scrollFrames: Frame[] = [];
let queued = false;

function onScroll(): void {
  if (queued) return;
  queued = true;
  window.requestAnimationFrame(() => {
    queued = false;
    const y = window.scrollY || window.pageYOffset || 0;
    for (const frame of scrollFrames) frame(y);
  });
}

function addFrame(frame: Frame): void {
  scrollFrames.push(frame);
}

/* ------------------------------------------------------------------
   Nav: condense on the way down, return on the way up, and carry a
   hairline that reports how far through the page you are.
   ------------------------------------------------------------------ */

function initNav(): void {
  const nav = document.querySelector<HTMLElement>('[data-nav]');
  if (!nav) return;

  const progress = nav.querySelector<HTMLElement>('[data-nav-progress]');
  let last = 0;

  addFrame((y) => {
    nav.classList.toggle('is-scrolled', y > 4);

    // Condensing is a state change, not an animation, so it stands under
    // reduced motion too — the transition itself is disabled by the token.
    if (y > 220 && y > last + 4) nav.classList.add('is-condensed');
    else if (y < last - 4 || y < 160) nav.classList.remove('is-condensed');
    last = y;

    if (progress) {
      const doc = document.documentElement;
      const span = doc.scrollHeight - window.innerHeight;
      const ratio = span > 0 ? Math.min(1, Math.max(0, y / span)) : 0;
      progress.style.transform = `scaleX(${ratio.toFixed(4)})`;
    }
  });
}

/* ------------------------------------------------------------------
   Hero rule: a few pixels of drift against the scroll. Capped hard so it
   never separates from the header it belongs to.
   ------------------------------------------------------------------ */

function initHeroRule(): void {
  if (reduced) return;
  const rule = document.querySelector<HTMLElement>('[data-hero-rule]');
  if (!rule) return;

  addFrame((y) => {
    if (y > 1400) return;
    const drift = Math.min(22, y * 0.07);
    rule.style.setProperty('--rule-drift', `${drift.toFixed(2)}px`);
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

    const duration = 900;
    const start = performance.now();

    const step = (now: number): void => {
      const t = Math.min(1, (now - start) / duration);
      // Same ease as --e-out, so the count sits with the rest of the page.
      const eased = 1 - Math.pow(1 - t, 3);
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

  addFrame(() => {
    const line = window.innerHeight * 0.32;
    let found: HTMLElement | null = null;

    for (const section of sections) {
      if (section.getBoundingClientRect().top <= line) found = section;
    }
    if (found === current) return;

    if (current) current.classList.remove('is-current');
    if (found) found.classList.add('is-current');
    current = found;
  });
}

/* ------------------------------------------------------------------ */

function start(): void {
  initNav();
  initHeroRule();
  initCounters();
  initRail();

  if (scrollFrames.length > 0) {
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    onScroll();
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
