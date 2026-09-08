/**
 * Adaptive quality tiers.
 *
 * Ported from the behaviour observed in the reference experience: sample a
 * rolling window of frame times, downgrade when the average frame costs more
 * than `downgradeThreshold` ms, upgrade when it comfortably beats
 * `upgradeThreshold`, and refuse to change tier again until a cooldown has
 * elapsed so the scene never oscillates.
 */

export type Tier = 'HIGH' | 'MEDIUM' | 'LOW';

export interface QualityConfig {
  enabled: boolean;
  sampleWindow: number;
  downgradeThreshold: number;
  upgradeThreshold: number;
  cooldownFrames: number;
}

export const QUALITY_CONFIG: QualityConfig = {
  enabled: true,
  sampleWindow: 60,
  downgradeThreshold: 22,
  upgradeThreshold: 12,
  cooldownFrames: 180,
};

/** Per-tier render settings consumed by the scene modules. */
export const TIER_SETTINGS: Record<Tier, {
  pixelRatio: number;
  terrainSegments: number;
  particleCount: number;
  shadows: boolean;
  fog: boolean;
}> = {
  HIGH:   { pixelRatio: 2,   terrainSegments: 320, particleCount: 1100, shadows: true,  fog: true },
  MEDIUM: { pixelRatio: 1.5, terrainSegments: 200, particleCount: 700, shadows: false, fog: true },
  LOW:    { pixelRatio: 1,   terrainSegments: 120, particleCount: 320,  shadows: false, fog: false },
};

type TierListener = (tier: Tier, settings: (typeof TIER_SETTINGS)[Tier]) => void;

class QualityManager {
  private tier: Tier = 'HIGH';
  private frameSum = 0;
  private frameCount = 0;
  private cooldown = 0;
  private listeners = new Set<TierListener>();

  constructor() {
    if (typeof navigator !== 'undefined') {
      // Start conservatively on devices that advertise little parallelism or
      // memory — mid-range phones should not have to fail a frame to be believed.
      const cores = navigator.hardwareConcurrency ?? 8;
      const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
      if (cores <= 4 || memory <= 4) this.tier = 'MEDIUM';
      if (cores <= 2 || memory <= 2) this.tier = 'LOW';
    }
  }

  get current(): Tier { return this.tier; }
  get settings() { return TIER_SETTINGS[this.tier]; }

  onChange(fn: TierListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setTier(tier: Tier): void {
    if (tier === this.tier) return;
    this.tier = tier;
    this.cooldown = QUALITY_CONFIG.cooldownFrames;
    for (const fn of this.listeners) fn(tier, TIER_SETTINGS[tier]);
  }

  /** Call once per rendered frame with the frame's duration in ms. */
  sample(deltaMs: number): void {
    if (!QUALITY_CONFIG.enabled) return;
    if (this.cooldown > 0) { this.cooldown--; return; }

    this.frameSum += deltaMs;
    this.frameCount++;
    if (this.frameCount < QUALITY_CONFIG.sampleWindow) return;

    const avg = this.frameSum / this.frameCount;
    this.frameSum = 0;
    this.frameCount = 0;

    if (avg > QUALITY_CONFIG.downgradeThreshold) {
      if (this.tier === 'HIGH') this.setTier('MEDIUM');
      else if (this.tier === 'MEDIUM') this.setTier('LOW');
    } else if (avg < QUALITY_CONFIG.upgradeThreshold) {
      if (this.tier === 'LOW') this.setTier('MEDIUM');
      else if (this.tier === 'MEDIUM') this.setTier('HIGH');
    }
  }
}

export const quality = new QualityManager();
