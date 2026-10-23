import {
  Color,
  DirectionalLight,
  HemisphereLight,
  PerspectiveCamera,
  Scene as ThreeScene,
  type WebGLRenderer,
} from 'three';
import type { QualityManager } from '../../rendering/QualityManager';
import type { RenderProfile } from '../../rendering/quality';
import { ResourceTracker } from '../../rendering/ResourceTracker';
import type { MotionPreferenceWatcher } from '../../systems/MotionPreference';
import type { Scene } from '../Scene';
import { CinematicCamera } from './CinematicCamera';
import { Cosmos, type CosmosReveal } from './Cosmos';
import {
  CINEMATIC_SCHEDULE,
  IntroTimeline,
  type PhaseChange,
  REDUCED_MOTION_SCHEDULE,
} from './IntroTimeline';
import { PLANET_CENTER, SUN_DIRECTION } from './layout';
import { damp, smoothstep } from './random';
import { ProceduralShip } from './ship/ProceduralShip';
import type { ShipModel } from './ship/ShipModel';
import { createShipState, ShipFlight } from './ShipFlight';
import { createEnvironmentTexture, createGlowTexture } from './textures';

export interface SpaceIntroOptions {
  readonly quality: QualityManager;
  readonly motion: MotionPreferenceWatcher;
  readonly onPhase: (change: PhaseChange) => void;
}

const EXPOSURE = 1.05;

/**
 * The opening and the living backdrop of the title menu. Every visual is sampled from the
 * timeline clock, so the sequence looks the same at 20 or 120 frames per second.
 */
export class SpaceIntroScene implements Scene {
  public readonly threeScene = new ThreeScene();
  public readonly camera = new PerspectiveCamera(40, 16 / 9, 0.5, 12000);
  private readonly resources = new ResourceTracker();
  private readonly timeline: IntroTimeline;
  private readonly cinematic: CinematicCamera;
  private readonly cosmos: Cosmos;
  private readonly ship: ShipModel;
  private readonly flight = new ShipFlight();
  private readonly shipState = createShipState();
  private readonly sunLight = new DirectionalLight(new Color('#ffe9d2'), 3.4);
  private readonly bounceLight = new DirectionalLight(new Color('#6f8bb8'), 0.55);
  private readonly unsubscribers: Array<() => void> = [];
  private readonly shipHoldsStation: boolean;
  private reducedMotion: boolean;
  /** Ambient clock: keeps running smoothly even when the timeline jumps on skip. */
  private ambientTime = 0;
  private fade = 0;
  private fadeRate = 0.9;
  private compiled = false;
  private exited = false;

  public constructor(options: SpaceIntroOptions) {
    const profile = options.quality.profile;
    this.reducedMotion = options.motion.reduced;
    this.shipHoldsStation = this.reducedMotion;
    this.timeline = new IntroTimeline(
      this.reducedMotion ? REDUCED_MOTION_SCHEDULE : CINEMATIC_SCHEDULE,
      (change) => options.onPhase(change),
    );
    this.cinematic = new CinematicCamera(this.camera);

    const glow = this.resources.track(createGlowTexture());
    const environment = this.resources.track(createEnvironmentTexture());
    this.cosmos = new Cosmos(this.resources, glow, profile);
    this.ship = new ProceduralShip(environment, glow);
    this.ship.root.visible = false;
    this.threeScene.add(this.cosmos.root, this.ship.root);

    this.sunLight.target = this.ship.root;
    this.sunLight.shadow.camera.left = -24;
    this.sunLight.shadow.camera.right = 24;
    this.sunLight.shadow.camera.top = 24;
    this.sunLight.shadow.camera.bottom = -24;
    this.sunLight.shadow.camera.near = 1;
    this.sunLight.shadow.camera.far = 260;
    this.sunLight.shadow.bias = -0.0004;
    this.sunLight.shadow.normalBias = 0.04;
    this.bounceLight.target = this.ship.root;
    this.threeScene.add(
      this.sunLight,
      this.bounceLight,
      new HemisphereLight(new Color('#0d1424'), new Color('#020203'), 0.35),
    );

    this.applyProfile(profile);
    this.unsubscribers.push(
      options.quality.subscribe((next) => this.applyProfile(next)),
      options.motion.subscribe((reduced) => {
        this.reducedMotion = reduced;
      }),
    );
  }

  public enter(): void {
    this.exited = false;
    this.timeline.start();
  }

  public get introComplete(): boolean {
    return this.timeline.complete;
  }

  /** Cuts to the final composition through a short dip, then announces the remaining phases. */
  public skip(): boolean {
    const fadeBeforeSkip = this.fade;
    if (!this.timeline.skip()) return false;
    if (fadeBeforeSkip > 0.05) this.fade = 0;
    this.fadeRate = 2.4;
    return true;
  }

  public resize(width: number, height: number): void {
    this.cinematic.setAspect(width / Math.max(1, height));
  }

  public update(deltaSeconds: number): void {
    if (this.exited) return;
    this.timeline.advance(deltaSeconds);
    this.ambientTime += deltaSeconds;
    const t = this.timeline.elapsed;
    const schedule = this.timeline.schedule;
    const skipped = this.timeline.skipped;

    const exposureTarget = t >= schedule.cosmos ? 1 : 0;
    this.fade = damp(this.fade, exposureTarget, this.fadeRate, deltaSeconds);

    const shipEntry = schedule.ship;
    if (this.shipHoldsStation) {
      this.flight.sampleStation(this.ambientTime, this.shipState);
    } else if (skipped) {
      this.shipState.visible = false;
    } else {
      this.flight.sample(t - shipEntry, this.ambientTime, this.shipState);
    }
    this.applyShip();

    const followWeight =
      this.shipState.visible && !this.shipHoldsStation && !skipped
        ? smoothstep(shipEntry + 2.3, shipEntry + 3.4, t) *
          (1 - smoothstep(shipEntry + 4.4, shipEntry + 7.8, t)) *
          0.3
        : 0;
    this.cinematic.update(t, this.reducedMotion, {
      target: this.shipState.visible ? this.shipState.position : undefined,
      weight: followWeight,
    });

    this.cosmos.update(this.ambientTime, this.camera.position, this.revealAt(t, skipped));
  }

  public render(renderer: WebGLRenderer): void {
    if (this.exited) return;
    this.cosmos.setPixelRatio(renderer.getPixelRatio());
    if (!this.compiled) {
      // Compile every program while the screen is still black, not mid-reveal.
      renderer.compile(this.threeScene, this.camera);
      this.compiled = true;
    }
    const previousExposure = renderer.toneMappingExposure;
    renderer.toneMappingExposure = EXPOSURE * this.fade;
    renderer.render(this.threeScene, this.camera);
    renderer.toneMappingExposure = previousExposure;
  }

  public exit(): void {
    if (this.exited) return;
    this.exited = true;
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.unsubscribers.length = 0;
    this.ship.dispose();
    this.sunLight.shadow.dispose();
    this.threeScene.clear();
    this.resources.dispose();
  }

  private revealAt(t: number, skipped: boolean): CosmosReveal {
    if (skipped) return { sky: 1, stars: 1.4, bodies: 1, dust: 1 };
    const start = this.timeline.schedule.cosmos;
    // Reduced motion compresses the staggered reveal into a short dissolve.
    const pace = this.timeline.schedule === REDUCED_MOTION_SCHEDULE ? 0.35 : 1;
    const since = (t - start) / pace;
    return {
      stars: Math.max(0, Math.min(1.4, (since / 3.4) * 1.4)),
      sky: smoothstep(0.8, 5.2, since),
      bodies: smoothstep(1.4, 6.2, since),
      dust: smoothstep(2.2, 6.4, since),
    };
  }

  private applyShip(): void {
    const state = this.shipState;
    this.ship.root.visible = state.visible;
    if (!state.visible) return;
    this.ship.root.position.copy(state.position);
    this.ship.root.quaternion.copy(state.quaternion);
    this.ship.setEngineIntensity(state.engine);
    this.ship.setFade(state.hullFade, state.engineFade);
    this.ship.update(this.ambientTime);
    this.sunLight.position.copy(state.position).addScaledVector(SUN_DIRECTION, 120);
    this.bounceLight.position
      .copy(state.position)
      .addScaledVector(PLANET_CENTER.clone().normalize(), 120);
  }

  private applyProfile(profile: RenderProfile): void {
    this.cosmos.applyProfile(profile);
    this.ship.setDetailDensity(profile.detailDensity);
    this.ship.setShadows(profile.shadows);
    this.sunLight.castShadow = profile.shadows;
    if (this.sunLight.shadow.mapSize.x !== profile.shadowMapSize) {
      this.sunLight.shadow.mapSize.set(profile.shadowMapSize, profile.shadowMapSize);
      this.sunLight.shadow.map?.dispose();
      this.sunLight.shadow.map = null;
    }
  }
}
