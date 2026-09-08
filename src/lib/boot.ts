/**
 * Cinematic route boot.
 *
 * Vertical slice: stage 1 (THE LAND) renders, reveals and hands off to stage 2
 * (THE WAIT) through the hold interaction — the hold scrubs the shader's world
 * mix, the ambient audio cross-fade and the chrome tint together, and releasing
 * early unwinds all three. The remaining stages plug into the same contract.
 */

import gsap from 'gsap';
import type { Experience } from './scene/experience';
import { HoldButton, prefersReducedMotion } from './hold-button';
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
  const powerValue = document.querySelector<HTMLElement>('#power-value');
  if (!canvas || !root || !holdSlot) return;

  // Signals to CSS that the cinematic path is live, which retires the static one.
  document.documentElement.classList.add('js-ready');

  // Re-bind after the guard so the narrowed types survive into the closures below.
  const canvasEl: HTMLCanvasElement = canvas;
  const rootEl: HTMLElement = root;

  const reduced = prefersReducedMotion();
  const panels = Array.from(rootEl.querySelectorAll<HTMLElement>('[data-stage-panel]'));

  // --- 3D ---------------------------------------------------------------
  // Three.js is the single heaviest dependency, so it is code-split and pulled
  // in only after the first screen has painted. The CSS gradient behind the
  // canvas is a complete picture until it arrives — and if it never does.
  let experience: Experience | null = null;

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
      // Handle for automated visual verification (pause the loop before capture).
      (window as unknown as { __experience?: Experience }).__experience = experience;
    } catch {
      canvasEl.hidden = true;
      document.body.dataset.noWebgl = '';
    }
  }

  const idle = window.requestIdleCallback ?? ((fn: () => void) => setTimeout(fn, 200));
  idle(() => void initScene());

  // --- Stage state ------------------------------------------------------
  let current = 0;

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

  // --- Reveal -----------------------------------------------------------
  const first = panels[0];
  if (first && !reduced) {
    const lines = first.querySelectorAll<HTMLElement>('[data-reveal]');
    gsap.set(lines, { yPercent: 40, opacity: 0 });
    gsap.to(lines, {
      yPercent: 0,
      opacity: 1,
      duration: 1.1,
      ease: 'power3.out',
      stagger: 0.09,
      delay: 0.25,
    });
  }

  // --- Power badge count-up --------------------------------------------
  function setPower(fraction: number): void {
    if (!powerValue) return;
    powerValue.textContent = String(Math.round(PHASE_1A_KW * fraction));
  }
  setPower(0);

  // --- The hold ---------------------------------------------------------
  const stage1 = stages[0];
  const holdConfig = stage1.hold;

  const button = new HoldButton({
    label: holdConfig?.label ?? 'Continue',
    holdLabel: holdConfig?.holdLabel,
    holdDuration: holdConfig?.duration ?? 0,
    audioTrack: 'hold-button',

    onStart() {
      audio.play('stage-land-ambient', { fadeIn: 0.4, volume: 0.5 });
      audio.play('stage-wait-ambient', { fadeIn: 0, volume: 0 });
    },

    // One callback drives the shader, both ambiences, the chrome and the badge.
    onProgress(p) {
      experience?.setWorldMix(p);
      audio.setLevel('stage-land-ambient', { volume: (1 - p) * 0.5 });
      audio.setLevel('stage-wait-ambient', { volume: p * 0.5 });
      setPower(p * 0.25);
      if (first) first.style.opacity = String(1 - p * 0.85);
    },

    onCancel() {
      experience?.setWorldMix(0);
      audio.stop('stage-wait-ambient', { fadeOut: 0.3 });
      audio.setLevel('stage-land-ambient', { volume: 0.5 });
      setPower(0);
      if (first) first.style.opacity = '1';
    },

    onComplete() {
      current = 1;
      audio.stop('stage-land-ambient', { fadeOut: 0.6 });
      audio.play('whoosh');
      if (first) first.style.opacity = '1';
      showPanel(1);
      applyStage(1, 1);
      setPower(0.25);
      const next = panels[1];
      if (next && !reduced) {
        gsap.fromTo(
          next.querySelectorAll<HTMLElement>('[data-reveal]'),
          { yPercent: 40, opacity: 0 },
          { yPercent: 0, opacity: 1, duration: 1, ease: 'power3.out', stagger: 0.08 },
        );
      }
      button.destroy();
    },
  });
  holdSlot.appendChild(button.el);

  // --- Ruler jump buttons ----------------------------------------------
  rootEl.querySelectorAll<HTMLElement>('[data-goto]').forEach((btn, index) => {
    btn.addEventListener('click', () => {
      audio.unlock();
      audio.play('click');
      if (index > 1) return; // stages 3–5 are not built yet in this slice
      current = index;
      showPanel(index);
      applyStage(index, index === 0 ? 0 : 1);
      setPower(index === 0 ? 0 : 0.25);
    });
  });

  // --- Back control -----------------------------------------------------
  document.querySelector<HTMLElement>('[data-back]')?.addEventListener('click', () => {
    if (current === 0) return;
    current -= 1;
    showPanel(current);
    applyStage(current, current === 0 ? 0 : 1);
    setPower(current === 0 ? 0 : 0.25);
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

  applyStage(0, 0);
  showPanel(0);
}
