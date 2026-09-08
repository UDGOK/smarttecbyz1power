/**
 * type-motion — kinetic typography for the stage routes.
 *
 * The reference this site is modelled on treats type as a lead actor: an
 * enormous didone that *arrives*, and tiny wide-tracked mono labels that set
 * and settle like a readout coming online. One move — the masked line rise —
 * cannot carry all of that, so this is a small library of them:
 *
 *   revealLines  the masked per-line rise, unchanged, still the workhorse
 *   revealChars  per-character arrival, staggered from an edge or the centre
 *   scramble     mono labels that cycle glyphs before settling
 *   countUp      figures that roll to their value without reflowing
 *   emphasis     one word in a headline, breathing
 *
 * Rules this file keeps, in priority order:
 *
 *  1. The page is never left worse than it was found. Splitting detaches the
 *     element's *real* child nodes into a fragment and keeps them; restore()
 *     puts those same nodes back. Any throw during a split re-attaches them
 *     before it propagates, and every public entry point catches, restores,
 *     and returns an inert handle. A broken effect degrades to plain text.
 *  2. Split text stays readable to assistive tech: the original string goes
 *     on the element as `aria-label` *and* as a visually-hidden mirror span,
 *     and every generated visual node is `aria-hidden="true"`.
 *  3. `prefers-reduced-motion` is read live from the MediaQueryList on every
 *     call — never cached at import — and flipping it mid-flight finishes
 *     whatever is running. Under reduce, every treatment applies its *final*
 *     state at once: text present, numbers at value, nothing hidden, and the
 *     purely decorative splits are not performed at all.
 *  4. Transform and opacity only. `countUp` and `scramble` write text because
 *     that is the whole of the effect; both freeze their box first so nothing
 *     around them reflows. `emphasis` in 'weight' mode writes
 *     font-variation-settings, which is opt-in.
 *  5. Idempotent. Calling a treatment twice on one element re-uses the split
 *     it already has and kills the tween it already had.
 */

import gsap from 'gsap';

/* ==================================================================
   Reduced motion
   ================================================================== */

const REDUCE_QUERY = '(prefers-reduced-motion: reduce)';

let mediaQuery: MediaQueryList | null = null;
let mediaBound = false;

/** The live MediaQueryList, created on first use (never at import). */
function motionQuery(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  if (!mediaQuery) mediaQuery = window.matchMedia(REDUCE_QUERY);
  if (!mediaBound) {
    mediaBound = true;
    const onChange = (): void => {
      if (mediaQuery && mediaQuery.matches) finishAllLive();
    };
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', onChange);
    } else if (typeof mediaQuery.addListener === 'function') {
      // Safari < 14 still ships the deprecated shape.
      mediaQuery.addListener(onChange);
    }
  }
  return mediaQuery;
}

/**
 * Whether the visitor asked for reduced motion, read at the moment of asking.
 * Every treatment calls this on entry, so a preference changed after load is
 * honoured by the next reveal without a page refresh.
 */
export function prefersReducedMotion(): boolean {
  const q = motionQuery();
  return q ? q.matches : false;
}

/* ==================================================================
   Handles
   ================================================================== */

/** What every treatment hands back. */
export interface TypeMotionHandle {
  /** The element the treatment was applied to. */
  readonly element: HTMLElement;
  /** True when the treatment resolved straight to its end state. */
  readonly reduced: boolean;
  /** Settles when the animation ends — immediately under reduced motion. */
  readonly finished: Promise<void>;
  /** Start a treatment created with `paused: true`. */
  play(): void;
  /** Jump to the end state now. Split markup is kept in place. */
  finish(): void;
  /** Stop animating. The element is left in its visible end state, never mid-way. */
  kill(): void;
  /** `kill()`, then put the element's original nodes and attributes back. */
  restore(): void;
}

/** Treatments in the same group are mutually exclusive on one element. */
type Group = 'text' | 'emphasis';

interface TreatmentInit {
  element: HTMLElement;
  group: Group;
  reduced: boolean;
  /** Applies the visual end state. Must be safe to call more than once. */
  final: () => void;
  /** The tween, if one is running. */
  tween?: gsap.core.Tween | null;
  /** Extra teardown for restore() — generated chrome, frozen boxes, styles. */
  undo?: (() => void) | null;
  /** Whether this treatment created the element's split and so owns it. */
  owned?: boolean;
}

const liveTreatments = new Set<Treatment>();
const activeByElement = new WeakMap<HTMLElement, Map<Group, Treatment>>();

class Treatment implements TypeMotionHandle {
  readonly element: HTMLElement;
  readonly reduced: boolean;
  readonly finished: Promise<void>;

  private readonly group: Group;
  private readonly final: () => void;
  private readonly undo: (() => void) | null;
  private readonly owned: boolean;
  private tween: gsap.core.Tween | null;
  private settle: () => void = () => {};
  private state: 'running' | 'done' | 'restored' = 'running';

  constructor(init: TreatmentInit) {
    this.element = init.element;
    this.group = init.group;
    this.reduced = init.reduced;
    this.final = init.final;
    this.tween = init.tween ?? null;
    this.undo = init.undo ?? null;
    this.owned = init.owned ?? false;

    this.finished = new Promise<void>((resolve) => {
      this.settle = resolve;
    });

    if (this.tween) {
      liveTreatments.add(this);
      let slots = activeByElement.get(this.element);
      if (!slots) {
        slots = new Map<Group, Treatment>();
        activeByElement.set(this.element, slots);
      }
      slots.set(this.group, this);
    } else {
      this.state = 'done';
      this.settle();
    }
  }

  play(): void {
    if (this.state === 'running' && this.tween) this.tween.play();
  }

  finish(): void {
    if (this.state !== 'running') return;
    this.state = 'done';
    if (this.tween) {
      this.tween.kill();
      this.tween = null;
    }
    safeCall(this.final);
    this.unregister();
    this.settle();
  }

  /** Kill is finish: stopping halfway would be the one thing that leaves text hidden. */
  kill(): void {
    this.finish();
  }

  restore(): void {
    if (this.state === 'restored') return;
    this.finish();
    this.state = 'restored';
    if (this.undo) safeCall(this.undo);
    if (this.owned) safeCall(() => unsplit(this.element));
  }

  private unregister(): void {
    liveTreatments.delete(this);
    const slots = activeByElement.get(this.element);
    if (slots && slots.get(this.group) === this) slots.delete(this.group);
  }
}

function finishAllLive(): void {
  for (const treatment of Array.from(liveTreatments)) treatment.finish();
}

/** Kill whatever is already running in this group on this element. */
function preempt(el: HTMLElement, group: Group): void {
  const slots = activeByElement.get(el);
  const running = slots?.get(group);
  if (running) running.finish();
}

function safeCall(fn: () => void): void {
  try {
    fn();
  } catch (err) {
    warn('teardown failed', err);
  }
}

function warn(message: string, err?: unknown): void {
  if (typeof console !== 'undefined') console.warn(`[type-motion] ${message}`, err ?? '');
}

/**
 * Wraps a treatment so a throw can never leave the element split, empty or
 * invisible. On failure the element is restored to its original nodes and an
 * inert handle is returned, so callers need no error path of their own.
 */
function guarded(el: HTMLElement, group: Group, run: () => TypeMotionHandle): TypeMotionHandle {
  try {
    return run();
  } catch (err) {
    warn('treatment failed; element restored', err);
    safeCall(() => unsplit(el));
    safeCall(() => {
      gsap.killTweensOf(el);
      gsap.set(el, { opacity: 1, visibility: 'visible' });
    });
    return new Treatment({ element: el, group, reduced: prefersReducedMotion(), final: () => {} });
  }
}

/** A handle for the reduced-motion path: nothing running, nothing to undo. */
function staticHandle(
  el: HTMLElement,
  group: Group,
  undo?: (() => void) | null,
  owned = false,
): TypeMotionHandle {
  return new Treatment({
    element: el,
    group,
    reduced: true,
    final: () => {},
    undo: undo ?? null,
    owned,
  });
}

/* ==================================================================
   Splitting — non-destructive and reversible
   ================================================================== */

type SplitKind = 'lines' | 'chars';

interface SplitRecord {
  kind: SplitKind;
  /** The original string, newline-separated at hard breaks. */
  text: string;
  /** The element's own child nodes, detached and held for restore(). */
  original: DocumentFragment | null;
  /** The nodes a treatment animates: line inners, or characters. */
  parts: HTMLElement[];
  /** The boxes that hold them: line masks, or word wrappers. */
  containers: HTMLElement[];
  /** True when the split was authored in the markup and is not ours to undo. */
  adopted: boolean;
  prevAriaLabel: string | null;
}

const splits = new WeakMap<HTMLElement, SplitRecord>();

const SR_ONLY =
  'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;' +
  'clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0;';

/** Reads an element's text with `<br>` preserved as a newline, whitespace collapsed. */
function readText(el: HTMLElement): string {
  let raw = '';
  const walk = (node: Node): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        raw += child.nodeValue ?? '';
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const tag = (child as Element).tagName;
        if (tag === 'BR') raw += '\n';
        else walk(child);
      }
    }
  };
  walk(el);
  return raw
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
}

function makeSpan(className: string, cssText: string): HTMLSpanElement {
  const span = document.createElement('span');
  if (className) span.className = className;
  span.style.cssText = cssText;
  return span;
}

/**
 * Roles that take a name from the author. `aria-label` is *prohibited* on the
 * generic roles — `span`, `div`, `p` — which is most of what a designer wants
 * to split, so those elements need the mirror below as well as the label.
 */
const NAMEABLE = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BUTTON', 'LI', 'TD', 'TH', 'SUMMARY']);

function takesAriaLabel(el: HTMLElement): boolean {
  if (el.hasAttribute('role')) return true;
  if (el.tagName === 'A') return el.hasAttribute('href');
  return NAMEABLE.has(el.tagName);
}

/** The visually-hidden copy that keeps the string reachable whatever the role. */
function mirror(text: string): HTMLSpanElement {
  const span = makeSpan('', SR_ONLY);
  span.setAttribute('data-type-motion-sr', '');
  span.textContent = text.replace(/\n/g, ' ');
  return span;
}

/**
 * Marks the element as split for assistive tech.
 *
 * `aria-label` goes on unconditionally, and on a heading, button, link or
 * list item that is the whole story: the label replaces the contents, and the
 * split spans below it are all aria-hidden.
 *
 * On a `<p>` or `<span>` the label is *prohibited* by the role and silently
 * ignored, which would leave the element with nothing readable at all — so
 * those, and only those, also get a clipped mirror node carrying the string,
 * which is the one generated child not marked aria-hidden. Exactly one of the
 * two is ever announced, never both. The cost is that `el.textContent` on such
 * an element reads doubled while it is split; `unsplit()` ends that, and it is
 * why the mirror is not added where the label alone does the job.
 */
function labelSplit(el: HTMLElement, record: SplitRecord): void {
  const label = record.text.replace(/\n/g, ' ');
  record.prevAriaLabel = el.getAttribute('aria-label');
  if (label) el.setAttribute('aria-label', label);
  el.setAttribute('data-type-motion', record.kind);
}

function unlabelSplit(el: HTMLElement, record: SplitRecord): void {
  if (record.prevAriaLabel === null) el.removeAttribute('aria-label');
  else el.setAttribute('aria-label', record.prevAriaLabel);
  el.removeAttribute('data-type-motion');
}

/** Splits `text` into word spans laid into `el`, so their rects can be read. */
function layMeasuringWords(el: HTMLElement, text: string): HTMLSpanElement[] {
  const words: HTMLSpanElement[] = [];
  const segments = text.split('\n');

  segments.forEach((segment, index) => {
    if (index > 0) el.appendChild(document.createElement('br'));
    const tokens = segment.split(' ').filter((t) => t.length > 0);
    tokens.forEach((token, i) => {
      if (i > 0) el.appendChild(document.createTextNode(' '));
      const span = document.createElement('span');
      span.textContent = token;
      el.appendChild(span);
      words.push(span);
    });
  });

  return words;
}

/** Groups measured word spans into visual lines by their top edge. */
function groupIntoLines(words: HTMLSpanElement[]): string[] {
  const lines: string[] = [];
  let current: string[] = [];
  let top = Number.NaN;

  for (const word of words) {
    const rects = word.getClientRects();
    const rect = rects.length > 0 ? rects[0]! : word.getBoundingClientRect();
    if (Number.isNaN(top) || Math.abs(rect.top - top) > 1) {
      if (current.length > 0) lines.push(current.join(' '));
      current = [];
      top = rect.top;
    }
    current.push(word.textContent ?? '');
  }
  if (current.length > 0) lines.push(current.join(' '));
  return lines;
}

interface LineClassNames {
  lineClass: string;
  innerClass: string;
}

/**
 * Splits into the site's masked-line pair. If the markup already carries that
 * pair (as the stage panels do, server-rendered), it is adopted rather than
 * rebuilt — so this is a drop-in for the hand-rolled reveal it replaces.
 */
function splitLines(el: HTMLElement, names: LineClassNames): SplitRecord {
  const existing = splits.get(el);
  if (existing && existing.kind === 'lines') return existing;
  if (existing) unsplit(el);

  const authored = Array.from(el.querySelectorAll<HTMLElement>(`.${names.innerClass}`));
  if (authored.length > 0) {
    const record: SplitRecord = {
      kind: 'lines',
      text: readText(el),
      original: null,
      parts: authored,
      containers: authored.map((p) => (p.parentElement ?? p) as HTMLElement),
      adopted: true,
      prevAriaLabel: el.getAttribute('aria-label'),
    };
    splits.set(el, record);
    return record;
  }

  const text = readText(el);
  const original = document.createDocumentFragment();
  while (el.firstChild) original.appendChild(el.firstChild);

  try {
    const measuring = layMeasuringWords(el, text);
    const rendered = el.getClientRects().length > 0;
    const lines = rendered && measuring.length > 0 ? groupIntoLines(measuring) : text.split('\n');

    el.textContent = '';
    const parts: HTMLElement[] = [];
    const containers: HTMLElement[] = [];

    for (const line of lines) {
      const mask = makeSpan(names.lineClass, 'display:block;overflow:hidden;');
      const inner = makeSpan(names.innerClass, 'display:block;will-change:transform;');
      inner.textContent = line;
      mask.appendChild(inner);
      mask.setAttribute('aria-hidden', 'true');
      el.appendChild(mask);
      containers.push(mask);
      parts.push(inner);
    }

    if (!takesAriaLabel(el)) el.appendChild(mirror(text));

    const record: SplitRecord = {
      kind: 'lines',
      text,
      original,
      parts,
      containers,
      adopted: false,
      prevAriaLabel: null,
    };
    labelSplit(el, record);
    splits.set(el, record);
    return record;
  } catch (err) {
    // Put the real nodes back before anyone can see the gap.
    el.textContent = '';
    el.appendChild(original);
    throw err;
  }
}

/** Splits into per-character spans, with word wrappers so wrapping is unchanged. */
function splitChars(el: HTMLElement): SplitRecord {
  const existing = splits.get(el);
  if (existing && existing.kind === 'chars') return existing;
  if (existing) unsplit(el);

  const text = readText(el);
  const original = document.createDocumentFragment();
  while (el.firstChild) original.appendChild(el.firstChild);

  try {
    const parts: HTMLElement[] = [];
    const containers: HTMLElement[] = [];
    const segments = text.split('\n');

    segments.forEach((segment, index) => {
      if (index > 0) {
        const br = document.createElement('br');
        br.setAttribute('aria-hidden', 'true');
        el.appendChild(br);
      }
      const tokens = segment.split(' ').filter((t) => t.length > 0);
      tokens.forEach((token, i) => {
        if (i > 0) el.appendChild(document.createTextNode(' '));
        // inline-block + nowrap: characters are inline-block, which would
        // otherwise let the line break inside a word.
        const word = makeSpan('tm-word', 'display:inline-block;white-space:nowrap;');
        word.setAttribute('aria-hidden', 'true');
        for (const ch of Array.from(token)) {
          const glyph = makeSpan('tm-char', 'display:inline-block;will-change:transform;');
          glyph.textContent = ch;
          word.appendChild(glyph);
          parts.push(glyph);
        }
        el.appendChild(word);
        containers.push(word);
      });
    });

    if (!takesAriaLabel(el)) el.appendChild(mirror(text));

    const record: SplitRecord = {
      kind: 'chars',
      text,
      original,
      parts,
      containers,
      adopted: false,
      prevAriaLabel: null,
    };
    labelSplit(el, record);
    splits.set(el, record);
    return record;
  } catch (err) {
    el.textContent = '';
    el.appendChild(original);
    throw err;
  }
}

/**
 * Puts an element back the way it was found: the original child nodes (the
 * same nodes, not clones), the original aria state, no leftover inline styles
 * on anything we made. Safe to call on an element that was never split.
 */
export function unsplit(el: HTMLElement): void {
  const record = splits.get(el);
  if (!record) return;
  splits.delete(el);

  gsap.killTweensOf(record.parts);

  if (record.adopted) {
    // Not ours: leave the authored markup exactly where it is, just drop the
    // inline transform/opacity the tween left behind. GSAP 3 writes the
    // individual `translate`/`rotate`/`scale` properties as well as
    // `transform`, and leaves an empty style attribute behind either way.
    gsap.set(record.parts, {
      clearProps: 'transform,translate,rotate,scale,opacity,willChange',
    });
    record.parts.forEach(tidyStyle);
    return;
  }

  unlabelSplit(el, record);
  el.textContent = '';
  if (record.original) el.appendChild(record.original);
}

/** Drops a style attribute GSAP emptied, so the markup reads as it was authored. */
function tidyStyle(node: HTMLElement): void {
  if (node.getAttribute('style') === '') node.removeAttribute('style');
}

/** Whether an element currently carries a split of ours. */
export function isSplit(el: HTMLElement): boolean {
  return splits.has(el);
}

/** Under reduce, make sure nothing a caller pre-hid is left invisible. */
function ensureVisible(el: HTMLElement): void {
  const record = splits.get(el);
  if (record) gsap.set(record.parts, { yPercent: 0, opacity: 1, clearProps: 'willChange' });
  gsap.set(el, { opacity: 1, visibility: 'visible' });
}

/* ==================================================================
   Shared options
   ================================================================== */

/** Timing shared by the reveal treatments. */
export interface MotionOptions {
  /** Seconds per part. */
  duration?: number;
  /** Seconds before the first part moves. */
  delay?: number;
  /** Seconds between parts. */
  stagger?: number;
  /** Any GSAP ease string. */
  ease?: string;
  /** Create the tween paused; call `play()` on the handle to start it. */
  paused?: boolean;
  /** Fires once the last part lands (and immediately under reduced motion). */
  onComplete?: () => void;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/* ==================================================================
   1. revealLines — the masked per-line rise
   ================================================================== */

export interface RevealLinesOptions extends MotionOptions {
  /** Start offset as a percentage of line height. Default 115 — a full mask. */
  y?: number;
  /** Opacity the lines start from. Default 0. */
  opacityFrom?: number;
  /** Class on the generated mask. Default 'line', matching global.css. */
  lineClass?: string;
  /** Class on the generated inner. Default 'line__inner'. */
  innerClass?: string;
}

const LINE_DEFAULTS = {
  duration: 0.65,
  delay: 0.15,
  stagger: 0.075,
  ease: 'power2.out',
  y: 115,
  opacityFrom: 0,
  lineClass: 'line',
  innerClass: 'line__inner',
  paused: false,
} as const;

/**
 * The workhorse: each line rides up out of an `overflow: hidden` mask.
 *
 * yPercent 115 → 0 with opacity, `power2.out`, 0.65s, 0.075s stagger. Those
 * are the reference's numbers, not ours: power2.out is its default gesture by
 * a wide margin and 0.65s is the long end of its UI band. It reads gentler and
 * shorter than the 1.15s `expo.out` this used to run — an expo arrives almost
 * all at once and then crawls, which is what made our chrome feel snappier and
 * more aggressive than the site it is modelled on.
 *
 * It adopts the `.line > .line__inner` pair when the markup already provides
 * it, so it can be swapped in without touching a template.
 */
export function revealLines(el: HTMLElement, opts: RevealLinesOptions = {}): TypeMotionHandle {
  return guarded(el, 'text', () => {
    const o = { ...LINE_DEFAULTS, ...opts };
    preempt(el, 'text');

    if (prefersReducedMotion()) {
      // Nothing gets split that was not already. Markup that ships the mask
      // pair — or an element left split by an earlier call — still has to be
      // put into the end state, because something (boot, CSS) may be holding
      // it hidden; anything else is simply left as the server wrote it.
      const authored = el.querySelector(`.${o.innerClass}`);
      if (authored || isSplit(el)) {
        const held = splitLines(el, { lineClass: o.lineClass, innerClass: o.innerClass });
        gsap.set(held.parts, { yPercent: 0, opacity: 1, clearProps: 'willChange' });
        o.onComplete?.();
        return staticHandle(el, 'text', null, true);
      }
      gsap.set(el, { opacity: 1, visibility: 'visible' });
      o.onComplete?.();
      return staticHandle(el, 'text', () => gsap.set(el, { clearProps: 'opacity,visibility' }));
    }

    const record = splitLines(el, { lineClass: o.lineClass, innerClass: o.innerClass });
    const parts = record.parts;
    const final = (): void => {
      gsap.set(parts, { yPercent: 0, opacity: 1, clearProps: 'willChange' });
      o.onComplete?.();
    };

    const tween = gsap.fromTo(
      parts,
      { yPercent: o.y, opacity: o.opacityFrom },
      {
        yPercent: 0,
        opacity: 1,
        duration: o.duration,
        delay: o.delay,
        ease: o.ease,
        stagger: o.stagger,
        paused: o.paused,
        // GSAP defers a tween's first render to the end of the tick by
        // default. On a delayed reveal that shows one frame of the *finished*
        // headline before it drops back into the mask, so: render now.
        immediateRender: true,
        lazy: false,
        onComplete: final,
      },
    );

    return new Treatment({
      element: el,
      group: 'text',
      reduced: false,
      final,
      tween,
      // Always "owned": for an adopted split unsplit() only strips the inline
      // props the tween left on the authored markup, which is exactly the
      // cleanup restore() should do.
      owned: true,
    });
  });
}

/* ==================================================================
   2. revealChars — per-character arrival
   ================================================================== */

/** Where the character stagger starts from. */
export type CharOrigin = 'start' | 'end' | 'center' | 'edges' | 'random';

export interface RevealCharsOptions extends MotionOptions {
  /** Stagger origin. Default 'start'. */
  from?: CharOrigin;
  /** Start offset, percentage of the character's own height. Default 90. */
  y?: number;
  /** Start rotation in degrees. Default 0. */
  rotate?: number;
  /** Start scale. Default 1. */
  scale?: number;
  /** Opacity the characters start from. Default 0. */
  opacityFrom?: number;
}

const CHAR_DEFAULTS = {
  duration: 0.5,
  delay: 0,
  stagger: 0.024,
  ease: 'power2.out',
  from: 'start' as CharOrigin,
  y: 90,
  rotate: 0,
  scale: 1,
  opacityFrom: 0,
  paused: false,
} as const;

/**
 * Characters arrive one by one. Use it on a short display line — a word, a
 * figure, a two-word headline — where the line rise reads as too polite.
 *
 * `power2.out` at 0.5s: shorter than the line rise because a stagger of a
 * couple of dozen characters is already carrying the length.
 */
export function revealChars(el: HTMLElement, opts: RevealCharsOptions = {}): TypeMotionHandle {
  return guarded(el, 'text', () => {
    const o = { ...CHAR_DEFAULTS, ...opts };
    preempt(el, 'text');

    // Under reduce the split is pure decoration, so it is not performed at all
    // and the element keeps its own untouched text nodes — including one left
    // split by an earlier call made before the preference changed.
    if (prefersReducedMotion()) {
      unsplit(el);
      ensureVisible(el);
      o.onComplete?.();
      return staticHandle(el, 'text', () => gsap.set(el, { clearProps: 'opacity,visibility' }));
    }

    const record = splitChars(el);
    const parts = record.parts;
    const final = (): void => {
      gsap.set(parts, {
        yPercent: 0,
        rotate: 0,
        scale: 1,
        opacity: 1,
        clearProps: 'willChange',
      });
      o.onComplete?.();
    };

    const tween = gsap.fromTo(
      parts,
      { yPercent: o.y, rotate: o.rotate, scale: o.scale, opacity: o.opacityFrom },
      {
        yPercent: 0,
        rotate: 0,
        scale: 1,
        opacity: 1,
        duration: o.duration,
        delay: o.delay,
        ease: o.ease,
        stagger: { each: o.stagger, from: o.from },
        paused: o.paused,
        immediateRender: true,
        lazy: false,
        onComplete: final,
      },
    );

    return new Treatment({ element: el, group: 'text', reduced: false, final, tween, owned: true });
  });
}

/* ==================================================================
   3. scramble — the mono label settling
   ================================================================== */

export interface ScrambleOptions {
  /** Glyph pool cycled through before a character settles. */
  chars?: string;
  /** Seconds for the whole label to settle. Default 0.65. */
  duration?: number;
  /** Seconds before it starts. Default 0. */
  delay?: number;
  /** Milliseconds a decoy glyph is held before it is re-rolled. Default 42. */
  tick?: number;
  /** Ease over the settling front. Default 'power2.out'. */
  ease?: string;
  /** Order characters settle in. Default 'start'. */
  from?: CharOrigin;
  /** How ragged the settling front is, 0–1. Default 0.22. */
  spread?: number;
  /** Match the pool's case to the character being replaced. Default true. */
  matchCase?: boolean;
  /** Create the tween paused. */
  paused?: boolean;
  onComplete?: () => void;
}

const SCRAMBLE_DEFAULTS = {
  chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/\\<>[]=+*#%',
  duration: 0.65,
  delay: 0,
  tick: 42,
  ease: 'power2.out',
  from: 'start' as CharOrigin,
  spread: 0.22,
  matchCase: true,
  paused: false,
} as const;

/** Reveal order for `n` characters, as indices into the character list. */
function orderFor(n: number, from: CharOrigin): number[] {
  const order = new Array<number>(n);
  const mid = (n - 1) / 2;
  for (let i = 0; i < n; i += 1) {
    switch (from) {
      case 'end':
        order[i] = n - 1 - i;
        break;
      case 'center':
        order[i] = Math.abs(i - mid);
        break;
      case 'edges':
        order[i] = mid - Math.abs(i - mid);
        break;
      case 'random':
        order[i] = Math.random() * n;
        break;
      default:
        order[i] = i;
    }
  }
  const max = Math.max(1, ...order);
  return order.map((v) => v / max);
}

/**
 * The terminal settle: every character cycles through a glyph pool and then
 * locks to its real value, front-to-back. Built for the 10px wide-tracked mono
 * labels — `SITE 01 · MEAD, OKLAHOMA` reads as a readout coming online.
 *
 * This writes text, which is the effect, so each character's box is frozen at
 * its measured width first and the label cannot jitter as glyphs change.
 */
export function scramble(el: HTMLElement, opts: ScrambleOptions = {}): TypeMotionHandle {
  return guarded(el, 'text', () => {
    const o = { ...SCRAMBLE_DEFAULTS, ...opts };
    preempt(el, 'text');

    if (prefersReducedMotion()) {
      unsplit(el);
      ensureVisible(el);
      o.onComplete?.();
      return staticHandle(el, 'text', () => gsap.set(el, { clearProps: 'opacity,visibility' }));
    }

    const record = splitChars(el);
    const parts = record.parts;
    const n = parts.length;
    if (n === 0) {
      o.onComplete?.();
      return staticHandle(el, 'text');
    }

    const finals = parts.map((p) => p.textContent ?? '');

    // Read every width in one pass, then write — no layout thrash, and no
    // reflow once the glyphs start changing under the real ones.
    const widths = parts.map((p) => p.getBoundingClientRect().width);
    parts.forEach((p, i) => {
      const w = widths[i] ?? 0;
      if (w > 0) {
        p.style.minWidth = `${w.toFixed(2)}px`;
        p.style.textAlign = 'center';
      }
    });

    const pool = o.chars.length > 0 ? o.chars : SCRAMBLE_DEFAULTS.chars;
    const upper = pool.toUpperCase();
    const lower = pool.toLowerCase();
    const base = orderFor(n, o.from);
    const spread = clamp01(o.spread);
    const thresholds = base.map((b) =>
      clamp01(b * (1 - spread) + spread * 0.5 + (Math.random() - 0.5) * spread),
    );
    const settled = new Array<boolean>(n).fill(false);

    const decoy = (index: number): string => {
      const real = finals[index] ?? '';
      const set = !o.matchCase ? pool : real === real.toLowerCase() && real !== real.toUpperCase() ? lower : upper;
      return set.charAt(Math.floor(Math.random() * set.length)) || real;
    };

    const state = { p: 0 };
    let last = -Infinity;

    const paint = (force: boolean): void => {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const due = force || now - last >= o.tick;
      let changed = false;
      for (let i = 0; i < n; i += 1) {
        const part = parts[i];
        if (!part) continue;
        const real = finals[i] ?? '';
        const isSettled = state.p >= (thresholds[i] ?? 1);
        if (isSettled) {
          if (!settled[i]) {
            settled[i] = true;
            part.textContent = real;
            changed = true;
          }
          continue;
        }
        // Whitespace and punctuation-free spacing stay put; only real glyphs cycle.
        if (real.trim().length === 0) continue;
        if (due) {
          part.textContent = decoy(i);
          changed = true;
        }
      }
      if (due && changed) last = now;
    };

    const final = (): void => {
      parts.forEach((p, i) => {
        p.textContent = finals[i] ?? '';
        p.style.minWidth = '';
        p.style.textAlign = '';
        p.style.willChange = '';
      });
      o.onComplete?.();
    };

    paint(true);

    const tween = gsap.to(state, {
      p: 1,
      duration: o.duration,
      delay: o.delay,
      ease: o.ease,
      paused: o.paused,
      onUpdate: () => paint(false),
      onComplete: final,
    });

    return new Treatment({ element: el, group: 'text', reduced: false, final, tween, owned: true });
  });
}

/* ==================================================================
   4. countUp — figures that roll
   ================================================================== */

export interface CountUpOptions {
  /** Start value. Default 0. */
  from?: number;
  /** End value. Default: the number already in the element. */
  to?: number;
  /** Seconds. Default 0.8. */
  duration?: number;
  /** Seconds before it starts. Default 0. */
  delay?: number;
  /** Default 'power2.out'. */
  ease?: string;
  /** Decimal places. Default: as many as the element's own text carries. */
  decimals?: number;
  /** Thousands grouping. Default: whatever the element's text uses. */
  group?: boolean;
  /** Locale for grouping. Default: the browser's. */
  locale?: string;
  /** Text before the number. Default: parsed from the element. */
  prefix?: string;
  /** Text after the number. Default: parsed from the element. */
  suffix?: string;
  /** Full control of the printed string; overrides decimals/group/prefix/suffix. */
  format?: (value: number) => string;
  /** Create the tween paused. */
  paused?: boolean;
  onComplete?: () => void;
}

interface ParsedFigure {
  value: number;
  decimals: number;
  group: boolean;
  prefix: string;
  suffix: string;
}

/** Pulls the figure out of text like `114 kW`, `$1,250.50`, `99.9%`. */
function parseFigure(text: string): ParsedFigure | null {
  const match = /^(\D*?)([-+]?\d[\d,  ]*(?:\.\d+)?)(.*)$/s.exec(text);
  if (!match) return null;
  const digits = (match[2] ?? '').replace(/[,  ]/g, '');
  const value = Number(digits);
  if (!Number.isFinite(value)) return null;
  const dot = digits.indexOf('.');
  return {
    value,
    decimals: dot === -1 ? 0 : digits.length - dot - 1,
    group: /[,  ]/.test(match[2] ?? ''),
    prefix: match[1] ?? '',
    suffix: match[3] ?? '',
  };
}

/**
 * Rolls a figure to its value.
 *
 * The element's own text is the source of truth for the target, the decimals,
 * the grouping and the units, so a figure animates correctly with no options
 * at all — and the end state is exactly the string the server rendered.
 *
 * The box is frozen at the width of the *widest* string the count will print
 * before the first digit changes, so nothing around it reflows mid-count.
 */
export function countUp(el: HTMLElement, opts: CountUpOptions = {}): TypeMotionHandle {
  return guarded(el, 'text', () => {
    preempt(el, 'text');

    const originalText = el.textContent ?? '';
    const parsed = parseFigure(originalText.trim());
    const to = opts.to ?? parsed?.value;

    if (to === undefined || !Number.isFinite(to)) {
      opts.onComplete?.();
      return staticHandle(el, 'text');
    }

    const from = opts.from ?? 0;
    const decimals = opts.decimals ?? parsed?.decimals ?? 0;
    const group = opts.group ?? parsed?.group ?? false;
    const prefix = opts.prefix ?? parsed?.prefix ?? '';
    const suffix = opts.suffix ?? parsed?.suffix ?? '';

    const format =
      opts.format ??
      ((value: number): string => {
        const body = group
          ? value.toLocaleString(opts.locale, {
              minimumFractionDigits: decimals,
              maximumFractionDigits: decimals,
            })
          : value.toFixed(decimals);
        return `${prefix}${body}${suffix}`;
      });

    const endText = format(to);
    const final = (): void => {
      el.textContent = endText;
      opts.onComplete?.();
    };

    if (prefersReducedMotion()) {
      final();
      return staticHandle(el, 'text', () => {
        el.textContent = originalText;
      });
    }

    // --- Freeze the box -------------------------------------------------
    // Measure the end string and the start string, take the larger, and pin
    // it before a single digit changes.
    const prevDisplay = el.style.display;
    const prevMinWidth = el.style.minWidth;
    const prevMinHeight = el.style.minHeight;
    let frozen = false;

    try {
      const startText = format(from);
      el.textContent = endText;
      const endBox = el.getBoundingClientRect();
      el.textContent = startText;
      const startBox = el.getBoundingClientRect();
      const width = Math.max(endBox.width, startBox.width);
      const height = Math.max(endBox.height, startBox.height);

      if (width > 0) {
        if (getComputedStyle(el).display === 'inline') el.style.display = 'inline-block';
        el.style.minWidth = `${Math.ceil(width)}px`;
        el.style.minHeight = `${Math.ceil(height)}px`;
        frozen = true;
      }
    } catch (err) {
      el.textContent = originalText;
      throw err;
    }

    const unfreeze = (): void => {
      if (!frozen) return;
      el.style.display = prevDisplay;
      el.style.minWidth = prevMinWidth;
      el.style.minHeight = prevMinHeight;
    };

    const state = { value: from };
    const tween = gsap.to(state, {
      value: to,
      // 0.8s is the top of the reference's band, kept rather than shortened
      // further: a figure has to be legible on the way up, not just at rest.
      duration: opts.duration ?? 0.8,
      delay: opts.delay ?? 0,
      ease: opts.ease ?? 'power2.out',
      paused: opts.paused ?? false,
      onUpdate: () => {
        el.textContent = format(state.value);
      },
      onComplete: final,
    });

    return new Treatment({
      element: el,
      group: 'text',
      reduced: false,
      final,
      tween,
      undo: () => {
        unfreeze();
        el.textContent = originalText;
      },
    });
  });
}

/* ==================================================================
   5. emphasis — one word, breathing
   ================================================================== */

/**
 * 'breathe' — a slow scale and opacity swell. Transform and opacity only, so
 *             it is safe on anything, and it is the default.
 * 'weight'  — an optical weight shift. Needs a variable face; opt in.
 * 'sheen'   — a highlight drifting across the word, clipped to its box and
 *             driven by transform.
 */
export type EmphasisMode = 'breathe' | 'weight' | 'sheen';

export interface EmphasisOptions {
  mode?: EmphasisMode;
  /** Seconds for one half-cycle (breathe/weight) or one pass (sheen). */
  duration?: number;
  /** Seconds before it starts. Default 0. */
  delay?: number;
  /** Default 'sine.inOut' (breathe/weight), 'power2.inOut' (sheen). */
  ease?: string;
  /** Repeats. -1 for forever, which is the default. */
  repeat?: number;
  /** breathe: peak scale. Default 1.014. */
  scale?: number;
  /** breathe: dimmest opacity. Default 0.86. */
  opacity?: number;
  /** breathe: transform origin. Default '50% 62%' — the optical centre of type. */
  origin?: string;
  /** weight: [from, to] `wght` axis. Default: the computed weight, +200. */
  weight?: [number, number];
  /** weight: [from, to] `opsz` axis. Omitted by default. */
  opticalSize?: [number, number];
  /** sheen: any CSS colour. Default 'currentColor'. */
  sheenColor?: string;
  /** sheen: peak opacity of the band. Default 0.18. */
  sheenOpacity?: number;
  /** sheen: band width as a fraction of the box. Default 0.3. */
  sheenWidth?: number;
  /** sheen: seconds of stillness between passes. Default 3.5. */
  interval?: number;
}

/**
 * A continuous, low-amplitude treatment for a single word or figure — the one
 * word in a headline that should feel alive without ever pulling the eye off
 * the sentence. Amplitudes are deliberately small; this is a breath, not a
 * pulse. Under reduced motion it does nothing at all and the word stands as
 * typeset.
 */
export function emphasis(el: HTMLElement, opts: EmphasisOptions = {}): TypeMotionHandle {
  return guarded(el, 'emphasis', () => {
    const mode: EmphasisMode = opts.mode ?? 'breathe';
    preempt(el, 'emphasis');

    if (prefersReducedMotion()) return staticHandle(el, 'emphasis');

    const repeat = opts.repeat ?? -1;
    const delay = opts.delay ?? 0;

    if (mode === 'weight') {
      const computed = getComputedStyle(el);
      const current = Number.parseFloat(computed.fontWeight) || 400;
      const [w0, w1] = opts.weight ?? [current, Math.min(900, current + 200)];
      const opsz = opts.opticalSize;
      const prev = el.style.fontVariationSettings;
      const state = { w: w0, o: opsz ? opsz[0] : 0 };

      const write = (): void => {
        const axes = [`'wght' ${state.w.toFixed(1)}`];
        if (opsz) axes.push(`'opsz' ${state.o.toFixed(1)}`);
        el.style.fontVariationSettings = axes.join(', ');
      };
      write();

      const tween = gsap.to(state, {
        w: w1,
        o: opsz ? opsz[1] : 0,
        // Ambient, so it takes the reference's scene-scale end: 3.5s.
        duration: opts.duration ?? 3.5,
        delay,
        ease: opts.ease ?? 'sine.inOut',
        repeat,
        yoyo: true,
        onUpdate: write,
      });

      return new Treatment({
        element: el,
        group: 'emphasis',
        reduced: false,
        final: () => {},
        tween,
        undo: () => {
          el.style.fontVariationSettings = prev;
        },
      });
    }

    if (mode === 'sheen') {
      const prevPosition = el.style.position;
      const prevDisplay = el.style.display;
      const computed = getComputedStyle(el);
      if (computed.position === 'static') el.style.position = 'relative';
      if (computed.display === 'inline') el.style.display = 'inline-block';

      const width = clamp01(opts.sheenWidth ?? 0.3);
      const colour = opts.sheenColor ?? 'currentColor';
      const alpha = opts.sheenOpacity ?? 0.18;

      // The clip lives on the frame, so the band can be translated freely
      // without ever painting outside the word.
      const frame = makeSpan(
        'tm-sheen',
        'position:absolute;inset:0;overflow:hidden;pointer-events:none;',
      );
      frame.setAttribute('aria-hidden', 'true');
      const band = makeSpan(
        'tm-sheen__band',
        `position:absolute;top:0;bottom:0;left:0;width:${(width * 100).toFixed(1)}%;` +
          `background:linear-gradient(100deg, transparent 0%, ${colour} 50%, transparent 100%);` +
          `opacity:${alpha};will-change:transform;`,
      );
      frame.appendChild(band);
      el.appendChild(frame);

      const travel = 100 / width + 20;
      const tween = gsap.fromTo(
        band,
        { xPercent: -travel },
        {
          xPercent: travel,
          duration: opts.duration ?? 1,
          delay,
          ease: opts.ease ?? 'power2.inOut',
          repeat,
          repeatDelay: opts.interval ?? 3.5,
        },
      );

      return new Treatment({
        element: el,
        group: 'emphasis',
        reduced: false,
        final: () => {},
        tween,
        undo: () => {
          frame.remove();
          el.style.position = prevPosition;
          el.style.display = prevDisplay;
        },
      });
    }

    // breathe
    const prevDisplay = el.style.display;
    const prevOrigin = el.style.transformOrigin;
    if (getComputedStyle(el).display === 'inline') el.style.display = 'inline-block';
    el.style.transformOrigin = opts.origin ?? '50% 62%';

    const tween = gsap.to(el, {
      scale: opts.scale ?? 1.014,
      opacity: opts.opacity ?? 0.86,
      duration: opts.duration ?? 2,
      delay,
      ease: opts.ease ?? 'sine.inOut',
      repeat,
      yoyo: true,
    });

    return new Treatment({
      element: el,
      group: 'emphasis',
      reduced: false,
      final: () => {
        gsap.set(el, { scale: 1, opacity: 1 });
      },
      tween,
      undo: () => {
        gsap.set(el, { clearProps: 'transform,opacity' });
        el.style.display = prevDisplay;
        el.style.transformOrigin = prevOrigin;
      },
    });
  });
}

/* ==================================================================
   Convenience
   ================================================================== */

/** The treatments, by the name a `data-` attribute would use. */
export const treatments = {
  lines: revealLines,
  chars: revealChars,
  scramble,
  count: countUp,
  emphasis,
} as const;

/**
 * Kills and restores every treatment currently running. Useful on route
 * teardown, or from a console when something has gone wrong.
 */
export function restoreAll(): void {
  for (const treatment of Array.from(liveTreatments)) treatment.restore();
}
