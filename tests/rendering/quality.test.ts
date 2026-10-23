import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/app/config';
import {
  getEffectivePixelRatio,
  normalizeSettings,
  QUALITY_PRESETS,
} from '../../src/rendering/quality';

describe('render quality settings', () => {
  it('limits the low tier to the economical pixel ratio', () => {
    expect(getEffectivePixelRatio(3, QUALITY_PRESETS.low, 1)).toBe(1);
  });

  it('respects the render-scale preference', () => {
    expect(getEffectivePixelRatio(2, QUALITY_PRESETS.medium, 0.75)).toBe(1.125);
    expect(getEffectivePixelRatio(3, QUALITY_PRESETS.high, 0.5)).toBe(1);
  });

  it('clamps an out-of-range render scale even when called directly', () => {
    expect(getEffectivePixelRatio(1, QUALITY_PRESETS.high, 0.01)).toBe(0.5);
    expect(getEffectivePixelRatio(Number.NaN, QUALITY_PRESETS.medium, 1)).toBe(1);
  });

  it('makes each tier strictly cheaper than the one above it', () => {
    const { low, medium, high } = QUALITY_PRESETS;
    expect(low.starCount).toBeLessThan(medium.starCount);
    expect(medium.starCount).toBeLessThan(high.starCount);
    expect(low.pixelRatioCap).toBeLessThan(medium.pixelRatioCap);
    expect(low.shadows).toBe(false);
    expect(medium.shadowMapSize).toBeLessThan(high.shadowMapSize);
  });

  it('migrates the foundation milestone "balanced" preset to medium', () => {
    expect(normalizeSettings({ quality: 'balanced' }).quality).toBe('medium');
  });

  it('keeps valid fields and replaces only invalid ones', () => {
    expect(
      normalizeSettings({ quality: 'ultra', resolutionScale: 0.8, volume: 'loud', motion: 'full' }),
    ).toEqual({
      quality: 'auto',
      resolutionScale: 0.8,
      volume: DEFAULT_SETTINGS.volume,
      motion: 'full',
    });
  });

  it('clamps unsafe numbers and rejects NaN', () => {
    const high = normalizeSettings({ resolutionScale: 4, volume: 7 });
    expect(high.resolutionScale).toBe(1);
    expect(high.volume).toBe(1);
    const low = normalizeSettings({ resolutionScale: 0, volume: -1 });
    expect(low.resolutionScale).toBe(0.5);
    expect(low.volume).toBe(0);
    expect(normalizeSettings({ resolutionScale: Number.NaN }).resolutionScale).toBe(1);
  });

  it('returns safe defaults for non-object settings', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings([1, 2])).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings('high')).toEqual(DEFAULT_SETTINGS);
  });
});
