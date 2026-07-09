/**
 * Village Generator type definitions
 */
export interface VillageOptions {
  seed?: number;
  tags?: string;
  name?: string;
}

export interface GeneratedVillage {
  name: string;
  seed: number;
  options: VillageOptions;
  exportJson(): Promise<string>;
  exportSvg(): Promise<string>;
  exportPng(): Promise<Buffer>;
}

export interface VillageGenerator {
  generate(options?: VillageOptions): Promise<GeneratedVillage>;
}
