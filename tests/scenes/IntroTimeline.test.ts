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
    run(timeline, 45, 60);
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
    // 12 s is a whole number of frames at both rates and falls inside the battle.
    expect(CINEMATIC_SCHEDULE.battle).toBeLessThan(12);
    expect(CINEMATIC_SCHEDULE.hero).toBeGreaterThan(12);
    run(fast.timeline, 12, 144);
    run(slow.timeline, 12, 8);
    expect(fast.timeline.phase).toBe('battle');
    expect(slow.timeline.phase).toBe('battle');
    expect(fast.timeline.elapsed).toBeCloseTo(slow.timeline.elapsed, 6);
  });

  it('catches up through several phases after one long frame, still in order', () => {
    const { timeline, changes } = record();
    timeline.start();
    timeline.advance(CINEMATIC_SCHEDULE.hero + 0.01);
    expect(changes.map((change) => change.phase)).toEqual([
      'void',
      'studio',
      'title',
      'battle',
      'hero',
    ]);
  });

  it('skips to the menu once, marking the remaining phases as skipped', () => {
    const { timeline, changes } = record();
    timeline.start();
    run(timeline, 3, 60);
    expect(timeline.skip()).toBe(true);
    expect(timeline.skip()).toBe(false);
    run(timeline, 30, 60);
    expect(changes.map((change) => change.phase)).toEqual([...INTRO_PHASES]);
    expect(changes.map((change) => change.skipped)).toEqual([
      false,
      false,
      true,
      true,
      true,
      true,
      true,
    ]);
  });

  it('refuses to skip once the menu is showing or before the opening starts', () => {
    const early = record();
    expect(early.timeline.skip()).toBe(false);
    const done = record();
    done.timeline.start();
    run(done.timeline, 40, 30);
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
    expect(REDUCED_MOTION_SCHEDULE.menu).toBeLessThan(10);
  });

  it('rejects schedules that run backwards', () => {
    expect(
      () =>
        new IntroTimeline(
          { studio: 1, title: 3, battle: 2, hero: 4, departure: 5, menu: 6 },
          () => undefined,
        ),
    ).toThrow();
  });
});
