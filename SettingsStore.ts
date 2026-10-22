import { SETTINGS_STORAGE_KEY, type UserSettings } from '../app/config';
import { normalizeSettings } from '../rendering/quality';

export function loadSettings(): UserSettings {
  try {
    const stored = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    return stored ? normalizeSettings(JSON.parse(stored) as unknown) : normalizeSettings(null);
  } catch (error) {
    console.warn('[VÉRTICE] Saved graphics settings could not be read; using defaults.', error);
    return normalizeSettings(null);
  }
}

export function saveSettings(settings: UserSettings): void {
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(normalizeSettings(settings)));
  } catch (error) {
    console.warn('[VÉRTICE] Graphics settings could not be saved in this browser.', error);
  }
}
