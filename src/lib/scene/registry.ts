/**
 * Stage scene registry.
 *
 * Each scene is its own chunk, fetched the first time a stage needs it and
 * warmed one stage ahead so a hold never waits on a network round trip.
 */

import type { StageScene } from './types';
import type { SceneId } from '../../data/site';

const loaders: Record<SceneId, () => Promise<StageScene>> = {
  land:    async () => new (await import('./stage-land')).LandScene(),
  wait:    async () => new (await import('./stage-wait')).WaitScene(),
  power:   async () => new (await import('./stage-power')).PowerStage(),
  machine: async () => new (await import('./stage-machine')).MachineScene(),
  campus:  async () => new (await import('./stage-campus')).CampusScene(),
};

export function loadScene(id: SceneId): Promise<StageScene> {
  return loaders[id]();
}

/** Fire-and-forget warm of the next stage's chunk. */
export function warmScene(id: SceneId): void {
  void loaders[id]().then((s) => s.dispose()).catch(() => {});
}
