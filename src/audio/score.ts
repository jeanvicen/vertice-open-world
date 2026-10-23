import type { IntroSchedule } from '../scenes/space/IntroTimeline';

export type ScoreCueName =
  | 'studio-sting'
  | 'title-hit'
  | 'pad'
  | 'pulse'
  | 'drum'
  | 'brass'
  | 'ambience';

/** One musical event. `notes` are frequencies in hertz; `length` is in seconds. */
export interface ScoreCue {
  readonly time: number;
  readonly name: ScoreCueName;
  readonly notes: readonly number[];
  readonly length: number;
  readonly level: number;
}

const note = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

/** A minor, then the relative major when the hero arrives. MIDI note numbers. */
const BATTLE_PROGRESSION: ReadonlyArray<readonly number[]> = [
  [45, 57, 60, 64], // Am
  [41, 57, 60, 65], // F
  [48, 55, 60, 64], // C
  [43, 55, 59, 62], // G
];
const HERO_PROGRESSION: ReadonlyArray<readonly number[]> = [
  [48, 55, 64, 67], // C
  [43, 55, 62, 67], // G
  [45, 57, 64, 69], // Am
  [41, 57, 65, 69], // F
];
/** The hero's motif, one note per beat (0 = rest). */
const HERO_MOTIF = [76, 0, 79, 76, 74, 0, 72, 0, 74, 76, 0, 79, 81, 0, 79, 0];

/**
 * The opening's score as timed events: a studio sting, a title hit, a driving battle cue that
 * lifts into a heroic major when the protagonist arrives, a resolving pad on departure and the
 * ambient bed under the menu. Synthesized at runtime by the audio engine.
 */
export function createScore(schedule: IntroSchedule, cinematic: boolean): ScoreCue[] {
  const cues: ScoreCue[] = [
    { time: schedule.studio + 0.15, name: 'studio-sting', notes: [], length: 5, level: 1 },
    { time: schedule.title + 1.0, name: 'title-hit', notes: [], length: 6, level: 1 },
  ];
  if (cinematic) {
    const beat = 60 / 96;
    const bar = beat * 4;
    const start = schedule.battle - 0.3;
    const heroBar = Math.round((schedule.hero + 0.55 - start) / bar);
    const end = schedule.departure + 0.8;
    for (let index = 0; start + index * bar < end; index += 1) {
      const time = start + index * bar;
      const heroic = index >= heroBar;
      const progression = heroic ? HERO_PROGRESSION : BATTLE_PROGRESSION;
      const chord = progression[index % progression.length]!;
      cues.push({
        time,
        name: 'pad',
        notes: chord.slice(1).map(note),
        length: bar * 1.05,
        level: heroic ? 1 : 0.8,
      });
      for (let eighth = 0; eighth < 8; eighth += 1) {
        cues.push({
          time: time + (eighth * beat) / 2,
          name: 'pulse',
          notes: [note(chord[0]! + (eighth % 4 === 3 ? 12 : 0))],
          length: beat / 2,
          level: eighth % 2 === 0 ? 1 : 0.6,
        });
      }
      const hits = index % 2 === 1 ? [0, 2, 3, 3.5] : [0, 2];
      for (const position of hits) {
        cues.push({
          time: time + position * beat,
          name: 'drum',
          notes: [],
          length: 0.8,
          level: position === 0 ? 1 : 0.7,
        });
      }
      if (heroic) {
        const phrase = (index - heroBar) % 4;
        for (let step = 0; step < 4; step += 1) {
          const midi = HERO_MOTIF[(phrase * 4 + step) % HERO_MOTIF.length]!;
          if (midi > 0)
            cues.push({
              time: time + step * beat,
              name: 'brass',
              notes: [note(midi), note(midi - 12)],
              length: beat * 0.95,
              level: 0.9,
            });
        }
      }
    }
    // Resolution as the ship leaves: F(add9) settling on C over E.
    cues.push(
      {
        time: schedule.departure + 0.8,
        name: 'pad',
        notes: [53, 60, 67, 69].map(note),
        length: 4.6,
        level: 1,
      },
      {
        time: schedule.departure + 4.8,
        name: 'pad',
        notes: [52, 60, 64, 67, 72].map(note),
        length: 6,
        level: 0.8,
      },
    );
  }
  cues.push({
    time: cinematic ? schedule.departure + 5 : schedule.menu - 1,
    name: 'ambience',
    notes: [],
    length: 0,
    level: 1,
  });
  return cues.sort((a, b) => a.time - b.time);
}
