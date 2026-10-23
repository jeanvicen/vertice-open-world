import type { WebGLRenderer, Scene as ThreeScene, PerspectiveCamera } from 'three';

export interface Scene {
  readonly threeScene: ThreeScene;
  readonly camera: PerspectiveCamera;
  enter(): void;
  resize(width: number, height: number): void;
  update(deltaSeconds: number): void;
  render(renderer: WebGLRenderer): void;
  exit(): void;
}
