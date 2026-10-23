import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { Choreography } from '../../src/scenes/space/battle/Choreography';
import { CINEMATIC_SCHEDULE } from '../../src/scenes/space/IntroTimeline';
import { ShipFlight, WARP_SECONDS } from '../../src/scenes/space/ShipFlight';

const schedule = CINEMATIC_SCHEDULE;
const script = new Choreography(
  schedule,
  new ShipFlight(schedule.departure - schedule.hero - WARP_SECONDS),
);

describe('battle choreography', () => {
  it('ends with every other ship destroyed', () => {
    for (const fighter of script.fighters) {
      expect(Number.isFinite(fighter.deathTime)).toBe(true);
      expect(script.isAlive(fighter, schedule.departure)).toBe(false);
    }
  });

  it('lets the raiders win until the hero arrives, then has the hero destroy every raider', () => {
    for (const fighter of script.fighters) {
      if (fighter.faction === 'defender') {
        expect(fighter.deathTime).toBeGreaterThan(schedule.battle);
        expect(fighter.deathTime).toBeLessThan(schedule.hero);
      } else {
        expect(fighter.deathTime).toBeGreaterThan(schedule.hero + WARP_SECONDS);
        expect(fighter.deathTime).toBeLessThan(schedule.departure);
        const killingShot = script.bolts.find(
          (bolt) => bolt.kind === 'hero' && bolt.hit && bolt.endTime === fighter.deathTime,
        );
        expect(killingShot).toBeDefined();
        const target = script.fighterPosition(fighter, fighter.deathTime, new Vector3());
        expect(killingShot!.end.distanceTo(target)).toBeLessThan(1e-6);
      }
    }
  });

  it('times every bolt so it travels forwards in time', () => {
    for (const bolt of script.bolts) expect(bolt.endTime).toBeGreaterThan(bolt.fireTime);
  });

  it('explodes each ship once, plus the warp arrival', () => {
    const fighterExplosions = script.explosions.filter((explosion) => explosion.kind === 'fighter');
    expect(fighterExplosions).toHaveLength(script.fighters.length);
    expect(script.explosions.filter((explosion) => explosion.kind === 'warp')).toHaveLength(1);
  });

  it('provides a sorted sound cue for every shot and explosion', () => {
    const times = script.cues.map((cue) => cue.time);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(script.cues.filter((cue) => cue.name === 'explosion')).toHaveLength(
      script.fighters.length,
    );
    expect(script.cues.filter((cue) => cue.name.startsWith('laser-'))).toHaveLength(
      script.bolts.length,
    );
  });

  it('is deterministic', () => {
    const again = new Choreography(
      schedule,
      new ShipFlight(schedule.departure - schedule.hero - WARP_SECONDS),
    );
    expect(again.bolts.length).toBe(script.bolts.length);
    expect(again.bolts[10]!.start.equals(script.bolts[10]!.start)).toBe(true);
  });
});
