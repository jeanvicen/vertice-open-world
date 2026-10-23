import type { Group } from 'three';

/**
 * What the opening needs from a ship. The procedural vessel implements it today; an authored
 * GLB can implement the same contract later without touching the timeline or flight path.
 */
export interface ShipModel {
  /** Nose along +Z, up along +Y, origin near the centre of mass. */
  readonly root: Group;
  readonly length: number;
  /** 0 = cold, 1 = cruise, values above 1 = burn. */
  setEngineIntensity(value: number): void;
  /** Fades the hull (and later the engines) as the ship vanishes into the distance. */
  setFade(hull: number, engines: number): void;
  /** 0–1 share of optional surface details to draw. */
  setDetailDensity(density: number): void;
  setShadows(enabled: boolean): void;
  update(timeSeconds: number): void;
  dispose(): void;
}
