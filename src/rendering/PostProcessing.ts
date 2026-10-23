import {
  type Camera,
  HalfFloatType,
  type Scene,
  Vector2,
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type { RenderProfile } from './quality';

/**
 * Optional HDR bloom. The scene renders linear HDR into a half-float target, bloom picks up
 * only values above the threshold (lasers, explosions, drives, the star), and OutputPass
 * applies the renderer's tone mapping, exposure and sRGB conversion. Disabled on Low, where
 * the scene renders straight to the canvas.
 */
export class PostProcessing {
  private composer: EffectComposer | undefined;
  private bloom: UnrealBloomPass | undefined;
  private width = 1;
  private height = 1;
  private pixelRatio = 0;
  private profile: RenderProfile | undefined;

  public constructor(
    private readonly scene: Scene,
    private readonly camera: Camera,
  ) {}

  public setProfile(profile: RenderProfile): void {
    if (
      this.profile &&
      this.profile.bloom === profile.bloom &&
      this.profile.msaaSamples === profile.msaaSamples
    )
      return;
    this.profile = profile;
    this.disposeComposer();
  }

  public setSize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.composer?.setSize(this.width, this.height);
    this.bloom?.resolution.set(this.width * 0.5, this.height * 0.5);
  }

  public render(renderer: WebGLRenderer): void {
    if (!this.profile?.bloom) {
      renderer.render(this.scene, this.camera);
      return;
    }
    if (!this.composer) this.createComposer(renderer, this.profile);
    const pixelRatio = renderer.getPixelRatio();
    if (pixelRatio !== this.pixelRatio) {
      this.pixelRatio = pixelRatio;
      this.composer!.setPixelRatio(pixelRatio);
      this.composer!.setSize(this.width, this.height);
    }
    this.composer!.render();
  }

  public dispose(): void {
    this.disposeComposer();
  }

  private createComposer(renderer: WebGLRenderer, profile: RenderProfile): void {
    const target = new WebGLRenderTarget(this.width, this.height, {
      type: HalfFloatType,
      samples: profile.msaaSamples,
    });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(
      new Vector2(this.width * 0.5, this.height * 0.5),
      0.5,
      0.5,
      1.4,
    );
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.pixelRatio = renderer.getPixelRatio();
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(this.width, this.height);
  }

  private disposeComposer(): void {
    if (!this.composer) return;
    for (const pass of this.composer.passes) pass.dispose();
    this.composer.dispose();
    this.composer = undefined;
    this.bloom = undefined;
  }
}
