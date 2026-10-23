/** Chromium's install event (not yet in the DOM typings). */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallState = 'installed' | 'available' | 'ios' | 'unavailable';

let deferredPrompt: BeforeInstallPromptEvent | undefined;
let installed = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/**
 * Starts listening for installability as early as possible: browsers fire the event once,
 * soon after load. The browser's own install banner is left alone; this only keeps the event
 * so the Settings panel can offer an "Install app" button as well.
 */
export function watchInstallability(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferredPrompt = undefined;
    notify();
  });
}

export function isStandalone(): boolean {
  const media = (query: string): boolean => window.matchMedia?.(query).matches ?? false;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return (
    media('(display-mode: standalone)') || media('(display-mode: fullscreen)') || iosStandalone
  );
}

export function installState(): InstallState {
  if (installed || isStandalone()) return 'installed';
  if (deferredPrompt) return 'available';
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return 'ios';
  return 'unavailable';
}

/** Shows the browser's install dialog. Resolves true when the player accepted. */
export async function promptInstall(): Promise<boolean> {
  const prompt = deferredPrompt;
  if (!prompt) return false;
  deferredPrompt = undefined;
  await prompt.prompt();
  const choice = await prompt.userChoice;
  notify();
  return choice.outcome === 'accepted';
}

export function onInstallChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
