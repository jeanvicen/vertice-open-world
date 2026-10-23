import { DEFAULT_SETTINGS, type UserSettings } from '../app/config';

export const QUALITY_PRESETS = {
  low: { pixelRatioCap: 1, shadows: false },
  balanced: { pixelRatioCap: 1.5, shadows: true },
  high: { pixelRatioCap: 2, shadows: true },
} as const;

export function normalizeSettings(value: unknown): UserSettings {
  if (typeof value !== 'object' || value === null) return { ...DEFAULT_SETTINGS };
  const input = value as Record<string, unknown>;
  const quality = input.quality === 'low' || input.quality === 'high' ? input.quality : 'balanced';
  const rawScale = typeof input.resolutionScale === 'number' ? input.resolutionScale : 1;
  const resolutionScale = Number.isFinite(rawScale) ? Math.min(1, Math.max(0.55, rawScale)) : 1;
  return { quality, resolutionScale };
}

export function getEffectivePixelRatio(devicePixelRatio: number, settings: UserSettings): number {
  const preset = QUALITY_PRESETS[settings.quality];
  const safeDevicePixelRatio = Number.isFinite(devicePixelRatio)
    ? Math.max(0.5, devicePixelRatio)
    : 1;
  return Math.min(safeDevicePixelRatio, preset.pixelRatioCap) * settings.resolutionScale;
}
