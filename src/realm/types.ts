/**
 * Realm (Perilous Shores) type definitions
 */
export interface RealmOptions {
  seed?: number;
  tags?: string;
  width?: number;
  height?: number;
  name?: string;
  hexes?: number;
}

export interface GeneratedRealm {
  name: string;
  seed: number;
  width: number;
  height: number;
  options: RealmOptions;
  exportJson(): Promise<string>;
  exportSvg(): Promise<string>;
  exportPng(): Promise<Buffer>;
}

export interface RealmGenerator {
  generate(options?: RealmOptions): Promise<GeneratedRealm>;
}
