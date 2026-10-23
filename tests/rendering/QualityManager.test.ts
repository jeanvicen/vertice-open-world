import { describe, expect, it, vi } from 'vitest';
import {
  type DeviceCapabilities,
  FrameBudgetMonitor,
  QualityManager,
  resolveAutoTier,
} from '../../src/rendering/QualityManager';

const desktop: DeviceCapabilities = {
  hardwareConcurrency: 12,
  deviceMemory: 8,
  coarsePointer: false,
  devicePixelRatio: 2,
};
const phone: DeviceCapabilities = {
  hardwareConcurrency: 8,
  deviceMemory: 4,
  coarsePointer: true,
  devicePixelRatio: 3,
};

function feed(target: { sampleFrame(delta: number): void }, seconds: number, delta: number): void {
  for (let elapsed = 0; elapsed < seconds; elapsed += delta) target.sampleFrame(delta);
}

describe('automatic quality heuristics', () => {
  it('starts desktops at medium and never picks high on its own', () => {
    expect(resolveAutoTier(desktop)).toBe('medium');
    expect(resolveAutoTier({ ...desktop, hardwareConcurrency: 64 })).toBe('medium');
  });

  it('starts typical phones at low and only well-provisioned ones at medium', () => {
    expect(resolveAutoTier(phone)).toBe('low');
    expect(resolveAutoTier({ ...phone, deviceMemory: undefined })).toBe('low');
    expect(resolveAutoTier({ ...phone, deviceMemory: 8 })).toBe('medium');
  });

  it('treats very small CPUs or memory as low regardless of pointer', () => {
    expect(resolveAutoTier({ ...desktop, hardwareConcurrency: 2 })).toBe('low');
    expect(resolveAutoTier({ ...desktop, deviceMemory: 2 })).toBe('low');
  });
});

describe('FrameBudgetMonitor', () => {
  it('ignores the warmup period, where shader compilation stalls are expected', () => {
    const monitor = new FrameBudgetMonitor();
    const results: boolean[] = [];
    for (let elapsed = 0; elapsed < 3.9; elapsed += 0.05) results.push(monitor.push(0.05));
    expect(results.every((value) => !value)).toBe(true);
  });

  it('never asks for a downgrade at a healthy frame rate', () => {
    const monitor = new FrameBudgetMonitor();
    let downgrades = 0;
    for (let frame = 0; frame < 60 * 60; frame += 1) if (monitor.push(1 / 60)) downgrades += 1;
    expect(downgrades).toBe(0);
  });

  it('asks once per sustained slow window, then cools down', () => {
    const monitor = new FrameBudgetMonitor();
    let downgrades = 0;
    // 4 s warmup + 3 s window, then a 6 s cooldown before the next 3 s window.
    for (let elapsed = 0; elapsed < 12.9; elapsed += 0.05) if (monitor.push(0.05)) downgrades += 1;
    expect(downgrades).toBe(1);
    for (let elapsed = 0; elapsed < 3.6; elapsed += 0.05) if (monitor.push(0.05)) downgrades += 1;
    expect(downgrades).toBe(2);
  });
});

describe('QualityManager', () => {
  it('resolves explicit tiers directly', () => {
    expect(new QualityManager('high', phone).profile.tier).toBe('high');
    expect(new QualityManager('low', desktop).profile.tier).toBe('low');
  });

  it('lowers the automatic tier after sustained slow frames and notifies listeners', () => {
    const manager = new QualityManager('auto', desktop);
    const listener = vi.fn();
    manager.subscribe(listener);
    feed(manager, 8, 0.05);
    expect(manager.profile.tier).toBe('low');
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ tier: 'low' }));
    feed(manager, 30, 0.05);
    expect(manager.profile.tier).toBe('low');
  });

  it('never adapts a tier the player chose', () => {
    const manager = new QualityManager('high', desktop);
    feed(manager, 30, 0.05);
    expect(manager.profile.tier).toBe('high');
  });

  it('publishes preference changes once and stops after unsubscribe', () => {
    const manager = new QualityManager('auto', desktop);
    const listener = vi.fn();
    const unsubscribe = manager.subscribe(listener);
    manager.setPreference('high');
    manager.setPreference('high');
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    manager.setPreference('low');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(manager.profile.tier).toBe('low');
  });
});
