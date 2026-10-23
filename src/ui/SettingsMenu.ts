import {
  RESOLUTION_SCALE_MAX,
  RESOLUTION_SCALE_MIN,
  type MotionPreference,
  type QualityPreference,
  type UserSettings,
} from '../app/config';
import { installState, onInstallChange, promptInstall } from '../app/install';
import type { QualityTier } from '../rendering/quality';

/** Read-only facts the panel reports next to the controls. */
export interface SettingsStatus {
  readonly settings: UserSettings;
  readonly activeTier: QualityTier;
  /** Antialiasing of the running WebGL context; it only changes on reload. */
  readonly contextAntialias: boolean;
  readonly profileAntialias: boolean;
  readonly audioSupported: boolean;
  readonly audioRunning: boolean;
  readonly systemPrefersReducedMotion: boolean;
}

const TIER_LABEL: Readonly<Record<QualityTier, string>> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

const TIER_DESCRIPTION: Readonly<Record<QualityTier, string>> = {
  low: 'Native 1× pixels, no shadows, a lighter sky and star field.',
  medium: 'Up to 1.5× pixel density, soft ship shadows, fuller sky detail.',
  high: 'Up to 2× pixel density, sharper shadows and the full star field.',
};

/** Paints the slider's filled portion; the CSS track reads this custom property. */
function paintRange(input: HTMLInputElement): void {
  const min = Number(input.min);
  const max = Number(input.max);
  const share = max > min ? ((Number(input.value) - min) / (max - min)) * 100 : 0;
  input.style.setProperty('--fill', `${share}%`);
}

function query<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Settings control "${selector}" is missing.`);
  return element;
}

/** Binds the settings markup; every change is applied and persisted by the owner immediately. */
export class SettingsMenu {
  private readonly qualityInputs: HTMLInputElement[];
  private readonly motionInputs: HTMLInputElement[];
  private readonly renderScale: HTMLInputElement;
  private readonly renderScaleValue: HTMLOutputElement;
  private readonly volume: HTMLInputElement;
  private readonly volumeValue: HTMLOutputElement;
  private readonly qualityNote: HTMLElement;
  private readonly volumeNote: HTMLElement;
  private readonly motionNote: HTMLElement;
  private readonly fullscreenRow: HTMLElement;
  private readonly fullscreenButton: HTMLButtonElement;
  private readonly installRow: HTMLElement;
  private readonly installButton: HTMLButtonElement;
  private readonly installNote: HTMLElement;
  private readonly stopInstallWatch: () => void;

  public constructor(
    private readonly root: HTMLElement,
    private readonly onChange: (patch: Partial<UserSettings>) => void,
  ) {
    this.qualityInputs = [...root.querySelectorAll<HTMLInputElement>('input[name="quality"]')];
    this.motionInputs = [...root.querySelectorAll<HTMLInputElement>('input[name="motion"]')];
    this.renderScale = query(root, '#render-scale');
    this.renderScaleValue = query(root, '#render-scale-value');
    this.volume = query(root, '#master-volume');
    this.volumeValue = query(root, '#master-volume-value');
    this.qualityNote = query(root, '#quality-note');
    this.volumeNote = query(root, '#volume-note');
    this.motionNote = query(root, '#motion-note');
    this.fullscreenRow = query(root, '#fullscreen-setting');
    this.fullscreenButton = query(root, '#fullscreen-toggle');
    this.installRow = query(root, '#install-setting');
    this.installButton = query(root, '#install-button');
    this.installNote = query(root, '#install-note');
    if (this.qualityInputs.length !== 4 || this.motionInputs.length !== 3)
      throw new Error('Settings radio groups are incomplete.');

    this.renderScale.min = String(Math.round(RESOLUTION_SCALE_MIN * 100));
    this.renderScale.max = String(Math.round(RESOLUTION_SCALE_MAX * 100));
    this.fullscreenRow.hidden = !document.fullscreenEnabled;

    for (const input of this.qualityInputs) input.addEventListener('change', this.handleQuality);
    for (const input of this.motionInputs) input.addEventListener('change', this.handleMotion);
    this.renderScale.addEventListener('input', this.handleRenderScale);
    this.volume.addEventListener('input', this.handleVolume);
    this.fullscreenButton.addEventListener('click', this.handleFullscreen);
    document.addEventListener('fullscreenchange', this.syncFullscreen);
    this.syncFullscreen();
    this.installButton.addEventListener('click', this.handleInstall);
    this.stopInstallWatch = onInstallChange(this.syncInstall);
    this.syncInstall();
  }

  public sync(status: SettingsStatus): void {
    const { settings } = status;
    for (const input of this.qualityInputs) input.checked = input.value === settings.quality;
    for (const input of this.motionInputs) input.checked = input.value === settings.motion;
    const scale = Math.round(settings.resolutionScale * 100);
    if (document.activeElement !== this.renderScale) this.renderScale.value = String(scale);
    this.renderScaleValue.value = `${scale}%`;
    paintRange(this.renderScale);
    const volume = Math.round(settings.volume * 100);
    if (document.activeElement !== this.volume) this.volume.value = String(volume);
    this.volumeValue.value = volume === 0 ? 'Off' : `${volume}%`;
    paintRange(this.volume);

    const tier = TIER_LABEL[status.activeTier];
    const qualityLead =
      settings.quality === 'auto' ? `Automatic is using ${tier} on this device. ` : '';
    const reload =
      status.contextAntialias !== status.profileAntialias
        ? ' Edge smoothing changes when the game is next opened.'
        : '';
    this.qualityNote.textContent = `${qualityLead}${TIER_DESCRIPTION[status.activeTier]}${reload}`;

    this.volumeNote.textContent = !status.audioSupported
      ? 'This browser does not provide audio output.'
      : volume === 0
        ? 'Sound is muted.'
        : status.audioRunning
          ? 'A synthesized ambient soundscape is playing.'
          : 'The ambient soundscape starts after your first tap or key press.';

    this.motionNote.textContent =
      settings.motion === 'system'
        ? `Following your device, which currently asks for ${
            status.systemPrefersReducedMotion ? 'reduced' : 'full'
          } motion.`
        : settings.motion === 'reduced'
          ? 'A still camera, short dissolves and a static credits list.'
          : 'Full camera movement and transitions.';
  }

  public focusHeading(): void {
    this.root.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
    this.root.querySelector<HTMLElement>('.settings-scroll')?.scrollTo({ top: 0 });
  }

  public dispose(): void {
    for (const input of this.qualityInputs) input.removeEventListener('change', this.handleQuality);
    for (const input of this.motionInputs) input.removeEventListener('change', this.handleMotion);
    this.renderScale.removeEventListener('input', this.handleRenderScale);
    this.volume.removeEventListener('input', this.handleVolume);
    this.fullscreenButton.removeEventListener('click', this.handleFullscreen);
    document.removeEventListener('fullscreenchange', this.syncFullscreen);
    this.installButton.removeEventListener('click', this.handleInstall);
    this.stopInstallWatch();
  }

  private readonly handleQuality = (event: Event): void => {
    const value = (event.currentTarget as HTMLInputElement).value as QualityPreference;
    this.onChange({ quality: value });
  };

  private readonly handleMotion = (event: Event): void => {
    const value = (event.currentTarget as HTMLInputElement).value as MotionPreference;
    this.onChange({ motion: value });
  };

  private readonly handleRenderScale = (): void => {
    this.onChange({ resolutionScale: Number(this.renderScale.value) / 100 });
  };

  private readonly handleVolume = (): void => {
    this.onChange({ volume: Number(this.volume.value) / 100 });
  };

  private readonly handleFullscreen = (): void => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    } else {
      void document.documentElement
        .requestFullscreen({ navigationUI: 'hide' })
        .catch((error: unknown) => console.warn('[VÉRTICE] Fullscreen was refused.', error));
    }
  };

  private readonly handleInstall = (): void => {
    void promptInstall().catch((error: unknown) =>
      console.warn('[VÉRTICE] The install dialog could not open.', error),
    );
  };

  /** Install row: a real install button where the browser offers one, guidance elsewhere. */
  private readonly syncInstall = (): void => {
    const state = installState();
    this.installRow.hidden = state === 'unavailable';
    this.installButton.hidden = state !== 'available';
    this.installNote.textContent =
      state === 'installed'
        ? 'VÉRTICE is installed and opens fullscreen from your home screen.'
        : state === 'ios'
          ? 'On iPhone or iPad: Share, then Add to Home Screen.'
          : state === 'available'
            ? 'Adds VÉRTICE to your home screen as a fullscreen app that also works offline.'
            : '';
  };

  private readonly syncFullscreen = (): void => {
    const active = Boolean(document.fullscreenElement);
    this.fullscreenButton.setAttribute('aria-pressed', String(active));
    this.fullscreenButton.textContent = active ? 'Exit fullscreen' : 'Enter fullscreen';
  };
}
