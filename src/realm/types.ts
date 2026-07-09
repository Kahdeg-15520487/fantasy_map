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
  /**
   * Whether to draw the decorative parchment "matte" border/frame around
   * the map (com.watabou.perilous.mapping.MapView's matte sprite). Defaults
   * to false (borderless) — this generator's default differs from the
   * original app's default (true), since exported maps are meant to be
   * borderless for the frontend by default. Set to true to include the
   * parchment border/frame.
   */
  showMatte?: boolean;
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
  /**
   * Returns the EXACT rendered bounding box (same coordinate space as
   * `region.islands[i].towns[j].cell.center`) of a town's icon sprite,
   * captured live from the Haxe/OpenFL object graph during rendering. Pass
   * one of the town model objects from `region.islands[i].towns[j]`.
   * Returns null if the icon sprite wasn't captured (e.g. town mode isn't
   * "icon", or the sprite has no renderable bounds).
   */
  getTownIconBounds(town: any): { x: number; y: number; width: number; height: number } | null;
  exportJson(): Promise<string>;
  exportSvg(): Promise<string>;
  exportPng(): Promise<Buffer>;
}

export interface RealmGenerator {
  generate(options?: RealmOptions): Promise<GeneratedRealm>;
}
