import { describe, expect, it } from 'vitest';
import { MAX_FRAME_DELTA_SECONDS, Time } from '../../src/core/Time';

describe('Time', () => {
  it('starts without a simulated first-frame delta', () => {
    const time = new Time();
    expect(time.update(1000)).toBe(0);
    expect(time.elapsedSeconds).toBe(0);
  });

  it('accumulates elapsed frame time', () => {
    const time = new Time();
    time.update(1000);
    expect(time.update(1025)).toBeCloseTo(0.025);
    expect(time.elapsedSeconds).toBeCloseTo(0.025);
  });

  it('caps a suspended-tab-sized frame instead of simulating a huge movement', () => {
    const time = new Time();
    time.update(1000);
    expect(time.update(9000)).toBe(MAX_FRAME_DELTA_SECONDS);
    expect(time.elapsedSeconds).toBe(MAX_FRAME_DELTA_SECONDS);
  });

  it('ignores invalid timestamps without resetting the elapsed frame sequence', () => {
    const time = new Time();
    time.update(1000);
    expect(time.update(Number.NaN)).toBe(0);
    expect(time.update(1020)).toBeCloseTo(0.02);
    expect(time.elapsedSeconds).toBeCloseTo(0.02);
  });

  it('does not move backwards when a timestamp goes backwards', () => {
    const time = new Time();
    time.update(1000);
    expect(time.update(950)).toBe(0);
    expect(time.update(1020)).toBeCloseTo(0.02);
    expect(time.elapsedSeconds).toBeCloseTo(0.02);
  });

  it('clears the previous timestamp on reset', () => {
    const time = new Time();
    time.update(1000);
    time.update(1030);
    time.reset();
    expect(time.elapsedSeconds).toBe(0);
    expect(time.update(50000)).toBe(0);
  });
});
