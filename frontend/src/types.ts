// ── GeoJSON primitives ──────────────────────────────────────────

export type Coord = [number, number]
export type Ring = Coord[]
export type Polygon = Ring[]
export type MultiPolygon = Polygon[]

export interface GeoGeometryCollection {
  type: 'GeometryCollection'
  geometries: GeoGeometry[]
  name?: string
}

export type GeoGeometry =
  | { type: 'Polygon'; coordinates: Polygon; name?: string }
  | { type: 'MultiPolygon'; coordinates: MultiPolygon; name?: string }
  | { type: 'Point'; coordinates: Coord; name?: string }
  | { type: 'MultiPoint'; coordinates: Coord[]; name?: string }
  | { type: 'LineString'; coordinates: Coord[]; name?: string; width?: number }
  | GeoGeometryCollection

export interface GeoFeature {
  type: string
  id?: string
  coordinates?: MultiPolygon | Polygon | Coord[] | Coord[][]
  geometries?: GeoGeometry[]
  geometry?: GeoGeometry
  properties?: Record<string, unknown>
  name?: string
  width?: number
}

export interface GeoCollection {
  type: string
  features?: GeoFeature[]
}

// ── Theme ───────────────────────────────────────────────────────

export interface LayerDef {
  id: string
  label: string
  order: number
  batch?: boolean
  randomFill?: boolean
  fill?: string
  stroke?: string
  strokeWidth?: number
  strokeLinejoin?: string
  strokeLinecap?: string
  opacity?: number
  tooltipField?: string
  widthScale?: number
  radius?: number
  wallMarkers?: boolean
  innerWallDistrict?: string
  markerRadius?: number
  markerFill?: string
}

export interface Theme {
  title: string
  generator?: string
  boundsSource?: string | null
  padding: number
  layers: LayerDef[]
}

// ── Towns ───────────────────────────────────────────────────────

export interface TownMarker {
  q: number
  r: number
  x: number
  y: number
  name: string
  type: 'village' | 'town' | 'city'
  seed: number
  file: string
}
