import { MathUtils, type PerspectiveCamera, Vector3 } from 'three';
import { CAMERA_FAR } from './layout';
import { clamp01, easeInOutCubic, smoothstep } from './random';

const START_POSITION = new Vector3(5, 2.6, 46);
const REST_POSITION = new Vector3(0, 0, 0);
/** The camera completes its approach in this many seconds of scene time. */
const APPROACH_SECONDS = 16;
const LOOK_DISTANCE = 100;

/** Final framing as yaw/pitch offsets (radians) from -Z, for wide and for tall screens. */
const LANDSCAPE_AIM = { yaw: 0.07, pitch: -0.02 };
const PORTRAIT_AIM = { yaw: -0.2, pitch: -0.2 };

export interface CameraFollow {
  readonly target: Vector3 | undefined;
  /** 0–1 share of the view that leans towards the target. */
  readonly weight: number;
}

/**
 * Restrained camera direction: a slow approach, a slight lean towards the ship as it overtakes,
 * then a near-still hold with a very slow drift. No shake, no zoom punches.
 */
export class CinematicCamera {
  private aspect = 16 / 9;
  private readonly baseDirection = new Vector3();
  private readonly followDirection = new Vector3();
  private readonly target = new Vector3();

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

  public update(timeSeconds: number, reducedMotion: boolean, follow: CameraFollow): void {
    const approach = reducedMotion ? 1 : easeInOutCubic(timeSeconds / APPROACH_SECONDS);
    this.camera.position.lerpVectors(START_POSITION, REST_POSITION, approach);
    if (!reducedMotion) {
      // Slow drift, a fraction of a unit over tens of seconds: the shot breathes, never shakes.
      const settle = smoothstep(APPROACH_SECONDS - 4, APPROACH_SECONDS + 4, timeSeconds);
      this.camera.position.x += Math.sin(timeSeconds * 0.071) * 0.9 * settle;
      this.camera.position.y += Math.sin(timeSeconds * 0.053 + 1.3) * 0.45 * settle;
      this.camera.position.z += Math.sin(timeSeconds * 0.039 + 0.4) * 0.7 * settle;
    }

    const portrait = this.portraitWeight;
    const yaw = MathUtils.lerp(LANDSCAPE_AIM.yaw, PORTRAIT_AIM.yaw, portrait);
    const pitch = MathUtils.lerp(LANDSCAPE_AIM.pitch, PORTRAIT_AIM.pitch, portrait);
    // The view starts slightly higher and settles as the approach completes.
    const entryLift = (1 - approach) * 0.05;
    const drift = reducedMotion ? 0 : Math.sin(timeSeconds * 0.047) * 0.004;
    this.baseDirection
      .set(
        -Math.sin(yaw + drift) * Math.cos(pitch + entryLift),
        Math.sin(pitch + entryLift),
        -Math.cos(yaw + drift) * Math.cos(pitch + entryLift),
      )
      .normalize();

    const weight = follow.target && !reducedMotion ? clamp01(follow.weight) : 0;
    if (weight > 0 && follow.target) {
      this.followDirection.subVectors(follow.target, this.camera.position).normalize();
      this.baseDirection.lerp(this.followDirection, weight).normalize();
    }
    this.target.copy(this.camera.position).addScaledVector(this.baseDirection, LOOK_DISTANCE);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.target);
  }
}
