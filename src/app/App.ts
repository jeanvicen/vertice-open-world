import { GAME_TITLE, type UserSettings } from './config';
import { AudioEngine } from '../audio/AudioEngine';
import { Game } from '../core/Game';
import { normalizeSettings } from '../rendering/quality';
import { detectCapabilities, QualityManager } from '../rendering/QualityManager';
import { Renderer } from '../rendering/Renderer';
import { BootScene } from '../scenes/BootScene';
import { SceneManager } from '../scenes/SceneManager';
import { SpaceIntroScene } from '../scenes/space/SpaceIntroScene';
import { InputSystem } from '../systems/InputSystem';
import { MotionPreferenceWatcher } from '../systems/MotionPreference';
import { loadSettings, saveSettings } from '../systems/SettingsStore';
import { ExperienceUI } from '../ui/ExperienceUI';

/** Owns the application lifetime and wires systems together; it holds no scene logic. */
export class App {
  private game: Game | undefined;
  private input: InputSystem | undefined;
  private ui: ExperienceUI | undefined;
  private quality: QualityManager | undefined;
  private motion: MotionPreferenceWatcher | undefined;
  private audio: AudioEngine | undefined;
  private renderer: Renderer | undefined;
  private space: SpaceIntroScene | undefined;
  private settings: UserSettings = normalizeSettings(null);
  private contextAntialias = false;
  private readonly unsubscribers: Array<() => void> = [];
  private readonly canvas: HTMLCanvasElement;
  private readonly retryButton: HTMLButtonElement;
  private readonly handleRetry = (): void => {
    this.shutdown();
    this.start();
  };

  public constructor() {
    const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
    const retryButton = document.querySelector<HTMLButtonElement>('#retry-button');
    if (!canvas || !retryButton)
      throw new Error('The application canvas or retry button is missing.');
    this.canvas = canvas;
    this.retryButton = retryButton;
  }

  public start(): void {
    this.showError('');
    this.retryButton.removeEventListener('click', this.handleRetry);
    this.retryButton.addEventListener('click', this.handleRetry);
    try {
      this.settings = loadSettings();
      const motion = (this.motion = new MotionPreferenceWatcher(this.settings.motion));
      const quality = (this.quality = new QualityManager(
        this.settings.quality,
        detectCapabilities(),
      ));
      const renderer = (this.renderer = new Renderer(
        this.canvas,
        quality.profile,
        this.settings.resolutionScale,
      ));
      this.contextAntialias = quality.profile.antialias;
      const audio = (this.audio = new AudioEngine(this.settings.volume));
      const input = (this.input = new InputSystem(this.canvas));

      const ui = (this.ui = new ExperienceUI({
        reducedMotion: motion.reduced,
        onSkip: () => this.space?.skip(),
        onSettingsChange: (patch) => this.updateSettings(patch),
        onUserGesture: () => audio.unlock(),
        getSettingsStatus: () => ({
          settings: this.settings,
          activeTier: quality.profile.tier,
          contextAntialias: this.contextAntialias,
          profileAntialias: quality.profile.antialias,
          audioSupported: audio.supported,
          audioRunning: audio.running,
          systemPrefersReducedMotion: motion.systemPrefersReduced,
        }),
        // PLAY stays disabled until the first playable scene exists; pass a handler here
        // (e.g. a transition to the registered 'world' scene) to enable it.
        onPlay: undefined,
      }));
      audio.onStateChange = (): void => ui.refreshSettings();

      const scenes = new SceneManager(input);
      scenes.register('space', () => {
        this.space = new SpaceIntroScene({
          quality,
          motion,
          onPhase: (change) => ui.handlePhase(change),
        });
        return this.space;
      });
      // The original walkable blockout, kept registered for the future PLAY transition.
      scenes.register('world', (context) => new BootScene(context, context.input));

      this.unsubscribers.push(
        quality.subscribe((profile) => {
          renderer.applySettings(profile, this.settings.resolutionScale);
          ui.refreshSettings();
        }),
        motion.subscribe((reduced) => {
          ui.setReducedMotion(reduced);
          ui.refreshSettings();
        }),
      );

      this.game = new Game(renderer, scenes, input);
      this.game.onFrame = (delta): void => quality.sampleFrame(delta);
      this.game.onContextLost = (): void =>
        ui.setStatus('Graphics paused by the browser. Waiting for the GPU to recover.');
      this.game.onContextRestored = (): void => ui.setStatus('');
      this.game.start('space');
      document.title = GAME_TITLE;
    } catch (error) {
      this.shutdown();
      this.showError(this.describeError(error));
    }
  }

  public shutdown(): void {
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.unsubscribers.length = 0;
    this.game?.dispose();
    this.game = undefined;
    // Game disposes the renderer and scenes when it exists; covers a failure before that.
    this.renderer?.dispose();
    this.renderer = undefined;
    this.space = undefined;
    this.input?.dispose();
    this.input = undefined;
    this.ui?.dispose();
    this.ui = undefined;
    this.audio?.dispose();
    this.audio = undefined;
    this.quality?.dispose();
    this.quality = undefined;
    this.motion?.dispose();
    this.motion = undefined;
  }

  private updateSettings(patch: Partial<UserSettings>): void {
    const next = normalizeSettings({ ...this.settings, ...patch });
    this.settings = next;
    saveSettings(next);
    this.quality?.setPreference(next.quality);
    if (this.quality) this.renderer?.applySettings(this.quality.profile, next.resolutionScale);
    this.audio?.setVolume(next.volume);
    this.motion?.setPreference(next.motion);
    this.ui?.refreshSettings();
  }

  private showError(message: string): void {
    const overlay = document.querySelector<HTMLElement>('#fatal-error');
    const detail = document.querySelector<HTMLElement>('#fatal-error-message');
    if (overlay && detail) {
      detail.textContent = message;
      overlay.hidden = !message;
    }
    if (message) console.error('[VÉRTICE] Could not initialize the game:', message);
  }

  private describeError(error: unknown): string {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
    if (/webgl|context|renderer/i.test(message)) {
      return `${message} Check that hardware acceleration is on, update the browser, and allow this site to use WebGL 2.`;
    }
    return `${message} Reload the page to try again.`;
  }
}
