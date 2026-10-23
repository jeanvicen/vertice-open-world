export type MenuView = 'intro' | 'main' | 'settings' | 'credits';

const ALLOWED: Readonly<Record<MenuView, readonly MenuView[]>> = {
  intro: ['main'],
  main: ['settings', 'credits'],
  settings: ['main'],
  credits: ['main'],
};

/** Long enough to absorb double taps, short enough that the interface never feels locked. */
export const MENU_TRANSITION_LOCK_MS = 360;

/**
 * Which interface view is showing. Opening a view during a running transition, or requesting a
 * view not reachable from the current one, is refused, so rapid input cannot interleave
 * transitions. Returning to the main menu is never delayed: a panel can always be left at once.
 */
export class MenuStateMachine {
  private current: MenuView = 'intro';
  private lockedUntil = Number.NEGATIVE_INFINITY;

  public constructor(private readonly lockMs = MENU_TRANSITION_LOCK_MS) {}

  public get view(): MenuView {
    return this.current;
  }

  public canRequest(next: MenuView, nowMs: number): boolean {
    if (!ALLOWED[this.current].includes(next)) return false;
    const isReturn = next === 'main' && this.current !== 'intro';
    return isReturn || nowMs >= this.lockedUntil;
  }

  public request(next: MenuView, nowMs: number, lockMs = this.lockMs): boolean {
    if (!this.canRequest(next, nowMs)) return false;
    this.current = next;
    this.lockedUntil = nowMs + lockMs;
    return true;
  }
}
