import { ACESFilmicToneMapping, PCFSoftShadowMap, SRGBColorSpace, WebGLRenderer } from 'three';
import { getEffectivePixelRatio, type RenderProfile } from './quality';

export class Renderer {
  public readonly instance: WebGLRenderer;
  public onContextLost: (() => void) | undefined;
  public onContextRestored: (() => void) | undefined;
  public onResize: ((width: number, height: number) => void) | undefined;
  private disposed = false;

  public constructor(
    private readonly canvas: HTMLCanvasElement,
    private profile: RenderProfile,
    private resolutionScale: number,
  ) {
    try {
      this.instance = new WebGLRenderer({
        canvas,
        antialias: profile.antialias,
        alpha: false,
        powerPreference: 'high-performance',
        failIfMajorPerformanceCaveat: false,
      });
    } catch (error) {
      const details = error instanceof Error ? error.message : 'WebGL is unavailable.';
      throw new Error(`WebGL renderer initialization failed: ${details}`, { cause: error });
    }
    this.instance.outputColorSpace = SRGBColorSpace;
    this.instance.toneMapping = ACESFilmicToneMapping;
    this.instance.toneMappingExposure = 1;
    this.instance.shadowMap.enabled = profile.shadows;
    this.instance.shadowMap.type = PCFSoftShadowMap;
    this.instance.setPixelRatio(this.pixelRatio());
    this.resizeObserver = new ResizeObserver(this.handleResize);
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    window.addEventListener('resize', this.handleResize);
    canvas.addEventListener('webglcontextlost', this.handleContextLost);
    canvas.addEventListener('webglcontextrestored', this.handleContextRestored);
    this.resize();
  }

  private readonly resizeObserver: ResizeObserver;

  public resize(): void {
    this.resizeRenderer();
  }

  /** Antialiasing is fixed for the context's lifetime; every other profile value applies live. */
  public applySettings(profile: RenderProfile, resolutionScale: number): void {
    this.profile = profile;
    this.resolutionScale = resolutionScale;
    this.instance.shadowMap.enabled = profile.shadows;
    this.resize();
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resizeObserver.disconnect();
    window.removeEventListener('resize', this.handleResize);
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);
    this.instance.dispose();
  }

  private readonly handleResize = (): void => {
    this.resizeRenderer();
  };

  private resizeRenderer(): void {
    if (this.disposed) return;
    const target = this.canvas.parentElement ?? this.canvas;
    const width = Math.max(1, target.clientWidth);
    const height = Math.max(1, target.clientHeight);
    this.instance.setPixelRatio(this.pixelRatio());
    this.instance.setSize(width, height, false);
    this.onResize?.(width, height);
  }

  private pixelRatio(): number {
    return getEffectivePixelRatio(window.devicePixelRatio, this.profile, this.resolutionScale);
  }

  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault();
    this.onContextLost?.();
  };

  private readonly handleContextRestored = (): void => {
    this.resize();
    this.onContextRestored?.();
  };
}
