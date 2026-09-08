/**
 * Deployment configurator.
 *
 * One question on screen at a time. Answering it flies the chosen card into
 * the summary strip and rises the next question in behind it, while a running
 * readout counts up to the new estimate. The whole thing is progressive
 * enhancement over server-rendered markup: every question, every card and the
 * static fallback are already in the HTML, so with the script blocked the page
 * still reads as a spec sheet.
 *
 * All sizing rules live in `src/data/configurator.ts`. Nothing numeric is
 * decided in here beyond arithmetic and rounding.
 */

import gsap from 'gsap';
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

export type Answers = Partial<Record<QuestionId, string>>;

export interface SizingResult {
  answered: number;
  total: number;
  complete: boolean;
  /** True until the GPU question is answered — the count is standing in. */
  provisional: boolean;
  /** GPUs quoted, after floors and after clipping to the rentable pool. */
  gpus: number;
  /** What the rules asked for before clipping. */
  requestedGpus: number;
  /** Set when another answer lifted the GPU count above what was asked for. */
  lift: { from: number; to: number; reason: string } | null;
  drawFactor: number;
  itKw: number;
  storageKw: number;
  ancillaryKw: number;
  totalKw: number;
  /** Percent of the transformer nameplate. */
  transformerShare: number;
  /** Percent of the Phase 1A load. */
  phase1aShare: number;
  fit: FitLevel;
  fitCopy: FitCopy;
  energy: { hours: number; period: string; usd: number };
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
  let drawFactor: number | null = null;
  let storageKw = 0;
  let energyHours: number = rules.defaultEnergyHours;
  let energyPeriod: string = rules.defaultEnergyPeriod;
  const notes: string[] = [];
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
    if (fx.drawFactor !== undefined) drawFactor = (drawFactor ?? 1) * fx.drawFactor;
    if (fx.addKw !== undefined) storageKw += fx.addKw;
    if (fx.energyHours !== undefined) energyHours = fx.energyHours;
    if (fx.energyPeriod) energyPeriod = fx.energyPeriod;
    if (fx.note) notes.push(fx.note);
  }

  const factor = drawFactor ?? rules.defaultDrawFactor;
  const requestedGpus = Math.max(range ? range.max : 0, floor);
  const gpus = Math.min(requestedGpus, envelope.rentableGpus);

  const itKw = gpus * envelope.kwPerGpu * factor;
  const ancillaryKw = gpus > 0 ? rules.ancillaryKw : 0;
  const totalKw = itKw + storageKw + ancillaryKw;

  const overGpus = requestedGpus > envelope.rentableGpus;
  const overKw = totalKw > envelope.phase1aKw;
  const gpuShare = gpus / envelope.rentableGpus;
  const kwShare = envelope.phase1aKw > 0 ? totalKw / envelope.phase1aKw : 0;

  let fit: FitLevel = 'phase-1a';
  if (overGpus || overKw) fit = 'expansion';
  else if (gpuShare >= rules.tightGpuShare || kwShare >= rules.tightKwShare) fit = 'phase-1a-tight';

  return {
    answered,
    total: questions.length,
    complete: answered === questions.length,
    provisional: range === null,
    gpus,
    requestedGpus,
    lift: range && floor > range.max ? { from: range.max, to: gpus, reason: floorReason } : null,
    drawFactor: factor,
    itKw,
    storageKw,
    ancillaryKw,
    totalKw,
    transformerShare: (totalKw / envelope.transformerKva) * 100,
    phase1aShare: kwShare * 100,
    fit,
    fitCopy: fitLevels[fit],
    energy: { hours: energyHours, period: energyPeriod, usd: totalKw * energyHours * envelope.energyRate },
    notes,
  };
}

// --- Formatting -------------------------------------------------------

const int = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

const fmt = {
  gpus: (n: number): string => int.format(Math.round(n)),
  kw: (n: number): string => n.toFixed(1),
  share: (n: number): string => (n < 10 ? n.toFixed(2) : n.toFixed(1)),
  money: (n: number): string => (n < 100 ? `$${n.toFixed(2)}` : `$${int.format(Math.round(n))}`),
};

type FieldName = 'gpus' | 'kw' | 'share' | 'energy';

const CARD = '[data-option]';

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
  private readonly resultEl: HTMLElement | null;
  private readonly announceEl: HTMLElement | null;
  private readonly motionQuery: MediaQueryList | null;

  private answers: Answers = {};
  private index = 0;
  private readonly shown = new Map<FieldName, number>();
  private readonly proxies = new Map<FieldName, { v: number }>();
  private ghost: HTMLElement | null = null;

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
    }
    if (this.panels.length !== questions.length) return;

    root.dataset.enhanced = 'true';
    root.addEventListener('click', this.onClick);
    root.addEventListener('keydown', this.onKeyDown);

    // Every question ships visible so the no-JS path reads top to bottom.
    // Enhancement is what collapses it to one at a time.
    this.panels.forEach((panel, i) => { panel.hidden = i !== 0; });
    if (this.resultEl) this.resultEl.hidden = true;
    this.groups.forEach((group) => this.roveTo(group, this.cards(group)[0] ?? null, false));
    this.render(false);
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

  private advance(from: number, to: number, card: HTMLElement, chip: HTMLElement | null): void {
    const outgoing = this.panels[from];
    if (!outgoing) return;

    if (this.reduced) {
      this.goTo(to, true);
      return;
    }

    const cardRect = card.getBoundingClientRect();
    const chipRect = chip?.getBoundingClientRect() ?? null;

    // Dim the cards that were not chosen before the winner leaves.
    const siblings = this.cards(outgoing).filter((c) => c !== card);
    gsap.to(siblings, { opacity: 0, y: 8, duration: 0.22, ease: 'power2.in' });

    if (chipRect && chipRect.width > 0) {
      this.flyToChip(card, cardRect, chip as HTMLElement, chipRect);
    }

    gsap.to(outgoing, {
      opacity: 0,
      y: -14,
      duration: 0.3,
      ease: 'power2.in',
      onComplete: () => {
        gsap.set(siblings, { clearProps: 'opacity,transform' });
        gsap.set(outgoing, { clearProps: 'opacity,transform' });
        this.goTo(to, true);
      },
    });
  }

  /** Detached clone of the chosen card, flown into its summary chip. */
  private flyToChip(card: HTMLElement, from: DOMRect, chip: HTMLElement, to: DOMRect): void {
    this.clearGhost();

    const ghost = card.cloneNode(true) as HTMLElement;
    ghost.removeAttribute('id');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.tabIndex = -1;
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
      opacity: 0.15,
      duration: 0.52,
      ease: 'power3.inOut',
      onComplete: () => this.clearGhost(),
    });
    gsap.to(chip, { opacity: 1, duration: 0.28, delay: 0.34, ease: 'power2.out' });
  }

  private clearGhost(): void {
    if (!this.ghost) return;
    gsap.killTweensOf(this.ghost);
    this.ghost.remove();
    this.ghost = null;
  }

  /** `index === questions.length` shows the result panel. */
  private goTo(index: number, focus: boolean): void {
    this.index = Math.max(0, Math.min(index, questions.length));
    const atResult = this.index === questions.length;

    this.panels.forEach((panel, i) => { panel.hidden = i !== this.index; });
    if (this.resultEl) this.resultEl.hidden = !atResult;

    const incoming = atResult ? this.resultEl : this.panels[this.index] ?? null;
    if (!incoming) return;

    if (!this.reduced) this.reveal(incoming);

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
    const cards = Array.from(panel.querySelectorAll<HTMLElement>('[data-option], [data-reveal]'));

    gsap.killTweensOf([...lines, ...cards]);
    if (lines.length) {
      gsap.fromTo(
        lines,
        { yPercent: 115, opacity: 0 },
        { yPercent: 0, opacity: 1, duration: 0.62, ease: 'power3.out', stagger: 0.05, clearProps: 'transform,opacity' },
      );
    }
    if (cards.length) {
      gsap.fromTo(
        cards,
        { y: 18, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5, ease: 'power3.out', stagger: 0.045, delay: 0.1, clearProps: 'transform,opacity' },
      );
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
    this.groups.forEach((group) => {
      for (const card of this.cards(group)) card.setAttribute('aria-checked', 'false');
      this.roveTo(group, this.cards(group)[0] ?? null, false);
    });
    for (const question of questions) {
      const slot = this.root.querySelector<HTMLElement>(`[data-chip-slot="${question.id}"]`);
      if (slot) slot.hidden = true;
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

  private number(name: FieldName, value: number, format: (n: number) => string): void {
    const els = Array.from(this.root.querySelectorAll<HTMLElement>(`[data-field="${name}"]`));
    if (!els.length) return;

    const from = this.shown.get(name) ?? 0;
    this.shown.set(name, value);

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
    gsap.to(p, {
      v: value,
      duration: 0.7,
      ease: 'power2.out',
      onUpdate: () => write(p.v),
      onComplete: () => write(value),
    });
  }

  private render(announce: boolean): void {
    const r = computeSizing(this.answers);

    this.number('gpus', r.gpus, fmt.gpus);
    this.number('kw', r.totalKw, fmt.kw);
    this.number('share', r.transformerShare, fmt.share);
    this.number('energy', r.energy.usd, fmt.money);

    this.text('energy-period', `per ${r.energy.period}`);
    this.text('phase-share', `${fmt.share(r.phase1aShare)}% of the Phase 1A load`);
    this.text('fit', r.gpus === 0 ? 'Not sized yet' : r.fitCopy.label);
    this.text('fit-headline', r.fitCopy.headline);
    this.text('fit-detail', r.fitCopy.detail);
    this.text('progress', `${r.answered} / ${r.total}`);
    this.text(
      'gpu-note',
      r.gpus === 0
        ? 'Pick a workload to start'
        : r.provisional
          ? `provisional · of ${envelope.rentableGpus} rentable`
          : `of ${envelope.rentableGpus} rentable`,
    );
    this.text(
      'lift',
      r.lift ? `Raised from ${r.lift.from} to ${r.lift.to} — ${r.lift.reason}.` : '',
    );

    this.root.dataset.fit = r.fit;
    this.root.dataset.state = r.complete ? 'complete' : 'sizing';

    const bar = this.root.querySelector<HTMLElement>('[data-bar]');
    if (bar) {
      const pct = Math.min(100, (r.gpus / envelope.rentableGpus) * 100);
      if (this.reduced) gsap.set(bar, { width: `${pct}%` });
      else gsap.to(bar, { width: `${pct}%`, duration: 0.6, ease: 'power3.out' });
      bar.parentElement?.setAttribute('aria-valuenow', String(Math.round(pct)));
    }

    const notes = this.root.querySelector<HTMLElement>('[data-notes]');
    if (notes) {
      notes.replaceChildren(...r.notes.map((note) => {
        const li = document.createElement('li');
        li.className = 'cfg__note';
        li.textContent = note;
        return li;
      }));
    }

    if (announce && this.announceEl) {
      this.announceEl.textContent = r.gpus === 0
        ? 'No answers yet.'
        : `${r.answered} of ${r.total} answered. ${fmt.gpus(r.gpus)} GPUs of ${envelope.rentableGpus} rentable, `
          + `${fmt.kw(r.totalKw)} kilowatts estimated, ${fmt.share(r.transformerShare)} percent of the `
          + `${envelope.transformerLabel} transformer. ${r.fitCopy.label}.`;
    }
  }

  destroy(): void {
    this.clearGhost();
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
