import type { UserSettings } from '../app/config';
import { saveSettings } from '../systems/SettingsStore';

export class UIManager {
  private readonly qualitySelect: HTMLSelectElement;
  private readonly resolutionSlider: HTMLInputElement;
  private disposed = false;

  public constructor(
    private settings: UserSettings,
    private readonly onSettingsChange: (settings: UserSettings) => void,
  ) {
    const quality = document.querySelector<HTMLSelectElement>('#quality-setting');
    const resolution = document.querySelector<HTMLInputElement>('#resolution-setting');
    if (!quality || !resolution) throw new Error('The graphics settings controls are missing.');
    this.qualitySelect = quality;
    this.resolutionSlider = resolution;
    this.qualitySelect.value = settings.quality;
    this.resolutionSlider.value = String(settings.resolutionScale);
    this.qualitySelect.addEventListener('change', this.handleQualityChange);
    this.resolutionSlider.addEventListener('input', this.handleResolutionChange);
  }

  public setStatus(status: string): void {
    const element = document.querySelector<HTMLElement>('#runtime-status');
    if (element) element.textContent = status;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.qualitySelect.removeEventListener('change', this.handleQualityChange);
    this.resolutionSlider.removeEventListener('input', this.handleResolutionChange);
  }

  private readonly handleQualityChange = (): void => {
    if (
      this.qualitySelect.value !== 'low' &&
      this.qualitySelect.value !== 'balanced' &&
      this.qualitySelect.value !== 'high'
    )
      return;
    this.applySettings({ ...this.settings, quality: this.qualitySelect.value });
  };

  private readonly handleResolutionChange = (): void => {
    this.applySettings({ ...this.settings, resolutionScale: Number(this.resolutionSlider.value) });
  };

  private applySettings(settings: UserSettings): void {
    this.settings = settings;
    saveSettings(settings);
    this.onSettingsChange(settings);
  }
}
