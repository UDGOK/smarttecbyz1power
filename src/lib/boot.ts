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
import { stages, ENTRY_MIX } from '../data/site';

const PHASE_1A_KW = 114;

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
 * How much longer a stage's track is than its nominal height.
 *
 * Calibrated by measurement, not taste: at 1.0 a single wheel notch advanced
 * 5.5% of a stage, so a trackpad swipe — which emits a long momentum tail of
 * events — crossed two whole worlds before the visitor could read either. At
 * 2.6 a notch is worth about 2%, so a stage takes deliberate effort and a
 * momentum flick lands inside it rather than through it.
 */
const STAGE_TRACK_SCALE = 2.6;

/** kW committed by the time each stage has been reached. */
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

export function boot(): void {
  const canvas = document.querySelector<HTMLCanvasElement>('#experience-canvas');
  const root = document.querySelector<HTMLElement>('[data-stage-root]');
  const holdSlot = document.querySelector<HTMLElement>('#hold-slot');
  if (!canvas || !root || !holdSlot) return;

  document.documentElement.classList.add('js-ready');

  const canvasEl: HTMLCanvasElement = canvas;
  const rootEl: HTMLElement = root;
  const slot: HTMLElement = holdSlot;

  const readout = document.querySelector<HTMLElement>('#ruler-readout');
  const rulerTrack = document.querySelector<HTMLElement>('.scroll-ruler-track');
  const powerValue = document.querySelector<HTMLElement>('#power-value');
  const campusUI = document.querySelector<HTMLElement>('#campus-ui');
  const hotspotLayer = document.querySelector<HTMLElement>('#campus-hotspots');
  const after = document.querySelector<HTMLElement>('#after');

  const reduced = prefersReducedMotion();
  const panels = Array.from(rootEl.querySelectorAll<HTMLElement>('[data-stage-panel]'));

  let host: SceneHost | null = null;
  let current = 0;
  let swapping = false;
  let lockedUntil = 0;
  let crossing = false;

  // The reference does not use native scroll: it damps its own position, which
  // is most of why its motion reads smooth. Same model here.
  const scroller = new ScrollManager({ reducedMotion: reduced });
  const rig = new CameraRig({ reducedMotion: reduced });
  document.body.dataset.virtualScroll = '';

  /**
   * A stage's scroll track, in the manager's own units.
   *
   * The manager multiplies raw wheel/touch deltas by DELTA_SCALE (35), which
   * is the reference's own figure — so the track has to be expressed in those
   * same units or a dozen wheel notches cross the entire stage. One notch of
   * roughly 100px therefore advances about 100px worth of the track.
   */
  const trackLength = (index: number): number =>
    ((stages[index]?.scrollVh ?? 250) / 100) * window.innerHeight * DELTA_SCALE * STAGE_TRACK_SCALE;

  // --- Scene host, code-split and idle-loaded ---------------------------
  async function initScene(): Promise<void> {
    if (!supportsWebGL()) {
      canvasEl.hidden = true;
      document.body.dataset.noWebgl = '';
      return;
    }
    try {
      host = new SceneHost(canvasEl, reduced);
      host.setStage(await loadScene(stages[0].scene));
      host.setWorldMix(ENTRY_MIX[stages[0].id] ?? 0);
      host.start();
      window.addEventListener('resize', host.resize);
      (window as unknown as { __experience?: SceneHost }).__experience = host;

      // One clock for everything: the host's own delta drives the damped
      // scroll and the parallax rig, so they can never drift out of step
      // with the frame they are moving.
      host.onFrame((dt) => {
        scroller.update(dt);
        rig.update(dt);
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
    }
  }

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
    panels.forEach((p, i) => {
      p.hidden = i !== index;
      p.setAttribute('aria-hidden', String(i !== index));
    });
  }

  function setPower(fraction: number): void {
    if (powerValue) powerValue.textContent = String(Math.round(PHASE_1A_KW * fraction));
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
    if (sticky) sticky.style.opacity = String(Math.max(0, 1 - t * 2.2));

    if (t >= 0.995 && performance.now() > lockedUntil) void advance();
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

    scroller.setActiveStage(trackLength(next));
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
    reveal(next);
    if (stages[next + 1]) warmScene(stages[next + 1].scene);
    if (to.scene === 'campus') enterCampus();

    swapping = false;
    requestAnimationFrame(() => onProgress(0));
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
    scroller.setActiveStage(trackLength(index));
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

  function enterCampus(): void {
    const scene = campus();
    if (!scene || !campusUI) return;
    // The journey is over: give the page back to the browser so the
    // configurator and the reading path below can actually be reached.
    scroller.disable();
    delete document.body.dataset.virtualScroll;
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
          node.addEventListener('click', () => { audio.play('click'); sc.focusHotspot(p.id); });
          hotspotLayer.appendChild(node);
        }
        node.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
        node.style.opacity = p.visible ? '1' : '0';
      }
      hotspotRaf = requestAnimationFrame(trackHotspots);
    };
    cancelAnimationFrame(hotspotRaf);
    trackHotspots();
  }

  function exitCampus(): void {
    scroller.enable();
    document.body.dataset.virtualScroll = '';
    window.scrollTo({ top: 0, behavior: 'auto' });
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

  // --- Go ----------------------------------------------------------------
  initCursor();
  initConfigurator();
  applyChrome(0);
  showPanel(0);
  setPower(0);
  gsap.set(rootEl.querySelectorAll('.line__inner'), { yPercent: 115, opacity: 0 });

  // The gate is transparent and the world renders behind it, so the scene is
  // the first screen — not something deferred until after it. Three.js is
  // still its own chunk; we simply stop waiting for idle to ask for it.
  void initScene();
  scroller.onScrub(onProgress);
  scroller.setActiveStage(trackLength(0));
  window.addEventListener('resize', () => scroller.setActiveStage(trackLength(current)));

  initLoader(() => {
    reveal(0);
    audio.play('stage-land-ambient', { fadeIn: 1.2, volume: 0.35 });
    scroller.enable();
    onProgress(0);
  });
}
