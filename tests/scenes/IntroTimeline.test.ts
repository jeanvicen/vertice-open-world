import { describe, expect, it } from 'vitest';
import {
  CINEMATIC_SCHEDULE,
  INTRO_PHASES,
  IntroTimeline,
  type PhaseChange,
  REDUCED_MOTION_SCHEDULE,
} from '../../src/scenes/space/IntroTimeline';

function record(schedule = CINEMATIC_SCHEDULE): {
  timeline: IntroTimeline;
  changes: PhaseChange[];
} {
  const changes: PhaseChange[] = [];
  const timeline = new IntroTimeline(schedule, (change) => changes.push(change));
  return { timeline, changes };
}

function run(timeline: IntroTimeline, seconds: number, fps: number): void {
  const frames = Math.round(seconds * fps);
  for (let frame = 0; frame < frames; frame += 1) timeline.advance(1 / fps);
}

describe('IntroTimeline', () => {
  it('stays silent until started, then opens on black exactly once', () => {
    const { timeline, changes } = record();
    timeline.advance(5);
    expect(changes).toEqual([]);
    timeline.start();
    timeline.start();
    expect(changes.map((change) => change.phase)).toEqual(['void']);
  });

  it('plays every phase in order and reaches the menu exactly once', () => {
    const { timeline, changes } = record();
    timeline.start();
    run(timeline, 60, 60);
    expect(changes.map((change) => change.phase)).toEqual([...INTRO_PHASES]);
    expect(changes.filter((change) => change.phase === 'menu')).toHaveLength(1);
    expect(changes.every((change) => !change.skipped)).toBe(true);
    expect(timeline.complete).toBe(true);
  });

  it('announces the same phase at the same scene time at 144 fps and at 8 fps', () => {
    const fast = record();
    const slow = record();
    fast.timeline.start();
    slow.timeline.start();
    // 7.5 s is a whole number of frames at both rates.
    expect(CINEMATIC_SCHEDULE.ship).toBeLessThan(7.5);
    run(fast.timeline, 7.5, 144);
    run(slow.timeline, 7.5, 8);
    expect(fast.timeline.phase).toBe('ship');
    expect(slow.timeline.phase).toBe('ship');
    expect(fast.timeline.elapsed).toBeCloseTo(slow.timeline.elapsed, 6);
  });

  it('catches up through several phases after one long frame, still in order', () => {
    const { timeline, changes } = record();
    timeline.start();
    timeline.advance(CINEMATIC_SCHEDULE.title + 0.01);
    expect(changes.map((change) => change.phase)).toEqual(['void', 'cosmos', 'ship', 'title']);
  });

  it('skips to the menu once, marking the remaining phases as skipped', () => {
    const { timeline, changes } = record();
    timeline.start();
    run(timeline, 3, 60);
    expect(timeline.skip()).toBe(true);
    expect(timeline.skip()).toBe(false);
    run(timeline, 30, 60);
    expect(changes.map((change) => change.phase)).toEqual([...INTRO_PHASES]);
    expect(changes.map((change) => change.skipped)).toEqual([false, false, true, true, true]);
  });

  it('refuses to skip once the menu is showing or before the opening starts', () => {
    const early = record();
    expect(early.timeline.skip()).toBe(false);
    const done = record();
    done.timeline.start();
    run(done.timeline, 30, 30);
    expect(done.timeline.skip()).toBe(false);
    expect(done.changes.filter((change) => change.phase === 'menu')).toHaveLength(1);
  });

  it('ignores negative and non-finite frame times', () => {
    const { timeline } = record();
    timeline.start();
    timeline.advance(-10);
    timeline.advance(Number.NaN);
    timeline.advance(Number.POSITIVE_INFINITY);
    expect(timeline.elapsed).toBe(0);
    expect(timeline.phase).toBe('void');
  });

  it('keeps the reduced-motion opening short and well ordered', () => {
    const { timeline, changes } = record(REDUCED_MOTION_SCHEDULE);
    timeline.start();
    run(timeline, REDUCED_MOTION_SCHEDULE.menu + 0.05, 60);
    expect(changes.map((change) => change.phase)).toEqual([...INTRO_PHASES]);
    expect(REDUCED_MOTION_SCHEDULE.menu).toBeLessThan(5);
  });

  it('rejects schedules that run backwards', () => {
    expect(
      () => new IntroTimeline({ cosmos: 2, ship: 1, title: 3, menu: 4 }, () => undefined),
    ).toThrow();
  });
});
