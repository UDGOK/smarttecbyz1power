/**
 * Cinematic route boot.
 *
 * Five stage worlds on one scroll spine. Scrolling drives the ruler, the camera
 * and the copy; reaching the end of a stage arms the hold; holding scrubs the
 * outgoing world apart while a shader effect carries the eye into the next one.
 * Arriving at the campus hands control back to the visitor.
 */

import gsap from 'gsap';
import { SceneHost } from './scene/host';
import { loadScene, warmScene } from './scene/registry';
import type { CampusScene } from './scene/stage-campus';
import { prefersReducedMotion } from './hold-button';
import { initLoader } from './loader';
import { initCursor } from './cursor';
import { initConfigurator } from './configurator';
import { revealLines, scramble } from './type-motion';
import { ScrollManager, CameraRig, SCROLL_CONFIG, DELTA_SCALE } from './scroll';
import { audio } from './audio';
import { submitInquiry, failureMessage } from './inquiry';
import { stages, ENTRY_MIX, compute } from '../data/site';

/**
 * The estimated planned first-phase IT load, read from the record rather than
 * hard-coded — it moved from 114 kW to 7.5 when the first phase changed from
 * eight HGX B200s to two RTX nodes, and a literal here would have silently
 * kept counting to the old number.
 *
 * What the badge does with it is an illustration of a planned load being
 * assembled, not a measure of anything sold. See PowerBadge.astro.
 */
const PLANNED_KW = Number.parseFloat(compute.load.replace(/[^0-9.]/g, '')) || 7.5;

/**
 * Where in a stage's scroll track the next world starts bleeding in. Before
 * this you are reading; after it, the crossing is already underway and your
 * own scrolling is what drives it. No button, no gate — the reference advances
 * the same way, at its own scroll threshold.
 */
const CROSS_START = 0.8;

/** Ignore scroll for this long after a swap, or momentum re-triggers it. */
const SWAP_LOCKOUT_MS = 620;

/**
 * How far past the top of a stage you may pull before it hands you back to the
 * previous world, as a fraction of the track. Small enough that it takes
 * intent, large enough that it never fires on the bounce at the top.
 */
const RETREAT_MARGIN = 0.055;

/**
 * Where you land when you go back: near the end of the previous stage, but
 * short of the point where its crossing begins — so arriving does not
 * immediately push you forward again.
 */
const RETREAT_LANDING = 0.74;

/**
 * How much longer a stage's track is than its nominal height.
 *
 * Calibrated by measurement, not taste: at 1.0 a single wheel notch advanced
 * 5.5% of a stage, so a trackpad swipe — which emits a long momentum tail of
 * events — crossed two whole worlds before the visitor could read either. At
 * 2.6 a notch is worth about 2%, so a stage takes deliberate effort and a
 * momentum flick lands inside it rather than through it.
 */
const STAGE_TRACK_SCALE = 2.6;

/** Share of the planned load the badge has assembled at each stage. */
const STAGE_KW = [0, 0.08, 0.35, 1, 1];

const AMBIENT: Record<string, string> = {
  land: 'stage-land-ambient',
  wait: 'stage-wait-ambient',
  power: 'stage-power-ambient',
  machine: 'stage-machine-ambient',
  campus: 'stage-campus-ambient',
};

function supportsWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

function run(): void {
  const canvas = document.querySelector<HTMLCanvasElement>('#experience-canvas');
  const root = document.querySelector<HTMLElement>('[data-stage-root]');
  const holdSlot = document.querySelector<HTMLElement>('#hold-slot');
  // holdSlot is vestigial — the hold button was replaced by scroll — so it
  // must not be able to take the whole experience down by being absent.
  if (!canvas || !root) return;

  document.documentElement.classList.add('js-ready');

  // The reading path below the experience ships visible so a no-JS visitor
  // still gets it. Now that JS is running, hide it until the campus.
  document.querySelector<HTMLElement>('#after')?.setAttribute('hidden', '');

  const canvasEl: HTMLCanvasElement = canvas;
  const rootEl: HTMLElement = root;
  const slot: HTMLElement | null = holdSlot;

  const readout = document.querySelector<HTMLElement>('#ruler-readout');
  const rulerTrack = document.querySelector<HTMLElement>('.scroll-ruler-track');
  const powerValue = document.querySelector<HTMLElement>('#power-value');
  const campusUI = document.querySelector<HTMLElement>('#campus-ui');
  const hotspotLayer = document.querySelector<HTMLElement>('#campus-hotspots');
  const after = document.querySelector<HTMLElement>('#after');

  const reduced = prefersReducedMotion();
  const panels = Array.from(rootEl.querySelectorAll<HTMLElement>('[data-stage-panel]'));

  let host: SceneHost | null = null;
  /**
   * The experience is armed only when the gate has cleared AND the scene is
   * up. They finish in either order — the gate runs on a timer, the scene
   * waits on a 127KB chunk — so whichever lands second does the arming.
   */
  let armed = false;
  let gateCleared = false;
  let sceneState: 'pending' | 'ready' | 'failed' = 'pending';
  let current = 0;
  let swapping = false;
  let lockedUntil = 0;
  let crossing = false;

  // The reference does not use native scroll: it damps its own position, which
  // is most of why its motion reads smooth. Same model here.
  /**
   * Touch devices keep native scrolling.
   *
   * The damped virtual scroll is a real improvement over a mouse wheel, which
   * arrives in coarse notches. It is a liability on a phone: iOS already has
   * better momentum than we can synthesise, and taking `overflow` away in
   * order to replace it means any failure in the replacement leaves a page
   * that cannot be moved at all. Which is what happened.
   */
  const nativeScroll = window.matchMedia('(pointer: coarse)').matches;

  // `touch: false` on the spine is load-bearing, not tidiness: the manager
  // binds a non-passive touchmove that calls preventDefault, and it does so on
  // construction regardless of whether it is ever enabled. Built with touch
  // bound, it silently ate every finger drag on the page.
  const scroller = new ScrollManager({ reducedMotion: reduced, touch: !nativeScroll });
  if (nativeScroll) scroller.disable();
  const rig = new CameraRig({ reducedMotion: reduced });
  // Deliberately NOT armed here. `data-virtual-scroll` sets overflow: hidden,
  // so arming it before the scroller is actually running means any later
  // failure leaves a page that cannot be scrolled at all. It goes on at the
  // same moment the scroller is enabled, and comes off if anything breaks.

  /**
   * A stage's scroll track, in the manager's own units.
   *
   * The manager multiplies raw wheel/touch deltas by DELTA_SCALE (35), which
   * is the reference's own figure — so the track has to be expressed in those
   * same units or a dozen wheel notches cross the entire stage. One notch of
   * roughly 100px therefore advances about 100px worth of the track.
   */
  /** Sets the track and allows a small overscroll upward for the retreat. */
  function armStage(index: number): void {
    const len = trackLength(index);
    scroller.setActiveStage(len);
    scroller.setScrollClamp(index > 0 ? -len * RETREAT_MARGIN * 1.6 : 0, len);
  }

  const trackLength = (index: number): number =>
    ((stages[index]?.scrollVh ?? 250) / 100) * window.innerHeight * DELTA_SCALE * STAGE_TRACK_SCALE;

  // --- Scene host, code-split and idle-loaded ---------------------------
  async function initScene(): Promise<void> {
    if (!supportsWebGL()) {
      canvasEl.hidden = true;
      document.body.dataset.noWebgl = '';
      sceneState = 'failed';
      maybeArm();
      return;
    }
    try {
      host = new SceneHost(canvasEl, reduced);
      host.setStage(await loadScene(stages[0].scene));
      host.setWorldMix(ENTRY_MIX[stages[0].id] ?? 0);
      host.start();
      window.addEventListener('resize', host.resize);
      (window as unknown as { __experience?: SceneHost }).__experience = host;

      sceneState = 'ready';
      maybeArm();

      // The scroll and the rig are stepped on their own clock (see `tick`),
      // not here — they must keep running even when this loop does not exist.
      // What does belong here is the stage threshold check, which only means
      // anything while there is a world to advance.
      host.onFrame(() => {
        if (!nativeScroll && !swapping && performance.now() > lockedUntil) {
          const p = scroller.progress;
          const t = p <= CROSS_START ? 0 : (p - CROSS_START) / (1 - CROSS_START);
          if (t >= 0.995) void advance();
          else if (p <= -RETREAT_MARGIN && current > 0) void retreat();
        }

        host?.setRigOffset(
          rig.offsetX * SCROLL_CONFIG.CAMERA_RIG.MAX_OFFSET * 6,
          rig.offsetY * SCROLL_CONFIG.CAMERA_RIG.MAX_OFFSET * 6,
          rig.focalDistance,
        );
      });
      warmScene(stages[1].scene);
    } catch {
      canvasEl.hidden = true;
      document.body.dataset.noWebgl = '';
      sceneState = 'failed';
      maybeArm();
    }
  }

  /**
   * The damped scroll and the parallax rig are driven here, on their own
   * clock, and NOT from the renderer's loop.
   *
   * They used to ride on `host.onFrame`, which meant that if WebGL failed to
   * start — an old phone, a lost context, a scene that threw — the loop never
   * ran, nothing advanced the scroll position, and because the page had
   * already been switched to virtual scrolling there was no native scrolling
   * either. The result was a page that could not be moved at all.
   */
  let lastTick = performance.now();
  const tick = (now: number): void => {
    const dt = Math.min(0.064, (now - lastTick) / 1000);
    lastTick = now;
    scroller.update(dt);
    rig.update(dt);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  // --- The continuous spine (touch) --------------------------------------
  /**
   * On touch, all five stages sit in the document at once — each is a 250vh
   * section with a sticky panel — and the browser's own scrolling moves
   * between them. Nothing is hidden, nothing is ever scrolled back to zero.
   *
   * The previous arrangement kept one panel and reset the scroll on each
   * advance. iOS momentum does not stop for a `scrollTo`, so the reset landed
   * you at the top of the next stage still travelling at speed, which hit the
   * end and advanced again: one flick ran through every world, no headline
   * stayed up long enough to read, and because "back" was wired to the virtual
   * scroller — which touch no longer uses — there was no way to return.
   *
   * Reading the spine instead of driving it makes reverse free: scrolling up
   * is just scrolling up, and each stage re-enters exactly as it left.
   */

  /** Signed progress through a stage. Below 0 is above it, above 1 is past. */
  function panelProgress(index: number): number {
    const panel = panels[index];
    if (!panel) return 0;
    const rect = panel.getBoundingClientRect();
    const travel = Math.max(1, rect.height - window.innerHeight);
    return -rect.top / travel;
  }

  /**
   * The stage that owns the screen: the last one whose predecessor has run out
   * of track.
   *
   * Not "the last section whose top has passed the viewport top" — that is a
   * whole viewport later. A panel is `position: sticky` inside a 250vh
   * section, so it unpins and rides away at 150vh, while the next section's
   * top does not arrive until 250vh. Switching on the section boundary left
   * every join with a screenful of scrolling in which the outgoing headline
   * had already faded out and the incoming one had not been revealed yet —
   * the missing section titles, and a third of the journey.
   *
   * Handing over at the end of the pin instead means the outgoing copy leaves
   * exactly as the incoming copy rises into view.
   */
  function spineIndex(): number {
    for (let i = panels.length - 1; i > 0; i -= 1) {
      if (panelProgress(i - 1) >= 1) return i;
    }
    return 0;
  }

  let spineSwapping = false;

  /**
   * Take the world to `index`. Called in both directions and for jumps of more
   * than one, because a fast fling can cross two boundaries inside one frame.
   */
  async function spineSwap(index: number): Promise<void> {
    const to = stages[index];
    const from = stages[current];
    if (!to || spineSwapping || index === current) return;
    spineSwapping = true;
    swapping = true;
    const forward = index > current;

    if (host && from.scene !== to.scene) {
      host.setStage(await loadScene(to.scene));
      host.setClearColor(to.ground);
    }
    host?.endTransition();
    host?.setWorldMix(ENTRY_MIX[to.id] ?? 0);
    crossing = false;

    audio.stop(AMBIENT[from.id], { fadeOut: 0.5 });
    audio.play(AMBIENT[to.id], { fadeIn: 0.5, volume: 0.45 });

    current = index;
    applyChrome(index);
    setPower(STAGE_KW[index] ?? 1);
    if (forward) topupBadge();

    // Whichever way you came, the panel you land on is fully present and its
    // copy plays in. Going back used to leave the headline at whatever opacity
    // the crossing had faded it to.
    const sticky = panels[index].querySelector<HTMLElement>('[data-stage-sticky]');
    if (sticky) { sticky.style.opacity = '1'; sticky.style.transform = 'none'; }
    reveal(index);

    if (to.scene === 'campus') enterCampus(); else exitCampus();
    if (stages[index + 1]) warmScene(stages[index + 1].scene);
    if (stages[index - 1]) warmScene(stages[index - 1].scene);

    swapping = false;
    spineSwapping = false;
    readSpine();
  }

  let nativeTicking = false;
  function readSpine(): void {
    if (spineSwapping) return;
    const index = spineIndex();
    if (index !== current) { void spineSwap(index); return; }
    onProgress(Math.min(1, Math.max(0, panelProgress(index))));
  }

  function onNativeScroll(): void {
    if (nativeTicking) return;
    nativeTicking = true;
    requestAnimationFrame(() => {
      nativeTicking = false;
      readSpine();
    });
  }

  /** Hands the page to the experience, or to the browser if there is none. */
  function maybeArm(): void {
    if (!gateCleared || sceneState === 'pending') return;
    if (armed) return;
    armed = true;

    if (sceneState === 'ready' && nativeScroll) {
      // The document scrolls; we only read it. Nothing is taken away, so
      // nothing can freeze. Every stage joins the spine — the markup ships
      // with all but the first hidden so a no-JS visitor gets one clean
      // screen rather than five stacked ones.
      for (const panel of panels) {
        panel.hidden = false;
        panel.removeAttribute('aria-hidden');
      }
      window.addEventListener('scroll', onNativeScroll, { passive: true });
      window.addEventListener('resize', onNativeScroll, { passive: true });
      onNativeScroll();
    } else if (sceneState === 'ready') {
      scroller.enable();
      document.body.dataset.virtualScroll = '';
      onProgress(0);
    } else {
      // No scene to drive, so never take native scrolling away: that pairing
      // is what produces a page nothing can move.
      for (const panel of panels) {
        panel.hidden = false;
        panel.removeAttribute('aria-hidden');
        const sticky = panel.querySelector<HTMLElement>('[data-stage-sticky]');
        if (sticky) { sticky.style.opacity = '1'; sticky.style.transform = 'none'; }
        for (const line of panel.querySelectorAll<HTMLElement>('.line__inner')) {
          line.style.opacity = '1';
          line.style.transform = 'none';
        }
      }
      document.querySelector<HTMLElement>('#after')?.removeAttribute('hidden');
    }
    window.dispatchEvent(new Event('experience:ready'));
  }

  // If the scene chunk never resolves at all, stop waiting on it.
  window.setTimeout(() => {
    if (sceneState === 'pending') { sceneState = 'failed'; maybeArm(); }
  }, 9000);

  // --- Chrome ------------------------------------------------------------
  function applyChrome(index: number): void {
    const stage = stages[index];
    if (!stage) return;
    // Each world carries its own grade.
    host?.setPost(stage.post);
    document.documentElement.dataset.chrome = stage.chrome === 'dark' ? 'dark' : 'light';
    if (readout) readout.textContent = stage.ruler;
    rootEl.querySelectorAll<HTMLElement>('.scroll-ruler-nav-btn').forEach((b, i) => {
      b.setAttribute('aria-current', String(i === index));
    });
  }

  function showPanel(index: number): void {
    // On the continuous spine every stage is in the document at once and the
    // browser decides which one you are looking at. Hiding four of five is
    // what made the phone show one headline and then none.
    if (nativeScroll) return;
    panels.forEach((p, i) => {
      p.hidden = i !== index;
      p.setAttribute('aria-hidden', String(i !== index));
    });
  }

  function setPower(fraction: number): void {
    if (!powerValue) return;
    const kw = PLANNED_KW * fraction;
    // At 7.5 kW a whole-number counter only has eight steps in it, so it reads
    // as stuttering rather than climbing. One decimal under 20 kW.
    powerValue.textContent = PLANNED_KW < 20 ? kw.toFixed(1) : String(Math.round(kw));
  }

  function flash(): void {
    const el = document.querySelector<HTMLElement>('#flash');
    if (!el || reduced) return;
    el.classList.remove('is-firing');
    void el.offsetWidth;
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

  function reveal(index: number): void {
    const panel = panels[index];
    if (!panel) return;

    // The mono kicker resolves out of noise; the display lines rise out of
    // their masks. Two different arrivals rather than the same one twice.
    const kicker = panel.querySelector<HTMLElement>('.stage-panel__kicker');
    // Duration left to the module's default, which is set to the reference's
    // vocabulary; 0.85 is not a value it uses.
    if (kicker) scramble(kicker, { delay: 0.1, from: 'start' });

    for (const el of panel.querySelectorAll<HTMLElement>('.stage-panel__title, .stage-panel__lede')) {
      revealLines(el, { delay: el.matches('.stage-panel__lede') ? 0.34 : 0.16 });
    }
  }

  // --- Scroll ------------------------------------------------------------
  /**
   * One callback drives the whole crossing: the outgoing world dissolves, the
   * effect carries the eye across, both ambiences cross-fade and the committed
   * capacity climbs — all from the scroll position, continuously.
   */
  function cross(t: number): void {
    const from = stages[current];
    const to = stages[current + 1];
    if (!from || !to) return;

    if (!crossing && t > 0) {
      crossing = true;
      host?.beginTransition(from.exit, from.ground, to.ground);
      audio.play(AMBIENT[from.id], { fadeIn: 0.3, volume: 0.45 });
      audio.play(AMBIENT[to.id], { fadeIn: 0, volume: 0 });
      warmScene(to.scene);
    }
    if (crossing && t <= 0) {
      crossing = false;
      host?.endTransition();
      audio.stop(AMBIENT[to.id], { fadeOut: 0.3 });
      audio.setLevel(AMBIENT[from.id], { volume: 0.45 });
    }

    host?.setTransitionProgress(t);

    // The outgoing world also dissolves underneath, so the effect is not
    // merely painted over a frame that is still going about its business.
    if (from.scene !== to.scene) {
      host?.setWorldMix(t);
    } else {
      const a = ENTRY_MIX[from.id] ?? 0;
      const b = ENTRY_MIX[to.id] ?? 1;
      host?.setWorldMix(a + (b - a) * t);
    }

    audio.setLevel(AMBIENT[from.id], { volume: (1 - t) * 0.45 });
    audio.setLevel(AMBIENT[to.id], { volume: t * 0.45 });

    const kwA = STAGE_KW[current] ?? 0;
    const kwB = STAGE_KW[current + 1] ?? 1;
    setPower(kwA + (kwB - kwA) * t);
  }

  function onProgress(p: number): void {
    const panel = panels[current];
    if (!panel || panel.hidden || swapping) return;

    if (rulerTrack) rulerTrack.style.transform = `translateX(${-(current + p) * 62}px)`;
    host?.setScrollProgress(p);

    const sticky = panel.querySelector<HTMLElement>('[data-stage-sticky]');
    if (sticky && !reduced) sticky.style.transform = `translate3d(0, ${-p * 8}vh, 0)`;

    const cue = panel.querySelector<HTMLElement>('[data-scroll-cue]');
    if (cue) cue.style.opacity = String(Math.max(0, 1 - p * 4));

    // The tail of every stage is the crossing into the next one.
    const t = p <= CROSS_START ? 0 : (p - CROSS_START) / (1 - CROSS_START);
    cross(t);
    // Dissolving the copy is how the virtual scroller gets a stage off the
    // screen, because there the panel never moves. On the spine the panel does
    // move — it unpins and rides away — so the fade only makes it leave
    // invisibly, and since onProgress writes to the incoming stage from the
    // handover on, that faded value stayed on the outgoing panel for the whole
    // screen-height of its exit. The slide is the transition; the words stay
    // legible until they are gone.
    if (sticky && !nativeScroll) {
      sticky.style.opacity = String(1 - Math.max(0, (t - 0.5) / 0.5));
    }

    if (!nativeScroll && t >= 0.995 && performance.now() > lockedUntil) void advance();
  }

  // --- Advance ----------------------------------------------------------
  async function advance(): Promise<void> {
    const next = current + 1;
    const to = stages[next];
    if (!to || swapping) return;
    swapping = true;
    lockedUntil = performance.now() + SWAP_LOCKOUT_MS;

    const from = stages[current];
    audio.stop(AMBIENT[from.id], { fadeOut: 0.6 });

    // The transition is fully opaque by now, so the swap behind it is unseen.
    if (from.scene !== to.scene && host) {
      host.setStage(await loadScene(to.scene));
      host.setClearColor(to.ground);
      host.setWorldMix(1);
    }

    current = next;
    showPanel(next);
    applyChrome(next);
    setPower(STAGE_KW[next] ?? 1);
    topupBadge();

    armStage(next);
    const sticky = panels[next].querySelector<HTMLElement>('[data-stage-sticky]');
    if (sticky) { sticky.style.opacity = '1'; sticky.style.transform = 'none'; }

    // Resolve the effect out and settle the new world in behind it.
    const resolve = { t: 1 };
    gsap.to(resolve, {
      t: 0,
      duration: reduced ? 0 : 1.05,
      ease: 'power2.inOut',
      onUpdate: () => {
        host?.setTransitionProgress(resolve.t);
        host?.setWorldMix((ENTRY_MIX[to.id] ?? 0) + resolve.t * (1 - (ENTRY_MIX[to.id] ?? 0)));
      },
      onComplete: () => {
        host?.endTransition();
        host?.setWorldMix(ENTRY_MIX[to.id] ?? 0);
      },
    });

    crossing = false;
    // Let the world resolve a little before the copy lands on it — arriving
    // together meant a second of flat colour with the headline already there.
    window.setTimeout(() => reveal(next), reduced ? 0 : 430);
    if (stages[next + 1]) warmScene(stages[next + 1].scene);
    if (to.scene === 'campus') enterCampus();

    swapping = false;
    requestAnimationFrame(() => onProgress(0));
  }

  /** advance() run backwards: the same crossing, played the other way. */
  async function retreat(): Promise<void> {
    const prev = current - 1;
    const to = stages[prev];
    if (!to || swapping) return;
    swapping = true;
    lockedUntil = performance.now() + SWAP_LOCKOUT_MS;

    const from = stages[current];
    audio.stop(AMBIENT[from.id], { fadeOut: 0.6 });
    audio.play(AMBIENT[to.id], { fadeIn: 0.5, volume: 0.45 });

    // Cover the swap with the crossing that separates these two worlds — the
    // one the visitor came through — so going back retraces the same door.
    host?.beginTransition(to.exit, from.ground, to.ground);
    host?.setTransitionProgress(1);

    if (from.scene !== to.scene && host) {
      host.setStage(await loadScene(to.scene));
      host.setClearColor(to.ground);
    }

    current = prev;
    showPanel(prev);
    applyChrome(prev);
    setPower(STAGE_KW[prev] ?? 0);

    armStage(prev);
    scroller.setScrollImmediate(trackLength(prev) * RETREAT_LANDING);

    const sticky = panels[prev].querySelector<HTMLElement>('[data-stage-sticky]');
    if (sticky) { sticky.style.opacity = '1'; sticky.style.transform = 'none'; }

    const resolve = { t: 1 };
    gsap.to(resolve, {
      t: 0,
      duration: reduced ? 0 : 0.95,
      ease: 'power2.inOut',
      onUpdate: () => {
        host?.setTransitionProgress(resolve.t);
        host?.setWorldMix((ENTRY_MIX[to.id] ?? 0) + resolve.t * (1 - (ENTRY_MIX[to.id] ?? 0)));
      },
      onComplete: () => {
        host?.endTransition();
        host?.setWorldMix(ENTRY_MIX[to.id] ?? 0);
      },
    });

    crossing = false;
    reveal(prev);
    if (stages[prev - 1]) warmScene(stages[prev - 1].scene);
    exitCampus();

    swapping = false;
    requestAnimationFrame(() => onProgress(RETREAT_LANDING));
  }

  async function goToStage(index: number): Promise<void> {
    const to = stages[index];
    if (!to || swapping) return;
    swapping = true;

    if (host && stages[current].scene !== to.scene) {
      host.setStage(await loadScene(to.scene));
      host.setClearColor(to.ground);
    }
    host?.setWorldMix(ENTRY_MIX[to.id] ?? 0);
    host?.endTransition();
    crossing = false;
    lockedUntil = performance.now() + SWAP_LOCKOUT_MS;

    current = index;
    showPanel(index);
    applyChrome(index);
    setPower(STAGE_KW[index] ?? 0);
    if (nativeScroll) {
      // Land a little inside the track so the stage reads as entered rather
      // than balanced on its own boundary.
      const panel = panels[index];
      const top = window.scrollY + panel.getBoundingClientRect().top;
      window.scrollTo({ top: top + 4, behavior: 'auto' });
    } else armStage(index);
    // Clear any parallax left inline by the previous stage's scroll.
    const jumped = panels[index].querySelector<HTMLElement>('[data-stage-sticky]');
    if (jumped) { jumped.style.opacity = '1'; jumped.style.transform = 'none'; }
    reveal(index);
    if (to.scene === 'campus') enterCampus(); else exitCampus();

    swapping = false;
    requestAnimationFrame(() => onProgress(0));
  }

  // --- Campus ------------------------------------------------------------
  let hotspotRaf = 0;

  function campus(): CampusScene | null {
    const s = host?.currentStage;
    return s && s.id === 'campus' ? (s as CampusScene) : null;
  }

  /**
   * On the campus the page scrolls natively, so the manager cannot see an
   * overscroll. Watch for a sustained pull upward at the top of the document
   * and hand back to the compute hall — the same gesture, the same result.
   */
  let campusPull = 0;
  const campusWheel = (e: WheelEvent): void => {
    if (swapping || stages[current]?.scene !== 'campus') return;
    // A pinch-zoom arrives as ctrl+wheel and belongs to the model, not to us.
    if (e.ctrlKey || e.metaKey) { campusPull = 0; return; }
    if (window.scrollY > 2 || e.deltaY >= 0) { campusPull = 0; return; }
    campusPull += -e.deltaY;
    if (campusPull > 260 && performance.now() > lockedUntil) {
      campusPull = 0;
      void retreat();
    }
  };

  // Touch equivalent of campusWheel: a sustained downward pull at the top of
  // the document. Desktop had a documented gesture that a phone silently
  // lacked.
  let campusTouchY = 0;
  const campusTouchStart = (e: TouchEvent): void => {
    campusTouchY = e.touches[0]?.clientY ?? 0;
    campusPull = 0;
  };
  const campusTouchMove = (e: TouchEvent): void => {
    if (swapping || stages[current]?.scene !== 'campus') return;
    const y = e.touches[0]?.clientY ?? 0;
    const delta = y - campusTouchY;
    campusTouchY = y;
    if (window.scrollY > 2 || delta <= 0) { campusPull = 0; return; }
    campusPull += delta;
    if (campusPull > 190 && performance.now() > lockedUntil) {
      campusPull = 0;
      void retreat();
    }
  };

  function enterCampus(): void {
    const scene = campus();
    if (!scene || !campusUI) return;
    campusPull = 0;
    if (!nativeScroll) {
      window.addEventListener('wheel', campusWheel, { passive: true });
      window.addEventListener('touchstart', campusTouchStart, { passive: true });
      window.addEventListener('touchmove', campusTouchMove, { passive: true });
      // The journey is over: give the page back to the browser so the
      // configurator and the reading path below can actually be reached.
      scroller.disable();
      delete document.body.dataset.virtualScroll;
    }
    campusUI.hidden = false;
    if (after) after.hidden = false;
    scene.setInteractive(true);

    const legend = document.querySelector<HTMLElement>('#campus-legend');
    if (legend && !legend.childElementCount) {
      for (const h of scene.hotspots) {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'campus-legend__btn mono-label';
        btn.textContent = h.label;
        btn.addEventListener('click', () => { audio.play('click'); scene.focusHotspot(h.id); });
        const mark = (on: boolean) => {
          hotspotLayer
            ?.querySelector<HTMLElement>(`[data-hotspot="${h.id}"]`)
            ?.classList.toggle('is-active', on);
        };
        btn.addEventListener('pointerenter', () => mark(true));
        btn.addEventListener('pointerleave', () => mark(false));
        btn.addEventListener('focus', () => mark(true));
        btn.addEventListener('blur', () => mark(false));
        li.appendChild(btn);
        legend.appendChild(li);
      }
    }

    const trackHotspots = () => {
      const sc = campus();
      if (!sc || !hotspotLayer || !host) return;
      const projected = sc.projectHotspots(host.context);
    hotspotLayer.setAttribute('aria-hidden', 'true');
      for (const p of projected) {
        let node = hotspotLayer.querySelector<HTMLElement>(`[data-hotspot="${p.id}"]`);
        if (!node) {
          node = document.createElement('span');
          node.className = 'campus-hotspot';
          node.dataset.hotspot = p.id;
          const label = document.createElement('span');
          label.className = 'campus-hotspot__label mono-label';
          label.textContent = p.label;
          node.appendChild(label);
          const dot = node;
          dot.addEventListener('click', () => {
            audio.play('click');
            sc.focusHotspot(p.id);
            // On touch there is no hover and the legend is hidden, so the tap
            // itself has to reveal the label — otherwise the visitor is flown
            // somewhere with no idea what they are looking at.
            hotspotLayer?.querySelectorAll('.campus-hotspot.is-active')
              .forEach((n) => { if (n !== dot) n.classList.remove('is-active'); });
            dot.classList.toggle('is-active');
          });
          hotspotLayer.appendChild(node);
        }
        node.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
        node.style.opacity = p.visible ? '1' : '0';
        // A label opening rightwards from a dot near the right edge runs off.
        node.classList.toggle('campus-hotspot--flip', p.x > window.innerWidth * 0.55);
      }
      hotspotRaf = requestAnimationFrame(trackHotspots);
    };
    cancelAnimationFrame(hotspotRaf);
    trackHotspots();
  }

  function exitCampus(): void {
    campusPull = 0;
    if (!nativeScroll) {
      window.removeEventListener('wheel', campusWheel);
      window.removeEventListener('touchstart', campusTouchStart);
      window.removeEventListener('touchmove', campusTouchMove);
      scroller.enable();
      document.body.dataset.virtualScroll = '';
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
    cancelAnimationFrame(hotspotRaf);
    if (campusUI) campusUI.hidden = true;
    if (after) after.hidden = true;
  }

  document.querySelectorAll<HTMLElement>('[data-campus]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const scene = campus();
      if (!scene) return;
      audio.play('click');
      const action = btn.dataset.campus;
      if (action === 'in') scene.zoom(2);
      if (action === 'out') scene.zoom(-2);
      if (action === 'left') scene.orbit(-70, 0);
      if (action === 'right') scene.orbit(70, 0);
      if (action === 'reset') scene.resetView();
    });
  });

  // --- Site menu ---------------------------------------------------------
  const menuToggle = document.querySelector<HTMLButtonElement>('#menu-toggle');
  const menu = document.querySelector<HTMLElement>('#site-menu');

  function setMenu(open: boolean): void {
    if (!menu || !menuToggle) return;
    menuToggle.setAttribute('aria-expanded', String(open));
    if (open) {
      menu.hidden = false;
      requestAnimationFrame(() => menu.classList.add('is-open'));
      menu.querySelector<HTMLElement>('a, button')?.focus();
    } else {
      menu.classList.remove('is-open');
      window.setTimeout(() => { menu.hidden = true; }, 400);
      menuToggle.focus();
    }
  }

  menuToggle?.addEventListener('click', () => {
    audio.unlock();
    audio.play('click');
    setMenu(menuToggle.getAttribute('aria-expanded') !== 'true');
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menuToggle?.getAttribute('aria-expanded') === 'true') setMenu(false);
  });

  menu?.querySelectorAll<HTMLElement>('[data-menu-stage]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.menuStage);
      audio.play('click');
      setMenu(false);
      void goToStage(i);
    });
  });

  // --- Navigation --------------------------------------------------------
  rootEl.querySelectorAll<HTMLElement>('[data-goto]').forEach((btn, index) => {
    btn.addEventListener('click', () => {
      audio.unlock();
      audio.play('click');
      void goToStage(index);
    });
  });

  document.querySelector<HTMLElement>('[data-back]')?.addEventListener('click', () => {
    if (current > 0) void goToStage(current - 1);
  });

  // --- Capture form ------------------------------------------------------
  /**
   * The bar reported success on a timer and cleared the field. It had no
   * endpoint, so every inquiry typed into it was discarded while the visitor
   * was told it had been received.
   *
   * Now the only thing that produces a "sent" state is a server saying so,
   * and every failure leaves the address exactly where it was typed.
   */
  const form = document.querySelector<HTMLFormElement>('#reserve-form');
  const msg = document.querySelector<HTMLElement>('#reserve-msg');
  let sending = false;
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (sending) return;
    const email = String(new FormData(form).get('email') ?? '');
    const setState = (state: 'submitting' | 'sent' | 'error' | 'idle'): void => {
      form.classList.remove('is-submitting', 'is-sent', 'is-error');
      if (state !== 'idle') form.classList.add(`is-${state}`);
    };

    if (!email.includes('@')) {
      if (msg) msg.textContent = 'Enter a valid work email';
      setState('error');
      return;
    }

    sending = true;
    setState('submitting');
    if (msg) msg.textContent = 'Sending…';

    void submitInquiry({ email, source: 'capture-bar' }).then((result) => {
      sending = false;
      if (result.ok) {
        setState('sent');
        if (msg) msg.textContent = 'Received — we will be in touch.';
        form.reset();
        return;
      }
      setState('error');
      if (msg) msg.textContent = failureMessage(result.reason);
      // Deliberately no reset: the address stays in the field.
    });
  });

  // Any first real interaction unlocks audio. It was previously wired only to
  // a few controls, so a visitor who only ever scrolled heard nothing at all.
  const unlockOnce = (): void => {
    audio.unlock();
    window.removeEventListener('pointerdown', unlockOnce);
    window.removeEventListener('keydown', unlockOnce);
    window.removeEventListener('touchstart', unlockOnce);
  };
  window.addEventListener('pointerdown', unlockOnce, { passive: true });
  window.addEventListener('keydown', unlockOnce);
  window.addEventListener('touchstart', unlockOnce, { passive: true });

  // --- Go ----------------------------------------------------------------
  initCursor();
  initConfigurator();
  applyChrome(0);
  showPanel(0);
  setPower(0);
  // Only pre-hide when something is going to animate it back. Under reduced
  // motion the char treatments deliberately do not split, so anything hidden
  // here would never be cleared — which is exactly the "left invisible" case
  // the reduced-motion path exists to avoid.
  if (!reduced) {
    gsap.set(rootEl.querySelectorAll('.line__inner'), { yPercent: 115, opacity: 0 });
  }

  // The gate is transparent and the world renders behind it, so the scene is
  // the first screen — not something deferred until after it. Three.js is
  // still its own chunk; we simply stop waiting for idle to ask for it.
  void initScene();
  scroller.onScrub(onProgress);
  if (!nativeScroll) {
    armStage(0);
    window.addEventListener('resize', () => armStage(current));
  }

  initLoader(() => {
    reveal(0);
    audio.play('stage-land-ambient', { fadeIn: 1.2, volume: 0.35 });
    gateCleared = true;
    maybeArm();
    window.dispatchEvent(new Event('experience:ready'));
  });
}


/**
 * Boot behind a safety net.
 *
 * `run()` hides the static reading path and takes the document's scrolling
 * away within its first few statements, and only reveals the stage copy some
 * way further down. A throw in between — a shader that will not compile on a
 * particular phone, a missing platform API — therefore leaves exactly the
 * worst possible state: no headings and no way to scroll.
 *
 * So: if anything throws, or if the experience has not signed on within a few
 * seconds, hand the page back to the browser. A plain scrollable document with
 * its content visible is a far better failure than a locked blank one.
 */
export function boot(): void {
  const recover = (why: string, err?: unknown): void => {
    document.documentElement.classList.remove('js-ready');
    delete document.body.dataset.virtualScroll;
    document.querySelector<HTMLElement>('#after')?.removeAttribute('hidden');
    const loader = document.querySelector<HTMLElement>('#loader');
    if (loader) { loader.hidden = true; loader.classList.add('is-done'); }
    for (const panel of document.querySelectorAll<HTMLElement>('[data-stage-panel]')) {
      panel.hidden = false;
      panel.removeAttribute('aria-hidden');
      const sticky = panel.querySelector<HTMLElement>('[data-stage-sticky]');
      if (sticky) { sticky.style.opacity = '1'; sticky.style.transform = 'none'; }
      for (const line of panel.querySelectorAll<HTMLElement>('.line__inner')) {
        line.style.opacity = '1';
        line.style.transform = 'none';
      }
    }
    // eslint-disable-next-line no-console
    console.warn(`[boot] fell back to the plain document: ${why}`, err ?? '');
  };

  // If the gate never clears, the visitor is staring at a title card forever.
  const watchdog = window.setTimeout(() => {
    const loader = document.querySelector<HTMLElement>('#loader');
    if (loader && !loader.hidden) recover('the entry card never cleared');
  }, 7000);

  window.addEventListener('experience:ready', () => window.clearTimeout(watchdog), { once: true });

  try {
    run();
  } catch (err) {
    window.clearTimeout(watchdog);
    recover('boot threw', err);
  }
}
