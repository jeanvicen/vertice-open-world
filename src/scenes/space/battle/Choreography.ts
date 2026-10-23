import { Matrix4, Quaternion, Vector3 } from 'three';
import type { IntroSchedule } from '../IntroTimeline';
import { createRandom } from '../random';
import {
  BATTLE_CENTER,
  createShipState,
  type ShipFlight,
  WARP_EXIT,
  WARP_SECONDS,
} from '../ShipFlight';

export type Faction = 'raider' | 'defender';
export type BoltKind = Faction | 'hero';

/** One fighter flying a looping dogfight orbit until it is destroyed. */
export interface FighterSpec {
  readonly index: number;
  readonly faction: Faction;
  readonly center: Vector3;
  readonly radius: number;
  readonly angularSpeed: number;
  readonly phase: number;
  readonly plane: Quaternion;
  /** Scene time of destruction; Infinity for a fighter that survives the script. */
  readonly deathTime: number;
}

export interface Bolt {
  readonly kind: BoltKind;
  readonly start: Vector3;
  readonly end: Vector3;
  readonly fireTime: number;
  /** Time the bolt reaches `end` (impact for hits, fade-out for misses). */
  readonly endTime: number;
  readonly hit: boolean;
}

export type ExplosionKind = 'fighter' | 'warp';

export interface Explosion {
  readonly kind: ExplosionKind;
  readonly time: number;
  readonly position: Vector3;
  readonly size: number;
  readonly seed: number;
}

export type SoundCueName =
  | 'laser-raider'
  | 'laser-defender'
  | 'laser-hero'
  | 'impact'
  | 'explosion'
  | 'warp-rise'
  | 'warp-arrival';

/** A sound tied to a moment and (optionally) a place in the battle. */
export interface SoundCue {
  readonly time: number;
  readonly name: SoundCueName;
  readonly position?: Vector3;
  /** 0–1 relative loudness before distance attenuation. */
  readonly weight: number;
}

const BOLT_SPEED: Readonly<Record<BoltKind, number>> = { raider: 170, defender: 190, hero: 290 };
const RAIDERS = 6;
const DEFENDERS = 3;
const MISS_RANGE = 240;

/**
 * The whole battle as data. Built once from the schedule and the hero's flight; every frame
 * only samples it, so the fight plays identically at any frame rate and can be unit-tested.
 */
export class Choreography {
  public readonly fighters: readonly FighterSpec[];
  public readonly bolts: readonly Bolt[];
  public readonly explosions: readonly Explosion[];
  public readonly cues: readonly SoundCue[];
  private readonly scratchA = new Vector3();
  private readonly scratchB = new Vector3();

  public constructor(
    public readonly schedule: IntroSchedule,
    private readonly hero: ShipFlight,
  ) {
    const random = createRandom(0xba771e);
    const arrival = schedule.hero;
    const defenderDeaths = [schedule.battle + 2.9, schedule.battle + 4.7, arrival - 0.75];
    const span = schedule.departure - 1.4 - (arrival + 1.3);
    const raiderDeaths = Array.from(
      { length: RAIDERS },
      (_, index) => arrival + 1.3 + (span * index) / (RAIDERS - 1) + (index % 2) * 0.12,
    );

    const fighters: FighterSpec[] = [];
    for (let index = 0; index < RAIDERS + DEFENDERS; index += 1) {
      const faction: Faction = index < RAIDERS ? 'raider' : 'defender';
      const local = faction === 'raider' ? index : index - RAIDERS;
      const radius = 34 + random() * 30;
      const speed = (faction === 'raider' ? 46 : 40) + random() * 10;
      fighters.push({
        index,
        faction,
        center: BATTLE_CENTER.clone().add(
          new Vector3((random() - 0.5) * 70, (random() - 0.5) * 26, (random() - 0.5) * 70),
        ),
        radius,
        angularSpeed: (speed / radius) * (random() < 0.5 ? 1 : -1),
        phase: random() * Math.PI * 2,
        plane: new Quaternion().setFromAxisAngle(
          new Vector3(random() - 0.5, random() * 0.4, random() - 0.5).normalize(),
          0.25 + random() * 0.5,
        ),
        deathTime: faction === 'raider' ? raiderDeaths[local]! : defenderDeaths[local]!,
      });
    }
    this.fighters = fighters;

    const bolts: Bolt[] = [];
    const explosions: Explosion[] = [];
    const raiders = fighters.filter((fighter) => fighter.faction === 'raider');
    const defenders = fighters.filter((fighter) => fighter.faction === 'defender');

    // Defenders fall to concentrated raider fire.
    defenders.forEach((defender, index) => {
      const shooter = raiders[(index * 2 + 1) % raiders.length]!;
      for (const lead of [0.5, 0.26, 0]) {
        bolts.push(this.aimedBolt('raider', shooter, defender, defender.deathTime - lead));
      }
      explosions.push(this.explosionAt(defender, 3.2, random));
    });

    // The hero clears every raider: three-round volleys from alternating wing cannons.
    raiders.forEach((raider, index) => {
      [0.34, 0.17, 0].forEach((lead, shot) => {
        bolts.push(this.heroBolt(raider, raider.deathTime - lead, (index + shot) % 2 === 0));
      });
      explosions.push(this.explosionAt(raider, 3.6, random));
    });

    // Background fire that keeps the battle alive and mostly misses.
    for (const fighter of fighters) {
      let time = schedule.battle - 1.5 + random() * 1.2;
      while (time < Math.min(fighter.deathTime - 0.4, schedule.departure)) {
        const enemies = fighters.filter(
          (other) => other.faction !== fighter.faction && other.deathTime > time + 0.6,
        );
        const target = enemies[Math.floor(random() * enemies.length)];
        const aimAtHero = fighter.faction === 'raider' && time > arrival + 0.8 && random() < 0.6;
        if (target || aimAtHero) {
          for (let burst = 0; burst < 2; burst += 1) {
            const fireTime = time + burst * 0.11;
            bolts.push(this.missedBolt(fighter, fireTime, aimAtHero ? undefined : target, random));
          }
        }
        time += 0.9 + random() * 1.1;
      }
    }

    explosions.push({
      kind: 'warp',
      time: arrival + WARP_SECONDS,
      position: WARP_EXIT.clone(),
      size: 9,
      seed: 0.5,
    });

    bolts.sort((a, b) => a.fireTime - b.fireTime);
    explosions.sort((a, b) => a.time - b.time);
    this.bolts = bolts;
    this.explosions = explosions;

    const cues: SoundCue[] = [
      { time: arrival - 1.1, name: 'warp-rise', position: WARP_EXIT, weight: 1 },
      { time: arrival + WARP_SECONDS, name: 'warp-arrival', position: WARP_EXIT, weight: 1 },
    ];
    for (const bolt of bolts) {
      cues.push({
        time: bolt.fireTime,
        name: `laser-${bolt.kind}`,
        position: bolt.start,
        weight: bolt.kind === 'hero' ? 1 : 0.55,
      });
      if (bolt.hit)
        cues.push({ time: bolt.endTime, name: 'impact', position: bolt.end, weight: 0.5 });
    }
    for (const explosion of explosions) {
      if (explosion.kind === 'fighter')
        cues.push({
          time: explosion.time,
          name: 'explosion',
          position: explosion.position,
          weight: 1,
        });
    }
    cues.sort((a, b) => a.time - b.time);
    this.cues = cues;
  }

  /** Dogfight position: a tilted, slightly figure-eight orbit around the fighter's centre. */
  public fighterPosition(fighter: FighterSpec, time: number, out: Vector3): Vector3 {
    const angle = fighter.phase + fighter.angularSpeed * time;
    out.set(
      Math.cos(angle) * fighter.radius,
      Math.sin(angle * 2) * fighter.radius * 0.16,
      Math.sin(angle) * fighter.radius * 0.72,
    );
    return out.applyQuaternion(fighter.plane).add(fighter.center);
  }

  /** Nose along the velocity, banked towards the centre of the orbit. */
  public fighterOrientation(fighter: FighterSpec, time: number, out: Quaternion): Quaternion {
    const position = this.fighterPosition(fighter, time, this.scratchA);
    const forward = this.fighterPosition(fighter, time + 0.04, this.scratchB)
      .sub(position)
      .normalize();
    const inward = fighter.center.clone().sub(position).normalize();
    const up = new Vector3(0, 1, 0).applyQuaternion(fighter.plane).lerp(inward, 0.55).normalize();
    const side = new Vector3().crossVectors(up, forward).normalize();
    up.crossVectors(forward, side);
    return out.setFromRotationMatrix(new Matrix4().makeBasis(side, up, forward));
  }

  public isAlive(fighter: FighterSpec, time: number): boolean {
    return time < fighter.deathTime;
  }

  private explosionAt(fighter: FighterSpec, size: number, random: () => number): Explosion {
    return {
      kind: 'fighter',
      time: fighter.deathTime,
      position: this.fighterPosition(fighter, fighter.deathTime, new Vector3()),
      size,
      seed: random(),
    };
  }

  /** A bolt that leaves `shooter` and lands on `target` exactly at `impactTime`. */
  private aimedBolt(
    kind: BoltKind,
    shooter: FighterSpec,
    target: FighterSpec,
    impactTime: number,
  ): Bolt {
    const end = this.fighterPosition(target, impactTime, new Vector3());
    let fireTime = impactTime - 0.3;
    const start = new Vector3();
    for (let iteration = 0; iteration < 4; iteration += 1) {
      this.fighterPosition(shooter, fireTime, start);
      fireTime = impactTime - start.distanceTo(end) / BOLT_SPEED[kind];
    }
    this.fighterPosition(shooter, fireTime, start);
    return { kind, start, end, fireTime, endTime: impactTime, hit: true };
  }

  private heroBolt(target: FighterSpec, impactTime: number, leftCannon: boolean): Bolt {
    const end = this.fighterPosition(target, impactTime, new Vector3());
    const state = createShipState();
    const muzzle = new Vector3(leftCannon ? 3.4 : -3.4, -0.35, 9);
    const start = new Vector3();
    let fireTime = impactTime - 0.3;
    for (let iteration = 0; iteration < 4; iteration += 1) {
      this.hero.sample(fireTime - this.schedule.hero, fireTime, state);
      start.copy(muzzle).applyQuaternion(state.quaternion).add(state.position);
      fireTime = impactTime - start.distanceTo(end) / BOLT_SPEED.hero;
    }
    this.hero.sample(fireTime - this.schedule.hero, fireTime, state);
    start.copy(muzzle).applyQuaternion(state.quaternion).add(state.position);
    return { kind: 'hero', start, end, fireTime, endTime: impactTime, hit: true };
  }

  /** Aimed near a target (or the hero) with a deliberate error, flying on past it. */
  private missedBolt(
    shooter: FighterSpec,
    fireTime: number,
    target: FighterSpec | undefined,
    random: () => number,
  ): Bolt {
    const kind: BoltKind = shooter.faction;
    const start = this.fighterPosition(shooter, fireTime, new Vector3());
    const aim = new Vector3();
    if (target) {
      this.fighterPosition(target, fireTime + 0.35, aim);
    } else {
      const state = createShipState();
      this.hero.sample(fireTime + 0.35 - this.schedule.hero, fireTime, state);
      aim.copy(state.position);
    }
    aim.add(new Vector3(random() - 0.5, random() - 0.5, random() - 0.5).multiplyScalar(22));
    const direction = aim.sub(start).normalize();
    const end = start.clone().addScaledVector(direction, MISS_RANGE);
    return {
      kind,
      start,
      end,
      fireTime,
      endTime: fireTime + MISS_RANGE / BOLT_SPEED[kind],
      hit: false,
    };
  }
}
