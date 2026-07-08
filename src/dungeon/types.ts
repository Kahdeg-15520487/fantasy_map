/**
 * One Page Dungeon type definitions
 */
export interface DungeonOptions {
  seed?: number;
}

export interface GeneratedDungeon {
  name: string;
  seed: number;
  options: DungeonOptions;
  exportJson(): Promise<string>;
  exportSvg(): Promise<string>;
  exportPng(): Promise<Buffer>;
}

export interface DungeonGenerator {
  generate(options?: DungeonOptions): Promise<GeneratedDungeon>;
}
