export const GAME_TITLE = 'VÉRTICE';
export const SETTINGS_STORAGE_KEY = 'vertice.settings.v1';
export const BASE_URL = import.meta.env.BASE_URL;

export interface UserSettings {
  quality: 'low' | 'balanced' | 'high';
  resolutionScale: number;
}

export const DEFAULT_SETTINGS: UserSettings = {
  quality: 'balanced',
  resolutionScale: 1,
};
