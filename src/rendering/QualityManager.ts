import type { QualityPreference } from '../app/config';
import { QUALITY_PRESETS, QUALITY_TIERS, type QualityTier, type RenderProfile } from './quality';

/** Browser hints only: none of them reliably describe GPU speed. */
export interface DeviceCapabilities {
  readonly hardwareConcurrency: number | undefined;
  /** Chromium-only, rounded and capped at 8 GB by the browser. */
  readonly deviceMemory: number | undefined;
  readonly coarsePointer: boolean;
  readonly devicePixelRatio: number;
}

export function detectCapabilities(): DeviceCapabilities {
  const navigatorWithMemory = navigator as Navigator & { deviceMemory?: number };
  return {
    hardwareConcurrency: Number.isFinite(navigator.hardwareConcurrency)
      ? navigator.hardwareConcurrency
      : undefined,
    deviceMemory:
      typeof navigatorWithMemory.deviceMemory === 'number'
        ? navigatorWithMemory.deviceMemory
        : undefined,
    coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? false,
    devicePixelRatio: window.devicePixelRatio || 1,
  };
}

/**
 * Conservative starting tier for "Automatic". It never selects High: that tier is an explicit
 * choice, and the frame monitor below can only step the automatic tier down.
 */
export function resolveAutoTier(capabilities: DeviceCapabilities): QualityTier {
  const cores = capabilities.hardwareConcurrency ?? 4;
  const memory = capabilities.deviceMemory;
  if (cores <= 2 || (memory !== undefined && memory <= 2)) return 'low';
  if (capabilities.coarsePointer) {
    // Phones and tablets: medium only with clear signs of a recent, well-provisioned device.
    return memory !== undefined && memory >= 6 && cores >= 8 ? 'medium' : 'low';
  }
  return 'medium';
}

const WARMUP_SECONDS = 4;
const WINDOW_SECONDS = 3;
const COOLDOWN_SECONDS = 6;
/** Sustained frame time above ~34 fps triggers a downgrade in automatic mode. */
const SLOW_FRAME_SECONDS = 1 / 34;

/** Measures sustained frame time; spikes from shader compilation fall inside the warmup. */
export class FrameBudgetMonitor {
  private warmup = WARMUP_SECONDS;
  private windowTime = 0;
  private windowFrames = 0;

  public reset(cooldown = WARMUP_SECONDS): void {
    this.warmup = cooldown;
    this.windowTime = 0;
    this.windowFrames = 0;
  }

  /** Returns true once per window when the average frame was over budget. */
  public push(deltaSeconds: number): boolean {
    if (!(deltaSeconds > 0)) return false;
    if (this.warmup > 0) {
      this.warmup -= deltaSeconds;
      return false;
    }
    this.windowTime += deltaSeconds;
    this.windowFrames += 1;
    if (this.windowTime < WINDOW_SECONDS) return false;
    const average = this.windowTime / this.windowFrames;
    this.windowTime = 0;
    this.windowFrames = 0;
    if (average <= SLOW_FRAME_SECONDS) return false;
    this.reset(COOLDOWN_SECONDS);
    return true;
  }
}

export type ProfileListener = (profile: RenderProfile) => void;

export class QualityManager {
  private readonly listeners = new Set<ProfileListener>();
  private readonly monitor = new FrameBudgetMonitor();
  private autoTier: QualityTier;
  private current: RenderProfile;

  public constructor(
    private preferenceValue: QualityPreference,
    private readonly capabilities: DeviceCapabilities,
  ) {
    this.autoTier = resolveAutoTier(capabilities);
    this.current = this.resolve();
  }

  public get profile(): RenderProfile {
    return this.current;
  }

  public get preference(): QualityPreference {
    return this.preferenceValue;
  }

  public setPreference(preference: QualityPreference): void {
    if (preference === this.preferenceValue) return;
    this.preferenceValue = preference;
    if (preference === 'auto') this.autoTier = resolveAutoTier(this.capabilities);
    this.monitor.reset();
    this.publish();
  }

  /** Feeds one frame's duration. Only the automatic preference adapts. */
  public sampleFrame(deltaSeconds: number): void {
    if (this.preferenceValue !== 'auto') return;
    if (!this.monitor.push(deltaSeconds)) return;
    const index = QUALITY_TIERS.indexOf(this.autoTier);
    const lower = QUALITY_TIERS[index - 1];
    if (!lower) return;
    this.autoTier = lower;
    console.info(`[VÉRTICE] Automatic quality lowered to ${lower} after sustained slow frames.`);
    this.publish();
  }

  public subscribe(listener: ProfileListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public dispose(): void {
    this.listeners.clear();
  }

  private resolve(): RenderProfile {
    const tier = this.preferenceValue === 'auto' ? this.autoTier : this.preferenceValue;
    return QUALITY_PRESETS[tier];
  }

  private publish(): void {
    const next = this.resolve();
    if (next === this.current) return;
    this.current = next;
    for (const listener of this.listeners) listener(next);
  }
}
