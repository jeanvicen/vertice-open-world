import { MathUtils, type PerspectiveCamera, Quaternion, Vector3 } from 'three';
import type { IntroSchedule } from './IntroTimeline';
import { CAMERA_FAR } from './layout';
import { clamp01, easeInOutCubic, smoothstep } from './random';
import { BATTLE_CENTER, createShipState, type ShipState, WARP_EXIT } from './ShipFlight';

const REST_POSITION = new Vector3(0, 0, 0);
const LOOK_DISTANCE = 100;

/** Final framing as yaw/pitch offsets (radians) from -Z, for wide and for tall screens. */
const LANDSCAPE_AIM = { yaw: 0.07, pitch: -0.02 };
const PORTRAIT_AIM = { yaw: -0.2, pitch: -0.2 };

/** Establishing shot: a slow push towards the dogfight with the planet behind it. */
const ESTABLISH_FROM = BATTLE_CENTER.clone().add(new Vector3(-62, 24, 108));
const ESTABLISH_TO = BATTLE_CENTER.clone().add(new Vector3(-46, 15, 76));
/** The warp is shot from beside the exit point so the streak crosses the frame. */
const ARRIVAL_POSITION = WARP_EXIT.clone().add(new Vector3(44, 14, 52));
/** Chase offset in the hero's frame (+Z is its nose): behind, above and to one side. */
const CHASE_OFFSET = new Vector3(16, 9, -58);
const CHASE_LOOK_AHEAD = 40;
const CHASE_LAG = 0.45;
const ARRIVAL_SHOT_SECONDS = 3.4;
const DEPARTURE_BLEND_SECONDS = 6.8;

export interface CameraContext {
  readonly schedule: IntroSchedule;
  /** False when the battle is not shown (reduced motion): the camera holds the final frame. */
  readonly cinematic: boolean;
  /** True after a skip: hold the final framing. */
  readonly skipped: boolean;
  /** Samples the hero at any scene time (used for a smooth, lagged chase). */
  readonly sampleHero: (time: number, out: ShipState) => void;
  /** 0–1 explosion shake, already distance-attenuated. */
  readonly shake: number;
}

interface Pose {
  readonly position: Vector3;
  readonly target: Vector3;
}

/**
 * Shot-based direction. Every pose is a function of scene time: an establishing push, a cut
 * on the warp, a lagged chase that keeps the hero readable, and a long ease back to the menu
 * framing. Motion stays restrained; shake only answers nearby explosions.
 */
export class CinematicCamera {
  private aspect = 16 / 9;
  private readonly heroNow = createShipState();
  private readonly heroLagged = createShipState();
  private readonly a: Pose = { position: new Vector3(), target: new Vector3() };
  private readonly b: Pose = { position: new Vector3(), target: new Vector3() };
  private readonly scratch = new Vector3();
  private readonly orientation = new Quaternion();

  public constructor(private readonly camera: PerspectiveCamera) {
    camera.near = 0.5;
    camera.far = CAMERA_FAR;
    this.setAspect(this.aspect);
  }

  public setAspect(aspect: number): void {
    this.aspect = Math.max(0.3, aspect);
    this.camera.aspect = this.aspect;
    // Keep at least ~46° horizontally on tall screens, capped to avoid wide-angle stretching.
    const landscapeFov = MathUtils.lerp(44, 36, smoothstep(1, 1.9, this.aspect));
    const minimumHorizontal = MathUtils.degToRad(46);
    const portraitFov = MathUtils.radToDeg(
      2 * Math.atan(Math.tan(minimumHorizontal / 2) / this.aspect),
    );
    this.camera.fov = this.aspect >= 1 ? landscapeFov : Math.min(74, portraitFov);
    this.camera.updateProjectionMatrix();
  }

  /** 0 for wide screens, 1 for tall phone portrait. */
  public get portraitWeight(): number {
    return smoothstep(1.15, 0.6, this.aspect);
  }

  public update(time: number, reducedMotion: boolean, context: CameraContext): void {
    const { schedule } = context;
    if (!context.cinematic || context.skipped) {
      this.restPose(time, reducedMotion, this.a);
      this.apply(this.a, 0, time);
      return;
    }
    const arrivalEnd = schedule.hero + ARRIVAL_SHOT_SECONDS;
    if (time < schedule.hero) {
      this.establishingPose(time, schedule, this.a);
      this.apply(this.a, context.shake, time);
    } else if (time < arrivalEnd) {
      this.arrivalPose(time, context, this.a);
      // Ease into the chase over the last part of the arrival shot.
      const blend = smoothstep(arrivalEnd - 1.4, arrivalEnd, time);
      if (blend > 0) {
        this.chasePose(time, context, this.b);
        this.mix(this.a, this.b, blend);
      }
      this.apply(this.a, context.shake, time);
    } else if (time < schedule.departure + 0.6) {
      this.chasePose(time, context, this.a);
      this.apply(this.a, context.shake, time);
    } else {
      this.chasePose(time, context, this.a);
      this.restPose(time, reducedMotion, this.b);
      const blend = easeInOutCubic((time - schedule.departure - 0.6) / DEPARTURE_BLEND_SECONDS);
      this.mix(this.a, this.b, blend);
      this.apply(this.a, context.shake * (1 - blend), time);
    }
  }

  private establishingPose(time: number, schedule: IntroSchedule, out: Pose): void {
    // A push across the battle; earlier times (behind the title cards) hold the first frame.
    const k = clamp01((time - schedule.battle) / (schedule.hero - schedule.battle));
    out.position.lerpVectors(ESTABLISH_FROM, ESTABLISH_TO, easeInOutCubic(k));
    out.target.copy(BATTLE_CENTER).add(this.scratch.set(Math.sin(time * 0.21) * 6, -4, 0));
  }

  private arrivalPose(time: number, context: CameraContext, out: Pose): void {
    context.sampleHero(time - 0.18, this.heroLagged);
    out.position.copy(ARRIVAL_POSITION);
    // Look first at the exit point, then follow the ship as it powers into the battle.
    const follow = smoothstep(context.schedule.hero + 0.2, context.schedule.hero + 1.6, time);
    out.target.copy(WARP_EXIT).lerp(this.heroLagged.position, follow);
  }

  private chasePose(time: number, context: CameraContext, out: Pose): void {
    context.sampleHero(time - CHASE_LAG, this.heroLagged);
    context.sampleHero(time, this.heroNow);
    // Follow the hero's heading but not its banking, so the horizon stays calm.
    this.orientation.copy(this.heroLagged.quaternion);
    const forward = this.scratch.set(0, 0, 1).applyQuaternion(this.orientation);
    const yaw = Math.atan2(forward.x, forward.z);
    const level = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw);
    out.position.copy(CHASE_OFFSET).applyQuaternion(level).add(this.heroLagged.position);
    out.target
      .copy(this.heroNow.position)
      .addScaledVector(
        new Vector3(0, 0, 1).applyQuaternion(this.heroNow.quaternion),
        CHASE_LOOK_AHEAD,
      );
  }

  private restPose(time: number, reducedMotion: boolean, out: Pose): void {
    out.position.copy(REST_POSITION);
    if (!reducedMotion) {
      // Slow drift, a fraction of a unit over tens of seconds: the shot breathes, never shakes.
      out.position.x += Math.sin(time * 0.071) * 0.9;
      out.position.y += Math.sin(time * 0.053 + 1.3) * 0.45;
      out.position.z += Math.sin(time * 0.039 + 0.4) * 0.7;
    }
    const portrait = this.portraitWeight;
    const yaw = MathUtils.lerp(LANDSCAPE_AIM.yaw, PORTRAIT_AIM.yaw, portrait);
    const pitch = MathUtils.lerp(LANDSCAPE_AIM.pitch, PORTRAIT_AIM.pitch, portrait);
    const drift = reducedMotion ? 0 : Math.sin(time * 0.047) * 0.004;
    out.target
      .set(
        -Math.sin(yaw + drift) * Math.cos(pitch),
        Math.sin(pitch),
        -Math.cos(yaw + drift) * Math.cos(pitch),
      )
      .multiplyScalar(LOOK_DISTANCE)
      .add(out.position);
  }

  /** Blends `into` towards `other`: positions linearly, view directions through a slerp. */
  private mix(into: Pose, other: Pose, k: number): void {
    const fromDirection = into.target.clone().sub(into.position).normalize();
    const toDirection = other.target.clone().sub(other.position).normalize();
    into.position.lerp(other.position, k);
    const rotation = new Quaternion().setFromUnitVectors(fromDirection, toDirection);
    const partial = new Quaternion().slerp(rotation, k);
    into.target
      .copy(fromDirection.applyQuaternion(partial))
      .multiplyScalar(LOOK_DISTANCE)
      .add(into.position);
  }

  private apply(pose: Pose, shake: number, t: number): void {
    this.camera.position.copy(pose.position);
    if (shake > 0.001) {
      this.camera.position.x += Math.sin(t * 37.1) * shake * 0.35;
      this.camera.position.y += Math.sin(t * 43.7 + 1.1) * shake * 0.28;
    }
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(pose.target);
  }
}
