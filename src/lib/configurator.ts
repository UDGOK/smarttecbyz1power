/**
 * Deployment configurator.
 *
 * One question on screen at a time. Answering it clears the outgoing question
 * with intent — the discarded cards fall, the prompt is pulled up out of its own
 * mask — while the chosen card flies into the summary strip and the next
 * question rises in behind it. A running readout counts to the new estimate,
 * reacts when an answer changes the answer materially, and the fifth answer
 * lands the recommendation as a slab rather than another panel.
 *
 * The whole thing is progressive enhancement over server-rendered markup: every
 * question, every card and the static fallback are already in the HTML, so with
 * the script blocked the page still reads as a spec sheet. Under
 * `prefers-reduced-motion` every animation below is skipped — panels swap
 * instantly, counters jump, nothing flies — and the flow is unchanged.
 *
 * All sizing rules live in `src/data/configurator.ts`. Nothing numeric is
 * decided in here beyond arithmetic and rounding.
 */

import gsap from 'gsap';
import { CustomEase } from 'gsap/CustomEase';
import { prefersReducedMotion } from './hold-button';
import {
  assumptions,
  envelope,
  fitLevels,
  questions,
  rules,
  type ConfiguratorOption,
  type ConfiguratorQuestion,
  type FitCopy,
  type FitLevel,
  type QuestionId,
} from '../data/configurator';

/**
 * The reference's motion vocabulary, adopted wholesale.
 *
 * `power2.out` is its workhorse — 28 of the eases in its bundle, against three
 * for `power3.out` and none at all for `expo.out` — and its gestures sit
 * between 0.3s and 0.65s. `osmoNav` is its signature curve, the CustomEase
 * `M0,0 C0.625,0.05 0,1 1,1`: a long, quiet start that arrives hard. It is
 * reserved here for the theatrical moves — the chosen card's flight into its
 * chip and the masked line rise that swaps one question for the next.
 */
gsap.registerPlugin(CustomEase);
const OSMO_NAV = 'osmoNav';
CustomEase.create(OSMO_NAV, 'M0,0 C0.625,0.05 0,1 1,1');

export type Answers = Partial<Record<QuestionId, string>>;

export interface SizingResult {
  answered: number;
  total: number;
  complete: boolean;
  /** True until the GPU question is answered — the count is standing in. */
  provisional: boolean;
  /** GPUs the request actually asks for. Never clipped: asking for more than
   *  the planned fleet is a real answer, and it is an expansion inquiry. */
  gpus: number;
  /** What the rules asked for before any floor was applied. */
  requestedGpus: number;
  /** Set when another answer lifted the GPU count above what was asked for. */
  lift: { from: number; to: number; reason: string } | null;

  /**
   * Peak IT load: servers, storage and network on one boundary, at rated
   * draw. This is the allocation figure, and no workload assumption reduces
   * it.
   */
  peakItKw: number;
  /** Servers only, at peak. */
  serverKw: number;
  /** Storage, at peak. Zero here means "none selected", not "none needed". */
  storageKw: number;
  /** Facility overhead, applied once as (PUE − 1) × peak IT. */
  facilityKw: number;
  /** Peak IT plus that overhead. */
  peakTotalKw: number;
  /** Assumed average share of peak. An energy assumption only. */
  dutyCycle: number;
  /** Peak IT × duty cycle. Explicitly an assumption about consumption. */
  avgItKw: number;

  /** True when an answer carries an unknown the form cannot resolve. */
  needsReview: boolean;
  /** Why, in the answers' own words. */
  reviewReasons: string[];
  /** True when the request runs past the planned fleet. */
  beyondPlanned: boolean;

  fit: FitLevel;
  fitCopy: FitCopy;
  energy: { hours: number; period: string };
  notes: string[];
}

function optionFor(question: ConfiguratorQuestion, id: string | undefined): ConfiguratorOption | null {
  if (!id) return null;
  return question.options.find((o) => o.id === id) ?? null;
}

/**
 * Fold the selected answers through the rule data. Safe to call with a partial
 * set — the readout runs live from the first answer.
 */
export function computeSizing(answers: Answers): SizingResult {
  let range: { min: number; max: number } | null = null;
  let floor = 0;
  let floorReason = '';
  let duty: number | null = null;
  let storageKw = 0;
  let energyHours: number = rules.monthlyHoursConvention;
  let energyPeriod = 'month';
  const notes: string[] = [];
  const reviewReasons: string[] = [];
  let answered = 0;

  for (const question of questions) {
    const option = optionFor(question, answers[question.id]);
    if (!option) continue;
    answered += 1;

    const fx = option.effects;
    if (fx.gpuRange) range = fx.gpuRange;
    if (fx.gpuFloor !== undefined && fx.gpuFloor > floor) {
      floor = fx.gpuFloor;
      floorReason = fx.gpuFloorReason ?? '';
    }
    if (fx.dutyCycle !== undefined) duty = (duty ?? 1) * fx.dutyCycle;
    if (fx.addKw !== undefined) storageKw += fx.addKw;
    if (fx.energyHours !== undefined) energyHours = fx.energyHours;
    if (fx.energyPeriod) energyPeriod = fx.energyPeriod;
    if (fx.note) notes.push(fx.note);
    if (fx.review) reviewReasons.push(fx.review);
  }

  const requestedGpus = Math.max(range ? range.max : 0, floor);
  /**
   * Not clipped to the planned fleet. Clipping used to hide the fact that a
   * request had exceeded it, then a separate flag tried to describe what had
   * been hidden. Asking for more than eight is a legitimate answer and the
   * honest response is that it is an expansion inquiry.
   */
  const gpus = requestedGpus;

  /**
   * One boundary: servers + storage (+ network IT, which is inside the
   * per-GPU figure's host and supply allowance). At rated draw, always.
   * The workload duty cycle does not appear here — it describes assumed
   * average consumption, and using it to shrink an allocation is exactly the
   * "arbitrary workload power reduction as a basis for fit" the handoff
   * removes.
   */
  const serverKw = gpus * envelope.kwPerGpu;
  const peakItKw = serverKw + storageKw;

  /** Applied once, to the whole IT load, from a stated PUE. */
  const facilityKw = peakItKw * (rules.assumedPue - 1);
  const peakTotalKw = peakItKw + facilityKw;

  const dutyCycle = duty ?? rules.defaultDutyCycle;
  const avgItKw = peakItKw * dutyCycle;

  const beyondPlanned = requestedGpus > envelope.plannedGpus;
  const needsReview = reviewReasons.length > 0;

  /**
   * Review outranks everything: an unbenchmarked workload or unspecified
   * customer equipment is not made resolvable by the request also being
   * small. Expansion outranks a prepared request. Nothing resolves to "fits".
   */
  let fit: FitLevel = 'prepared';
  if (needsReview) fit = 'review';
  else if (beyondPlanned) fit = 'expansion';

  return {
    answered,
    total: questions.length,
    complete: answered === questions.length,
    provisional: range === null,
    gpus,
    requestedGpus,
    lift: range && floor > range.max ? { from: range.max, to: gpus, reason: floorReason } : null,
    serverKw,
    storageKw,
    peakItKw,
    facilityKw,
    peakTotalKw,
    dutyCycle,
    avgItKw,
    needsReview,
    reviewReasons,
    beyondPlanned,
    fit,
    fitCopy: fitLevels[fit],
    energy: { hours: energyHours, period: energyPeriod },
    notes,
  };
}

// --- Formatting -------------------------------------------------------

const int = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

const fmt = {
  gpus: (n: number): string => int.format(Math.round(n)),
  kw: (n: number): string => n.toFixed(1),
  share: (n: number): string => (n < 10 ? n.toFixed(2) : n.toFixed(1)),
};

/**
 * The animated figures. `share` and `energy` are gone with the readouts they
 * fed: a percentage of a transformer nameplate nobody has documented, and a
 * dollar figure built on an energy rate that is now a placeholder — the
 * handoff is explicit that a power-only number is not a rental quote.
 */
type FieldName = 'gpus' | 'kw' | 'facility' | 'average';

/** Every animated figure, with the one formatter that owns it. */
const FORMAT: Record<FieldName, (n: number) => string> = {
  gpus: fmt.gpus,
  kw: fmt.kw,
  facility: fmt.kw,
  average: fmt.kw,
};

const FIELDS = Object.keys(FORMAT) as FieldName[];

function asField(value: string | undefined): FieldName | null {
  return value !== undefined && Object.prototype.hasOwnProperty.call(FORMAT, value)
    ? (value as FieldName)
    : null;
}

const CARD = '[data-option]';

/**
 * The local colour ladder is declared on the configurator root. The fly-to-chip
 * ghost is appended to <body>, outside that scope, so it is copied across —
 * otherwise the card loses its surface halfway through the flight.
 */
const LADDER = [
  '--cfg-line', '--cfg-hair', '--cfg-hair-soft', '--cfg-surface',
  '--cfg-card', '--cfg-lift-1', '--cfg-lift-2',
  '--cfg-sel-bg', '--cfg-sel-fg', '--cfg-sel-idx', '--cfg-accent', '--cfg-dot',
];

/**
 * Binds one server-rendered `[data-configurator]` block.
 *
 * Keyboard model, following the ARIA radiogroup pattern with manual selection
 * (selection would otherwise follow focus, and here selecting advances the
 * flow — hostile while arrowing):
 *   ← → ↑ ↓   move the roving tabindex between cards, wrapping
 *   Home End  first / last card
 *   Enter ␣   choose the focused card and advance
 *   Esc       step back to the previous question
 */
export class Configurator {
  readonly root: HTMLElement;

  private readonly panels: HTMLElement[] = [];
  private readonly groups: HTMLElement[] = [];
  private readonly pips: HTMLElement[] = [];
  private readonly resultEl: HTMLElement | null;
  private readonly announceEl: HTMLElement | null;
  private readonly motionQuery: MediaQueryList | null;

  private answers: Answers = {};
  private index = 0;
  private last: SizingResult | null = null;
  private readonly shown = new Map<FieldName, number>();
  private readonly proxies = new Map<FieldName, { v: number }>();
  private ghost: HTMLElement | null = null;
  /** The outgoing-question timeline, held so a mid-flight jump can undo it. */
  private exit: { tl: gsap.core.Timeline; els: HTMLElement[] } | null = null;
  /** Per-element count-ups on the result slab. */
  private tallies: gsap.core.Tween[] = [];

  private readonly onClick = (event: MouseEvent): void => this.handleClick(event);
  private readonly onKeyDown = (event: KeyboardEvent): void => this.handleKey(event);

  constructor(root: HTMLElement) {
    this.root = root;
    this.resultEl = root.querySelector<HTMLElement>('[data-result]');
    this.announceEl = root.querySelector<HTMLElement>('[data-announce]');
    this.motionQuery = typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;

    for (const question of questions) {
      const panel = root.querySelector<HTMLElement>(`[data-question="${question.id}"]`);
      const group = panel?.querySelector<HTMLElement>('[data-cards]') ?? null;
      if (!panel || !group) continue;
      this.panels.push(panel);
      this.groups.push(group);
      const pip = root.querySelector<HTMLElement>(`[data-pip="${question.id}"]`);
      if (pip) this.pips.push(pip);
    }
    if (this.panels.length !== questions.length) return;

    root.dataset.enhanced = 'true';
    // The gauge marks the planned fleet, which is the only real edge here.
    // There is no "fills the phase" band any more: filling it was never a
    // thing this form could establish.
    root.style.setProperty('--cfg-tight', '100%');
    root.addEventListener('click', this.onClick);
    root.addEventListener('keydown', this.onKeyDown);

    // Every question ships visible so the no-JS path reads top to bottom.
    // Enhancement is what collapses it to one at a time.
    this.panels.forEach((panel, i) => { panel.hidden = i !== 0; });
    if (this.resultEl) this.resultEl.hidden = true;
    this.groups.forEach((group) => this.roveTo(group, this.cards(group)[0] ?? null, false));
    this.render(false);
    this.syncPips();
  }

  private get reduced(): boolean {
    return this.motionQuery ? this.motionQuery.matches : prefersReducedMotion();
  }

  private cards(group: HTMLElement): HTMLElement[] {
    return Array.from(group.querySelectorAll<HTMLElement>(CARD));
  }

  // --- Events ---------------------------------------------------------

  private handleClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    const card = target.closest<HTMLElement>(CARD);
    if (card && this.root.contains(card)) {
      event.preventDefault();
      this.choose(card);
      return;
    }

    const chip = target.closest<HTMLElement>('[data-chip]');
    if (chip && this.root.contains(chip)) {
      event.preventDefault();
      const id = chip.dataset.chip as QuestionId | undefined;
      const at = questions.findIndex((q) => q.id === id);
      if (at >= 0) this.goTo(at, true);
      return;
    }

    if (target.closest('[data-cfg-back]')) {
      event.preventDefault();
      this.back();
      return;
    }
    if (target.closest('[data-restart]')) {
      event.preventDefault();
      this.restart();
    }
  }

  private handleKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      // Only swallow Escape while the flow itself has focus and there is
      // somewhere to go back to — otherwise leave it to the page.
      if (this.index > 0 && this.root.contains(document.activeElement)) {
        event.preventDefault();
        this.back();
      }
      return;
    }

    const target = event.target as HTMLElement | null;
    const card = target?.closest<HTMLElement>(CARD);
    if (!card) return;
    const group = card.closest<HTMLElement>('[data-cards]');
    if (!group) return;

    const cards = this.cards(group);
    const at = cards.indexOf(card);
    if (at < 0) return;

    let next = -1;
    switch (event.key) {
      case 'ArrowRight': case 'ArrowDown': next = (at + 1) % cards.length; break;
      case 'ArrowLeft': case 'ArrowUp': next = (at - 1 + cards.length) % cards.length; break;
      case 'Home': next = 0; break;
      case 'End': next = cards.length - 1; break;
      case 'Enter': case ' ': case 'Spacebar':
        event.preventDefault();
        this.choose(card);
        return;
      default: return;
    }

    event.preventDefault();
    this.roveTo(group, cards[next] ?? null, true);
  }

  // --- Selection ------------------------------------------------------

  /** Move the roving tabindex, optionally taking focus with it. */
  private roveTo(group: HTMLElement, card: HTMLElement | null, focus: boolean): void {
    if (!card) return;
    for (const other of this.cards(group)) {
      other.tabIndex = other === card ? 0 : -1;
    }
    if (focus) card.focus();
  }

  private choose(card: HTMLElement): void {
    const id = card.dataset.question as QuestionId | undefined;
    const optionId = card.dataset.option;
    if (!id || !optionId) return;

    const at = questions.findIndex((q) => q.id === id);
    const question = questions[at];
    const group = this.groups[at];
    if (!question || !group) return;

    this.answers[id] = optionId;
    for (const other of this.cards(group)) {
      other.setAttribute('aria-checked', String(other === card));
    }
    this.roveTo(group, card, false);

    const chipSlot = this.root.querySelector<HTMLElement>(`[data-chip-slot="${id}"]`);
    const chipValue = chipSlot?.querySelector<HTMLElement>('[data-chip-value]') ?? null;
    const option = optionFor(question, optionId);
    if (chipSlot && chipValue && option) {
      chipValue.textContent = option.chip;
      chipSlot.hidden = false;
    }

    // Next unanswered question, else the result.
    let target = questions.length;
    for (let i = 0; i < questions.length; i += 1) {
      const q = questions[i];
      if (q && !this.answers[q.id]) { target = i; break; }
    }

    this.render(true);
    this.advance(at, target, card, chipSlot);
  }

  // --- Movement -------------------------------------------------------

  /**
   * Clear the outgoing question, then rise the next one in. The discarded cards
   * fall in reading order, the prompt is pulled up out of its own mask, and the
   * chosen card leaves on its own path into the summary chip — so the swap reads
   * as one move rather than two panels trading places.
   */
  private advance(from: number, to: number, card: HTMLElement, chip: HTMLElement | null): void {
    const outgoing = this.panels[from];
    if (!outgoing) return;

    if (this.reduced) {
      this.goTo(to, true);
      return;
    }

    const cardRect = card.getBoundingClientRect();
    const chipRect = chip?.getBoundingClientRect() ?? null;
    const siblings = this.cards(outgoing).filter((c) => c !== card);
    const lines = Array.from(outgoing.querySelectorAll<HTMLElement>('.cfg__line-inner'));

    const flying = !!(chip && chipRect && chipRect.width > 0);
    if (flying && chip && chipRect) this.flyToChip(card, cardRect, chip, chipRect);

    const tl = gsap.timeline({ onComplete: () => this.goTo(to, true) });
    this.exit = { tl, els: [...siblings, ...lines, card, outgoing] };

    tl.to(siblings, { opacity: 0, y: 12, duration: 0.3, ease: 'power2.in', stagger: 0.035 }, 0);
    tl.to(lines, { yPercent: -115, duration: 0.4, ease: 'power2.in', stagger: 0.04 }, 0.06);
    // The chosen card is handed to the ghost, so it is cut rather than faded.
    if (flying) tl.set(card, { opacity: 0 }, 0.03);
    else tl.to(card, { opacity: 0, y: 12, duration: 0.3, ease: 'power2.in' }, 0.06);
    tl.to(outgoing, { opacity: 0, duration: 0.3, ease: 'power2.in' }, 0.3);
  }

  /** Undo whatever the outgoing timeline left inline, wherever it got to. */
  private clearExit(): void {
    if (!this.exit) return;
    const { tl, els } = this.exit;
    this.exit = null;
    tl.kill();
    gsap.set(els, { clearProps: 'opacity,transform' });
  }

  /** Detached clone of the chosen card, flown into its summary chip. */
  private flyToChip(card: HTMLElement, from: DOMRect, chip: HTMLElement, to: DOMRect): void {
    this.clearGhost();

    const ghost = card.cloneNode(true) as HTMLElement;
    ghost.removeAttribute('id');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.tabIndex = -1;

    // Carry the block's colour ladder out to <body> with the clone.
    const ladder = window.getComputedStyle(this.root);
    for (const name of LADDER) ghost.style.setProperty(name, ladder.getPropertyValue(name));

    Object.assign(ghost.style, {
      position: 'fixed',
      left: `${from.left}px`,
      top: `${from.top}px`,
      width: `${from.width}px`,
      height: `${from.height}px`,
      margin: '0',
      zIndex: '40',
      pointerEvents: 'none',
      transformOrigin: 'top left',
    });
    document.body.appendChild(ghost);
    this.ghost = ghost;

    gsap.set(chip, { opacity: 0 });
    gsap.to(ghost, {
      x: to.left - from.left,
      y: to.top - from.top,
      scaleX: to.width / Math.max(1, from.width),
      scaleY: to.height / Math.max(1, from.height),
      opacity: 0.12,
      // The single most theatrical move on the page, so it takes the
      // reference's signature curve rather than its default one.
      duration: 0.65,
      ease: OSMO_NAV,
      onComplete: () => this.clearGhost(),
    });
    // The chip catches it: the answer lands rather than appears.
    gsap.fromTo(
      chip,
      { opacity: 0, scale: 0.84 },
      { opacity: 1, scale: 1, duration: 0.45, delay: 0.4, ease: 'back.out(2)', clearProps: 'transform' },
    );
  }

  private clearGhost(): void {
    if (!this.ghost) return;
    gsap.killTweensOf(this.ghost);
    this.ghost.remove();
    this.ghost = null;
  }

  /** `index === questions.length` shows the result panel. */
  private goTo(index: number, focus: boolean): void {
    this.clearExit();
    this.killTallies();
    this.index = Math.max(0, Math.min(index, questions.length));
    const atResult = this.index === questions.length;

    this.panels.forEach((panel, i) => { panel.hidden = i !== this.index; });
    if (this.resultEl) this.resultEl.hidden = !atResult;
    this.syncPips();

    const incoming = atResult ? this.resultEl : this.panels[this.index] ?? null;
    if (!incoming) return;

    if (!this.reduced) {
      if (atResult) this.revealResult(incoming);
      else this.reveal(incoming);
    }

    if (!focus) return;
    if (atResult) {
      incoming.querySelector<HTMLElement>('[data-result-focus]')?.focus();
      return;
    }
    const group = this.groups[this.index];
    if (!group) return;
    const cards = this.cards(group);
    const checked = cards.find((c) => c.getAttribute('aria-checked') === 'true');
    this.roveTo(group, checked ?? cards[0] ?? null, true);
  }

  /** Masked per-line rise, the same treatment the stage panels use. */
  private reveal(panel: HTMLElement): void {
    const lines = Array.from(panel.querySelectorAll<HTMLElement>('.cfg__line-inner'));
    const cards = Array.from(panel.querySelectorAll<HTMLElement>(CARD));

    gsap.killTweensOf([...lines, ...cards]);
    if (lines.length) {
      gsap.fromTo(
        lines,
        { yPercent: 118, opacity: 0 },
        // The other half of the swap, so it answers the card's flight on the
        // same curve.
        { yPercent: 0, opacity: 1, duration: 0.65, ease: OSMO_NAV, stagger: 0.05, clearProps: 'transform,opacity' },
      );
    }
    if (cards.length) {
      gsap.fromTo(
        cards,
        { y: 22, opacity: 0, scale: 0.985 },
        {
          y: 0, opacity: 1, scale: 1,
          duration: 0.45, ease: 'power2.out', stagger: 0.05, delay: 0.16,
          clearProps: 'transform,opacity',
        },
      );
    }
  }

  /**
   * The payoff. The slab lands, the verdict seal snaps in, the headline rises,
   * the rules draw left to right and every figure counts up from zero behind
   * them — the reserve call arrives last, once the numbers have settled.
   */
  private revealResult(panel: HTMLElement): void {
    const slab = panel.querySelector<HTMLElement>('[data-slab]');
    const seal = panel.querySelector<HTMLElement>('[data-seal]');
    const cta = panel.querySelector<HTMLElement>('[data-reveal]');
    const lines = Array.from(panel.querySelectorAll<HTMLElement>('.cfg__line-inner'));
    const drawn = Array.from(panel.querySelectorAll<HTMLElement>('[data-rule]'));
    const cells = Array.from(panel.querySelectorAll<HTMLElement>('.cfg__result-cell'));
    const notes = Array.from(panel.querySelectorAll<HTMLElement>('.cfg__note'));

    const all: HTMLElement[] = [slab, seal, cta, ...lines, ...drawn, ...cells, ...notes]
      .filter((el): el is HTMLElement => el !== null);
    gsap.killTweensOf(all);

    const tl = gsap.timeline();
    if (slab) {
      tl.fromTo(
        slab,
        { opacity: 0, y: 30, scale: 0.985 },
        { opacity: 1, y: 0, scale: 1, duration: 0.65, ease: 'power2.out', clearProps: 'transform,opacity' },
        0,
      );
    }
    if (lines.length) {
      tl.fromTo(
        lines,
        { yPercent: 118, opacity: 0 },
        { yPercent: 0, opacity: 1, duration: 0.65, ease: OSMO_NAV, stagger: 0.06, clearProps: 'transform,opacity' },
        0.16,
      );
    }
    if (seal) {
      tl.fromTo(
        seal,
        { opacity: 0, scale: 0.86 },
        { opacity: 1, scale: 1, duration: 0.45, ease: 'back.out(2)', clearProps: 'transform,opacity' },
        0.3,
      );
    }
    if (drawn.length) {
      tl.fromTo(
        drawn,
        { scaleX: 0 },
        { scaleX: 1, duration: 0.6, ease: 'power2.inOut', stagger: 0.06, clearProps: 'transform' },
        0.3,
      );
    }
    if (cells.length) {
      tl.fromTo(
        cells,
        { opacity: 0, y: 14 },
        { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out', stagger: 0.06, clearProps: 'transform,opacity' },
        0.35,
      );
    }
    if (notes.length) {
      tl.fromTo(
        notes,
        { opacity: 0, y: 8 },
        { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out', stagger: 0.05, clearProps: 'transform,opacity' },
        0.6,
      );
    }
    if (cta) {
      tl.fromTo(
        cta,
        { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: 0.5, ease: 'back.out(2)', clearProps: 'transform,opacity' },
        0.8,
      );
    }

    this.tally();
  }

  /** Count every figure on the slab up from zero, in the order they read. */
  private tally(): void {
    if (!this.resultEl || this.reduced) return;
    const els = Array.from(this.resultEl.querySelectorAll<HTMLElement>('[data-tally]'));
    if (!els.length) return;

    // Hand the figures over: the shared count-up must not write over the tally.
    for (const name of FIELDS) {
      const proxy = this.proxies.get(name);
      if (proxy) gsap.killTweensOf(proxy);
      this.write(name, this.shown.get(name) ?? 0);
    }

    els.forEach((el, i) => {
      const name = asField(el.dataset.field);
      if (!name) return;
      const format = FORMAT[name];
      const target = this.shown.get(name) ?? 0;
      const proxy = { v: 0 };
      el.textContent = format(0);
      this.tallies.push(gsap.to(proxy, {
        v: target,
        duration: 1,
        delay: 0.4 + i * 0.09,
        ease: 'power2.out',
        onUpdate: () => { el.textContent = format(proxy.v); },
        onComplete: () => { el.textContent = format(target); },
      }));
    });
  }

  private killTallies(): void {
    if (!this.tallies.length) return;
    for (const tween of this.tallies) tween.kill();
    this.tallies = [];
    if (!this.resultEl) return;
    for (const el of this.resultEl.querySelectorAll<HTMLElement>('[data-tally]')) {
      const name = asField(el.dataset.field);
      if (name) el.textContent = FORMAT[name](this.shown.get(name) ?? 0);
    }
  }

  private back(): void {
    this.clearGhost();
    if (this.index === 0) return;
    this.goTo(this.index - 1, true);
  }

  private restart(): void {
    this.clearGhost();
    this.answers = {};
    this.last = null;
    this.groups.forEach((group) => {
      for (const card of this.cards(group)) card.setAttribute('aria-checked', 'false');
      this.roveTo(group, this.cards(group)[0] ?? null, false);
    });
    for (const question of questions) {
      const slot = this.root.querySelector<HTMLElement>(`[data-chip-slot="${question.id}"]`);
      if (slot) {
        gsap.set(slot, { clearProps: 'opacity,transform' });
        slot.hidden = true;
      }
    }
    this.render(true);
    this.goTo(0, true);
  }

  // --- Readout --------------------------------------------------------

  private text(name: string, value: string): void {
    for (const el of this.root.querySelectorAll<HTMLElement>(`[data-field="${name}"]`)) {
      el.textContent = value;
    }
  }

  /** Write one figure everywhere it appears, formatted by its own rule. */
  private write(name: FieldName, value: number): void {
    const format = FORMAT[name];
    for (const el of this.root.querySelectorAll<HTMLElement>(`[data-field="${name}"]`)) {
      el.textContent = format(value);
    }
  }

  /**
   * Count to the new figure and settle on it. The run is longer for a bigger
   * move, so a jump from 4 to 60 GPUs takes visibly more work than 4 to 8.
   */
  private number(name: FieldName, value: number): void {
    const els = Array.from(this.root.querySelectorAll<HTMLElement>(`[data-field="${name}"]`));
    if (!els.length) return;

    const from = this.shown.get(name) ?? 0;
    this.shown.set(name, value);

    const format = FORMAT[name];
    const write = (n: number): void => { for (const el of els) el.textContent = format(n); };

    if (this.reduced || from === value) {
      write(value);
      return;
    }

    let proxy = this.proxies.get(name);
    if (!proxy) { proxy = { v: from }; this.proxies.set(name, proxy); }
    const p = proxy;
    gsap.killTweensOf(p);
    p.v = from;

    const span = Math.abs(value - from) / Math.max(1, Math.abs(value), Math.abs(from));
    const pops = els.filter((el) => el.dataset.pop !== undefined);

    gsap.to(p, {
      v: value,
      duration: 0.45 + Math.min(0.35, span * 0.35),
      ease: 'power2.out',
      onUpdate: () => write(p.v),
      onComplete: () => { write(value); this.pop(pops); },
    });
  }

  /** The settle: a figure that has just changed nudges once and stops. */
  private pop(els: HTMLElement[]): void {
    if (this.reduced || !els.length) return;
    gsap.fromTo(
      els,
      { scale: 1 },
      {
        scale: 1.05, duration: 0.16, ease: 'power2.out',
        transformOrigin: 'left center', yoyo: true, repeat: 1,
        clearProps: 'transform',
      },
    );
  }

  /** A wash across the readout when the verdict itself changes. */
  private flash(): void {
    const el = this.root.querySelector<HTMLElement>('[data-flash]');
    if (!el || this.reduced) return;
    gsap.killTweensOf(el);
    gsap.fromTo(el, { opacity: 0 }, { opacity: 0.18, duration: 0.16, ease: 'power2.out', yoyo: true, repeat: 1 });
  }

  /** The gamified bit: how many GPUs that answer just moved the estimate by. */
  private showDelta(diff: number): void {
    const el = this.root.querySelector<HTMLElement>('[data-delta]');
    if (!el || this.reduced || diff === 0) return;
    const size = Math.abs(diff);
    el.textContent = `${diff > 0 ? '+' : '−'}${fmt.gpus(size)} GPU${size === 1 ? '' : 's'}`;
    el.dataset.dir = diff > 0 ? 'up' : 'down';
    gsap.killTweensOf(el);
    gsap.timeline()
      .fromTo(
        el,
        { opacity: 0, y: -10, scale: 0.9 },
        { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: 'back.out(2)' },
      )
      .to(el, { opacity: 0, y: -6, duration: 0.3, ease: 'power2.in', delay: 1.6 });
  }

  /** Answered / current markers on the foot's progress pips. */
  private syncPips(): void {
    this.pips.forEach((pip, i) => {
      const question = questions[i];
      const answered = !!(question && this.answers[question.id]);
      if (answered) pip.dataset.on = '';
      else delete pip.dataset.on;
      if (i === this.index) pip.dataset.now = '';
      else delete pip.dataset.now;
    });
  }

  private render(announce: boolean): void {
    const r = computeSizing(this.answers);
    const previous = this.last;
    this.last = r;

    this.number('gpus', r.gpus);
    this.number('kw', r.peakItKw);
    this.number('facility', r.peakTotalKw);
    this.number('average', r.avgItKw);

    this.text('kw-note', r.storageKw > 0 ? 'servers + storage, at peak' : 'servers, at peak');
    this.text('facility-note', `IT + facility at PUE ${rules.assumedPue}`);
    this.text('average-note', `assumed ${Math.round(r.dutyCycle * 100)}% of peak`);
    this.text('fit', r.answered === 0 ? 'Not sized yet' : r.fitCopy.label);
    // "1 GPUS" read wrong next to a delta chip that already said "+1 GPU".
    this.text('gpu-word', r.gpus === 1 ? 'GPU' : 'GPUs');
    this.text('fit-headline', r.fitCopy.headline);
    this.text('fit-detail', r.fitCopy.detail);
    this.text('progress', `${r.answered} / ${r.total}`);
    this.text(
      'gpu-note',
      r.answered === 0
        ? 'Pick a workload to start'
        : r.gpus === 0
          ? 'Scale it to size the deployment'
          : r.beyondPlanned
            ? `past the ${envelope.plannedGpus} in the RTX example`
            : r.provisional
              ? `provisional · of ${envelope.plannedGpus} reference GPUs`
              : `of ${envelope.plannedGpus} reference GPUs`,
    );
    this.text(
      'lift',
      r.lift ? `Raised from ${r.lift.from} to ${r.lift.to} — ${r.lift.reason}.` : '',
    );

    this.root.dataset.fit = r.fit;
    this.root.dataset.state = r.complete ? 'complete' : 'sizing';
    this.syncPips();

    const bar = this.root.querySelector<HTMLElement>('[data-bar]');
    if (bar) {
      const share = Math.min(1, r.gpus / envelope.plannedGpus);
      if (this.reduced) gsap.set(bar, { scaleX: share });
      else gsap.to(bar, { scaleX: share, duration: 0.65, ease: 'power2.out' });
      bar.parentElement?.setAttribute('aria-valuenow', String(Math.round(share * 100)));
    }

    const notes = this.root.querySelector<HTMLElement>('[data-notes]');
    if (notes) {
      const line = (text: string, review: boolean): HTMLLIElement => {
        const li = document.createElement('li');
        li.className = review ? 'cfg__note cfg__note--review' : 'cfg__note';
        li.textContent = text;
        return li;
      };
      notes.replaceChildren(
        ...r.reviewReasons.map((reason) => line(reason, true)),
        ...r.notes.map((note) => line(note, false)),
      );
    }

    // React only to a change the visitor can act on: a different GPU count, or
    // a verdict that has crossed into the next band.
    if (announce && previous) {
      if (previous.gpus !== r.gpus) this.showDelta(r.gpus - previous.gpus);
      if (previous.fit !== r.fit && r.gpus > 0) this.flash();
    }

    if (announce && this.announceEl) {
      this.announceEl.textContent = r.answered === 0
        ? 'No answers yet.'
        : `${r.answered} of ${r.total} answered. ${fmt.gpus(r.gpus)} ${r.gpus === 1 ? 'GPU' : 'GPUs'} `
          + `of ${envelope.plannedGpus} reference RTX GPUs. ${fmt.kw(r.peakItKw)} kilowatts estimated peak IT load, `
          + `${fmt.kw(r.peakTotalKw)} including facility overhead. ${r.fitCopy.label}.`;
    }
  }

  destroy(): void {
    this.clearGhost();
    this.clearExit();
    this.killTallies();
    this.root.removeEventListener('click', this.onClick);
    this.root.removeEventListener('keydown', this.onKeyDown);
    delete this.root.dataset.enhanced;
  }
}

/** Bind every configurator in `scope`. Safe to call more than once per page. */
export function initConfigurator(scope: ParentNode = document): Configurator[] {
  const roots = Array.from(scope.querySelectorAll<HTMLElement>('[data-configurator]'));
  return roots
    .filter((root) => root.dataset.enhanced !== 'true')
    .map((root) => new Configurator(root));
}

/** Re-exported so a host page can render the same rules without a second import. */
export { assumptions, envelope, questions };
