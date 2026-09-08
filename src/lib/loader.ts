/**
 * Entry.
 *
 * Was a drawn gesture; it is now a title card. The brand line rises out of its
 * masks over the live world, a rule draws under it, and it clears itself — the
 * visitor is not asked to do anything to get in. Any input takes them straight
 * through, so it never becomes a wall.
 */

import { audio } from './audio';
import { prefersReducedMotion } from './hold-button';

/** How long the card holds once it has finished arriving. */
const DWELL_MS = 2300;
/** Matches the CSS opacity transition on `.is-done`. */
const FADE_MS = 900;

/**
 * Input is ignored for this long. Without it a stray click or a trackpad
 * twitch in the first moments skips the card entirely and the visitor never
 * sees the line — which, since it is the only place the company introduces
 * itself, would be worse than making them wait.
 */
const GRACE_MS = 1100;

export function initLoader(onComplete: () => void): void {
  const el = document.querySelector<HTMLElement>('#loader');
  if (!el) { onComplete(); return; }

  const skip = el.querySelector<HTMLButtonElement>('#loader-skip');
  const reduced = prefersReducedMotion();

  let done = false;
  let dwell = 0;
  const openedAt = performance.now();

  /**
   * `byUser` matters: the card also clears itself on a timer, and unlocking
   * audio there constructs an AudioContext with no gesture behind it. Chrome
   * then leaves it suspended, the bus believes it is live, and every sound
   * queues against a frozen clock. Only a real interaction may unlock.
   */
  const finish = (byUser: boolean): void => {
    if (done) return;
    done = true;
    window.clearTimeout(dwell);
    if (byUser) {
      audio.unlock();
      audio.play('whoosh');
    }
    el.classList.add('is-done');
    window.setTimeout(() => {
      el.hidden = true;
      teardown();
      onComplete();
    }, reduced ? 0 : FADE_MS);
  };

  // Anything at all takes you in, once the line has had time to land. The
  // card is a greeting, not a gate.
  const onAny = (): void => {
    if (performance.now() - openedAt < GRACE_MS) return;
    finish(true);
  };

  function teardown(): void {
    window.removeEventListener('wheel', onAny);
    window.removeEventListener('pointerdown', onAny);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('touchstart', onAny);
    skip?.removeEventListener('click', onAny);
  }

  const onKey = (e: KeyboardEvent): void => {
    // Leave modifier combinations alone — they are not an attempt to enter.
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    onAny();
  };

  skip?.addEventListener('click', () => finish(true));
  window.addEventListener('wheel', onAny, { passive: true });
  window.addEventListener('pointerdown', onAny, { passive: true });
  window.addEventListener('touchstart', onAny, { passive: true });
  window.addEventListener('keydown', onKey);

  // Arrive on the next frame so the transition has a starting state to leave.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.classList.add('is-in');
      window.setTimeout(() => el.classList.add('is-ready'), reduced ? 0 : 700);
        dwell = window.setTimeout(() => finish(false), reduced ? 600 : DWELL_MS);
    });
  });
}
