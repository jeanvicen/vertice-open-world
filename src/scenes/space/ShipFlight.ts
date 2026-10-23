import { CatmullRomCurve3, Matrix4, Quaternion, Vector3 } from 'three';
import { SUN_DIRECTION } from './layout';
import { smoothstep } from './random';

/** Cruise speed while overtaking the camera, in units per second. */
const CRUISE_SPEED = 30;
/** Seconds after entry when the drive lights for the long run towards the star. */
const BURN_START = 4.4;
const BURN_ACCELERATION = 46;
/** Distance along the path where the reduced-motion composition holds the ship. */
export const STATION_DISTANCE = 250;

export interface ShipState {
  readonly position: Vector3;
  readonly quaternion: Quaternion;
  /** 0 before entry, 1 after leaving the path. */
  progress: number;
  visible: boolean;
  engine: number;
  hullFade: number;
  engineFade: number;
}

export function createShipState(): ShipState {
  return {
    position: new Vector3(),
    quaternion: new Quaternion(),
    progress: 0,
    visible: false,
    engine: 1,
    hullFade: 1,
    engineFade: 1,
  };
}

/** Distance travelled after entry: steady cruise, then a constant-thrust burn. */
export function flightDistance(secondsSinceEntry: number): number {
  if (secondsSinceEntry <= 0) return 0;
  const burn = Math.max(0, secondsSinceEntry - BURN_START);
  return CRUISE_SPEED * secondsSinceEntry + 0.5 * BURN_ACCELERATION * burn * burn;
}

/**
 * The ship overtakes the camera from behind its left shoulder, settles onto a heading for the
 * star and burns away until it is lost against the planet's bright limb.
 */
export class ShipFlight {
  private readonly curve: CatmullRomCurve3;
  public readonly length: number;
  private readonly tangent = new Vector3();
  private readonly ahead = new Vector3();
  private readonly side = new Vector3();
  private readonly up = new Vector3();
  private readonly basis = new Matrix4();
  private readonly roll = new Quaternion();
  private readonly forward = new Vector3(0, 0, 1);

  public constructor() {
    this.curve = new CatmullRomCurve3(
      [
        new Vector3(-27, 12.5, 96),
        new Vector3(-11.5, 6.4, 18),
        new Vector3(-4.5, 3.1, -46),
        new Vector3(34, 20, -360),
        SUN_DIRECTION.clone().multiplyScalar(1250),
        SUN_DIRECTION.clone().multiplyScalar(2700),
      ],
      false,
      'centripetal',
    );
    this.curve.arcLengthDivisions = 600;
    this.length = this.curve.getLength();
  }

  public sampleAtDistance(distance: number, timeSeconds: number, state: ShipState): void {
    const u = Math.min(1, Math.max(0, distance / this.length));
    state.progress = u;
    this.curve.getPointAt(u, state.position);
    this.curve.getTangentAt(u, this.tangent);
    this.curve.getTangentAt(Math.min(1, u + 6 / this.length), this.ahead);
    // Bank into the turn, proportional to the heading change over the next few units.
    const turn = this.side.crossVectors(this.tangent, this.ahead).y;
    const bank = Math.max(-0.32, Math.min(0.32, -turn * 26));
    // Slow attitude corrections, a fraction of a degree.
    const trim = Math.sin(timeSeconds * 0.55) * 0.006;
    this.up.set(0, 1, 0);
    this.side.crossVectors(this.up, this.tangent).normalize();
    this.up.crossVectors(this.tangent, this.side).normalize();
    this.basis.makeBasis(this.side, this.up, this.tangent);
    state.quaternion.setFromRotationMatrix(this.basis);
    state.quaternion.multiply(this.roll.setFromAxisAngle(this.forward, bank + trim));
  }

  /** Normal cinematic flight, sampled purely from time since the ship's entry. */
  public sample(secondsSinceEntry: number, timeSeconds: number, state: ShipState): void {
    const distance = flightDistance(secondsSinceEntry);
    this.sampleAtDistance(distance, timeSeconds, state);
    const u = state.progress;
    state.visible = secondsSinceEntry > 0 && u < 1;
    state.engine = 1 + 0.7 * smoothstep(BURN_START - 0.3, BURN_START + 1.6, secondsSinceEntry);
    state.hullFade = 1 - smoothstep(0.72, 0.9, u);
    state.engineFade = 1 - smoothstep(0.82, 0.995, u);
  }

  /** Reduced motion: the ship holds station mid-distance with its drive idling. */
  public sampleStation(timeSeconds: number, state: ShipState): void {
    this.sampleAtDistance(STATION_DISTANCE, timeSeconds, state);
    state.visible = true;
    state.engine = 0.75;
    state.hullFade = 1;
    state.engineFade = 1;
  }
}
