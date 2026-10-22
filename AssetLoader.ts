import { AudioLoader, TextureLoader, type Object3D, type Texture } from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { BASE_URL } from '../app/config';
import type { AssetEntry } from './AssetManifest';

export interface LoadingProgress {
  readonly completed: number;
  readonly total: number;
  readonly currentAsset: string;
}

type LoadedAsset = GLTF | Texture | AudioBuffer;

/** Loads only manifest-approved files; ownership transfers to the scene using each returned asset. */
export class AssetLoader {
  private readonly models = new GLTFLoader();
  private readonly textures = new TextureLoader();
  private readonly audio = new AudioLoader();
  private readonly loaded = new Map<string, LoadedAsset>();
  private readonly errors = new Map<string, Error>();

  public async loadAll(
    manifest: readonly AssetEntry[],
    onProgress?: (progress: LoadingProgress) => void,
  ): Promise<void> {
    const ids = new Set<string>();
    for (const entry of manifest) {
      if (ids.has(entry.id)) throw new Error(`Duplicate asset id "${entry.id}".`);
      ids.add(entry.id);
      if (!entry.path || entry.path.startsWith('/') || entry.path.split('/').includes('..')) {
        throw new Error(`Asset "${entry.id}" must use a safe, relative public/assets path.`);
      }
    }
    let completed = 0;
    const failures: string[] = [];
    await Promise.all(
      manifest.map(async (entry) => {
        try {
          const asset = await this.load(entry);
          this.loaded.set(entry.id, asset);
        } catch (cause) {
          const error = cause instanceof Error ? cause : new Error(String(cause));
          this.errors.set(entry.id, error);
          failures.push(`${entry.id}: ${error.message}`);
        } finally {
          completed += 1;
          onProgress?.({ completed, total: manifest.length, currentAsset: entry.id });
        }
      }),
    );
    if (failures.length > 0)
      throw new AggregateError(failures, `${failures.length} game asset(s) could not load.`);
  }

  public get<T extends LoadedAsset>(id: string): T {
    const error = this.errors.get(id);
    if (error) throw new Error(`Asset "${id}" failed to load: ${error.message}`, { cause: error });
    const asset = this.loaded.get(id);
    if (!asset)
      throw new Error(`Asset "${id}" is not loaded. Check the asset manifest and loading state.`);
    return asset as T;
  }

  public dispose(): void {
    for (const asset of this.loaded.values()) {
      if ('dispose' in asset && typeof asset.dispose === 'function') asset.dispose();
      else if ('scene' in asset) {
        asset.scene.traverse((object: Object3D) => {
          const mesh = object as typeof object & {
            geometry?: { dispose(): void };
            material?: unknown;
          };
          mesh.geometry?.dispose();
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const material of materials) {
            if (material && 'dispose' in material && typeof material.dispose === 'function')
              material.dispose();
          }
        });
      }
    }
    this.loaded.clear();
    this.errors.clear();
  }

  private load(entry: AssetEntry): Promise<LoadedAsset> {
    const base = `${BASE_URL}assets/`;
    const url = `${base}${entry.path.split('/').map(encodeURIComponent).join('/')}`;
    switch (entry.type) {
      case 'model':
        return this.models.loadAsync(url);
      case 'texture':
        return this.textures.loadAsync(url);
      case 'audio':
        return this.audio.loadAsync(url);
      case 'font':
        return Promise.reject(
          new Error(
            'Font parsing is not configured; supply a font loader before registering fonts.',
          ),
        );
    }
  }
}
