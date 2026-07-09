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
  /**
   * The live Haxe `Region` model instance (com.watabou.perilous.model.Region).
   * Exposed so callers can read precise pixel geometry directly (e.g.
   * `region.islands[i].towns[j].cell.center` + `.getOffset()`) instead of
   * reverse-engineering positions from the exported SVG/JSON, which only
   * approximates icon placement via label text coordinates.
   */
  region: any;
  exportJson(): Promise<string>;
  exportSvg(): Promise<string>;
  exportPng(): Promise<Buffer>;
}

export interface RealmGenerator {
  generate(options?: RealmOptions): Promise<GeneratedRealm>;
}
