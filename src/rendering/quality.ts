import {
  DEFAULT_SETTINGS,
  RESOLUTION_SCALE_MAX,
  RESOLUTION_SCALE_MIN,
  type MotionPreference,
  type QualityPreference,
  type UserSettings,
} from '../app/config';

export type QualityTier = 'low' | 'medium' | 'high';

/** Concrete renderer and scene-complexity budget for one quality tier. */
export interface RenderProfile {
  readonly tier: QualityTier;
  readonly pixelRatioCap: number;
  /** Only read when the WebGL context is created; changing it later needs a new context. */
  readonly antialias: boolean;
  readonly shadows: boolean;
  readonly shadowMapSize: number;
  readonly starCount: number;
  readonly dustCount: number;
  /** Noise octaves for the procedural sky and planet shaders. */
  readonly skyOctaves: number;
  readonly surfaceOctaves: number;
  /** Fraction (0–1) of the procedural ship's surface details that are drawn. */
  readonly detailDensity: number;
  /** HDR bloom post-processing (lasers, explosions, drives, the star). */
  readonly bloom: boolean;
  /** Multisampling of the post-processing target when bloom is on. */
  readonly msaaSamples: number;
}

export const QUALITY_PRESETS: Readonly<Record<QualityTier, RenderProfile>> = {
  low: {
    tier: 'low',
    pixelRatioCap: 1,
    antialias: false,
    shadows: false,
    shadowMapSize: 512,
    starCount: 3200,
    dustCount: 110,
    skyOctaves: 2,
    surfaceOctaves: 3,
    detailDensity: 0.45,
    bloom: false,
    msaaSamples: 0,
  },
  medium: {
    tier: 'medium',
    pixelRatioCap: 1.5,
    antialias: true,
    shadows: true,
    shadowMapSize: 1024,
    starCount: 6000,
    dustCount: 220,
    skyOctaves: 4,
    surfaceOctaves: 4,
    detailDensity: 0.8,
    bloom: true,
    msaaSamples: 2,
  },
  high: {
    tier: 'high',
    pixelRatioCap: 2,
    antialias: true,
    shadows: true,
    shadowMapSize: 2048,
    starCount: 9000,
    dustCount: 340,
    skyOctaves: 5,
    surfaceOctaves: 6,
    detailDensity: 1,
    bloom: true,
    msaaSamples: 4,
  },
};

export const QUALITY_TIERS: readonly QualityTier[] = ['low', 'medium', 'high'];

function isQualityPreference(value: unknown): value is QualityPreference {
  return value === 'auto' || value === 'low' || value === 'medium' || value === 'high';
}

function isMotionPreference(value: unknown): value is MotionPreference {
  return value === 'system' || value === 'reduced' || value === 'full';
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/** Validates untrusted stored data field by field, keeping every valid value. */
export function normalizeSettings(value: unknown): UserSettings {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ...DEFAULT_SETTINGS };
  }
  const input = value as Record<string, unknown>;
  // The foundation milestone stored 'balanced'; it maps to the equivalent medium tier.
  const rawQuality = input.quality === 'balanced' ? 'medium' : input.quality;
  return {
    quality: isQualityPreference(rawQuality) ? rawQuality : DEFAULT_SETTINGS.quality,
    resolutionScale: clampNumber(
      input.resolutionScale,
      RESOLUTION_SCALE_MIN,
      RESOLUTION_SCALE_MAX,
      DEFAULT_SETTINGS.resolutionScale,
    ),
    volume: clampNumber(input.volume, 0, 1, DEFAULT_SETTINGS.volume),
    motion: isMotionPreference(input.motion) ? input.motion : DEFAULT_SETTINGS.motion,
  };
}

export function getEffectivePixelRatio(
  devicePixelRatio: number,
  profile: RenderProfile,
  resolutionScale: number,
): number {
  const safeDevicePixelRatio = Number.isFinite(devicePixelRatio)
    ? Math.max(0.5, devicePixelRatio)
    : 1;
  const scale = clampNumber(resolutionScale, RESOLUTION_SCALE_MIN, RESOLUTION_SCALE_MAX, 1);
  return Math.min(safeDevicePixelRatio, profile.pixelRatioCap) * scale;
}
