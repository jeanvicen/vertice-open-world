import { describe, expect, it } from 'vitest';
import {
  getEffectivePixelRatio,
  normalizeSettings,
  QUALITY_PRESETS,
} from '../../src/rendering/quality';

describe('render quality settings', () => {
  it('limits low-tier devices to the economical pixel ratio', () => {
    expect(
      getEffectivePixelRatio(3, normalizeSettings({ quality: 'low', resolutionScale: 1 })),
    ).toBe(1);
  });

  it('respects the user render-scale preference', () => {
    expect(
      getEffectivePixelRatio(2, normalizeSettings({ quality: 'balanced', resolutionScale: 0.75 })),
    ).toBe(1.125);
  });

  it('falls back to balanced for unknown presets', () => {
    expect(normalizeSettings({ quality: 'ultra', resolutionScale: 1 }).quality).toBe('balanced');
    expect(QUALITY_PRESETS.balanced.shadows).toBe(true);
  });

  it('clamps unsafe scale values and rejects NaN', () => {
    expect(normalizeSettings({ quality: 'high', resolutionScale: 4 }).resolutionScale).toBe(1);
    expect(normalizeSettings({ quality: 'high', resolutionScale: 0 }).resolutionScale).toBe(0.55);
    expect(
      normalizeSettings({ quality: 'high', resolutionScale: Number.NaN }).resolutionScale,
    ).toBe(1);
  });

  it('returns safe defaults for non-object settings', () => {
    expect(normalizeSettings(null)).toEqual({ quality: 'balanced', resolutionScale: 1 });
  });
});
