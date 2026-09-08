/**
 * Hold-to-advance button.
 *
 * The single most important interaction in the reference: holding does not
 * merely *trigger* the transition, it *scrubs* it. `onProgress` runs every
 * frame with 0..1 so the caller can cross-fade audio, tint the chrome and
 * drive the 3D scene in lockstep with the ring filling. Releasing early
 * reverses all of it through `onCancel`.
 */

import gsap from 'gsap';
import { audio } from './audio';

export interface HoldButtonConfig {
  label: string;
  holdLabel?: string;
  /** Seconds of sustained hold required. 0 turns this into a plain click button. */
  holdDuration?: number;
  audioTrack?: string;
  onStart?: () => void;
  onProgress?: (progress: number) => void;
  onComplete?: () => void;
  onCancel?: () => void;
  onClick?: () => void;
}

const RING_RADIUS = 21;
const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export class HoldButton {
  readonly el: HTMLElement;
  private hit: HTMLButtonElement;
  private ring: SVGCircleElement;
  private labelEl: HTMLSpanElement;

  private raf = 0;
  private startedAt = 0;
  private progress = 0;
  private holding = false;
  private completed = false;

  private downHandler: ((e: Event) => void) | null = null;
  private upHandler: ((e: Event) => void) | null = null;
  private clickHandler: ((e: Event) => void) | null = null;
  private keyDown: ((e: KeyboardEvent) => void) | null = null;
  private keyUp: ((e: KeyboardEvent) => void) | null = null;

  constructor(private config: HoldButtonConfig) {
    this.el = this.buildDom(config);
    this.hit = this.el.querySelector('button') as HTMLButtonElement;
    this.ring = this.el.querySelector('.hold-btn__ring-progress') as SVGCircleElement;
    this.labelEl = this.el.querySelector('.hold-btn__label') as HTMLSpanElement;

    this.ring.style.strokeDasharray = String(CIRCUMFERENCE);
    this.setProgress(0);

    if (config.holdDuration && config.holdDuration > 0 && !prefersReducedMotion()) {
      this.attachHoldMode(config.holdDuration);
    } else {
      this.attachClickMode();
    }
  }

  private buildDom(config: HoldButtonConfig): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'hold-btn';
    wrap.innerHTML = `
      <button type="button" class="hold-btn__hit" aria-describedby="hold-btn-hint">
        <svg class="hold-btn__ring" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
          <circle class="hold-btn__ring-track" cx="24" cy="24" r="${RING_RADIUS}" />
          <circle class="hold-btn__ring-progress" cx="24" cy="24" r="${RING_RADIUS}" />
        </svg>
        <span class="hold-btn__dot" aria-hidden="true"></span>
        <span class="hold-btn__label">${config.label}</span>
      </button>
      <span id="hold-btn-hint" class="visually-hidden">
        Press and hold, or press and hold the Enter key, to continue.
      </span>`;
    return wrap;
  }

  private attachClickMode(): void {
    this.clickHandler = () => {
      audio.unlock();
      this.config.onClick?.();
      this.config.onStart?.();
      this.config.onProgress?.(1);
      this.config.onComplete?.();
    };
    this.hit.addEventListener('click', this.clickHandler);
  }

  private attachHoldMode(holdDuration: number): void {
    const track = this.config.audioTrack;

    const begin = () => {
      if (this.holding || this.completed) return;
      audio.unlock();
      this.holding = true;
      this.startedAt = performance.now();
      this.el.classList.add('is-holding');
      if (this.config.holdLabel) this.labelEl.textContent = this.config.holdLabel;

      if (track) {
        // Scale the FX rate so the sound resolves exactly on ring completion.
        const natural = audio.getDuration(track);
        const scale = audio.getTrackOption(track, 'holdRateScale') ?? 1;
        const rate = (natural ? natural / holdDuration : 1) * scale;
        audio.play(track, { rate });
      }

      this.config.onStart?.();
      this.tick(holdDuration);
    };

    const end = () => {
      if (!this.holding) return;
      this.holding = false;
      cancelAnimationFrame(this.raf);
      this.el.classList.remove('is-holding');
      this.labelEl.textContent = this.config.label;
      if (track) audio.stop(track, { fadeOut: 0.1 });

      if (this.completed) return;

      // Rewind the scrub rather than snapping it — the caller's onProgress
      // runs the whole way back so audio and scene unwind together.
      const from = { p: this.progress };
      gsap.to(from, {
        p: 0,
        duration: Math.max(0.2, this.progress * 0.5),
        ease: 'power2.out',
        onUpdate: () => {
          this.progress = from.p;
          this.setProgress(from.p);
          this.config.onProgress?.(from.p);
        },
        onComplete: () => this.config.onCancel?.(),
      });
    };

    this.downHandler = (e) => { e.preventDefault(); begin(); };
    this.upHandler = () => end();
    this.keyDown = (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (e.repeat) return;
      e.preventDefault();
      begin();
    };
    this.keyUp = (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      end();
    };

    this.hit.addEventListener('pointerdown', this.downHandler);
    this.hit.addEventListener('keydown', this.keyDown);
    this.hit.addEventListener('keyup', this.keyUp);
    document.addEventListener('pointerup', this.upHandler);
    document.addEventListener('pointercancel', this.upHandler);
  }

  private tick(holdDuration: number): void {
    const step = () => {
      if (!this.holding) return;
      const elapsed = (performance.now() - this.startedAt) / 1000;
      this.progress = Math.min(1, elapsed / holdDuration);
      this.setProgress(this.progress);
      this.config.onProgress?.(this.progress);

      if (this.progress >= 1) {
        this.completed = true;
        this.holding = false;
        this.el.classList.add('is-complete');
        this.config.onComplete?.();
        return;
      }
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  setProgress(p: number): void {
    this.ring.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - p));
  }

  /** Allow the button to be held again after a cancelled or replayed stage. */
  reset(): void {
    this.completed = false;
    this.progress = 0;
    this.setProgress(0);
    this.el.classList.remove('is-complete', 'is-holding');
    this.labelEl.textContent = this.config.label;
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    if (this.clickHandler) this.hit.removeEventListener('click', this.clickHandler);
    if (this.downHandler) this.hit.removeEventListener('pointerdown', this.downHandler);
    if (this.keyDown) this.hit.removeEventListener('keydown', this.keyDown);
    if (this.keyUp) this.hit.removeEventListener('keyup', this.keyUp);
    if (this.upHandler) {
      document.removeEventListener('pointerup', this.upHandler);
      document.removeEventListener('pointercancel', this.upHandler);
    }
    this.el.remove();
  }
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
