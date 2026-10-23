import { describe, expect, it } from 'vitest';
import { resolveReducedMotion } from '../../src/systems/MotionPreference';

describe('resolveReducedMotion', () => {
  it('follows the system only when the player chose "system"', () => {
    expect(resolveReducedMotion('system', true)).toBe(true);
    expect(resolveReducedMotion('system', false)).toBe(false);
  });

  it('lets an explicit choice override the system', () => {
    expect(resolveReducedMotion('reduced', false)).toBe(true);
    expect(resolveReducedMotion('full', true)).toBe(false);
  });
});
