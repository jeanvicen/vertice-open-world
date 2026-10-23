import { Group } from 'three';

/** Owns one environment root. Streaming, gameplay entities and physics are future milestones. */
export class World {
  public readonly root = new Group();

  public dispose(): void {
    this.root.clear();
  }
}
