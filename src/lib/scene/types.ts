/**
 * Stage scene contract.
 *
 * One WebGLRenderer, one camera, many stage scenes. Each stage owns its own
 * THREE.Group and knows how to cross-fade itself out toward the next stage.
 * Implement this and the host will drive it — do not create your own renderer,
 * camera, or animation loop.
 */

import type * as THREE from 'three';

export type Tier = 'HIGH' | 'MEDIUM' | 'LOW';

export interface TierSettings {
  pixelRatio: number;
  terrainSegments: number;
  particleCount: number;
  shadows: boolean;
  fog: boolean;
}

export interface SceneContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  /** Viewport width in CSS px — use it to re-compose for portrait. */
  width: number;
  height: number;
  reducedMotion: boolean;
}

export interface StageScene {
  readonly id: string;

  /** Build geometry into `ctx.scene`. Called once when the stage is entered. */
  build(ctx: SceneContext, settings: TierSettings): void;

  /**
   * Per-frame. `scroll` is 0..1 through this stage's scroll track.
   * Move the camera here if the stage wants a dolly; the host will not fight you.
   */
  update(elapsed: number, delta: number, scroll: number, ctx: SceneContext): void;

  /**
   * 0 = this stage at rest, 1 = fully dissolved toward the next stage.
   * Driven live by the hold-to-advance ring, so it must be cheap and
   * fully reversible.
   */
  setWorldMix(t: number): void;

  /** Quality tier changed. Rebuild heavy geometry at the new budget. */
  onTier(settings: TierSettings, ctx: SceneContext): void;

  /** Camera framing for this stage at a given viewport. */
  frame(ctx: SceneContext): void;

  /** Release every geometry, material and texture this stage created. */
  dispose(): void;
}
