/**
 * Custom cursor.
 *
 * The reference ships a sprite atlas of cursor states. Ours is drawn in CSS:
 * a lagging ring plus an instant dot, which reads as weight, and a small set of
 * states driven by `data-cursor` on whatever is under the pointer.
 */

export function initCursor(): void {
  if (window.matchMedia('(pointer: coarse)').matches) return;

  const ring = document.createElement('div');
  ring.className = 'cursor-ring';
  const dot = document.createElement('div');
  dot.className = 'cursor-dot';
  document.body.append(ring, dot);
  document.documentElement.classList.add('has-custom-cursor');

  let tx = window.innerWidth / 2;
  let ty = window.innerHeight / 2;
  let rx = tx;
  let ry = ty;

  window.addEventListener('pointermove', (e) => {
    tx = e.clientX;
    ty = e.clientY;
    dot.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;

    const el = (e.target as HTMLElement)?.closest?.('[data-cursor], a, button, input');
    const state = el instanceof HTMLElement
      ? (el.dataset.cursor ?? (el.tagName === 'INPUT' ? 'text' : 'action'))
      : '';
    ring.dataset.state = state;
  }, { passive: true });

  const loop = () => {
    // Trailing ring: the lag is the character.
    rx += (tx - rx) * 0.16;
    ry += (ty - ry) * 0.16;
    ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  document.addEventListener('pointerdown', () => ring.classList.add('is-down'));
  document.addEventListener('pointerup', () => ring.classList.remove('is-down'));
}
