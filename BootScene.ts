import {
  type BufferGeometry,
  Color,
  Fog,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene as ThreeScene,
  Vector3,
  type WebGLRenderer,
} from 'three';
import type { Scene } from './Scene';
import type { SceneContext } from './SceneManager';
import type { InputSystem } from '../systems/InputSystem';
import { buildEnvironment } from '../world/Environment';
import { World } from '../world/World';

const WALK_SPEED = 5;
const LOOK_SENSITIVITY = 0.0022;
const PITCH_LIMIT = Math.PI * 0.37;

export class BootScene implements Scene {
  public readonly threeScene = new ThreeScene();
  public readonly camera = new PerspectiveCamera(55, 1, 0.1, 400);
  private readonly world = new World();
  private readonly ownedGeometries = new Set<BufferGeometry>();
  private readonly ownedMaterials = new Set<MeshStandardMaterial>();
  private readonly input: InputSystem;
  private readonly cameraDirection = new Vector3();
  private yaw = -0.08;
  private pitch = -0.12;
  private exited = false;

  public constructor(_context: SceneContext, input: InputSystem) {
    this.input = input;
    this.threeScene.background = new Color('#938e7e');
    this.threeScene.fog = new Fog('#938e7e', 38, 165);
    this.camera.position.set(0, 3.2, 13);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(this.pitch, this.yaw, 0);
    this.buildEnvironment();
  }

  public enter(): void {
    this.exited = false;
  }

  public resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  public update(deltaSeconds: number): void {
    if (this.exited) return;
    const look = this.input.consumeLookDelta();
    this.yaw -= look.x * LOOK_SENSITIVITY;
    this.pitch = Math.max(
      -PITCH_LIMIT,
      Math.min(PITCH_LIMIT, this.pitch - look.y * LOOK_SENSITIVITY),
    );
    this.camera.rotation.set(this.pitch, this.yaw, 0);
    const movement = this.input.getMovement();
    if (movement.x === 0 && movement.z === 0) return;
    this.cameraDirection.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new Vector3(-this.cameraDirection.z, 0, this.cameraDirection.x);
    this.camera.position.addScaledVector(
      this.cameraDirection,
      movement.z * WALK_SPEED * deltaSeconds,
    );
    this.camera.position.addScaledVector(right, movement.x * WALK_SPEED * deltaSeconds);
    this.camera.position.x = Math.max(-26, Math.min(26, this.camera.position.x));
    this.camera.position.z = Math.max(-30, Math.min(20, this.camera.position.z));
  }

  public render(renderer: WebGLRenderer): void {
    if (!this.exited) renderer.render(this.threeScene, this.camera);
  }

  public exit(): void {
    if (this.exited) return;
    this.exited = true;
    this.threeScene.remove(this.world.root);
    for (const geometry of this.ownedGeometries) geometry.dispose();
    for (const material of this.ownedMaterials) material.dispose();
    this.ownedGeometries.clear();
    this.ownedMaterials.clear();
    this.world.dispose();
  }

  private buildEnvironment(): void {
    const groundGeometry = new PlaneGeometry(260, 260);
    const groundMaterial = new MeshStandardMaterial({
      color: '#aaa28d',
      roughness: 0.94,
      metalness: 0.02,
    });
    this.ownedGeometries.add(groundGeometry);
    this.ownedMaterials.add(groundMaterial);
    const ground = new Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.15;
    ground.receiveShadow = true;
    this.world.root.add(ground);
    const placeholder = new Group();
    buildEnvironment(this.threeScene, placeholder, this.ownedGeometries, this.ownedMaterials);
    this.world.root.add(placeholder);
    this.threeScene.add(this.world.root);
  }
}
