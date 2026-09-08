/**
 * Custom cursor.
 *
 * The reference ships a sprite atlas of cursor states. Ours is drawn in CSS
 * and driven from one attribute, so a state change costs a single DOM write.
 *
 * Three layers share one position:
 *   - a blurred trail, lagging hardest, whose opacity is the speed readout;
 *   - a ring, lagging a little, squashed and stretched along the direction of
 *     travel so fast movement reads as weight rather than teleportation;
 *   - a dot, exactly under the pointer, which is the thing you actually aim.
 *
 * States (see chrome.css for the visual definitions):
 *   default   quiet ring + dot
 *   action    links, buttons, controls — ring contracts onto a signal wash
 *   text      inputs — ring collapses, a blinking caret takes over
 *   draw      the entry gate — ring opens out, dashed arc turns, nib glyph
 *   grab      the campus model, idle — open hand
 *   grabbing  the campus model, dragging — closed hand
 *
 * Everything is transform/opacity. On a coarse pointer nothing is created at
 * all; under prefers-reduced-motion the lag, the stretch and the trail are
 * all switched off and the cursor tracks exactly.
 */

type CursorState = 'default' | 'action' | 'text' | 'draw' | 'grab' | 'grabbing';

/** Input types that take a caret. Everything else on <input> is a control. */
const TEXTUAL = new Set([
  'text', 'email', 'search', 'url', 'tel', 'password', 'number', '',
]);

const INTERACTIVE =
  'a[href], button, [role="button"], [role="link"], summary, select, label[for]';

const GLYPHS: Partial<Record<CursorState, string>> = {
  draw:
    '<path d="M4 16.2 5.3 12.6l8-8a1.7 1.7 0 0 1 2.4 2.4l-8 8L4 16.2Z"/>' +
    '<path d="m11.5 6.6 2 2"/>',
  grab:
    '<path d="M7 11.4V4.6a1.1 1.1 0 0 1 2.2 0V9M9.2 9V3.6a1.1 1.1 0 0 1 2.2 0V9' +
    'M11.4 9V4.4a1.1 1.1 0 0 1 2.2 0V10M13.6 10V6.6a1.1 1.1 0 0 1 2.2 0V12' +
    'c0 3.4-2 5.6-5 5.6-2.6 0-3.7-1-4.9-2.8L4 12.6c-.5-.8-.2-1.6.6-2 .7-.4 1.5-.2 1.9.5l.5.9"/>',
  grabbing:
    '<path d="M6 9.6V7.8a1.1 1.1 0 0 1 2.2 0V9.2M8.2 9.2V7.2a1.1 1.1 0 0 1 2.2 0V9.2' +
    'M10.4 9.2V7.4a1.1 1.1 0 0 1 2.2 0V9.6M12.6 9.6V8a1.1 1.1 0 0 1 2.2 0v4' +
    'c0 3.4-2 5.6-5 5.6-2.6 0-3.7-1-4.9-2.8L3.6 12.6c-.5-.8-.2-1.6.6-2 .7-.4 1.5-.2 1.9.5l.5.9"/>',
};

function glyphMarkup(state: keyof typeof GLYPHS): string {
  return (
    `<span class="cur__glyph" data-glyph="${state}">` +
    '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" ' +
    'stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    `${GLYPHS[state] ?? ''}</svg></span>`
  );
}

export function initCursor(): void {
  if (window.matchMedia('(pointer: coarse)').matches) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const root = document.createElement('div');
  root.className = 'cur';
  root.setAttribute('aria-hidden', 'true');
  root.dataset.state = 'default';
  root.innerHTML =
    '<div class="cur__trail"></div>' +
    '<div class="cur__ring">' +
      '<div class="cur__ring-state">' +
        '<div class="cur__ring-stretch">' +
          '<div class="cur__ring-fill"></div>' +
          '<svg class="cur__ring-svg" viewBox="0 0 44 44" aria-hidden="true">' +
            '<circle class="cur__ring-circle" cx="22" cy="22" r="21" vector-effect="non-scaling-stroke"/>' +
            '<circle class="cur__ring-arc" cx="22" cy="22" r="21" vector-effect="non-scaling-stroke"/>' +
          '</svg>' +
        '</div>' +
      '</div>' +
      '<div class="cur__glyphs">' +
        glyphMarkup('draw') + glyphMarkup('grab') + glyphMarkup('grabbing') +
      '</div>' +
    '</div>' +
    '<div class="cur__dot"></div>' +
    '<div class="cur__caret"><div class="cur__caret-bar"></div></div>';

  document.body.appendChild(root);
  document.documentElement.classList.add('has-custom-cursor');

  const trail = root.querySelector<HTMLElement>('.cur__trail');
  const ring = root.querySelector<HTMLElement>('.cur__ring');
  const stretch = root.querySelector<HTMLElement>('.cur__ring-stretch');
  const dot = root.querySelector<HTMLElement>('.cur__dot');
  const caret = root.querySelector<HTMLElement>('.cur__caret');
  if (!trail || !ring || !stretch || !dot || !caret) return;

  // --- position -----------------------------------------------------------
  let tx = window.innerWidth / 2;
  let ty = window.innerHeight / 2;
  let rx = tx, ry = ty;          // ring, lagging
  let sx = tx, sy = ty;          // trail, lagging harder
  let lastX = tx, lastY = ty;
  let lastT = 0;

  // --- velocity -----------------------------------------------------------
  let speed = 0;                 // smoothed, 0..1
  let lastCv = '';
  let dirX = 1, dirY = 0;        // smoothed direction of travel

  // --- state --------------------------------------------------------------
  let hovered: CursorState = 'default';
  let down = false;
  let live = false;

  const ringLag = reduced ? 1 : 0.2;
  const trailLag = reduced ? 1 : 0.09;

  function campusLive(): boolean {
    const ui = document.getElementById('campus-ui');
    return !!ui && !ui.hasAttribute('hidden');
  }

  function stateFor(node: Element | null): CursorState {
    if (!node) return 'default';

    // The entry gate asks for a gesture; say so with the cursor.
    const loader = node.closest('#loader');
    if (loader && !loader.classList.contains('is-done')) return 'draw';

    const declared = node.closest<HTMLElement>('[data-cursor]')?.dataset.cursor;
    if (declared === 'action' || declared === 'text' || declared === 'draw' ||
        declared === 'grab' || declared === 'grabbing' || declared === 'default') {
      return declared;
    }

    const field = node.closest<HTMLElement>('input, textarea, [contenteditable=""], [contenteditable="true"]');
    if (field) {
      if (field instanceof HTMLInputElement && !TEXTUAL.has(field.type)) return 'action';
      return 'text';
    }

    if (node.closest(INTERACTIVE)) return 'action';

    // Once the campus is handed over, the world itself is the control: the
    // whole scene reads as something you can push around. Anything above it
    // that is actually a control has already been claimed above.
    if (campusLive()) return 'grab';

    return 'default';
  }

  function applyState(): void {
    const next: CursorState = hovered === 'grab' && down ? 'grabbing' : hovered;
    if (root.dataset.state !== next) root.dataset.state = next;
  }

  function setHovered(node: Element | null): void {
    const next = stateFor(node);
    if (next !== hovered) {
      hovered = next;
      applyState();
    }
  }

  // --- events -------------------------------------------------------------
  window.addEventListener('pointermove', (e: PointerEvent) => {
    if (e.pointerType === 'touch') {
      root.classList.add('is-away');
      return;
    }
    root.classList.remove('is-away');
    if (!live) {
      live = true;
      // Land the whole rig where the pointer actually is before revealing it.
      rx = sx = tx = e.clientX;
      ry = sy = ty = e.clientY;
      root.classList.add('is-live');
    }

    const now = e.timeStamp || performance.now();
    const dt = lastT ? Math.min(64, now - lastT) : 16;
    lastT = now;

    tx = e.clientX;
    ty = e.clientY;

    const dx = tx - lastX;
    const dy = ty - lastY;
    lastX = tx;
    lastY = ty;

    if (!reduced) {
      const px = Math.hypot(dx, dy) / Math.max(1, dt);   // px per ms
      // 2 px/ms is a brisk flick; anything above that is already at full tilt.
      const target = Math.min(1, px / 2);
      speed += (target - speed) * 0.45;
      if (px > 0.02) {
        const inv = 1 / Math.hypot(dx, dy);
        dirX += (dx * inv - dirX) * 0.3;
        dirY += (dy * inv - dirY) * 0.3;
      }
    }

    dot.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
    caret.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;

    setHovered(e.target instanceof Element ? e.target : null);
  }, { passive: true });

  document.addEventListener('pointerdown', () => {
    down = true;
    root.classList.add('is-down');
    applyState();
  }, { passive: true });

  const release = (): void => {
    down = false;
    root.classList.remove('is-down');
    applyState();
  };
  document.addEventListener('pointerup', release, { passive: true });
  document.addEventListener('pointercancel', release, { passive: true });

  // Leaving the window should take the cursor with it.
  document.addEventListener('pointerleave', () => root.classList.add('is-away'));
  document.addEventListener('pointerenter', () => root.classList.remove('is-away'));
  window.addEventListener('blur', () => { root.classList.add('is-away'); release(); });

  // The thing under the pointer can change without the pointer moving — the
  // gate closes, the campus hands over control. Re-read it, cheaply.
  window.setInterval(() => {
    if (!live || root.classList.contains('is-away')) return;
    setHovered(document.elementFromPoint(tx, ty));
  }, 260);

  // --- loop ---------------------------------------------------------------
  const loop = (): void => {
    rx += (tx - rx) * ringLag;
    ry += (ty - ry) * ringLag;
    sx += (tx - sx) * trailLag;
    sy += (ty - sy) * trailLag;

    ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
    trail.style.transform = `translate3d(${sx}px, ${sy}px, 0)`;

    if (!reduced) {
      speed *= 0.93;                      // decay when the pointer rests
      if (speed < 0.002) speed = 0;
      const cv = speed.toFixed(3);
      if (cv !== lastCv) {
        lastCv = cv;
        root.style.setProperty('--cv', cv);
      }

      // Squash and stretch along the direction of travel.
      const s = speed * 0.3;
      const angle = (Math.atan2(dirY, dirX) * 180) / Math.PI;
      stretch.style.transform =
        `rotate(${angle.toFixed(1)}deg) scale(${(1 + s).toFixed(3)}, ${(1 - s * 0.62).toFixed(3)})`;
    }

    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
