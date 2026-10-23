import {
  Color,
  DirectionalLight,
  HemisphereLight,
  PerspectiveCamera,
  Scene as ThreeScene,
  Vector3,
  type WebGLRenderer,
} from 'three';
import type { EffectName, SceneAudio } from '../../audio/AudioEngine';
import { CueScheduler } from '../../audio/CueScheduler';
import { createScore, type ScoreCue } from '../../audio/score';
import { PostProcessing } from '../../rendering/PostProcessing';
import type { QualityManager } from '../../rendering/QualityManager';
import type { RenderProfile } from '../../rendering/quality';
import { ResourceTracker } from '../../rendering/ResourceTracker';
import type { MotionPreferenceWatcher } from '../../systems/MotionPreference';
import type { Scene } from '../Scene';
import { Battle } from './battle/Battle';
import { Choreography, type SoundCue } from './battle/Choreography';
import { CinematicCamera } from './CinematicCamera';
import { Cosmos } from './Cosmos';
import {
  CINEMATIC_SCHEDULE,
  type IntroSchedule,
  IntroTimeline,
  type PhaseChange,
  REDUCED_MOTION_SCHEDULE,
} from './IntroTimeline';
import { PLANET_CENTER, SUN_DIRECTION } from './layout';
import { damp } from './random';
import { createPanelTextures } from './ship/panelTexture';
import { ProceduralShip } from './ship/ProceduralShip';
import type { ShipModel } from './ship/ShipModel';
import { createShipState, ShipFlight, WARP_SECONDS } from './ShipFlight';
import { createEnvironmentTexture, createGlowTexture } from './textures';

export interface SpaceIntroOptions {
  readonly quality: QualityManager;
  readonly motion: MotionPreferenceWatcher;
  readonly onPhase: (change: PhaseChange) => void;
  readonly audio?: SceneAudio;
}

const EXPOSURE = 1.05;
const AUDIO_LOOKAHEAD = 0.06;
/** Frames rendered in full while the start screen is up, so GPU uploads happen off-screen. */
const WARM_UP_FRAMES = 3;

/**
 * The film and the living backdrop of the title menu. Every visual and every sound is sampled
 * from one timeline clock, so the sequence plays the same at 20 or 120 frames per second.
 */
export class SpaceIntroScene implements Scene {
  public readonly threeScene = new ThreeScene();
  public readonly camera = new PerspectiveCamera(40, 16 / 9, 0.5, 12000);
  private readonly resources = new ResourceTracker();
  private readonly timeline: IntroTimeline;
  private readonly schedule: IntroSchedule;
  private readonly cinematicFilm: boolean;
  private readonly cinematic: CinematicCamera;
  private readonly cosmos: Cosmos;
  private readonly ship: ShipModel;
  private readonly flight: ShipFlight;
  private readonly battle: Battle | undefined;
  private readonly post: PostProcessing;
  private readonly shipState = createShipState();
  private readonly sunLight = new DirectionalLight(new Color('#ffe9d2'), 2.7);
  private readonly bounceLight = new DirectionalLight(new Color('#6f8bb8'), 0.55);
  private readonly unsubscribers: Array<() => void> = [];
  private readonly effects: CueScheduler<SoundCue> | undefined;
  private readonly score: CueScheduler<ScoreCue>;
  private readonly audio: SceneAudio | undefined;
  private readonly scratch = new Vector3();
  private reducedMotion: boolean;
  private begun = false;
  private ambientTime = 0;
  private fade = 0;
  private fadeRate = 0.75;
  private warmFrames = 0;
  private compiled = false;
  private exited = false;

  public constructor(options: SpaceIntroOptions) {
    const profile = options.quality.profile;
    this.audio = options.audio;
    this.reducedMotion = options.motion.reduced;
    this.cinematicFilm = !this.reducedMotion;
    this.schedule = this.cinematicFilm ? CINEMATIC_SCHEDULE : REDUCED_MOTION_SCHEDULE;
    this.timeline = new IntroTimeline(this.schedule, (change) => options.onPhase(change));
    this.cinematic = new CinematicCamera(this.camera);
    this.flight = new ShipFlight(
      CINEMATIC_SCHEDULE.departure - CINEMATIC_SCHEDULE.hero - WARP_SECONDS,
    );

    const glow = this.resources.track(createGlowTexture());
    const environment = this.resources.track(createEnvironmentTexture());
    this.cosmos = new Cosmos(this.resources, glow, profile);
    this.ship = new ProceduralShip(environment, glow);
    this.ship.root.visible = false;
    this.threeScene.add(this.cosmos.root, this.ship.root);

    if (this.cinematicFilm) {
      const script = new Choreography(this.schedule, this.flight);
      const panels = createPanelTextures(512, 256);
      this.resources.track(panels.color);
      this.resources.track(panels.roughness);
      this.battle = new Battle(script, panels.color, environment, profile);
      this.threeScene.add(this.battle.root);
      this.effects = new CueScheduler(script.cues);
    }
    this.score = new CueScheduler(createScore(this.schedule, this.cinematicFilm));

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

    this.post = new PostProcessing(this.threeScene, this.camera);
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
  }

  /** Starts the film (called from the start screen's user gesture). Later calls are ignored. */
  public begin(): void {
    if (this.begun) return;
    this.begun = true;
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
    this.effects?.skipTo(Number.POSITIVE_INFINITY);
    this.score.skipTo(Number.POSITIVE_INFINITY);
    this.audio?.stopIntro();
    return true;
  }

  public resize(width: number, height: number): void {
    this.cinematic.setAspect(width / Math.max(1, height));
    this.post.setSize(width, height);
  }

  public update(deltaSeconds: number): void {
    if (this.exited) return;
    this.ambientTime += deltaSeconds;
    if (this.begun) this.timeline.advance(deltaSeconds);
    const t = this.timeline.elapsed;
    const schedule = this.schedule;
    const skipped = this.timeline.skipped;

    // Black under the title cards; the battle fades up like a first shot.
    const exposureTarget = this.begun && t >= schedule.battle - 0.2 ? 1 : 0;
    this.fade = damp(this.fade, exposureTarget, this.fadeRate, deltaSeconds);

    if (!this.cinematicFilm) {
      this.flight.sampleStation(this.ambientTime, this.shipState);
    } else if (skipped) {
      this.shipState.visible = false;
    } else {
      this.flight.sample(t - schedule.hero, t, this.shipState);
    }
    this.applyShip();

    const battleVisible =
      this.battle !== undefined &&
      !skipped &&
      (this.warmFrames < WARM_UP_FRAMES ||
        (t >= schedule.battle - 0.5 && t < schedule.departure + 8));
    this.battle?.update(t, battleVisible);

    this.cinematic.update(t, this.reducedMotion, {
      schedule,
      cinematic: this.cinematicFilm,
      skipped,
      sampleHero: (time, out) => this.flight.sample(time - schedule.hero, time, out),
      shake: this.reducedMotion || !this.battle ? 0 : this.battle.shakeAt(t, this.camera.position),
    });
    this.camera.updateMatrixWorld();
    this.cosmos.update(this.ambientTime, this.camera.position, {
      sky: 1,
      stars: 1.4,
      bodies: 1,
      dust: 1,
    });

    if (this.begun) this.updateAudio(t, skipped);
  }

  public render(renderer: WebGLRenderer): void {
    if (this.exited) return;
    this.cosmos.setPixelRatio(renderer.getPixelRatio());
    this.battle?.setViewport(this.camera, renderer.domElement.height);
    if (!this.compiled) {
      // Compile every program while the screen is still black.
      renderer.compile(this.threeScene, this.camera);
      this.compiled = true;
    }
    if (this.warmFrames >= WARM_UP_FRAMES && this.fade < 0.002) {
      renderer.setClearColor(0x000000, 1);
      renderer.clear();
      return;
    }
    this.warmFrames += 1;
    const previousExposure = renderer.toneMappingExposure;
    renderer.toneMappingExposure = EXPOSURE * this.fade;
    this.post.render(renderer);
    renderer.toneMappingExposure = previousExposure;
  }

  public exit(): void {
    if (this.exited) return;
    this.exited = true;
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.unsubscribers.length = 0;
    this.audio?.setEngine(0, 0);
    this.ship.dispose();
    this.battle?.dispose();
    this.post.dispose();
    this.sunLight.shadow.dispose();
    this.threeScene.clear();
    this.resources.dispose();
  }

  private updateAudio(t: number, skipped: boolean): void {
    const audio = this.audio;
    if (!audio) return;
    this.score.update(t, AUDIO_LOOKAHEAD, (cue, delay) => audio.playScore(cue, delay));
    this.effects?.update(t, AUDIO_LOOKAHEAD, (cue, delay) => {
      const placement = this.placeSound(cue.position);
      audio.playEffect(cue.name as EffectName, {
        delay,
        pan: placement.pan,
        gain: cue.weight * placement.gain,
        distance: placement.distance,
        seed: (cue.time * 7.31) % 1,
      });
    });
    if (this.shipState.visible && !skipped && this.cinematicFilm) {
      const placement = this.placeSound(this.shipState.position);
      audio.setEngine(
        this.shipState.engine * this.shipState.engineFade * placement.gain,
        placement.pan,
      );
    } else {
      audio.setEngine(0, 0);
    }
  }

  /** Stereo position and distance attenuation of a world point as heard from the camera. */
  private placeSound(position: Vector3 | undefined): {
    pan: number;
    gain: number;
    distance: number;
  } {
    if (!position) return { pan: 0, gain: 1, distance: 0 };
    const local = this.scratch.copy(position).applyMatrix4(this.camera.matrixWorldInverse);
    const distance = local.length();
    const pan = Math.max(-1, Math.min(1, (local.x / Math.max(25, distance)) * 1.6));
    const gain = Math.max(0.06, Math.min(1.2, 90 / (distance + 40)));
    return { pan, gain, distance };
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
    this.battle?.applyProfile(profile);
    this.post.setProfile(profile);
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
