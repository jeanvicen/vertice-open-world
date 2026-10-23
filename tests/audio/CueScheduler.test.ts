import { describe, expect, it } from 'vitest';
import { CueScheduler } from '../../src/audio/CueScheduler';
import { createScore } from '../../src/audio/score';
import { CINEMATIC_SCHEDULE, REDUCED_MOTION_SCHEDULE } from '../../src/scenes/space/IntroTimeline';

describe('CueScheduler', () => {
  it('fires each cue once, in order, with the delay still to wait', () => {
    const scheduler = new CueScheduler([{ time: 2 }, { time: 1 }, { time: 1.04 }]);
    const fired: Array<[number, number]> = [];
    const fire = (cue: { time: number }, delay: number): number => fired.push([cue.time, delay]);
    scheduler.update(0.98, 0.06, fire);
    scheduler.update(0.99, 0.06, fire);
    scheduler.update(3, 0.06, fire);
    expect(fired.map(([time]) => time)).toEqual([1, 1.04, 2]);
    expect(fired[0]![1]).toBeCloseTo(0.02);
    expect(fired[2]![1]).toBe(0);
    expect(scheduler.remaining).toBe(0);
  });

  it('drops skipped cues without firing them', () => {
    const scheduler = new CueScheduler([{ time: 1 }, { time: 5 }, { time: 9 }]);
    scheduler.skipTo(6);
    const fired: number[] = [];
    scheduler.update(20, 0, (cue) => fired.push(cue.time));
    expect(fired).toEqual([9]);
  });
});

describe('score', () => {
  it('opens with the studio sting and ends with the ambient bed', () => {
    const score = createScore(CINEMATIC_SCHEDULE, true);
    expect(score[0]!.name).toBe('studio-sting');
    expect(score.at(-1)!.name).toBe('ambience');
    expect(score.some((cue) => cue.name === 'title-hit')).toBe(true);
  });

  it('drives the battle with pulse and drums, and lifts into brass when the hero arrives', () => {
    const score = createScore(CINEMATIC_SCHEDULE, true);
    const inBattle = score.filter(
      (cue) =>
        cue.time >= CINEMATIC_SCHEDULE.battle - 0.5 && cue.time < CINEMATIC_SCHEDULE.departure,
    );
    expect(inBattle.some((cue) => cue.name === 'pulse')).toBe(true);
    expect(inBattle.some((cue) => cue.name === 'drum')).toBe(true);
    const brass = score.filter((cue) => cue.name === 'brass');
    expect(brass.length).toBeGreaterThan(0);
    expect(Math.min(...brass.map((cue) => cue.time))).toBeGreaterThan(CINEMATIC_SCHEDULE.hero);
  });

  it('keeps the reduced-motion score to the two cards and the bed', () => {
    const score = createScore(REDUCED_MOTION_SCHEDULE, false);
    expect(score.map((cue) => cue.name)).toEqual(['studio-sting', 'title-hit', 'ambience']);
  });
});
