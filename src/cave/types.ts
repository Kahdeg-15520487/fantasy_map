/**
 * Cave Generator type definitions
 */
export interface CaveOptions {
  seed?: number;
  tags?: string;
  name?: string;
  glade?: boolean;
}

export interface GeneratedCave {
  name: string;
  seed: number;
  options: CaveOptions;
  exportJson(): Promise<string>;
  exportSvg(): Promise<string>;
  exportPng(): Promise<Buffer>;
}

export interface CaveGenerator {
  generate(options?: CaveOptions): Promise<GeneratedCave>;
}
