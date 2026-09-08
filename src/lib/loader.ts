/**
 * Entry gate.
 *
 * The reference gates its experience behind a drawn zero. Ours asks you to
 * close the circuit: sweep a full turn around the ring and the site powers on.
 * The gesture accumulates *signed* angular travel, so scrubbing back and forth
 * does not cheat it — you have to actually go round.
 */

import { audio } from './audio';
import { prefersReducedMotion } from './hold-button';

const R = 96;
const CIRC = 2 * Math.PI * R;

export function initLoader(onComplete: () => void): void {
  const el = document.querySelector<HTMLElement>('#loader');
  if (!el) { onComplete(); return; }

  const arc = el.querySelector<SVGCircleElement>('.loader__ring-arc');
  const head = el.querySelector<SVGCircleElement>('.loader__ring-head');
  const label = el.querySelector<HTMLElement>('.loader__label');
  const skip = el.querySelector<HTMLButtonElement>('#loader-skip');
  const svg = el.querySelector<SVGSVGElement>('.loader__ring');
  if (!arc || !head || !svg) { onComplete(); return; }

  arc.style.strokeDasharray = String(CIRC);
  arc.style.strokeDashoffset = String(CIRC);

  let swept = 0;
  let lastAngle: number | null = null;
  let drawing = false;
  let done = false;

  const setProgress = (p: number) => {
    arc.style.strokeDashoffset = String(CIRC * (1 - p));
    const a = -Math.PI / 2 + p * Math.PI * 2;
    head.setAttribute('cx', String(120 + Math.cos(a) * R));
    head.setAttribute('cy', String(120 + Math.sin(a) * R));
  };
  setProgress(0);

  const finish = () => {
    if (done) return;
    done = true;
    setProgress(1);
    audio.unlock();
    audio.play('whoosh');
    el.classList.add('is-done');
    // Keep it out of the tab order once it has served its purpose.
    window.setTimeout(() => { el.hidden = true; onComplete(); }, 900);
  };

  const angleAt = (e: PointerEvent): number => {
    const r = svg.getBoundingClientRect();
    return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
  };

  const onDown = (e: PointerEvent) => {
    if (done) return;
    drawing = true;
    lastAngle = angleAt(e);
    el.classList.add('is-drawing');
    audio.unlock();
  };

  const onMove = (e: PointerEvent) => {
    if (!drawing || done || lastAngle === null) return;
    const a = angleAt(e);
    let d = a - lastAngle;
    // Unwrap across the ±π seam so one continuous turn reads as one turn.
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    swept += d;
    lastAngle = a;

    const p = Math.min(1, Math.abs(swept) / (Math.PI * 2));
    setProgress(p);
    if (label && p > 0.75) label.textContent = 'Almost';
    if (p >= 1) finish();
  };

  const onUp = () => {
    drawing = false;
    lastAngle = null;
    el.classList.remove('is-drawing');
  };

  el.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  skip?.addEventListener('click', finish);

  // Anyone who cannot perform a drag gesture gets in without one.
  if (prefersReducedMotion()) {
    el.classList.add('is-ready');
    skip?.focus();
  }

  // Stand in for real asset loading until there are assets to load.
  window.setTimeout(() => el.classList.add('is-ready'), 900);
}
