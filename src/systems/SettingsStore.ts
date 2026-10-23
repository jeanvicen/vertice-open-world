import {
  LEGACY_SETTINGS_STORAGE_KEY,
  SETTINGS_STORAGE_KEY,
  type UserSettings,
} from '../app/config';
import { normalizeSettings } from '../rendering/quality';

function readJson(storage: Storage, key: string): unknown {
  const stored = storage.getItem(key);
  if (!stored) return undefined;
  try {
    return JSON.parse(stored) as unknown;
  } catch {
    console.warn(`[VÉRTICE] Ignoring unreadable saved settings in "${key}".`);
    return undefined;
  }
}

/** Reads, validates and (for the foundation format) migrates stored preferences. */
export function loadSettings(storage: Storage | undefined = safeLocalStorage()): UserSettings {
  if (!storage) return normalizeSettings(null);
  try {
    const current = readJson(storage, SETTINGS_STORAGE_KEY);
    if (current !== undefined) return normalizeSettings(current);
    const legacy = readJson(storage, LEGACY_SETTINGS_STORAGE_KEY);
    return normalizeSettings(legacy ?? null);
  } catch (error) {
    console.warn('[VÉRTICE] Saved settings could not be read; using defaults.', error);
    return normalizeSettings(null);
  }
}

export function saveSettings(
  settings: UserSettings,
  storage: Storage | undefined = safeLocalStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(normalizeSettings(settings)));
  } catch (error) {
    console.warn('[VÉRTICE] Settings could not be saved in this browser.', error);
  }
}

/** Accessing localStorage throws in some privacy modes and sandboxed frames. */
function safeLocalStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
