import { CatmullRomCurve3, Matrix4, Quaternion, Vector3 } from 'three';
import { PLANET_CENTER, PLANET_RADIUS } from './layout';
import { smoothstep } from './random';

/** Centre of the dogfight the hero interrupts, in scene units. */
export const BATTLE_CENTER = new Vector3(30, -6, -240);

/** Seconds the warp streak takes to drop the ship out of hyperspace. */
export const WARP_SECONDS = 0.55;
const CRUISE_SPEED = 34;
const DEPARTURE_ACCELERATION = 64;
/** Distance along the path where the reduced-motion composition holds the ship. */
export const STATION_DISTANCE = 120;

/** Where the hero comes out of warp, and where the warp streak starts. */
export const WARP_EXIT = BATTLE_CENTER.clone().add(new Vector3(-95, 12, 70));
export const WARP_ORIGIN = WARP_EXIT.clone().add(new Vector3(-620, 70, 420));

/** The hero vanishes against the planet's night side, just inside the bright limb. */
const LIMB_DIRECTION = new Vector3(-0.66, 0.75, 0).normalize();
export const DEPARTURE_TARGET = PLANET_CENTER.clone()
  .addScaledVector(LIMB_DIRECTION, PLANET_RADIUS * 0.55)
  .multiplyScalar(0.62);

export interface ShipState {
  readonly position: Vector3;
  readonly quaternion: Quaternion;
  /** 0 before arrival, 1 at the end of the path. */
  progress: number;
  visible: boolean;
  /** True during the warp streak. */
  warping: boolean;
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
    warping: false,
    engine: 1,
    hullFade: 1,
    engineFade: 1,
  };
}

/**
 * Distance travelled along the main path after leaving warp: a steady attack run through the
 * battle, then constant thrust towards the planet from `departureDelay` seconds.
 */
export function flightDistance(secondsAfterWarp: number, departureDelay: number): number {
  if (secondsAfterWarp <= 0) return 0;
  const burn = Math.max(0, secondsAfterWarp - departureDelay);
  return CRUISE_SPEED * secondsAfterWarp + 0.5 * DEPARTURE_ACCELERATION * burn * burn;
}

/**
 * The protagonist's flight: a warp drop into the battle, a run straight through it, a banked
 * turn and a burn towards the planet until the ship is lost against its night side.
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

  /**
   * @param departureDelay seconds between leaving warp and starting the burn to the planet.
   */
  public constructor(private readonly departureDelay: number) {
    this.curve = new CatmullRomCurve3(
      [
        WARP_EXIT,
        BATTLE_CENTER.clone().add(new Vector3(-36, 4, 16)),
        BATTLE_CENTER.clone().add(new Vector3(18, -3, -24)),
        BATTLE_CENTER.clone().add(new Vector3(62, 4, -96)),
        BATTLE_CENTER.clone()
          .lerp(DEPARTURE_TARGET, 0.25)
          .add(new Vector3(40, 30, 0)),
        DEPARTURE_TARGET,
      ],
      false,
      'centripetal',
    );
    this.curve.arcLengthDivisions = 800;
    this.length = this.curve.getLength();
  }

  /** Position and attitude on the main path at a given distance. */
  public sampleAtDistance(distance: number, timeSeconds: number, state: ShipState): void {
    const u = Math.min(1, Math.max(0, distance / this.length));
    state.progress = u;
    this.curve.getPointAt(u, state.position);
    this.curve.getTangentAt(u, this.tangent);
    this.curve.getTangentAt(Math.min(1, u + 8 / this.length), this.ahead);
    // Bank into the turn, proportional to the heading change over the next few units.
    const turn = this.side.crossVectors(this.tangent, this.ahead).y;
    const bank = Math.max(-0.42, Math.min(0.42, -turn * 22));
    const trim = Math.sin(timeSeconds * 0.55) * 0.006;
    this.orient(this.tangent, bank + trim, state.quaternion);
  }

  /** Cinematic flight, sampled purely from the time since the warp began. */
  public sample(secondsSinceWarp: number, timeSeconds: number, state: ShipState): void {
    state.warping = false;
    if (secondsSinceWarp < 0) {
      state.position.copy(WARP_ORIGIN);
      this.tangent.subVectors(WARP_EXIT, WARP_ORIGIN).normalize();
      this.orient(this.tangent, 0, state.quaternion);
      state.visible = false;
      state.progress = 0;
      return;
    }
    if (secondsSinceWarp < WARP_SECONDS) {
      // Hyperspace drop: a hard deceleration along a straight line onto the battlefield.
      const k = secondsSinceWarp / WARP_SECONDS;
      const eased = 1 - (1 - k) ** 4;
      state.position.lerpVectors(WARP_ORIGIN, WARP_EXIT, eased);
      this.tangent.subVectors(WARP_EXIT, WARP_ORIGIN).normalize();
      this.orient(this.tangent, 0, state.quaternion);
      state.visible = true;
      state.warping = true;
      state.progress = 0;
      state.engine = 2.2;
      state.hullFade = 1;
      state.engineFade = 1;
      return;
    }
    const afterWarp = secondsSinceWarp - WARP_SECONDS;
    this.sampleAtDistance(flightDistance(afterWarp, this.departureDelay), timeSeconds, state);
    const u = state.progress;
    state.visible = u < 1;
    const settle = 1 + 1.1 * (1 - smoothstep(0, 1.2, afterWarp));
    const burn = 0.85 * smoothstep(this.departureDelay - 0.3, this.departureDelay + 1.4, afterWarp);
    state.engine = settle + burn;
    state.hullFade = 1 - smoothstep(0.78, 0.93, u);
    state.engineFade = 1 - smoothstep(0.86, 0.995, u);
  }

  /** Reduced motion: the ship holds station beyond the empty battlefield, drive idling. */
  public sampleStation(timeSeconds: number, state: ShipState): void {
    this.sampleAtDistance(STATION_DISTANCE, timeSeconds, state);
    state.visible = true;
    state.warping = false;
    state.engine = 0.75;
    state.hullFade = 1;
    state.engineFade = 1;
  }

  private orient(direction: Vector3, roll: number, out: Quaternion): void {
    this.up.set(0, 1, 0);
    this.side.crossVectors(this.up, direction).normalize();
    this.up.crossVectors(direction, this.side).normalize();
    this.basis.makeBasis(this.side, this.up, direction);
    out.setFromRotationMatrix(this.basis);
    out.multiply(this.roll.setFromAxisAngle(this.forward, roll));
  }
}
