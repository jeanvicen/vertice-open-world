export const GAME_TITLE = 'VÉRTICE';
export const SETTINGS_STORAGE_KEY = 'vertice.settings.v2';
/** Read once to migrate the foundation milestone's graphics preferences. */
export const LEGACY_SETTINGS_STORAGE_KEY = 'vertice.settings.v1';
export const BASE_URL = import.meta.env.BASE_URL;

export type QualityPreference = 'auto' | 'low' | 'medium' | 'high';
export type MotionPreference = 'system' | 'reduced' | 'full';

export interface UserSettings {
  quality: QualityPreference;
  /** Multiplier applied to the preset's capped device pixel ratio. */
  resolutionScale: number;
  /** Master volume from 0 (muted) to 1. */
  volume: number;
  motion: MotionPreference;
}

export const RESOLUTION_SCALE_MIN = 0.5;
export const RESOLUTION_SCALE_MAX = 1;

export const DEFAULT_SETTINGS: UserSettings = {
  quality: 'auto',
  resolutionScale: 1,
  volume: 0.7,
  motion: 'system',
};
