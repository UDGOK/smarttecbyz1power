/**
 * Cinematic route boot.
 *
 * Stage 1 → 2 end to end. Scroll drives the ruler, the camera and the text
 * parallax; reaching the end of a stage's scroll track arms the hold button;
 * holding scrubs the world, the ambience and the chrome across to the next
 * stage. Every later stage plugs into the same contract.
 */

import gsap from 'gsap';
import type { Experience } from './scene/experience';
import { HoldButton, prefersReducedMotion } from './hold-button';
import { initLoader } from './loader';
import { initCursor } from './cursor';
import { audio } from './audio';
import { stages } from '../data/site';

const PHASE_1A_KW = 114;

function supportsWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

export function boot(): void {
  const canvas = document.querySelector<HTMLCanvasElement>('#experience-canvas');
  const root = document.querySelector<HTMLElement>('[data-stage-root]');
  const holdSlot = document.querySelector<HTMLElement>('#hold-slot');
  const readout = document.querySelector<HTMLElement>('#ruler-readout');
  const rulerTrack = document.querySelector<HTMLElement>('.scroll-ruler-track');
  const powerValue = document.querySelector<HTMLElement>('#power-value');
  if (!canvas || !root || !holdSlot) return;

  document.documentElement.classList.add('js-ready');

  const canvasEl: HTMLCanvasElement = canvas;
  const rootEl: HTMLElement = root;
  const slot: HTMLElement = holdSlot;

  const reduced = prefersReducedMotion();
  const panels = Array.from(rootEl.querySelectorAll<HTMLElement>('[data-stage-panel]'));

  let experience: Experience | null = null;
  let current = 0;
  let button: HoldButton | null = null;

  // --- 3D, code-split and idle-loaded ----------------------------------
  async function initScene(): Promise<void> {
    if (!supportsWebGL()) {
      canvasEl.hidden = true;
      document.body.dataset.noWebgl = '';
      return;
    }
    try {
      const { Experience } = await import('./scene/experience');
      experience = new Experience(canvasEl, reduced);
      experience.start();
      window.addEventListener('resize', experience.resize);
      (window as unknown as { __experience?: Experience }).__experience = experience;
    } catch {
      canvasEl.hidden = true;
      document.body.dataset.noWebgl = '';
    }
  }

  // --- Chrome ----------------------------------------------------------
  function applyStage(index: number, mix: number): void {
    const stage = stages[index];
    if (!stage) return;
    document.documentElement.dataset.chrome = stage.chrome === 'dark' ? 'dark' : 'light';
    if (readout) readout.textContent = stage.ruler;
    rootEl.querySelectorAll<HTMLElement>('.scroll-ruler-nav-btn').forEach((b, i) => {
      b.setAttribute('aria-current', String(i === index));
    });
    experience?.setWorldMix(mix);
  }

  function showPanel(index: number): void {
    panels.forEach((p, i) => {
      p.hidden = i !== index;
      p.setAttribute('aria-hidden', String(i !== index));
    });
  }

  function setPower(fraction: number): void {
    if (powerValue) powerValue.textContent = String(Math.round(PHASE_1A_KW * fraction));
  }

  /** Full-bleed ripple, the reference's punctuation for a milestone. */
  function flash(): void {
    const el = document.querySelector<HTMLElement>('#flash');
    if (!el || reduced) return;
    el.classList.remove('is-firing');
    void el.offsetWidth; // restart the animation
    el.classList.add('is-firing');
  }

  function topupBadge(): void {
    const badge = document.querySelector<HTMLElement>('.power-badge');
    if (!badge || reduced) return;
    badge.classList.remove('is-topup');
    void badge.offsetWidth;
    badge.classList.add('is-topup');
    audio.play('xp-topup');
  }

  // --- Masked line reveal ----------------------------------------------
  function reveal(index: number): void {
    const panel = panels[index];
    if (!panel) return;
    const inners = panel.querySelectorAll<HTMLElement>('.line__inner');
    if (reduced) { gsap.set(inners, { yPercent: 0, opacity: 1 }); return; }
    gsap.fromTo(
      inners,
      { yPercent: 115, opacity: 0 },
      { yPercent: 0, opacity: 1, duration: 1.15, ease: 'expo.out', stagger: 0.075, delay: 0.15 },
    );
  }

  // --- Scroll ----------------------------------------------------------
  let ticking = false;

  function onScroll(): void {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const panel = panels[current];
      if (!panel || panel.hidden) return;

      const rect = panel.getBoundingClientRect();
      const travel = Math.max(1, rect.height - window.innerHeight);
      const p = Math.min(1, Math.max(0, -rect.top / travel));

      // The ruler physically travels with the scroll, as in the reference.
      if (rulerTrack) rulerTrack.style.transform = `translateX(${-p * 190}px)`;

      // Camera dolly + text parallax, both transform-only.
      experience?.setScrollProgress(p);
      const sticky = panel.querySelector<HTMLElement>('[data-stage-sticky]');
      if (sticky && !reduced) {
        sticky.style.transform = `translate3d(0, ${-p * 8}vh, 0)`;
        sticky.style.opacity = String(1 - Math.max(0, (p - 0.65) / 0.35) * 0.85);
      }

      const cue = panel.querySelector<HTMLElement>('[data-scroll-cue]');
      if (cue) cue.style.opacity = String(Math.max(0, 1 - p * 4));

      // Arm the hold once the stage has actually been read through.
      slot.classList.toggle('is-armed', p > 0.82 && !!button);
    });
  }

  // --- Hold ------------------------------------------------------------
  function mountHold(index: number): void {
    const cfg = stages[index]?.hold;
    button?.destroy();
    button = null;
    if (!cfg) return;

    button = new HoldButton({
      label: cfg.label,
      holdLabel: cfg.holdLabel,
      holdDuration: cfg.duration,
      audioTrack: 'hold-button',

      onStart() {
        audio.play('stage-land-ambient', { fadeIn: 0.4, volume: 0.5 });
        audio.play('stage-wait-ambient', { fadeIn: 0, volume: 0 });
      },

      onProgress(p) {
        experience?.setWorldMix(p);
        audio.setLevel('stage-land-ambient', { volume: (1 - p) * 0.5 });
        audio.setLevel('stage-wait-ambient', { volume: p * 0.5 });
        setPower(p * 0.25);
        const sticky = panels[current]?.querySelector<HTMLElement>('[data-stage-sticky]');
        if (sticky) sticky.style.opacity = String(1 - p * 0.9);
      },

      onCancel() {
        experience?.setWorldMix(0);
        audio.stop('stage-wait-ambient', { fadeOut: 0.3 });
        audio.setLevel('stage-land-ambient', { volume: 0.5 });
        setPower(0);
        const sticky = panels[current]?.querySelector<HTMLElement>('[data-stage-sticky]');
        if (sticky) sticky.style.opacity = '1';
      },

      onComplete() { advance(); },
    });
    slot.appendChild(button.el);
  }

  function advance(): void {
    const next = current + 1;
    if (!panels[next]) return;
    audio.stop('stage-land-ambient', { fadeOut: 0.6 });
    audio.play('whoosh');
    flash();
    topupBadge();
    slot.classList.remove('is-armed');

    current = next;
    showPanel(next);
    applyStage(next, 1);
    setPower(0.25);
    window.scrollTo({ top: 0, behavior: 'auto' });
    const sticky = panels[next].querySelector<HTMLElement>('[data-stage-sticky]');
    if (sticky) { sticky.style.opacity = '1'; sticky.style.transform = 'none'; }
    reveal(next);
    mountHold(next);
  }

  function goToStage(index: number): void {
    if (!panels[index]) return;
    current = index;
    showPanel(index);
    applyStage(index, index === 0 ? 0 : 1);
    setPower(index === 0 ? 0 : 0.25);
    window.scrollTo({ top: 0, behavior: 'auto' });
    reveal(index);
    mountHold(index);
  }

  rootEl.querySelectorAll<HTMLElement>('[data-goto]').forEach((btn, index) => {
    btn.addEventListener('click', () => {
      audio.unlock();
      audio.play('click');
      if (index > 1) return; // stages 3–5 not built yet
      goToStage(index);
    });
  });

  document.querySelector<HTMLElement>('[data-back]')?.addEventListener('click', () => {
    if (current > 0) goToStage(current - 1);
  });

  // --- Capture form -----------------------------------------------------
  const form = document.querySelector<HTMLFormElement>('#reserve-form');
  const msg = document.querySelector<HTMLElement>('#reserve-msg');
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = new FormData(form).get('email');
    if (!email || !String(email).includes('@')) {
      if (msg) msg.textContent = 'Enter a valid work email';
      return;
    }
    // [PLACEHOLDER] No endpoint wired yet — see README "Integration map".
    if (msg) msg.textContent = 'Thanks — we will be in touch about Phase 1A.';
    form.reset();
  });

  // --- Go ---------------------------------------------------------------
  initCursor();
  applyStage(0, 0);
  showPanel(0);
  setPower(0);
  gsap.set(rootEl.querySelectorAll('.line__inner'), { yPercent: 115, opacity: 0 });

  void initScene();
  window.addEventListener('scroll', onScroll, { passive: true });

  initLoader(() => {
    reveal(0);
    mountHold(0);
    audio.play('stage-land-ambient', { fadeIn: 1.2, volume: 0.35 });
    onScroll();
  });
}
