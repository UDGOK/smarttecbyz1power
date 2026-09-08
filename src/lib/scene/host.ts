/**
 * Scene host.
 *
 * Owns the one renderer, the one camera and the one animation loop, and swaps
 * StageScene implementations in and out. Stages never touch any of those —
 * they build into `ctx.scene`, move the camera in `update`, and dissolve
 * themselves in `setWorldMix`.
 */

import * as THREE from 'three';
import { quality, type Tier } from '../quality';
import { PostChain, type PostSettings } from './post';
import { Transition, type TransitionKind } from './transition';
import type { SceneContext, StageScene, TierSettings } from './types';

export class SceneHost {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private raf = 0;
  private lastFrame = performance.now();
  private disposeTier: () => void;
  private stage: StageScene | null = null;
  private scroll = 0;
  private post: PostChain;
  private transition: Transition;

  running = false;

  constructor(private canvas: HTMLCanvasElement, private reducedMotion = false) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x0e2419, 1);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);

    this.post = new PostChain(
      this.renderer,
      canvas.clientWidth || window.innerWidth,
      canvas.clientHeight || window.innerHeight,
      quality.current,
    );

    this.transition = new Transition(
      this.renderer,
      canvas.clientWidth || window.innerWidth,
      canvas.clientHeight || window.innerHeight,
      { reducedMotion },
    );

    this.disposeTier = quality.onChange((tier: Tier, settings) => {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.pixelRatio));
      // Order matters: setQuality re-measures from the pixel ratio we just set.
      this.post.setQuality(tier);
      this.stage?.onTier(settings, this.ctx());
    });

    this.resize();
  }

  /** Current frame context — hosts of DOM overlays need it to project. */
  get context(): SceneContext { return this.ctx(); }

  private ctx(): SceneContext {
    return {
      scene: this.scene,
      camera: this.camera,
      renderer: this.renderer,
      width: this.canvas.clientWidth || window.innerWidth,
      height: this.canvas.clientHeight || window.innerHeight,
      reducedMotion: this.reducedMotion,
    };
  }

  /** Swap the active stage. The outgoing stage is disposed. */
  setStage(next: StageScene, settings: TierSettings = quality.settings): void {
    if (this.stage) {
      this.stage.dispose();
      this.scene.clear();
    }
    this.stage = next;
    next.build(this.ctx(), settings);
    next.frame(this.ctx());
  }

  get currentStage(): StageScene | null { return this.stage; }

  setWorldMix(t: number): void { this.stage?.setWorldMix(t); }

  setScrollProgress(p: number): void { this.scroll = p; }

  setClearColor(color: THREE.ColorRepresentation): void {
    this.renderer.setClearColor(color, 1);
  }

  /** Each world grades itself — a daylight campus wants far less bloom than a
      hall full of emissive racks. */
  setPost(settings: Partial<PostSettings>): void {
    this.post.set(settings);
  }

  /** Crossings are scrubbed straight from scroll position. */
  beginTransition(kind: TransitionKind, from: THREE.ColorRepresentation, to: THREE.ColorRepresentation): void {
    this.transition.begin(kind, from, to);
  }

  setTransitionProgress(p: number): void {
    this.transition.setProgress(p);
  }

  endTransition(): void {
    this.transition.end();
  }

  get transitionActive(): boolean { return this.transition.active; }

  resize = (): void => {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.settings.pixelRatio));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.post.setSize(w, h);
    this.transition.setSize(w, h);
    this.stage?.frame(this.ctx());
  };

  start(): void {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      const now = performance.now();
      quality.sample(now - this.lastFrame);
      this.lastFrame = now;

      const delta = this.clock.getDelta();
      const elapsed = this.reducedMotion ? 0 : this.clock.getElapsedTime();
      this.stage?.update(elapsed, delta, this.scroll, this.ctx());
      this.post.render(this.scene, this.camera, elapsed);
      // Composites straight onto the frame the post chain just wrote.
      this.transition.render(this.camera, elapsed);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  dispose(): void {
    this.stop();
    this.disposeTier();
    this.stage?.dispose();
    this.scene.clear();
    this.post.dispose();
    this.transition.dispose();
    this.renderer.dispose();
  }
}
