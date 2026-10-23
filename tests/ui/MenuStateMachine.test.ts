import { describe, expect, it } from 'vitest';
import { MENU_TRANSITION_LOCK_MS, MenuStateMachine } from '../../src/ui/MenuStateMachine';

describe('MenuStateMachine', () => {
  it('only leaves the intro for the main menu', () => {
    const machine = new MenuStateMachine();
    expect(machine.request('settings', 0)).toBe(false);
    expect(machine.request('credits', 0)).toBe(false);
    expect(machine.request('main', 0)).toBe(true);
    expect(machine.request('main', 10_000)).toBe(false);
  });

  it('refuses a second panel while a transition is still running', () => {
    const machine = new MenuStateMachine();
    machine.request('main', 0);
    expect(machine.request('settings', MENU_TRANSITION_LOCK_MS - 1)).toBe(false);
    expect(machine.request('settings', MENU_TRANSITION_LOCK_MS)).toBe(true);
    expect(machine.view).toBe('settings');
  });

  it('never moves directly between settings and credits', () => {
    const machine = new MenuStateMachine(0);
    machine.request('main', 0);
    machine.request('settings', 1);
    expect(machine.request('credits', 2)).toBe(false);
    expect(machine.view).toBe('settings');
  });

  it('always allows leaving a panel immediately, then debounces reopening', () => {
    const machine = new MenuStateMachine();
    machine.request('main', 0);
    machine.request('credits', 1000);
    expect(machine.request('main', 1001)).toBe(true);
    expect(machine.request('settings', 1002)).toBe(false);
    expect(machine.request('settings', 1001 + MENU_TRANSITION_LOCK_MS)).toBe(true);
  });
});
