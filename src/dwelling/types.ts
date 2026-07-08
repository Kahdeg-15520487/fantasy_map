/**
 * Dwellings type definitions
 * Supports multi-floor output
 */
export interface DwellingOptions {
  seed?: number;
  tags?: string;
  floors?: number;
}

export interface GeneratedDwelling {
  name: string;
  seed: number;
  floors: number;
  options: DwellingOptions;
  exportJson(): Promise<string>;
  exportSvg(floor?: number): Promise<string>;
  exportPng(floor?: number): Promise<Buffer>;
  /** Export all floors as separate SVGs */
  exportAllFloorsSvg(): Promise<string[]>;
}

export interface DwellingGenerator {
  generate(options?: DwellingOptions): Promise<GeneratedDwelling>;
}
