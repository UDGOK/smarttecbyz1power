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

  running = false;

  constructor(private canvas: HTMLCanvasElement, private reducedMotion = false) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x0e2419, 1);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);

    this.disposeTier = quality.onChange((_t: Tier, settings) => {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.pixelRatio));
      this.stage?.onTier(settings, this.ctx());
    });

    this.resize();
  }

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

  resize = (): void => {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.settings.pixelRatio));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
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
      this.renderer.render(this.scene, this.camera);
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
    this.renderer.dispose();
  }
}
