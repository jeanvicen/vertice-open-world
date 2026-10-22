import { GAME_TITLE } from './config';
import { Game } from '../core/Game';
import { InputSystem } from '../systems/InputSystem';
import { loadSettings } from '../systems/SettingsStore';
import { UIManager } from '../ui/UIManager';
import { Renderer } from '../rendering/Renderer';
import { BootScene } from '../scenes/BootScene';
import { SceneManager } from '../scenes/SceneManager';

export class App {
  private game: Game | undefined;
  private input: InputSystem | undefined;
  private ui: UIManager | undefined;
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
    try {
      const settings = loadSettings();
      const renderer = new Renderer(this.canvas, settings);
      this.input = new InputSystem(this.canvas);
      const input = this.input;
      const scenes = new SceneManager(input);
      scenes.register('world', (context) => new BootScene(context, context.input));
      this.game = new Game(renderer, scenes, input);
      this.ui = new UIManager(settings, (next) => renderer.applySettings(next));
      this.game.onContextLost = (): void => this.ui?.setStatus('RENDERER PAUSED');
      this.game.onContextRestored = (): void => this.ui?.setStatus('WORLD READY');
      this.game.start('world');
      this.ui.setStatus('WORLD READY');
      document.title = `${GAME_TITLE} — Field test 00`;
      this.retryButton.removeEventListener('click', this.handleRetry);
      this.retryButton.addEventListener('click', this.handleRetry);
    } catch (error) {
      this.shutdown();
      this.showError(this.describeError(error));
    }
  }

  public shutdown(): void {
    this.retryButton.removeEventListener('click', this.handleRetry);
    this.game?.dispose();
    this.game = undefined;
    this.input?.dispose();
    this.input = undefined;
    this.ui?.dispose();
    this.ui = undefined;
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
      return `${message} Check browser hardware acceleration, update the browser, and allow this site to use WebGL. Your device's supported graphics performance may vary.`;
    }
    return `${message} Reload the page to try again.`;
  }
}
