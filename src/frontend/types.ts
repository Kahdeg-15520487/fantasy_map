/**
 * FicGeoRen — TypeScript port of the fictional map GeoJSON renderer.
 * 
 * Renders GeoJSON feature collections with a configurable theme.
 * Depends on D3.js v7 (loaded via CDN in the HTML shell).
 */

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

/** GeoJSON-compatible feature (FicGeoRen's looser format). */
export interface GeoFeature {
  type: string;
  id?: string;
  coordinates?: any;
  geometries?: any[];
  geometry?: any;
  properties?: Record<string, any>;
  name?: string;
  width?: number;
}

/** Top-level GeoJSON feature collection. */
export interface GeoCollection {
  type: string;
  features?: GeoFeature[];
}

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
