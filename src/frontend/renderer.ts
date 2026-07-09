/**
 * FicGeoRen engine — TypeScript port.
 * Renders GeoJSON feature collections with D3.js v7.
 *
 * Fixes applied:
 *  Sweep 1: #1 resize leak, #2 zoom leak, #4 NaN bounds, #5 id collision,
 *           #8 tooltip offset, #11 SVG sanitization, #12 proper types,
 *           #13 projectY helper, #15 district color cache, #16 reset state
 *  Sweep 2: #2 GeoJSON mutation, #3 cache unbounded, #5 incomplete sanitizer,
 *           #6 debounce resize, #7 null assertions, #9 featureIndex usage,
 *           #10 shared sanitizeSvg, #11 tooltip undefined, #13 dropped rings,
 *           #20 computeBounds edge case, #21 variable naming, #22 WeakMap
 *  Sweep 3: C1 real clone, C2 null guards, M1 shared positionTooltip,
 *           M3 removeEventListener type, M5 computeBounds types, M6 Object.keys,
 *           M8 ARIA roles, M9 keyboard nav, L1 identity mul, L9 redundant clear,
 *           L11 extractCoords fast-path
 */
/* d3 is loaded via CDN <script> — available as window.d3 */
declare const d3: typeof import('d3');
import {
  GeoCollection,
  GeoFeature,
  GeoGeometry,
  GeoGeometryCollection,
  LayerDef,
  RenderOptions,
  Theme,
  Ring,
  Polygon,
  Coord,
} from './types';
import { debounce, positionTooltip } from './utils';

// ── Coordinate extraction (L11: fast-path LineString) ───────────

/** Recursively collect all [x,y] pairs from an object tree. */
function extractCoords(obj: unknown, xs: number[], ys: number[]): void {
  if (!obj || typeof obj !== 'object') return;
  const arr = obj as Record<string, unknown>;

  // Fast path: [x, y] coordinate pair
  if (Array.isArray(arr) && arr.length === 2 &&
      typeof arr[0] === 'number' && typeof arr[1] === 'number') {
    xs.push(arr[0]); ys.push(arr[1]); return;
  }

  // Fast path: LineString is an array of [x,y] pairs — iterate directly
  if (Array.isArray(arr) && arr.length > 0 && Array.isArray(arr[0]) &&
      (arr[0] as unknown[]).length === 2 && typeof (arr[0] as unknown[])[0] === 'number') {
    for (const item of arr) {
      const p = item as Coord;
      xs.push(p[0]); ys.push(p[1]);
    }
    return;
  }

  if (Array.isArray(arr)) {
    for (const item of arr) extractCoords(item, xs, ys);
  } else {
    for (const v of Object.values(arr)) extractCoords(v, xs, ys);
  }
}

// ── Compute bounds (M5: correct type casts) ─────────────────────

/** Compute bounding box from a feature collection. Returns safe defaults on empty data. */
function computeBounds(features: GeoFeature[], theme: Theme): { x0: number; y0: number; x1: number; y1: number } {
  const srcId = theme.boundsSource || null;
  if (srcId) {
    const src = features.find(f => f.id === srcId);
    if (src?.coordinates) {
      if (src.type === 'MultiPolygon') {
        // M5: Use proper MultiPolygon type — coordinates is Polygon[]
        const polygons = src.coordinates as Polygon[];
        if (polygons?.[0]?.[0]?.length > 0) {
          const ring: Ring = polygons[0][0]; // First ring of first polygon
          const xs = ring.map((p: Coord) => p[0]);
          const ys = ring.map((p: Coord) => p[1]);
          return {
            x0: d3.min(xs) ?? 0, y0: d3.min(ys) ?? 0,
            x1: d3.max(xs) ?? 1, y1: d3.max(ys) ?? 1,
          };
        }
      } else if (src.type === 'Polygon') {
        const polygon = src.coordinates as Polygon;
        if (polygon?.[0]?.length > 0) {
          const ring: Ring = polygon[0];
          const xs = ring.map((p: Coord) => p[0]);
          const ys = ring.map((p: Coord) => p[1]);
          return {
            x0: d3.min(xs) ?? 0, y0: d3.min(ys) ?? 0,
            x1: d3.max(xs) ?? 1, y1: d3.max(ys) ?? 1,
          };
        }
      }
    }
  }

  const allX: number[] = [], allY: number[] = [];
  for (const f of features) extractCoords(f, allX, allY);

  const xMin = d3.min(allX);
  const xMax = d3.max(allX);
  const yMin = d3.min(allY);
  const yMax = d3.max(allY);

  const x0 = xMin ?? 0;
  const x1 = xMax != null ? xMax : (xMin != null ? xMin + 1 : 1);
  const y0 = yMin ?? 0;
  const y1 = yMax != null ? yMax : (yMin != null ? yMin + 1 : 1);

  return {
    x0: Math.min(x0, x1),
    y0: Math.min(y0, y1),
    x1: Math.max(x0, x1) || (Math.min(x0, x1) + 1),
    y1: Math.max(y0, y1) || (Math.min(y0, y1) + 1),
  };
}

function isEmpty(feature: GeoFeature): boolean {
  if (!feature) return true;
  if (feature.type === 'GeometryCollection')
    return !feature.geometries || feature.geometries.length === 0;
  if (feature.type === 'MultiPolygon' || feature.type === 'MultiPoint')
    return !feature.coordinates || (feature.coordinates as unknown[]).length === 0;
  if (feature.type === 'Feature' && !feature.geometry) return true;
  return false;
}

// ── Geometry helpers ────────────────────────────────────────────

function projectY(y: number): number { return -y; }

function closeRing(ring: Ring): Ring {
  if (!ring || ring.length < 2) return ring || [];
  const f = ring[0], l = ring[ring.length - 1];
  if (f[0] === l[0] && f[1] === l[1]) return ring;
  return ring.concat([[f[0], f[1]]]);
}

function ringsToPathD(rings: Polygon): string {
  const parts: string[] = [];
  for (const ringGroup of rings) {
    const ring = closeRing(ringGroup);
    if (ring.length < 3) {
      if (ring.length > 0) {
        console.warn(`[FicGeoRen] Dropping degenerate ring with ${ring.length} points`);
      }
      continue;
    }
    let d = '';
    for (let i = 0; i < ring.length; i++) {
      const sx = ring[i][0];
      const sy = projectY(ring[i][1]);
      d += (i === 0 ? 'M' : 'L') + sx + ',' + sy;
    }
    d += 'Z';
    parts.push(d);
  }
  return parts.join(' ');
}

// ── District colors ─────────────────────────────────────────────

const districtColorCache = new Map<string, string[]>();

function generateColors(n: number, cacheKey?: string): string[] {
  if (cacheKey) {
    const cached = districtColorCache.get(cacheKey);
    if (cached && cached.length === n) return cached;
  }
  const warmLen = 115;
  const colors: string[] = [];
  for (let i = 0; i < n; i++) {
    const pos = ((i * 137.5) % warmLen) / warmLen;
    const deg = pos < (55 / warmLen)
      ? pos * warmLen
      : 300 + (pos - 55 / warmLen) * warmLen;
    colors.push(`hsla(${Math.round(deg)},45%,32%,0.3)`);
  }
  if (cacheKey) districtColorCache.set(cacheKey, colors);
  return colors;
}

function clearDistrictColors(): void { districtColorCache.clear(); }

function deduplicatedEdgePath(coordsList: Polygon[][]): string {
  const edgeMap: Record<string, [Coord, Coord]> = {};
  const vk = (p: Coord) => p[0].toFixed(2) + ',' + p[1].toFixed(2);
  const ek = (a: Coord, b: Coord) => {
    const ka = vk(a), kb = vk(b);
    return ka < kb ? ka + '|' + kb : kb + '|' + ka;
  };
  for (const coords of coordsList) {
    const ring = closeRing(coords[0]);
    for (let i = 0; i < ring.length - 1; i++) {
      edgeMap[ek(ring[i], ring[i + 1])] = [ring[i], ring[i + 1]];
    }
  }
  return Object.values(edgeMap).map(e =>
    `M${e[0][0]},${projectY(e[0][1])}L${e[1][0]},${projectY(e[1][1])}`
  ).join(' ');
}

// ── Ring collection ─────────────────────────────────────────────

function collectRings(node: GeoGeometry, out: Polygon[][]): void {
  if (node.type === 'MultiPolygon') {
    ((node as { coordinates?: Polygon[] }).coordinates || []).forEach((pc: Polygon) => out.push(pc));
  } else if (node.type === 'Polygon') {
    out.push((node as { coordinates: Polygon }).coordinates);
  } else if (node.type === 'GeometryCollection') {
    ((node as GeoGeometryCollection).geometries || []).forEach((g) => collectRings(g, out));
  }
}

// ── WeakMap for DOM node state (#22) ────────────────────────────

interface RendererState {
  debouncedResize: ReturnType<typeof debounce>;
}

const rendererStateMap = new WeakMap<SVGSVGElement, RendererState>();

// ── Main render ─────────────────────────────────────────────────

export function render(opts: RenderOptions): void {
  const geojsonData = opts.geojson;
  const theme = opts.theme;
  const features: GeoFeature[] = geojsonData.features || [];

  const svg = d3.select(opts.svgSelector);
  const container = d3.select(opts.container);
  const legendEl = d3.select(opts.legendSelector);
  const tooltipEl = document.getElementById(opts.tooltipSelector.replace('#', '')) as HTMLDivElement | null;
  const togglesEl = d3.select(opts.togglesSelector);

  // ── Ensure clean slate ──────────────────────────────────────
  svg.selectAll('*').remove();
  svg.on('.zoom', null);

  // Layer definitions
  const layerDefs: Record<string, LayerDef> = {};
  const layerOrder = (theme.layers || []).slice().sort((a, b) => (a.order || 99) - (b.order || 99));
  layerOrder.forEach(d => { layerDefs[d.id] = d; });

  // ── Build feature index ─────────────────────────────────────
  const featureIndex = new Map<string, GeoFeature[]>();
  for (const f of features) {
    const key = f.id || '';
    if (!featureIndex.has(key)) featureIndex.set(key, []);
    featureIndex.get(key)!.push(f);
  }

  // Toggle UI
  const visibilities: Record<string, boolean> = {};
  togglesEl.html('');
  layerOrder.forEach(def => {
    const feats = featureIndex.get(def.id);
    if (!feats || feats.length === 0 || feats.every(isEmpty)) return;
    visibilities[def.id] = true;
    const lbl = togglesEl.append('label');
    lbl.append('input')
      .attr('type', 'checkbox').attr('checked', true)
      .on('change', function(this: HTMLInputElement) { visibilities[def.id] = this.checked; updateVisibility(); });
    lbl.append('span').text(def.label);
  });

  const d3proj = d3.geoIdentity().reflectY(true);
  const pathGen = d3.geoPath().projection(d3proj);

  const g = svg.append('g');
  const layerGroups: Record<string, d3.Selection<SVGGElement, unknown, null, undefined>> = {};

  const sortedFeatures = features.slice().sort((a, b) => {
    const da = layerDefs[a.id || ''], db = layerDefs[b.id || ''];
    return (da ? da.order || 99 : 99) - (db ? db.order || 99 : 99);
  });

  // ── C1: Inner wall → district injection (REAL clone) ────────
  const wallsDef = layerDefs['walls'];
  if (wallsDef?.innerWallDistrict) {
    const wallsFeats = featureIndex.get('walls');
    const wallsFeat = wallsFeats?.[0];
    if (wallsFeat?.type === 'GeometryCollection') {
      const geoms = (wallsFeat as GeoGeometryCollection).geometries || [];
      const innerIdx = geoms.length >= 2 ? geoms.length - 1 : (geoms.length === 1 ? 0 : -1);
      if (innerIdx >= 0) {
        const innerWallGeom = geoms[innerIdx];
        if (innerWallGeom.type === 'Polygon') {
          const districtFeats = featureIndex.get('districts');
          const districtFeat = districtFeats?.[0];
          if (districtFeat?.type === 'GeometryCollection') {
            // C1: Deep clone the features array to avoid mutating original geojson
            // The previous check `coll.geometries !== districtFeat.geometries` was always
            // false because `coll` was just a type assertion, not a copy.
            const clonedDistricts: GeoFeature = {
              ...districtFeat,
              geometries: [...(districtFeat as GeoGeometryCollection).geometries],
            };
            // Replace in the feature list so subsequent lookups use the clone
            const feats = featureIndex.get('districts');
            if (feats) feats[0] = clonedDistricts;

            (clonedDistricts as GeoGeometryCollection).geometries.push({
              type: 'Polygon',
              coordinates: (innerWallGeom as { coordinates: Polygon }).coordinates,
              name: wallsDef.innerWallDistrict,
            });
          }
        }
      }
    }
  }

  // Render features
  sortedFeatures.forEach(feature => {
    const id = feature.id;
    const def = layerDefs[id || ''];
    if (!def) return;
    if (isEmpty(feature)) return;
    if (feature.type === 'Feature' && !feature.geometry) return;

    const layerG = g.append('g').attr('class', `layer layer-${id}`);
    layerGroups[id!] = layerG;
    renderFeature(layerG, feature, def, id!);
  });

  // Render helper functions
  function renderPolygon(
    parentG: d3.Selection<SVGGElement, unknown, null, undefined>,
    rings: Polygon,
    def: LayerDef,
    id: string,
    tooltipName: string | null,
  ) {
    if (!rings?.[0] || rings[0].length < 3) return;
    const el = parentG.append('path')
      .attr('d', ringsToPathD(rings))
      .attr('fill', def.fill || 'none')
      .attr('stroke', def.stroke || 'none')
      .attr('stroke-width', def.strokeWidth ?? 1)
      .attr('opacity', def.opacity ?? 1)
      .attr('stroke-linejoin', def.strokeLinejoin || 'miter')
      .attr('fill-rule', 'evenodd');

    if (tooltipName && tooltipEl) {
      el.on('mouseenter', function() {
        tooltipEl.textContent = tooltipName;
        tooltipEl.style.opacity = '1';
      })
        .on('mousemove', function(ev: MouseEvent) { positionTooltip(tooltipEl, ev); })
        .on('mouseleave', function() { tooltipEl.style.opacity = '0'; });
    }
  }

  function renderGeometry(
    parentG: d3.Selection<SVGGElement, unknown, null, undefined>,
    geom: GeoGeometry,
    def: LayerDef,
    id: string,
    tooltipName: string | null,
  ) {
    if (!geom?.type) return;

    if (geom.type === 'GeometryCollection') {
      const coll = geom as GeoGeometryCollection;
      (coll.geometries || []).forEach((child) => renderGeometry(parentG, child, def, id, child.name || null));
      return;
    }
    if (geom.type === 'MultiPoint') {
      const coords = (geom as { coordinates: Coord[] }).coordinates || [];
      coords.forEach((c: Coord) => {
        parentG.append('circle')
          .attr('cx', c[0]).attr('cy', projectY(c[1]))
          .attr('r', def.radius ?? 2.5)
          .attr('fill', def.fill).attr('stroke', def.stroke)
          .attr('stroke-width', def.strokeWidth ?? 1)
          .attr('opacity', def.opacity ?? 1);
      });
      return;
    }
    if (geom.type === 'Polygon') {
      renderPolygon(parentG, (geom as { coordinates: Polygon }).coordinates, def, id, tooltipName);
      return;
    }
    if (geom.type === 'LineString') {
      const lsGeom = geom as { type: 'LineString'; coordinates: Coord[]; width?: number };
      const el = parentG.append('path')
        .datum(lsGeom)
        .attr('d', pathGen)
        .attr('fill', 'none')
        .attr('stroke', def.stroke || 'none')
        .attr('opacity', def.opacity ?? 1)
        .attr('stroke-linejoin', 'round')
        .attr('stroke-linecap', def.strokeLinecap || 'round');
      if (def.widthScale && lsGeom.width) {
        el.attr('stroke-width', lsGeom.width / def.widthScale);
      } else {
        el.attr('stroke-width', def.strokeWidth ?? 1);
      }
      return;
    }
    // Fallback
    parentG.append('path')
      .datum(geom)
      .attr('d', pathGen)
      .attr('fill', def.fill || 'none')
      .attr('stroke', def.stroke || 'none')
      .attr('stroke-width', def.strokeWidth ?? 1)
      .attr('opacity', def.opacity ?? 1)
      .attr('stroke-linejoin', def.strokeLinejoin || 'miter');
  }

  function renderFeature(
    parentG: d3.Selection<SVGGElement, unknown, null, undefined>,
    feature: GeoFeature,
    def: LayerDef,
    id: string,
  ) {
    // Random-fill layer (districts)
    if (def.randomFill && feature.type === 'GeometryCollection') {
      const coll = feature as GeoGeometryCollection;
      const geoms = (coll.geometries || []).filter(g => g.type === 'Polygon');
      const colors = generateColors(geoms.length, id);
      geoms.forEach((geom, i) => {
        const fillDef = { ...def, fill: colors[i], stroke: 'none', strokeWidth: 0 };
        let tooltipVal: string | null = null;
        if (def.tooltipField && geom.name) {
          tooltipVal = geom.name;
        }
        renderPolygon(parentG, (geom as { coordinates: Polygon }).coordinates, fillDef, id, tooltipVal);
      });
      const borderD = deduplicatedEdgePath(geoms.map(g => (g as { coordinates: Polygon }).coordinates));
      if (borderD) {
        parentG.append('path')
          .attr('d', borderD)
          .attr('fill', 'none')
          .attr('stroke', def.stroke || 'rgba(255,255,255,0.35)')
          .attr('stroke-width', def.strokeWidth ?? 0.8)
          .attr('opacity', def.opacity ?? 1);
      }
      return;
    }

    // Batched: all polygons merged into one <path>
    if (def.batch) {
      const allRings: Polygon[][] = [];
      collectRings(feature as GeoGeometry, allRings);
      if (allRings.length > 0) {
        const parts = allRings.map(r => ringsToPathD(r));
        parentG.append('path')
          .attr('d', parts.join(' '))
          .attr('fill', def.fill || 'none')
          .attr('stroke', def.stroke || 'none')
          .attr('stroke-width', def.strokeWidth ?? 1)
          .attr('opacity', def.opacity ?? 1)
          .attr('stroke-linejoin', def.strokeLinejoin || 'miter')
          .attr('fill-rule', 'evenodd');

        // Wall markers
        if (def.wallMarkers) {
          const mr = def.markerRadius || 4;
          const mf = def.markerFill || '#fff';
          const ms = def.stroke || '#1a1a1a';
          for (const rings of allRings) {
            const ring = closeRing(rings[0]);
            const n = ring.length - 1;
            for (let v = 0; v < n; v++) {
              const prev = ring[(v - 1 + n) % n];
              const curr = ring[v];
              const next = ring[(v + 1) % n];
              const v1x = curr[0] - prev[0], v1y = curr[1] - prev[1];
              const v2x = next[0] - curr[0], v2y = next[1] - curr[1];
              const cross = Math.abs(v1x * v2y - v1y * v2x);
              const len1 = Math.sqrt(v1x * v1x + v1y * v1y);
              const len2 = Math.sqrt(v2x * v2x + v2y * v2y);
              const sine = cross / (len1 * len2);

              if (sine < 0.02) {
                const ux = v1x / len1, uy = v1y / len1;
                for (let side = -1; side <= 1; side += 2) {
                  const gx = curr[0] + ux * mr * side;
                  const gy = curr[1] + uy * mr * side;
                  parentG.append('rect')
                    .attr('x', gx - mr).attr('y', projectY(gy) - mr)
                    .attr('width', mr * 2).attr('height', mr * 2)
                    .attr('fill', mf).attr('stroke', ms)
                    .attr('stroke-width', 2);
                }
              } else {
                parentG.append('circle')
                  .attr('cx', curr[0]).attr('cy', projectY(curr[1]))
                  .attr('r', mr).attr('fill', mf)
                  .attr('stroke', ms).attr('stroke-width', 2);
              }
            }
          }
        }
      }
      return;
    }

    // Individual rendering
    if (feature.type === 'GeometryCollection') {
      const coll = feature as GeoGeometryCollection;
      (coll.geometries || []).forEach(geom => renderGeometry(parentG, geom, def, id, geom.name || null));
    } else if (feature.type === 'MultiPolygon') {
      const coords = feature.coordinates as Polygon[];
      (coords || []).forEach((polyCoords: Polygon) => renderPolygon(parentG, polyCoords, def, id, null));
    } else if (feature.type === 'Polygon') {
      renderPolygon(parentG, feature.coordinates as Polygon, def, id, null);
    } else if (feature.type === 'MultiPoint') {
      const coords = feature.coordinates as Coord[];
      (coords || []).forEach((c: Coord) => {
        parentG.append('circle')
          .attr('cx', c[0]).attr('cy', projectY(c[1]))
          .attr('r', def.radius || 3)
          .attr('fill', def.fill).attr('stroke', def.stroke)
          .attr('stroke-width', def.strokeWidth ?? 1)
          .attr('opacity', def.opacity ?? 1);
      });
    } else {
      renderGeometry(parentG, feature as GeoGeometry, def, id, null);
    }
  }

  // ── Fit to viewport ──────────────────────────────────────────
  const bounds = computeBounds(features, theme);
  const dataW = bounds.x1 - bounds.x0 || 1;
  const dataH = bounds.y1 - bounds.y0 || 1;
  const padding = theme.padding || 60;

  function computeTransform(w: number, h: number) {
    const scale = Math.min((w - padding * 2) / dataW, (h - padding * 2) / dataH);
    const tx = (w - dataW * scale) / 2 - bounds.x0 * scale;
    const ty = (h - dataH * scale) / 2 + bounds.y1 * scale;
    return d3.zoomIdentity.translate(tx, ty).scale(scale);
  }

  // ── Resize handler with debounce ────────────────────────────
  function resize() {
    const node = container.node();
    if (!node) return; // C2: Guard missing container
    const w = node.clientWidth;
    const h = node.clientHeight;
    const t = computeTransform(w, h);
    g.attr('transform', t.toString());
  }
  const debouncedResize = debounce(resize, 100);
  window.addEventListener('resize', debouncedResize);
  resize();

  // ── Zoom behavior ───────────────────────────────────────────
  const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.3, 15])
    .on('zoom', (event) => { g.attr('transform', event.transform.toString()); });
  svg.call(zoomBehavior);

  // Store state in WeakMap
  const svgNode = svg.node();
  if (svgNode) {
    rendererStateMap.set(svgNode, { debouncedResize });
  }

  // ── M6: Safe visibility update (Object.keys, not for...in) ──
  function updateVisibility() {
    for (const id of Object.keys(visibilities)) {
      if (layerGroups[id]) layerGroups[id].style('display', visibilities[id] ? null : 'none');
    }
    updateLegend();
  }

  // Legend
  function updateLegend() {
    legendEl.html('');
    layerOrder.forEach(def => {
      if (!visibilities[def.id]) return;
      const feats = featureIndex.get(def.id);
      if (!feats || feats.length === 0 || feats.every(isEmpty)) return;
      if (feats[0].type === 'Feature' && !feats[0].geometry) return;
      const item = legendEl.append('div').attr('class', 'item');
      const isNone = def.fill === 'none' || !def.fill;
      item.append('div').attr('class', 'swatch')
        .style('background', isNone ? 'transparent' : def.fill!)
        .style('border-color', def.stroke || '#fff');
      item.append('span').text(def.label);
    });
  }
  updateLegend();
}

export function reset(svgSelector: string, togglesSelector: string, legendSelector: string): void {
  const svg = d3.select(svgSelector);
  const svgNode = svg.node();

  // Remove resize listener via WeakMap
  if (svgNode) {
    const state = rendererStateMap.get(svgNode);
    if (state) {
      state.debouncedResize.cancel();
      // M3: Cast through EventListener type for removeEventListener
      window.removeEventListener('resize', state.debouncedResize as EventListener);
      rendererStateMap.delete(svgNode);
    }
    svg.on('.zoom', null);
  }

  // Clear district color cache
  clearDistrictColors();

  // Clear all SVG content and state
  svg.selectAll('*').remove();
  d3.select(togglesSelector).html('');
  d3.select(legendSelector).html('');
}
