import type { WebGLRenderer } from 'three';
import type { InputSystem } from '../systems/InputSystem';
import type { Renderer } from '../rendering/Renderer';
import type { SceneManager } from '../scenes/SceneManager';
import { GameLoop } from './GameLoop';

export class Game {
  private readonly loop: GameLoop;
  public onContextLost: (() => void) | undefined;
  public onContextRestored: (() => void) | undefined;
  /** Receives each simulated frame's capped duration, e.g. for adaptive quality. */
  public onFrame: ((deltaSeconds: number) => void) | undefined;

  public constructor(
    private readonly renderer: Renderer,
    private readonly scenes: SceneManager,
    private readonly input: InputSystem,
  ) {
    this.loop = new GameLoop(
      (delta) => {
        this.scenes.update(delta);
        this.onFrame?.(delta);
      },
      () => this.scenes.render(this.renderer.instance),
    );
    this.renderer.onResize = (width, height): void => this.scenes.resize(width, height);
    this.renderer.resize();
    this.renderer.onContextLost = (): void => {
      this.loop.stop();
      this.onContextLost?.();
    };
    this.renderer.onContextRestored = (): void => {
      this.loop.start();
      this.onContextRestored?.();
    };
  }

  public start(initialScene: string): void {
    this.scenes.switchTo(initialScene);
    this.loop.start();
  }

  public get rendererInstance(): WebGLRenderer {
    return this.renderer.instance;
  }

  public dispose(): void {
    this.loop.stop();
    this.scenes.dispose();
    this.renderer.dispose();
    this.input.dispose();
  }
}
