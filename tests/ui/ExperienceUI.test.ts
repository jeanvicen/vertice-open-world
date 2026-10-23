// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type UserSettings } from '../../src/app/config';
import { CREDIT_BLOCKS } from '../../src/ui/credits';
import { ExperienceUI, type ExperienceUIOptions } from '../../src/ui/ExperienceUI';

const markup = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
const body = /<body>([\s\S]*)<\/body>/.exec(markup)?.[1]?.replace(/<script[\s\S]*?<\/script>/g, '');

let now = 0;
let ui: ExperienceUI;
let options: ExperienceUIOptions & {
  onBegin: ReturnType<typeof vi.fn>;
  onSkip: ReturnType<typeof vi.fn>;
  onSettingsChange: ReturnType<typeof vi.fn>;
};

function mount(overrides: Partial<ExperienceUIOptions> = {}): void {
  document.body.innerHTML = body ?? '';
  options = {
    reducedMotion: false,
    onBegin: vi.fn(),
    onSkip: vi.fn(),
    onSettingsChange: vi.fn(),
    onUserGesture: vi.fn(),
    getSettingsStatus: () => ({
      settings: DEFAULT_SETTINGS satisfies UserSettings,
      activeTier: 'medium',
      contextAntialias: true,
      profileAntialias: true,
      audioSupported: true,
      audioRunning: false,
      systemPrefersReducedMotion: false,
    }),
    ...overrides,
  } as typeof options;
  ui = new ExperienceUI(options);
}

function showMenu(): void {
  ui.handlePhase({ phase: 'departure', skipped: false });
  ui.handlePhase({ phase: 'menu', skipped: false });
  now += 1000;
}

function button(action: string): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>(`#main-menu [data-action="${action}"]`)!;
}

function visible(selector: string): boolean {
  return document.querySelector<HTMLElement>(selector)?.dataset.visible === 'true';
}

beforeEach(() => {
  now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  mount();
});

afterEach(() => {
  ui.dispose();
  vi.restoreAllMocks();
});

describe('main menu', () => {
  it('keeps the menu hidden and inert during the opening', () => {
    expect(visible('#main-menu')).toBe(false);
    expect(document.querySelector<HTMLElement>('#main-menu')!.inert).toBe(true);
    expect(visible('#title-block')).toBe(false);
  });

  it('has no visible skip control', () => {
    expect(document.querySelector('#skip-intro')).toBeNull();
    expect(
      [...document.querySelectorAll('button')].some((b) => /skip/i.test(b.textContent ?? '')),
    ).toBe(false);
  });

  it('waits on the start screen and begins the film exactly once', () => {
    expect(visible('#start-gate')).toBe(true);
    document.querySelector<HTMLButtonElement>('#start-gate')!.click();
    document.querySelector<HTMLButtonElement>('#start-gate')!.click();
    expect(options.onBegin).toHaveBeenCalledOnce();
    expect(visible('#start-gate')).toBe(false);
  });

  it('shows "Klipza Studio apresenta", then the title card, then clears both for the battle', () => {
    ui.handlePhase({ phase: 'studio', skipped: false });
    expect(visible('#studio-card')).toBe(true);
    expect(document.querySelector('#studio-card')!.textContent!.replace(/\s+/g, ' ').trim()).toBe(
      'Klipza Studio apresenta',
    );
    ui.handlePhase({ phase: 'title', skipped: false });
    expect(visible('#studio-card')).toBe(false);
    expect(visible('#title-card')).toBe(true);
    expect(document.querySelector('#title-card')!.textContent!.trim()).toBe('VÉRTICE');
    ui.handlePhase({ phase: 'battle', skipped: false });
    expect(visible('#title-card')).toBe(false);
    expect(visible('#main-menu')).toBe(false);
  });

  it('reveals the title and the menu only at the end of the film', () => {
    ui.handlePhase({ phase: 'departure', skipped: false });
    expect(visible('#title-block')).toBe(false);
    ui.handlePhase({ phase: 'menu', skipped: false });
    expect(visible('#title-block')).toBe(true);
    expect(visible('#main-menu')).toBe(true);
    expect(ui.view).toBe('main');
  });

  it('offers exactly PLAY, SETTINGS and CREDITS', () => {
    const labels = [...document.querySelectorAll('#main-menu .menu-button')].map((element) =>
      element.textContent?.trim(),
    );
    expect(labels).toEqual(['PLAY', 'SETTINGS', 'CREDITS']);
  });

  it('keeps PLAY truly disabled and explains why', () => {
    showMenu();
    const play = button('play');
    expect(play.disabled).toBe(true);
    const note = document.getElementById(play.getAttribute('aria-describedby') ?? '');
    expect(note?.textContent).toBe('In development');
    expect(note?.hidden).toBe(false);
    play.click();
    expect(ui.view).toBe('main');
  });

  it('enables PLAY only when a gameplay handler is provided', () => {
    ui.dispose();
    const onPlay = vi.fn();
    mount({ onPlay });
    showMenu();
    expect(button('play').disabled).toBe(false);
    button('play').click();
    expect(onPlay).toHaveBeenCalledOnce();
  });

  it('ignores a tap on the menu the instant it appears', () => {
    ui.handlePhase({ phase: 'menu', skipped: true });
    now += 100;
    button('settings').click();
    expect(ui.view).toBe('main');
  });

  it('starts on any key, then lets Escape skip the film, but not once the menu is up', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(options.onBegin).toHaveBeenCalledOnce();
    expect(options.onSkip).not.toHaveBeenCalled();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(options.onSkip).toHaveBeenCalledOnce();
    showMenu();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(options.onSkip).toHaveBeenCalledOnce();
  });
});

describe('settings', () => {
  it('opens, reports real values and returns focus to SETTINGS on Escape', () => {
    showMenu();
    button('settings').click();
    expect(ui.view).toBe('settings');
    expect(visible('#settings-panel')).toBe(true);
    expect(visible('#main-menu')).toBe(false);
    expect(document.querySelector('#quality-note')?.textContent).toContain(
      'Automatic is using Medium',
    );
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(ui.view).toBe('main');
    expect(document.activeElement).toBe(button('settings'));
  });

  it('forwards each control change as a settings patch', () => {
    showMenu();
    button('settings').click();
    const high = document.querySelector<HTMLInputElement>('input[name="quality"][value="high"]')!;
    high.checked = true;
    high.dispatchEvent(new Event('change'));
    const reduced = document.querySelector<HTMLInputElement>(
      'input[name="motion"][value="reduced"]',
    )!;
    reduced.checked = true;
    reduced.dispatchEvent(new Event('change'));
    const scale = document.querySelector<HTMLInputElement>('#render-scale')!;
    scale.value = '60';
    scale.dispatchEvent(new Event('input'));
    const volume = document.querySelector<HTMLInputElement>('#master-volume')!;
    volume.value = '25';
    volume.dispatchEvent(new Event('input'));
    expect(options.onSettingsChange.mock.calls).toEqual([
      [{ quality: 'high' }],
      [{ motion: 'reduced' }],
      [{ resolutionScale: 0.6 }],
      [{ volume: 0.25 }],
    ]);
  });

  it('cannot open two panels from rapid repeated input', () => {
    showMenu();
    button('settings').click();
    document.querySelector<HTMLButtonElement>('#settings-panel [data-action="back"]')!.click();
    button('credits').click();
    expect(ui.view).toBe('main');
    expect(visible('#credits')).toBe(false);
  });
});

describe('credits', () => {
  it('shows exactly the supplied credits, in order', () => {
    showMenu();
    button('credits').click();
    const lines = [...document.querySelectorAll('#credits-roll .credit')].map(
      (line) => line.textContent,
    );
    expect(lines).toEqual([
      'VÉRTICE',
      'jeanvicen',
      'Jean Carlos de Souza Vicente',
      'Instagram: 0neajx',
      'Klipza Studio',
    ]);
    expect(lines).toEqual(CREDIT_BLOCKS.flat().map((line) => line.text));
    expect(document.querySelector('#credits-roll a')).toBeNull();
  });

  it('can be left immediately with Back or Escape', () => {
    showMenu();
    button('credits').click();
    expect(visible('#credits')).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(ui.view).toBe('main');
    expect(visible('#credits')).toBe(false);
    now += 1000;
    button('credits').click();
    document.querySelector<HTMLButtonElement>('#credits [data-action="back"]')!.click();
    expect(ui.view).toBe('main');
  });

  it('uses a static list when reduced motion is on', () => {
    ui.setReducedMotion(true);
    showMenu();
    button('credits').click();
    expect(document.querySelector('#credits')!.classList.contains('is-static')).toBe(true);
  });
});
