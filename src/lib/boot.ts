/**
 * Cinematic route boot.
 *
 * Five stage worlds on one scroll spine. Scrolling drives the ruler, the camera
 * and the copy; reaching the end of a stage arms the hold; holding scrubs the
 * outgoing world apart while a colour veil carries the eye into the next one.
 * Arriving at the campus hands control back to the visitor.
 */

import gsap from 'gsap';
import { SceneHost } from './scene/host';
import { loadScene, warmScene } from './scene/registry';
import type { CampusScene } from './scene/stage-campus';
import { HoldButton, prefersReducedMotion } from './hold-button';
import { initLoader } from './loader';
import { initCursor } from './cursor';
import { initConfigurator } from './configurator';
import { audio } from './audio';
import { stages, ENTRY_MIX } from '../data/site';

const PHASE_1A_KW = 114;

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
  const veil = document.querySelector<HTMLElement>('#veil');
  const campusUI = document.querySelector<HTMLElement>('#campus-ui');
  const hotspotLayer = document.querySelector<HTMLElement>('#campus-hotspots');
  const after = document.querySelector<HTMLElement>('#after');

  const reduced = prefersReducedMotion();
  const panels = Array.from(rootEl.querySelectorAll<HTMLElement>('[data-stage-panel]'));

  let host: SceneHost | null = null;
  let current = 0;
  let button: HoldButton | null = null;
  let swapping = false;

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
    const inners = panel.querySelectorAll<HTMLElement>('.line__inner');
    if (reduced) { gsap.set(inners, { yPercent: 0, opacity: 1 }); return; }
    gsap.fromTo(
      inners,
      { yPercent: 115, opacity: 0 },
      { yPercent: 0, opacity: 1, duration: 1.15, ease: 'expo.out', stagger: 0.075, delay: 0.15 },
    );
  }

  // --- Scroll ------------------------------------------------------------
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

      if (rulerTrack) rulerTrack.style.transform = `translateX(${-(current + p) * 62}px)`;
      host?.setScrollProgress(p);

      const sticky = panel.querySelector<HTMLElement>('[data-stage-sticky]');
      if (sticky && !reduced) {
        sticky.style.transform = `translate3d(0, ${-p * 8}vh, 0)`;
        sticky.style.opacity = String(1 - Math.max(0, (p - 0.65) / 0.35) * 0.85);
      }

      const cue = panel.querySelector<HTMLElement>('[data-scroll-cue]');
      if (cue) cue.style.opacity = String(Math.max(0, 1 - p * 4));

      slot.classList.toggle('is-armed', p > 0.82 && !!button && !swapping);
    });
  }

  // --- Hold --------------------------------------------------------------
  function mountHold(index: number): void {
    button?.destroy();
    button = null;
    const cfg = stages[index]?.hold;
    if (!cfg) return;

    const from = stages[index];
    const to = stages[index + 1];
    if (!to) return;

    const fromAmbient = AMBIENT[from.id];
    const toAmbient = AMBIENT[to.id];
    const sceneChanges = from.scene !== to.scene;

    button = new HoldButton({
      label: cfg.label,
      holdLabel: cfg.holdLabel,
      holdDuration: cfg.duration,
      audioTrack: 'hold-button',

      onStart() {
        audio.play(fromAmbient, { fadeIn: 0.3, volume: 0.45 });
        audio.play(toAmbient, { fadeIn: 0, volume: 0 });
        if (veil) veil.style.setProperty('--veil-color', to.ground);
        warmScene(to.scene);
      },

      // One callback: the outgoing world dissolves, the veil carries the eye
      // across, both ambiences cross-fade, the badge climbs.
      onProgress(p) {
        if (sceneChanges) {
          host?.setWorldMix(p);
          if (veil) veil.style.opacity = String(Math.pow(p, 1.7) * 0.92);
        } else {
          // Same scene, different palette: scrub the shader straight across.
          const a = ENTRY_MIX[from.id] ?? 0;
          const b = ENTRY_MIX[to.id] ?? 1;
          host?.setWorldMix(a + (b - a) * p);
        }
        audio.setLevel(fromAmbient, { volume: (1 - p) * 0.45 });
        audio.setLevel(toAmbient, { volume: p * 0.45 });

        const a = STAGE_KW[index] ?? 0;
        const b = STAGE_KW[index + 1] ?? 1;
        setPower(a + (b - a) * p);

        const sticky = panels[current]?.querySelector<HTMLElement>('[data-stage-sticky]');
        if (sticky) sticky.style.opacity = String(1 - p * 0.9);
      },

      onCancel() {
        host?.setWorldMix(ENTRY_MIX[from.id] ?? 0);
        if (veil) veil.style.opacity = '0';
        audio.stop(toAmbient, { fadeOut: 0.3 });
        audio.setLevel(fromAmbient, { volume: 0.45 });
        setPower(STAGE_KW[index] ?? 0);
        const sticky = panels[current]?.querySelector<HTMLElement>('[data-stage-sticky]');
        if (sticky) sticky.style.opacity = '1';
      },

      onComplete() { void advance(); },
    });
    slot.appendChild(button.el);
  }

  async function advance(): Promise<void> {
    const next = current + 1;
    const to = stages[next];
    if (!to || swapping) return;
    swapping = true;
    slot.classList.remove('is-armed');

    const from = stages[current];
    audio.stop(AMBIENT[from.id], { fadeOut: 0.6 });
    audio.play('whoosh');

    if (from.scene !== to.scene && host) {
      // Swap behind the veil, then lift it while the new world resolves.
      host.setStage(await loadScene(to.scene));
      host.setClearColor(to.ground);
      host.setWorldMix(1);
      if (veil) {
        gsap.to(veil, {
          opacity: 0,
          duration: reduced ? 0 : 0.9,
          ease: 'power2.out',
        });
      }
      const mix = { v: 1 };
      gsap.to(mix, {
        v: ENTRY_MIX[to.id] ?? 0,
        duration: reduced ? 0 : 1.4,
        ease: 'power2.inOut',
        onUpdate: () => host?.setWorldMix(mix.v),
      });
    } else {
      host?.setWorldMix(ENTRY_MIX[to.id] ?? 0);
      if (veil) veil.style.opacity = '0';
    }

    current = next;
    showPanel(next);
    applyChrome(next);
    setPower(STAGE_KW[next] ?? 1);
    flash();
    topupBadge();

    window.scrollTo({ top: 0, behavior: 'auto' });
    const sticky = panels[next].querySelector<HTMLElement>('[data-stage-sticky]');
    if (sticky) { sticky.style.opacity = '1'; sticky.style.transform = 'none'; }
    reveal(next);
    mountHold(next);
    if (stages[next + 1]) warmScene(stages[next + 1].scene);
    if (to.scene === 'campus') enterCampus();

    swapping = false;
    // Next frame: the scroll reset and the panel swap must both have settled
    // before the parallax is recomputed, or the incoming panel inherits the
    // outgoing one's progress and arrives faded out.
    requestAnimationFrame(onScroll);
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
    if (veil) veil.style.opacity = '0';

    current = index;
    showPanel(index);
    applyChrome(index);
    setPower(STAGE_KW[index] ?? 0);
    window.scrollTo({ top: 0, behavior: 'auto' });
    // Clear any parallax left inline by the previous stage's scroll.
    const jumped = panels[index].querySelector<HTMLElement>('[data-stage-sticky]');
    if (jumped) { jumped.style.opacity = '1'; jumped.style.transform = 'none'; }
    reveal(index);
    mountHold(index);
    if (to.scene === 'campus') enterCampus(); else exitCampus();

    swapping = false;
    requestAnimationFrame(onScroll);
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
  window.addEventListener('scroll', onScroll, { passive: true });

  initLoader(() => {
    reveal(0);
    mountHold(0);
    audio.play('stage-land-ambient', { fadeIn: 1.2, volume: 0.35 });
    onScroll();
  });
}
