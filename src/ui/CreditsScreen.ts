import { CREDIT_BLOCKS } from './credits';

/** Roll speed in CSS pixels per second: slow enough to read every line without strain. */
const ROLL_SPEED = 34;
/** Where the first line starts, as a share of the viewport height from the top. */
const ROLL_START = 0.66;

/**
 * Film-style credits drawn by the compositor (Web Animations), so the roll adds no second
 * JavaScript frame loop. The roll ends holding the studio name at the centre of the screen.
 */
export class CreditsScreen {
  private animation: Animation | undefined;
  private reducedMotion = false;
  private open = false;

  public constructor(
    private readonly root: HTMLElement,
    private readonly viewport: HTMLElement,
    private readonly roll: HTMLElement,
  ) {
    roll.replaceChildren(
      ...CREDIT_BLOCKS.map((block) => {
        const group = document.createElement('div');
        group.className = 'credit-block';
        for (const line of block) {
          const element = document.createElement('p');
          element.className = `credit credit-${line.role}`;
          element.textContent = line.text;
          group.append(element);
        }
        return group;
      }),
    );
  }

  public show(reducedMotion: boolean): void {
    this.open = true;
    this.reducedMotion = reducedMotion;
    this.root.classList.toggle(
      'is-static',
      reducedMotion || typeof this.roll.animate !== 'function',
    );
    this.viewport.scrollTop = 0;
    this.start(0);
    window.addEventListener('resize', this.handleResize);
  }

  public hide(): void {
    this.open = false;
    window.removeEventListener('resize', this.handleResize);
    this.animation?.cancel();
    this.animation = undefined;
  }

  public setReducedMotion(reduced: boolean): void {
    if (reduced === this.reducedMotion) return;
    this.reducedMotion = reduced;
    if (this.open) this.show(reduced);
  }

  public dispose(): void {
    this.hide();
  }

  /** Starts (or restarts after a resize) the roll at a given fraction of its travel. */
  private start(progress: number): void {
    this.animation?.cancel();
    this.animation = undefined;
    if (this.root.classList.contains('is-static')) {
      this.roll.style.transform = '';
      return;
    }
    const height = this.viewport.clientHeight;
    const last = this.roll.lastElementChild as HTMLElement | null;
    const lastCentre = last ? last.offsetTop + last.offsetHeight / 2 : this.roll.offsetHeight;
    const startY = height * ROLL_START;
    const endY = height / 2 - lastCentre;
    const duration = (Math.max(1, startY - endY) / ROLL_SPEED) * 1000;
    this.animation = this.roll.animate(
      [
        { transform: `translate3d(0, ${startY}px, 0)` },
        { transform: `translate3d(0, ${endY}px, 0)` },
      ],
      { duration, easing: 'cubic-bezier(0.25, 0.05, 0.4, 1)', fill: 'forwards' },
    );
    // Cancelling rejects `finished`; browsers mark that handled, not every implementation does.
    this.animation.finished.catch(() => undefined);
    this.animation.currentTime = duration * progress;
  }

  private readonly handleResize = (): void => {
    if (!this.open || !this.animation) return;
    const timing = this.animation.effect?.getComputedTiming();
    this.start(typeof timing?.progress === 'number' ? timing.progress : 0);
  };
}
