import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SETTINGS,
  LEGACY_SETTINGS_STORAGE_KEY,
  SETTINGS_STORAGE_KEY,
} from '../../src/app/config';
import { loadSettings, saveSettings } from '../../src/systems/SettingsStore';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  public get length(): number {
    return this.values.size;
  }
  public clear(): void {
    this.values.clear();
  }
  public getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  public key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }
  public removeItem(key: string): void {
    this.values.delete(key);
  }
  public setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('SettingsStore', () => {
  it('returns defaults when nothing is stored', () => {
    expect(loadSettings(new MemoryStorage())).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips saved settings', () => {
    const storage = new MemoryStorage();
    const settings = {
      quality: 'high',
      resolutionScale: 0.75,
      volume: 0.3,
      motion: 'reduced',
    } as const;
    saveSettings(settings, storage);
    expect(loadSettings(storage)).toEqual(settings);
  });

  it('recovers from corrupt JSON without throwing', () => {
    const storage = new MemoryStorage();
    storage.setItem(SETTINGS_STORAGE_KEY, '{"quality":');
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid stored fields when others were tampered with', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ quality: 'low', resolutionScale: 'tiny', volume: 0.2, motion: 42 }),
    );
    expect(loadSettings(storage)).toEqual({
      quality: 'low',
      resolutionScale: DEFAULT_SETTINGS.resolutionScale,
      volume: 0.2,
      motion: DEFAULT_SETTINGS.motion,
    });
  });

  it('migrates the foundation milestone preferences once no new entry exists', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      LEGACY_SETTINGS_STORAGE_KEY,
      JSON.stringify({ quality: 'balanced', resolutionScale: 0.7 }),
    );
    expect(loadSettings(storage)).toMatchObject({ quality: 'medium', resolutionScale: 0.7 });
  });

  it('prefers the current entry over the legacy one', () => {
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_SETTINGS_STORAGE_KEY, JSON.stringify({ quality: 'high' }));
    storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ quality: 'low' }));
    expect(loadSettings(storage).quality).toBe('low');
  });

  it('survives storage that throws, as in some private browsing modes', () => {
    const storage = new MemoryStorage();
    storage.getItem = () => {
      throw new Error('denied');
    };
    storage.setItem = () => {
      throw new Error('quota');
    };
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(DEFAULT_SETTINGS, storage)).not.toThrow();
  });
});
