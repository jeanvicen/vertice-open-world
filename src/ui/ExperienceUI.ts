import type { InterfaceSound } from '../audio/synth';
import type { UserSettings } from '../app/config';
import type { PhaseChange } from '../scenes/space/IntroTimeline';
import { CreditsScreen } from './CreditsScreen';
import { MenuStateMachine, type MenuView } from './MenuStateMachine';
import { SettingsMenu, type SettingsStatus } from './SettingsMenu';

export interface ExperienceUIOptions {
  readonly reducedMotion: boolean;
  /** Runs inside the start screen's gesture: unlock audio, then start the film. */
  readonly onBegin: () => void;
  /** Keyboard-only escape hatch (Escape); there is deliberately no visible skip control. */
  readonly onSkip: () => void;
  readonly onInterfaceSound?: (kind: InterfaceSound) => void;
  readonly onSettingsChange: (patch: Partial<UserSettings>) => void;
  /** Runs inside user gestures; browsers only start audio from one. */
  readonly onUserGesture: () => void;
  readonly getSettingsStatus: () => SettingsStatus;
  /** Starts gameplay. While it is undefined, PLAY stays disabled and marked in development. */
  readonly onPlay?: () => void;
}

type MenuAction = 'play' | 'settings' | 'credits';

/** Ignore taps that land on the menu the instant it appears. */
const MENU_REVEAL_LOCK_MS = 650;

function query<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Interface element "${selector}" is missing.`);
  return element;
}

function setVisible(element: HTMLElement, visible: boolean): void {
  element.dataset.visible = String(visible);
  element.inert = !visible;
}

/**
 * HTML layer over the canvas: title, main menu, settings and credits. It only reacts to
 * timeline phases and player input; it never reads or drives rendering state directly.
 */
export class ExperienceUI {
  private readonly machine = new MenuStateMachine();
  private readonly experience = query<HTMLElement>('#experience');
  private readonly title = query<HTMLElement>('#title-block');
  private readonly menu = query<HTMLElement>('#main-menu');
  private readonly settingsPanel = query<HTMLElement>('#settings-panel');
  private readonly creditsPanel = query<HTMLElement>('#credits');
  private readonly gate = query<HTMLButtonElement>('#start-gate');
  private readonly studioCard = query<HTMLElement>('#studio-card');
  private readonly titleCard = query<HTMLElement>('#title-card');
  private readonly announcer = query<HTMLElement>('#intro-announcer');
  private readonly status = query<HTMLElement>('#runtime-status');
  private readonly menuButtons: HTMLButtonElement[];
  private readonly settings: SettingsMenu;
  private readonly credits: CreditsScreen;
  private returnFocus: HTMLElement | undefined;
  private reducedMotion: boolean;
  private begun = false;

  public constructor(private readonly options: ExperienceUIOptions) {
    this.reducedMotion = options.reducedMotion;
    this.menuButtons = [...this.menu.querySelectorAll<HTMLButtonElement>('button[data-action]')];
    const play = this.menuButtons.find((button) => button.dataset.action === 'play');
    if (!play || this.menuButtons.length !== 3) throw new Error('The main menu is incomplete.');
    play.disabled = !options.onPlay;
    query<HTMLElement>('#play-status').hidden = Boolean(options.onPlay);

    this.settings = new SettingsMenu(this.settingsPanel, options.onSettingsChange);
    this.credits = new CreditsScreen(
      this.creditsPanel,
      query<HTMLElement>('#credits-viewport'),
      query<HTMLElement>('#credits-roll'),
    );

    setVisible(this.title, false);
    setVisible(this.menu, false);
    setVisible(this.settingsPanel, false);
    setVisible(this.creditsPanel, false);
    setVisible(this.studioCard, false);
    setVisible(this.titleCard, false);
    setVisible(this.gate, true);
    query<HTMLElement>('#start-gate-label').textContent = window.matchMedia?.('(pointer: coarse)')
      .matches
      ? 'Toque para começar'
      : 'Clique para começar';
    this.setReducedMotion(options.reducedMotion);
    this.experience.dataset.view = 'intro';
    this.gate.focus({ preventScroll: true });

    this.menu.addEventListener('click', this.handleMenuClick);
    this.menu.addEventListener('keydown', this.handleMenuKeys);
    for (const back of document.querySelectorAll<HTMLButtonElement>('[data-action="back"]'))
      back.addEventListener('click', this.handleBack);
    this.gate.addEventListener('click', this.handleBegin);
    this.menu.addEventListener('pointerover', this.handleHover);
    this.menu.addEventListener('focusin', this.handleHover);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('click', this.handleGesture, true);
    window.addEventListener('touchend', this.handleGesture, true);
  }

  public get view(): MenuView {
    return this.machine.view;
  }

  public handlePhase({ phase, skipped }: PhaseChange): void {
    if (skipped) {
      setVisible(this.studioCard, false);
      setVisible(this.titleCard, false);
    }
    if (phase === 'studio' && !skipped) {
      setVisible(this.studioCard, true);
      this.announcer.textContent = 'Klipza Studio apresenta';
    } else if (phase === 'title' && !skipped) {
      setVisible(this.studioCard, false);
      setVisible(this.titleCard, true);
      this.announcer.textContent = 'VÉRTICE';
    } else if (phase === 'battle') {
      setVisible(this.titleCard, false);
    } else if (phase === 'menu') {
      this.title.classList.toggle('is-quick', skipped);
      this.revealMenu();
    }
  }

  public refreshSettings(): void {
    this.settings.sync(this.options.getSettingsStatus());
  }

  public setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
    this.experience.classList.toggle('reduce-motion', reduced);
    this.credits.setReducedMotion(reduced);
  }

  public setStatus(message: string): void {
    this.status.textContent = message;
    this.status.hidden = !message;
  }

  public dispose(): void {
    this.menu.removeEventListener('click', this.handleMenuClick);
    this.menu.removeEventListener('keydown', this.handleMenuKeys);
    for (const back of document.querySelectorAll<HTMLButtonElement>('[data-action="back"]'))
      back.removeEventListener('click', this.handleBack);
    this.gate.removeEventListener('click', this.handleBegin);
    this.menu.removeEventListener('pointerover', this.handleHover);
    this.menu.removeEventListener('focusin', this.handleHover);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('click', this.handleGesture, true);
    window.removeEventListener('touchend', this.handleGesture, true);
    this.settings.dispose();
    this.credits.dispose();
  }

  private revealMenu(): void {
    if (!this.machine.request('main', performance.now(), MENU_REVEAL_LOCK_MS)) return;
    const focusWasLost =
      document.activeElement === document.body || document.activeElement === this.gate;
    setVisible(this.title, true);
    setVisible(this.menu, true);
    this.experience.dataset.view = 'main';
    this.announcer.textContent = '';
    if (focusWasLost) this.firstEnabledButton()?.focus({ preventScroll: true });
  }

  private open(view: 'settings' | 'credits', opener: HTMLElement): void {
    if (!this.machine.request(view, performance.now())) return;
    this.options.onInterfaceSound?.('select');
    this.returnFocus = opener;
    setVisible(this.menu, false);
    this.experience.dataset.view = view;
    if (view === 'settings') {
      this.refreshSettings();
      setVisible(this.settingsPanel, true);
      this.settings.focusHeading();
    } else {
      setVisible(this.creditsPanel, true);
      this.credits.show(this.reducedMotion);
      query<HTMLElement>('#credits-heading').focus({ preventScroll: true });
    }
  }

  private back(): void {
    const from = this.machine.view;
    if (from !== 'settings' && from !== 'credits') return;
    if (!this.machine.request('main', performance.now())) return;
    this.options.onInterfaceSound?.('back');
    if (from === 'credits') this.credits.hide();
    setVisible(this.settingsPanel, false);
    setVisible(this.creditsPanel, false);
    setVisible(this.menu, true);
    this.experience.dataset.view = 'main';
    (this.returnFocus ?? this.firstEnabledButton())?.focus({ preventScroll: true });
  }

  private firstEnabledButton(): HTMLButtonElement | undefined {
    return this.menuButtons.find((button) => !button.disabled);
  }

  private readonly handleMenuClick = (event: MouseEvent): void => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>(
      'button[data-action]',
    );
    if (!button || button.disabled) return;
    const action = button.dataset.action as MenuAction;
    if (action === 'play') this.options.onPlay?.();
    else this.open(action, button);
  };

  private readonly handleMenuKeys = (event: KeyboardEvent): void => {
    const enabled = this.menuButtons.filter((button) => !button.disabled);
    const index = enabled.indexOf(document.activeElement as HTMLButtonElement);
    let next: HTMLButtonElement | undefined;
    if (event.key === 'ArrowDown') next = enabled[(index + 1) % enabled.length];
    else if (event.key === 'ArrowUp') next = enabled[(index - 1 + enabled.length) % enabled.length];
    else if (event.key === 'Home') next = enabled[0];
    else if (event.key === 'End') next = enabled[enabled.length - 1];
    if (!next) return;
    event.preventDefault();
    next.focus();
  };

  private readonly handleBack = (): void => this.back();

  private readonly handleBegin = (): void => {
    if (this.begun) return;
    this.begun = true;
    setVisible(this.gate, false);
    this.options.onBegin();
  };

  private lastHovered: Element | undefined;

  private readonly handleHover = (event: Event): void => {
    const button = (event.target as Element | null)?.closest('button[data-action]');
    if (!button || button === this.lastHovered || (button as HTMLButtonElement).disabled) return;
    this.lastHovered = button;
    this.options.onInterfaceSound?.('hover');
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    this.options.onUserGesture();
    if (event.defaultPrevented || event.repeat) return;
    const view = this.machine.view;
    if (view === 'intro') {
      if (!this.begun) {
        // Any key starts the film from the start screen.
        if (event.key !== 'Tab') {
          event.preventDefault();
          this.handleBegin();
        }
      } else if (event.key === 'Escape') {
        event.preventDefault();
        this.options.onSkip();
      }
    } else if (event.key === 'Escape' && (view === 'settings' || view === 'credits')) {
      event.preventDefault();
      this.back();
    }
  };

  private readonly handleGesture = (): void => this.options.onUserGesture();
}
