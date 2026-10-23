import type { WebGLRenderer } from 'three';
import type { InputSystem } from '../systems/InputSystem';
import type { Scene } from './Scene';

export interface SceneContext {
  readonly input: InputSystem;
}
export type SceneFactory = (context: SceneContext) => Scene;

export class SceneManager {
  private readonly factories = new Map<string, SceneFactory>();
  private active: Scene | undefined;
  private readonly context: SceneContext;

  public constructor(input: InputSystem) {
    this.context = { input };
  }

  public register(id: string, factory: SceneFactory): void {
    if (this.factories.has(id)) throw new Error(`Scene "${id}" is already registered.`);
    this.factories.set(id, factory);
  }

  public switchTo(id: string): void {
    const factory = this.factories.get(id);
    if (!factory) throw new Error(`Scene "${id}" has not been registered.`);
    this.active?.exit();
    const next = factory(this.context);
    this.active = next;
    next.enter();
  }

  public resize(width: number, height: number): void {
    this.active?.resize(width, height);
  }

  public update(deltaSeconds: number): void {
    this.active?.update(deltaSeconds);
  }

  public render(renderer: WebGLRenderer): void {
    this.active?.render(renderer);
  }

  public dispose(): void {
    this.active?.exit();
    this.active = undefined;
    this.factories.clear();
  }
}
