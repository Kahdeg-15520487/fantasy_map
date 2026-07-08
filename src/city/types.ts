/**
 * City (MFCG) type definitions
 */
export type CitySize = number;

export interface CityOptions {
  size?: CitySize;
  seed?: number;
  name?: string;
  citadel?: boolean;
  urbanCastle?: boolean;
  plaza?: boolean;
  temple?: boolean;
  walls?: boolean;
  shantytown?: boolean;
  river?: boolean;
  coast?: boolean;
  greens?: boolean;
  hub?: boolean;
  gates?: number;
  /** Sea/coast level — maps to coastDir on Blueprint */
  sea?: number;
}

export interface GeneratedCity {
  name: string;
  seed: number;
  size: number;
  options: CityOptions;
  exportJson(): Promise<string>;
  exportSvg(): Promise<string>;
  exportPng(): Promise<Buffer>;
}

export interface CityGenerator {
  generate(options?: CityOptions): Promise<GeneratedCity>;
}
