export type AssetType = 'model' | 'texture' | 'font' | 'audio';

export interface AssetEntry {
  readonly id: string;
  readonly type: AssetType;
  /** Path relative to public/assets/; never root-relative. */
  readonly path: string;
}

/** This first milestone ships no authored files: register an asset only after supplying it. */
export const ASSET_MANIFEST: readonly AssetEntry[] = [];
