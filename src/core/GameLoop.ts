import { Time } from './Time';

export class GameLoop {
  private frameHandle: number | undefined;
  private running = false;
  private readonly time = new Time();

  public constructor(
    private readonly update: (deltaSeconds: number) => void,
    private readonly render: () => void,
  ) {}

  public start(): void {
    if (this.running) return;
    this.running = true;
    this.time.reset();
    this.frameHandle = requestAnimationFrame(this.frame);
  }

  public stop(): void {
    this.running = false;
    if (this.frameHandle !== undefined) cancelAnimationFrame(this.frameHandle);
    this.frameHandle = undefined;
    this.time.reset();
  }

  public get isRunning(): boolean {
    return this.running;
  }

  private readonly frame = (timestamp: number): void => {
    if (!this.running) return;
    const delta = this.time.update(timestamp);
    try {
      this.update(delta);
      this.render();
    } catch (error) {
      this.stop();
      console.error('[VÉRTICE] The game loop stopped after an unexpected frame error.', error);
      return;
    }
    this.frameHandle = requestAnimationFrame(this.frame);
  };
}
