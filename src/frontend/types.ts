/**
 * FicGeoRen — TypeScript port of the fictional map GeoJSON renderer.
 *
 * Renders GeoJSON feature collections with a configurable theme.
 * Depends on D3.js v7 (loaded via CDN in the HTML shell).
 */

// ── GeoJSON primitives (loose FicGeoRen dialect) ────────────────

/** Coordinate pair [x, y]. */
export type Coord = [number, number];

/** Ring = closed array of coordinate pairs. */
export type Ring = Coord[];

/** Polygon = array of rings (outer + holes). */
export type Polygon = Ring[];

/** MultiPolygon = array of polygons. */
export type MultiPolygon = Polygon[];

/** Point = a single coordinate pair. */
export type Point = Coord;

/** MultiPoint = array of coordinate pairs. */
export type MultiPoint = Point[];

/** LineString = array of coordinate pairs. */
export type LineString = Coord[];

export type GeometryType =
  | 'Polygon'
  | 'MultiPolygon'
  | 'Point'
  | 'MultiPoint'
  | 'LineString'
  | 'GeometryCollection';

export type GeoGeometry =
  | { type: 'Polygon'; coordinates: Polygon; name?: string }
  | { type: 'MultiPolygon'; coordinates: MultiPolygon; name?: string }
  | { type: 'Point'; coordinates: Point; name?: string }
  | { type: 'MultiPoint'; coordinates: MultiPoint; name?: string }
  | { type: 'LineString'; coordinates: LineString; name?: string; width?: number }
  | GeoGeometryCollection;

export interface GeoGeometryCollection {
  type: 'GeometryCollection';
  geometries: GeoGeometry[];
  name?: string;
}

/** Discriminated union for feature types — improves type narrowing. */
export type FeatureType =
  | 'Polygon'
  | 'MultiPolygon'
  | 'Point'
  | 'MultiPoint'
  | 'LineString'
  | 'GeometryCollection'
  | 'Feature'
  | string; // fallback for non-standard types

/** A single feature — FicGeoRen's looser dialect allows `id` at top level. */
export interface GeoFeature {
  type: FeatureType;
  id?: string;
  coordinates?: MultiPolygon | Polygon | MultiPoint | LineString | Coord[];
  geometries?: GeoGeometry[];
  geometry?: GeoGeometry;
  properties?: Record<string, unknown>;
  name?: string;
  width?: number;
}

/** Top-level GeoJSON feature collection. */
export interface GeoCollection {
  type: string;
  features?: GeoFeature[];
}

// ── Theme & layer definitions ───────────────────────────────────

/** A single layer definition from the theme. */
export interface LayerDef {
  id: string;
  label: string;
  order: number;
  batch?: boolean;
  randomFill?: boolean;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  strokeLinejoin?: string;
  strokeLinecap?: string;
  opacity?: number;
  tooltipField?: string;
  widthScale?: number;
  radius?: number;
  wallMarkers?: boolean;
  innerWallDistrict?: string;
  markerRadius?: number;
  markerFill?: string;
}

/** A full theme descriptor. */
export interface Theme {
  title: string;
  generator?: string;
  boundsSource?: string | null;
  padding: number;
  layers: LayerDef[];
}

// ── Render options ──────────────────────────────────────────────

/** Render options passed to FicGeoRen.render(). */
export interface RenderOptions {
  geojson: GeoCollection;
  theme: Theme;
  container: string;
  svgSelector: string;
  legendSelector: string;
  tooltipSelector: string;
  togglesSelector: string;
}
