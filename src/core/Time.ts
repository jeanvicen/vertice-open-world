export const MAX_FRAME_DELTA_SECONDS = 0.05;

export class Time {
  private lastTimestamp: number | undefined;
  public deltaSeconds = 0;
  public elapsedSeconds = 0;

  public update(timestampMilliseconds: number): number {
    if (!Number.isFinite(timestampMilliseconds)) {
      this.deltaSeconds = 0;
      return this.deltaSeconds;
    }
    const nowSeconds = timestampMilliseconds / 1000;
    if (this.lastTimestamp === undefined) {
      this.lastTimestamp = nowSeconds;
      this.deltaSeconds = 0;
      return this.deltaSeconds;
    }
    if (nowSeconds < this.lastTimestamp) {
      this.deltaSeconds = 0;
      return this.deltaSeconds;
    }
    this.deltaSeconds = Math.min(nowSeconds - this.lastTimestamp, MAX_FRAME_DELTA_SECONDS);
    this.lastTimestamp = nowSeconds;
    this.elapsedSeconds += this.deltaSeconds;
    return this.deltaSeconds;
  }

  public reset(): void {
    this.lastTimestamp = undefined;
    this.deltaSeconds = 0;
    this.elapsedSeconds = 0;
  }
}
