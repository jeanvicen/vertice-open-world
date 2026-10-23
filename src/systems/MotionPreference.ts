import type { MotionPreference } from '../app/config';

export function resolveReducedMotion(
  preference: MotionPreference,
  systemPrefersReduced: boolean,
): boolean {
  if (preference === 'reduced') return true;
  if (preference === 'full') return false;
  return systemPrefersReduced;
}

type MotionListener = (reduced: boolean) => void;

/** Combines the player's choice with the browser's prefers-reduced-motion query. */
export class MotionPreferenceWatcher {
  private readonly listeners = new Set<MotionListener>();
  private readonly query: MediaQueryList | undefined;
  private reducedValue: boolean;

  public constructor(private preferenceValue: MotionPreference) {
    this.query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    this.query?.addEventListener('change', this.handleSystemChange);
    this.reducedValue = this.resolve();
  }

  public get reduced(): boolean {
    return this.reducedValue;
  }

  public get systemPrefersReduced(): boolean {
    return this.query?.matches ?? false;
  }

  public get preference(): MotionPreference {
    return this.preferenceValue;
  }

  public setPreference(preference: MotionPreference): void {
    this.preferenceValue = preference;
    this.update();
  }

  public subscribe(listener: MotionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public dispose(): void {
    this.query?.removeEventListener('change', this.handleSystemChange);
    this.listeners.clear();
  }

  private resolve(): boolean {
    return resolveReducedMotion(this.preferenceValue, this.systemPrefersReduced);
  }

  private update(): void {
    const next = this.resolve();
    if (next === this.reducedValue) return;
    this.reducedValue = next;
    for (const listener of this.listeners) listener(next);
  }

  private readonly handleSystemChange = (): void => this.update();
}
