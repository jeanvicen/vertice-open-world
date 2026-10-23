import {
  Color,
  DodecahedronGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  type PerspectiveCamera,
  PointLight,
  Quaternion,
  type Texture,
  Vector3,
} from 'three';
import type { RenderProfile } from '../../../rendering/quality';
import { ResourceTracker } from '../../../rendering/ResourceTracker';
import { createRandom } from '../random';
import { WARP_ORIGIN, WARP_SECONDS } from '../ShipFlight';
import type { Bolt, BoltKind, Choreography, Explosion } from './Choreography';
import { BillboardBatch, GlowPoints, LaserBatch } from './effects';
import { createDefenderModel, createRaiderModel, type FighterModel } from './fighterGeometry';

const BOLT_STYLE: Readonly<
  Record<BoltKind, { color: [number, number, number]; length: number; width: number }>
> = {
  raider: { color: [4.2, 0.75, 0.32], length: 11, width: 0.5 },
  defender: { color: [0.55, 2.4, 3.2], length: 10, width: 0.45 },
  hero: { color: [2.2, 3.2, 6.2], length: 18, width: 0.7 },
};

const ENGINE_COLOR: Readonly<Record<'raider' | 'defender', [number, number, number]>> = {
  raider: [3.2, 0.9, 0.35],
  defender: [0.7, 1.9, 3.4],
};

const DEBRIS_PER_EXPLOSION = 14;
/** Fighters are modelled small; this keeps them readable in wide shots. */
const FIGHTER_SCALE = 1.35;
const EXPLOSION_LIFETIME = 4;

/** Renders the choreographed battle: fighters, bolts, explosions, the warp and their light. */
export class Battle {
  public readonly root = new Group();
  private readonly resources = new ResourceTracker();
  private readonly raiders: InstancedMesh;
  private readonly defenders: InstancedMesh;
  private readonly glows: GlowPoints;
  private readonly lasers: LaserBatch;
  private readonly fire: BillboardBatch;
  private readonly flashes: BillboardBatch;
  private readonly debris: InstancedMesh;
  private readonly light = new PointLight(new Color('#ffb070'), 0, 260, 1.6);
  private readonly debrisDirections: Vector3[] = [];
  private readonly debrisSpin: Vector3[] = [];
  private readonly models: { raider: FighterModel; defender: FighterModel };
  private debrisDensity = 1;
  // Scratch objects reused every frame.
  private readonly position = new Vector3();
  private readonly quaternion = new Quaternion();
  private readonly matrix = new Matrix4();
  private readonly scale = new Vector3();
  private readonly tail = new Vector3();
  private readonly head = new Vector3();
  private readonly direction = new Vector3();
  private readonly engine = new Vector3();

  public constructor(
    private readonly script: Choreography,
    panels: Texture,
    environment: Texture,
    profile: RenderProfile,
  ) {
    this.models = { raider: createRaiderModel(), defender: createDefenderModel() };
    this.resources.track(this.models.raider.geometry);
    this.resources.track(this.models.defender.geometry);
    const raiderMaterial = this.resources.track(
      new MeshStandardMaterial({
        color: new Color('#6a5750'),
        map: panels,
        metalness: 0.55,
        roughness: 0.48,
        envMap: environment,
        envMapIntensity: 1.1,
      }),
    );
    const defenderMaterial = this.resources.track(
      new MeshStandardMaterial({
        color: new Color('#c9ced6'),
        map: panels,
        metalness: 0.25,
        roughness: 0.4,
        envMap: environment,
        envMapIntensity: 0.9,
      }),
    );
    const count = (faction: 'raider' | 'defender'): number =>
      script.fighters.filter((fighter) => fighter.faction === faction).length;
    this.raiders = new InstancedMesh(this.models.raider.geometry, raiderMaterial, count('raider'));
    this.defenders = new InstancedMesh(
      this.models.defender.geometry,
      defenderMaterial,
      count('defender'),
    );
    for (const mesh of [this.raiders, this.defenders]) {
      mesh.frustumCulled = false;
      this.resources.track({ dispose: () => mesh.dispose() });
    }

    this.glows = new GlowPoints(this.resources, 256);
    this.lasers = new LaserBatch(this.resources, 96);
    this.fire = new BillboardBatch(this.resources, 48, 'fire');
    this.flashes = new BillboardBatch(this.resources, 48, 'glow');

    const shard = this.resources.track(new DodecahedronGeometry(0.5, 0));
    shard.scale(1, 0.35, 0.7);
    const debrisMaterial = this.resources.track(
      new MeshStandardMaterial({
        color: new Color('#3b3634'),
        metalness: 0.6,
        roughness: 0.5,
        envMap: environment,
        emissive: new Color('#ff5a1a'),
        emissiveIntensity: 0.6,
      }),
    );
    const maxDebris = script.explosions.length * DEBRIS_PER_EXPLOSION;
    this.debris = new InstancedMesh(shard, debrisMaterial, maxDebris);
    this.debris.frustumCulled = false;
    this.resources.track({ dispose: () => this.debris.dispose() });
    const random = createRandom(0xdeb215);
    for (let index = 0; index < maxDebris; index += 1) {
      this.debrisDirections.push(
        new Vector3(random() - 0.5, random() - 0.5, random() - 0.5)
          .normalize()
          .multiplyScalar(8 + random() * 22),
      );
      this.debrisSpin.push(
        new Vector3(random() - 0.5, random() - 0.5, random() - 0.5)
          .normalize()
          .multiplyScalar(2 + random() * 7),
      );
    }

    this.root.add(
      this.raiders,
      this.defenders,
      this.debris,
      this.glows.object,
      this.lasers.object,
      this.fire.object,
      this.flashes.object,
      this.light,
    );
    this.applyProfile(profile);
  }

  public applyProfile(profile: RenderProfile): void {
    this.debrisDensity = Math.max(0.35, profile.detailDensity);
    this.fire.setOctaves(Math.max(2, Math.min(5, profile.surfaceOctaves)));
  }

  /** Projection scale for world-sized points: pixels per unit at distance 1. */
  public setViewport(camera: PerspectiveCamera, heightPixels: number): void {
    this.glows.setViewportScale(heightPixels / (2 * Math.tan((camera.fov * Math.PI) / 360)));
  }

  /** Explosion shake for the camera, attenuated by distance (0–1). */
  public shakeAt(time: number, cameraPosition: Vector3): number {
    let shake = 0;
    for (const explosion of this.script.explosions) {
      const age = time - explosion.time;
      if (age < 0 || age > 1.2) continue;
      const distance = Math.max(20, explosion.position.distanceTo(cameraPosition));
      shake += (explosion.size * 14 * Math.exp(-age * 4.5)) / distance;
    }
    return Math.min(1, shake);
  }

  public update(time: number, visible: boolean): void {
    this.root.visible = visible;
    if (!visible) return;
    const script = this.script;
    this.glows.begin();
    this.lasers.begin();
    this.fire.begin();
    this.flashes.begin();

    // Fighters and their drives.
    let raiderIndex = 0;
    let defenderIndex = 0;
    for (const fighter of script.fighters) {
      const mesh = fighter.faction === 'raider' ? this.raiders : this.defenders;
      const slot = fighter.faction === 'raider' ? raiderIndex++ : defenderIndex++;
      if (!script.isAlive(fighter, time)) {
        mesh.setMatrixAt(slot, this.matrix.makeScale(0, 0, 0));
        continue;
      }
      script.fighterPosition(fighter, time, this.position);
      script.fighterOrientation(fighter, time, this.quaternion);
      mesh.setMatrixAt(
        slot,
        this.matrix.compose(this.position, this.quaternion, this.scale.setScalar(FIGHTER_SCALE)),
      );
      const [r, g, b] = ENGINE_COLOR[fighter.faction];
      for (const mount of this.models[fighter.faction].engines) {
        this.engine
          .set(mount.x, mount.y, mount.z - 0.2)
          .multiplyScalar(FIGHTER_SCALE)
          .applyQuaternion(this.quaternion)
          .add(this.position);
        this.glows.push(this.engine, r, g, b, mount.radius * 5.2 * FIGHTER_SCALE);
      }
    }
    this.raiders.instanceMatrix.needsUpdate = true;
    this.defenders.instanceMatrix.needsUpdate = true;

    for (const bolt of script.bolts) {
      if (bolt.fireTime > time) break;
      this.drawBolt(bolt, time);
    }
    this.drawWarp(time);
    this.drawExplosions(time);

    this.glows.end();
    this.lasers.end();
    this.fire.end();
    this.flashes.end();
  }

  public dispose(): void {
    this.root.removeFromParent();
    this.root.clear();
    this.light.dispose();
    this.resources.dispose();
  }

  private drawBolt(bolt: Bolt, time: number): void {
    const style = BOLT_STYLE[bolt.kind];
    const [r, g, b] = style.color;
    const duration = bolt.endTime - bolt.fireTime;
    const progress = (time - bolt.fireTime) / duration;
    if (progress <= 1) {
      this.direction.subVectors(bolt.end, bolt.start);
      const travel = this.direction.length();
      this.direction.normalize();
      this.head.copy(bolt.start).addScaledVector(this.direction, travel * progress);
      const length = Math.min(style.length, travel * progress);
      this.tail.copy(this.head).addScaledVector(this.direction, -length);
      const fade = bolt.hit ? 1 : 1 - Math.max(0, progress - 0.7) / 0.3;
      this.lasers.push(this.tail, this.head, r * fade, g * fade, b * fade, style.width);
      if (time - bolt.fireTime < 0.07) {
        // Muzzle flash.
        this.glows.push(bolt.start, r * 0.8, g * 0.8, b * 0.8, style.width * 9);
      }
    } else if (bolt.hit) {
      const age = time - bolt.endTime;
      if (age < 0.22) {
        const k = 1 - age / 0.22;
        this.glows.push(bolt.end, r * k * 1.5, g * k * 1.5, b * k * 1.5, 2.6 * (0.6 + age * 4));
      }
    }
  }

  private drawWarp(time: number): void {
    const arrival = this.script.schedule.hero;
    const since = time - arrival;
    if (since < -0.05 || since > WARP_SECONDS + 0.6) return;
    const exit = this.script.explosions.find((explosion) => explosion.kind === 'warp');
    if (!exit) return;
    // The streak: a long bolt of light from deep space onto the exit point, then gone.
    const streak = 1 - Math.max(0, since - WARP_SECONDS) / 0.6;
    const reach = Math.min(1, Math.max(0, since / WARP_SECONDS));
    this.head.copy(exit.position);
    this.tail.lerpVectors(WARP_ORIGIN, exit.position, reach * 0.6);
    this.lasers.push(
      this.tail,
      this.head,
      1.4 * streak,
      2.2 * streak,
      5.5 * streak,
      1.6 * streak + 0.2,
    );
  }

  private drawExplosions(time: number): void {
    let lightIntensity = 0;
    let debrisCount = 0;
    const maxDebris = Math.round(DEBRIS_PER_EXPLOSION * this.debrisDensity);
    this.script.explosions.forEach((explosion, explosionIndex) => {
      const age = time - explosion.time;
      if (age < 0 || age > EXPLOSION_LIFETIME) return;
      if (explosion.kind === 'warp') {
        this.drawWarpFlash(explosion, age);
        lightIntensity = Math.max(lightIntensity, 260 * Math.exp(-age * 5));
        if (lightIntensity > 0) this.light.position.copy(explosion.position);
        this.light.color.setRGB(0.6, 0.75, 1);
        return;
      }
      const size = explosion.size;
      const life = age / EXPLOSION_LIFETIME;
      // Flash, then the fireball (two offset lobes) and a shockwave ring.
      if (age < 0.4) {
        this.flashes.push(
          explosion.position,
          size * (1.5 + age * 3),
          age / 0.4,
          explosion.seed,
          0,
          2.6,
          2.0,
          1.4,
        );
      }
      if (age < 1) {
        this.flashes.push(
          explosion.position,
          size * (1 + age * 5),
          age,
          explosion.seed,
          1,
          0.9,
          0.75,
          0.6,
        );
      }
      const grow = 0.5 + 1.35 * Math.sqrt(Math.min(1, age / 2.4));
      this.fire.push(explosion.position, size * grow, Math.min(1, age / 2.8), explosion.seed, 0);
      this.position.set(
        Math.sin(explosion.seed * 40) * 0.5,
        0.35,
        Math.cos(explosion.seed * 40) * 0.5,
      );
      this.position.multiplyScalar(size).add(explosion.position);
      this.fire.push(
        this.position,
        size * grow * 0.7,
        Math.min(1, (age + 0.25) / 2.6),
        explosion.seed + 0.37,
        0,
      );

      const light = 140 * size * Math.exp(-age * 3.5);
      if (light > lightIntensity) {
        lightIntensity = light;
        this.light.position.copy(explosion.position);
        this.light.color.setRGB(1, 0.62, 0.32);
      }

      // Sparks: fast embers with drag.
      for (let spark = 0; spark < 10; spark += 1) {
        const direction =
          this.debrisDirections[(explosionIndex * 31 + spark * 7) % this.debrisDirections.length]!;
        const travel = (1 - Math.exp(-age * 2.2)) * 2.6;
        this.position.copy(explosion.position).addScaledVector(direction, travel);
        const k = Math.max(0, 1 - age / 1.4);
        if (k > 0) this.glows.push(this.position, 3.2 * k, 1.3 * k, 0.4 * k, 0.55);
      }

      // Debris: tumbling hull fragments that cool and dwindle.
      for (let piece = 0; piece < maxDebris; piece += 1) {
        const index = explosionIndex * DEBRIS_PER_EXPLOSION + piece;
        const velocity = this.debrisDirections[index]!;
        const spin = this.debrisSpin[index]!;
        const travel = (1 - Math.exp(-age * 0.9)) / 0.9;
        this.position.copy(explosion.position).addScaledVector(velocity, travel);
        this.quaternion.setFromAxisAngle(
          this.direction.copy(spin).normalize(),
          spin.length() * age,
        );
        const shrink = (0.5 + (piece % 3) * 0.35) * (1 - Math.max(0, life - 0.6) / 0.4);
        this.debris.setMatrixAt(
          debrisCount,
          this.matrix.compose(this.position, this.quaternion, this.scale.setScalar(shrink)),
        );
        debrisCount += 1;
      }
    });
    this.debris.count = debrisCount;
    this.debris.instanceMatrix.needsUpdate = true;
    this.light.intensity = lightIntensity;
  }

  private drawWarpFlash(explosion: Explosion, age: number): void {
    if (age < 0.5) {
      this.flashes.push(
        explosion.position,
        explosion.size * (1.2 + age * 2.5),
        age / 0.5,
        0,
        0,
        1.2,
        1.7,
        3.2,
      );
    }
    if (age < 1.2) {
      this.flashes.push(
        explosion.position,
        explosion.size * (1 + age * 7),
        age / 1.2,
        0,
        1,
        0.45,
        0.7,
        1.5,
      );
    }
  }
}
