export interface Disposable {
  dispose(): void;
}

/** Collects the GPU resources one owner creates so they are released together. */
export class ResourceTracker {
  private readonly resources = new Set<Disposable>();

  public track<T extends Disposable>(resource: T): T {
    this.resources.add(resource);
    return resource;
  }

  public dispose(): void {
    for (const resource of this.resources) resource.dispose();
    this.resources.clear();
  }
}
