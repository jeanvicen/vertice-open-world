import { ACESFilmicToneMapping, PCFSoftShadowMap, SRGBColorSpace, WebGLRenderer } from 'three';
import type { UserSettings } from '../app/config';
import { getEffectivePixelRatio, QUALITY_PRESETS } from './quality';

export class Renderer {
  public readonly instance: WebGLRenderer;
  public onContextLost: (() => void) | undefined;
  public onContextRestored: (() => void) | undefined;
  public onResize: ((width: number, height: number) => void) | undefined;
  private disposed = false;

  public constructor(
    private readonly canvas: HTMLCanvasElement,
    private settings: UserSettings,
  ) {
    try {
      this.instance = new WebGLRenderer({
        canvas,
        antialias: settings.quality !== 'low',
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
    this.instance.shadowMap.enabled = QUALITY_PRESETS[settings.quality].shadows;
    this.instance.shadowMap.type = PCFSoftShadowMap;
    this.instance.setPixelRatio(getEffectivePixelRatio(window.devicePixelRatio, settings));
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

  public applySettings(settings: UserSettings): void {
    this.settings = settings;
    this.instance.shadowMap.enabled = QUALITY_PRESETS[settings.quality].shadows;
    this.instance.setPixelRatio(getEffectivePixelRatio(window.devicePixelRatio, settings));
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
    this.instance.setPixelRatio(getEffectivePixelRatio(window.devicePixelRatio, this.settings));
    this.instance.setSize(width, height, false);
    this.onResize?.(width, height);
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
