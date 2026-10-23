export type IntroPhase = 'void' | 'cosmos' | 'ship' | 'title' | 'menu';

export const INTRO_PHASES: readonly IntroPhase[] = ['void', 'cosmos', 'ship', 'title', 'menu'];

/** Start time of each phase after the black opening, in scene seconds. */
export type IntroSchedule = Readonly<Record<Exclude<IntroPhase, 'void'>, number>>;

export const CINEMATIC_SCHEDULE: IntroSchedule = {
  cosmos: 1.6,
  ship: 7.2,
  title: 14.6,
  menu: 18.4,
};

/** Reduced motion: short dissolves, no ship passage and no camera travel. */
export const REDUCED_MOTION_SCHEDULE: IntroSchedule = {
  cosmos: 0.4,
  ship: 2.2,
  title: 2.2,
  menu: 3.6,
};

export interface PhaseChange {
  readonly phase: IntroPhase;
  /** True when the phase was reached because the viewer skipped the opening. */
  readonly skipped: boolean;
}

/**
 * Deterministic opening clock. Visuals sample `elapsed`; phases are announced exactly once,
 * in order, regardless of frame rate, large frame gaps or repeated skip requests.
 */
export class IntroTimeline {
  private elapsedSeconds = 0;
  private phaseIndex = -1;
  private wasSkipped = false;

  public constructor(
    public readonly schedule: IntroSchedule,
    private readonly onPhase: (change: PhaseChange) => void,
  ) {
    const starts = INTRO_PHASES.slice(1).map((phase) => this.phaseStart(phase));
    for (let index = 1; index < starts.length; index += 1) {
      if ((starts[index] ?? 0) < (starts[index - 1] ?? 0))
        throw new Error('Intro phases must be scheduled in order.');
    }
  }

  public get elapsed(): number {
    return this.elapsedSeconds;
  }

  public get skipped(): boolean {
    return this.wasSkipped;
  }

  public get phase(): IntroPhase | undefined {
    return INTRO_PHASES[this.phaseIndex];
  }

  public get complete(): boolean {
    return this.phase === 'menu';
  }

  public phaseStart(phase: IntroPhase): number {
    return phase === 'void' ? 0 : this.schedule[phase];
  }

  /** Announces the black opening; later calls are ignored. */
  public start(): void {
    if (this.phaseIndex >= 0) return;
    this.emitDue();
  }

  public advance(deltaSeconds: number): void {
    if (this.phaseIndex < 0) return;
    if (Number.isFinite(deltaSeconds) && deltaSeconds > 0) this.elapsedSeconds += deltaSeconds;
    this.emitDue();
  }

  /** Jumps to the menu. Returns false when the opening was already complete. */
  public skip(): boolean {
    if (this.phaseIndex < 0 || this.complete) return false;
    this.wasSkipped = true;
    this.elapsedSeconds = Math.max(this.elapsedSeconds, this.schedule.menu);
    this.emitDue();
    return true;
  }

  private emitDue(): void {
    for (;;) {
      const next = INTRO_PHASES[this.phaseIndex + 1];
      if (!next || this.elapsedSeconds < this.phaseStart(next)) return;
      this.phaseIndex += 1;
      this.onPhase({ phase: next, skipped: this.wasSkipped });
    }
  }
}
