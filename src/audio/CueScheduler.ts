export interface TimedCue {
  readonly time: number;
}

/**
 * Fires each cue exactly once when the scene clock comes within `lookahead` of it, passing the
 * remaining delay so audio can be scheduled sample-accurately ahead of the frame.
 */
export class CueScheduler<T extends TimedCue> {
  private readonly cues: readonly T[];
  private next = 0;

  public constructor(cues: readonly T[]) {
    this.cues = [...cues].sort((a, b) => a.time - b.time);
  }

  public update(elapsed: number, lookahead: number, fire: (cue: T, delay: number) => void): void {
    while (this.next < this.cues.length) {
      const cue = this.cues[this.next]!;
      if (cue.time > elapsed + lookahead) return;
      this.next += 1;
      fire(cue, Math.max(0, cue.time - elapsed));
    }
  }

  /** Drops every cue before `time` without firing it (used after a skip). */
  public skipTo(time: number): void {
    while (this.next < this.cues.length && this.cues[this.next]!.time < time) this.next += 1;
  }

  public get remaining(): number {
    return this.cues.length - this.next;
  }
}
