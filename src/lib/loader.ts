/**
 * Entry.
 *
 * Was a drawn gesture, then a typed title card; it is now the company's own
 * logo with the brand's electron flow running through it, over the live world.
 * A rule draws under it and it clears itself — the visitor is not asked to do
 * anything to get in. Any input takes them straight through, so it never
 * becomes a wall.
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

/** What mountSmartTec hands back. Only the two calls this file makes. */
interface ParticleHandle {
  destroy(): void;
}

export function initLoader(onComplete: () => void): void {
  const el = document.querySelector<HTMLElement>('#loader');
  if (!el) { onComplete(); return; }

  const skip = el.querySelector<HTMLButtonElement>('#loader-skip');
  const reduced = prefersReducedMotion();

  /**
   * The animated mark.
   *
   * `formation: false` on purpose. The card dwells for a little over two
   * seconds, and the formation intro spends most of that gathering particles
   * into the wordmark — which inside that window reads as a logo failing to
   * load rather than as an animation. Starting from the readable logo and
   * running the energy through it means the mark is legible in the first
   * frame, which is the whole reason it is here.
   *
   * `transparent: true` because this sits over the world, not over the kit's
   * forest fill; the container carries `data-transparent` to match.
   *
   * Everything here is best-effort. The flat vector lockup is already on
   * screen and stays there unless this actually starts, so a failed import, a
   * missing canvas or a thrown renderer costs the visitor nothing.
   */
  const stage = el.querySelector<HTMLElement>('#loader-particles');
  const logo = el.querySelector<HTMLElement>('#loader-logo');
  let particles: ParticleHandle | null = null;
  let particlesDead = false;

  if (stage && logo) {
    void (async () => {
      try {
        // Assembled rather than written as a literal: the file is served from
        // public/, so it is not part of the module graph, and a literal path
        // makes both the bundler and the type checker try to resolve it at
        // build time and fail.
        const src = `${'/assets/smarttec/'}smarttec-particles.mjs`;
        const mod = (await import(/* @vite-ignore */ src)) as {
          mountSmartTec: (el: HTMLElement, opts?: Record<string, unknown>) => Promise<ParticleHandle>;
        };
        const handle = await mod.mountSmartTec(stage, {
          intensity: 'website',
          formation: false,
          transparent: true,
          speed: 1,
        });
        // The card may already have cleared while that was loading.
        if (particlesDead) { handle.destroy(); return; }
        particles = handle;
        logo.classList.add('is-live');
      } catch {
        // The flat lockup is the fallback, and it is already visible.
      }
    })();
  }

  const killParticles = (): void => {
    particlesDead = true;
    particles?.destroy();
    particles = null;
  };

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
      killParticles();
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
