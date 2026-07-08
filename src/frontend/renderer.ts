/**
 * FicGeoRen engine — TypeScript port.
 * Renders GeoJSON feature collections with D3.js v7.
 */
import * as d3 from 'd3';
import { GeoCollection, GeoFeature, LayerDef, RenderOptions, Theme } from './types';

// ── Coordinate extraction ──────────────────────────────────────

/** Recursively collect all [x,y] pairs from an object tree. */
function extractCoords(obj: any, xs: number[], ys: number[]): void {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj) && obj.length === 2 &&
      typeof obj[0] === 'number' && typeof obj[1] === 'number') {
    xs.push(obj[0]); ys.push(obj[1]); return;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) extractCoords(item, xs, ys);
  } else {
    for (const v of Object.values(obj)) extractCoords(v, xs, ys);
  }
}

/** Compute bounding box from a feature collection. */
function computeBounds(features: GeoFeature[], theme: Theme) {
  const srcId = theme.boundsSource || null;
  if (srcId) {
    const src = features.find(f => f.id === srcId);
    if (src?.coordinates) {
      const ring = src.type === 'MultiPolygon'
        ? d3.merge(src.coordinates.map((p: number[][]) => p[0]))
        : src.coordinates[0];
      if (ring) {
        const xs = ring.map((p: number[]) => p[0]);
        const ys = ring.map((p: number[]) => p[1]);
        return { x0: d3.min(xs)!, y0: d3.min(ys)!, x1: d3.max(xs)!, y1: d3.max(ys)! };
      }
    }
  }
  const allX: number[] = [], allY: number[] = [];
  for (const f of features) extractCoords(f, allX, allY);
  return { x0: d3.min(allX)!, y0: d3.min(allY)!, x1: d3.max(allX)!, y1: d3.max(allY)! };
}

function isEmpty(feature: GeoFeature): boolean {
  if (!feature) return true;
  if (feature.type === 'GeometryCollection')
    return !feature.geometries || feature.geometries.length === 0;
  if (feature.type === 'MultiPolygon' || feature.type === 'MultiPoint')
    return !feature.coordinates || (feature.coordinates as any[]).length === 0;
  if (feature.type === 'Feature' && !feature.geometry) return true;
  return false;
}

// ── Geometry helpers ────────────────────────────────────────────

function closeRing(ring: number[][]): number[][] {
  if (!ring || ring.length < 2) return ring || [];
  const f = ring[0], l = ring[ring.length - 1];
  if (f[0] === l[0] && f[1] === l[1]) return ring;
  return ring.concat([[f[0], f[1]]]);
}

function ringsToPathD(rings: number[][][]): string {
  const parts: string[] = [];
  for (const ringGroup of rings) {
    const ring = closeRing(ringGroup);
    if (ring.length < 3) continue;
    let d = '';
    for (let i = 0; i < ring.length; i++) {
      const sx = ring[i][0];
      const sy = -ring[i][1];
      d += (i === 0 ? 'M' : 'L') + sx + ',' + sy;
    }
    d += 'Z';
    parts.push(d);
  }
  return parts.join(' ');
}

// ── District colors ─────────────────────────────────────────────

function generateColors(n: number): string[] {
  const warm = [{ lo: 0, hi: 55 }, { lo: 300, hi: 360 }];
  const warmLen = 115;
  const colors: string[] = [];
  for (let i = 0; i < n; i++) {
    const pos = ((i * 137.5) % warmLen) / warmLen;
    const deg = pos < (55 / warmLen)
      ? pos * warmLen
      : 300 + (pos - 55 / warmLen) * warmLen;
    colors.push(`hsla(${Math.round(deg)},45%,32%,0.3)`);
  }
  return colors;
}

function deduplicatedEdgePath(coordsList: number[][][][]): string {
  const edgeMap: Record<string, [number[], number[]]> = {};
  const vk = (p: number[]) => p[0].toFixed(2) + ',' + p[1].toFixed(2);
  const ek = (a: number[], b: number[]) => { const ka = vk(a), kb = vk(b); return ka < kb ? ka + '|' + kb : kb + '|' + ka; };

  for (const coords of coordsList) {
    const ring = closeRing(coords[0]);
    for (let i = 0; i < ring.length - 1; i++) {
      edgeMap[ek(ring[i], ring[i + 1])] = [ring[i], ring[i + 1]];
    }
  }
  return Object.values(edgeMap).map(e =>
    `M${e[0][0]},${-e[0][1]}L${e[1][0]},${-e[1][1]}`
  ).join(' ');
}

// ── Ring collection ─────────────────────────────────────────────

function collectRings(node: any, out: number[][][][]): void {
  if (node.type === 'MultiPolygon') {
    (node.coordinates || []).forEach((pc: number[][][]) => out.push(pc));
  } else if (node.type === 'Polygon') {
    out.push(node.coordinates);
  } else if (node.type === 'GeometryCollection') {
    (node.geometries || []).forEach((g: any) => collectRings(g, out));
  }
}

// ── Main render ─────────────────────────────────────────────────

export function render(opts: RenderOptions): void {
  const geojsonData = opts.geojson;
  const theme = opts.theme;
  const features: GeoFeature[] = geojsonData.features || [];

  const svg = d3.select(opts.svgSelector);
  const container = d3.select(opts.container);
  const legendEl = d3.select(opts.legendSelector);
  const tooltip = d3.select(opts.tooltipSelector);
  const togglesEl = d3.select(opts.togglesSelector);

  // Layer definitions
  const layerDefs: Record<string, LayerDef> = {};
  const layerOrder = (theme.layers || []).slice().sort((a, b) => (a.order || 99) - (b.order || 99));
  layerOrder.forEach(d => { layerDefs[d.id] = d; });

  // Toggle UI
  const visibilities: Record<string, boolean> = {};
  togglesEl.html('');
  layerOrder.forEach(def => {
    const feat = features.find(f => f.id === def.id);
    if (!feat || isEmpty(feat)) return;
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

  // Inner wall → district injection
  const wallsDef = layerDefs['walls'];
  if (wallsDef?.innerWallDistrict) {
    const wallsFeat = features.find(f => f.id === 'walls');
    if (wallsFeat?.type === 'GeometryCollection') {
      const geoms = wallsFeat.geometries || [];
      const innerIdx = geoms.length >= 2 ? geoms.length - 1 : (geoms.length === 1 ? 0 : -1);
      if (innerIdx >= 0) {
        const innerWallGeom = geoms[innerIdx];
        if (innerWallGeom.type === 'Polygon') {
          const districtFeat = features.find(f => f.id === 'districts');
          if (districtFeat?.type === 'GeometryCollection') {
            districtFeat.geometries!.push({
              type: 'Polygon',
              coordinates: innerWallGeom.coordinates,
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
    rings: number[][][],
    def: LayerDef,
    id: string,
    tooltipName: string | null
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

    if (tooltipName) {
      el.on('mouseenter', function() { tooltip.style('opacity', 1).text(tooltipName!); })
        .on('mousemove', function(ev: MouseEvent) {
          tooltip.style('left', (ev.offsetX + 12) + 'px')
                .style('top', (ev.offsetY - 10) + 'px');
        })
        .on('mouseleave', function() { tooltip.style('opacity', 0); });
    }
  }

  function renderGeometry(
    parentG: d3.Selection<SVGGElement, unknown, null, undefined>,
    geom: any,
    def: LayerDef,
    id: string,
    tooltipName: string | null
  ) {
    if (!geom?.type) return;

    if (geom.type === 'GeometryCollection') {
      (geom.geometries || []).forEach((g: any) => renderGeometry(parentG, g, def, id, g.name || null));
      return;
    }
    if (geom.type === 'MultiPoint') {
      (geom.coordinates || []).forEach((c: number[]) => {
        parentG.append('circle')
          .attr('cx', c[0]).attr('cy', -c[1])
          .attr('r', def.radius ?? 2.5)
          .attr('fill', def.fill).attr('stroke', def.stroke)
          .attr('stroke-width', def.strokeWidth ?? 1)
          .attr('opacity', def.opacity ?? 1);
      });
      return;
    }
    if (geom.type === 'Polygon') {
      renderPolygon(parentG, geom.coordinates, def, id, tooltipName);
      return;
    }
    if (geom.type === 'LineString') {
      const el = parentG.append('path')
        .datum(geom)
        .attr('d', pathGen)
        .attr('fill', 'none')
        .attr('stroke', def.stroke || 'none')
        .attr('opacity', def.opacity ?? 1)
        .attr('stroke-linejoin', 'round')
        .attr('stroke-linecap', def.strokeLinecap || 'round');
      if (def.widthScale && geom.width) {
        el.attr('stroke-width', geom.width / def.widthScale);
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
    id: string
  ) {
    // Random-fill layer (districts)
    if (def.randomFill && feature.type === 'GeometryCollection') {
      const geoms = (feature.geometries || []).filter(g => g.type === 'Polygon');
      const colors = generateColors(geoms.length);
      geoms.forEach((geom, i) => {
        const fillDef = { ...def, fill: colors[i], stroke: 'none', strokeWidth: 0 };
        renderPolygon(parentG, geom.coordinates, fillDef, id, def.tooltipField ? geom[def.tooltipField] : null);
      });
      const borderD = deduplicatedEdgePath(geoms.map(g => g.coordinates));
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
      const allRings: number[][][][] = [];
      collectRings(feature, allRings);
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
                const spacing = mr * 1.0;
                for (let side = -1; side <= 1; side += 2) {
                  const gx = curr[0] + ux * spacing * side;
                  const gy = curr[1] + uy * spacing * side;
                  parentG.append('rect')
                    .attr('x', gx - mr).attr('y', -gy - mr)
                    .attr('width', mr * 2).attr('height', mr * 2)
                    .attr('fill', mf).attr('stroke', ms)
                    .attr('stroke-width', 2);
                }
              } else {
                parentG.append('circle')
                  .attr('cx', curr[0]).attr('cy', -curr[1])
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
      (feature.geometries || []).forEach(geom => renderGeometry(parentG, geom, def, id, geom.name || null));
    } else if (feature.type === 'MultiPolygon') {
      (feature.coordinates || []).forEach((polyCoords: number[][][]) => renderPolygon(parentG, polyCoords, def, id, null));
    } else if (feature.type === 'Polygon') {
      renderPolygon(parentG, feature.coordinates, def, id, null);
    } else if (feature.type === 'MultiPoint') {
      (feature.coordinates || []).forEach((c: number[]) => {
        parentG.append('circle')
          .attr('cx', c[0]).attr('cy', -c[1])
          .attr('r', def.radius || 3)
          .attr('fill', def.fill).attr('stroke', def.stroke)
          .attr('stroke-width', def.strokeWidth ?? 1)
          .attr('opacity', def.opacity ?? 1);
      });
    } else {
      renderGeometry(parentG, feature, def, id, null);
    }
  }

  // ── Fit to viewport ────────────────────────────────────────────
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

  let initialTransform: d3.ZoomTransform;
  function resize() {
    const w = container.node()!.clientWidth;
    const h = container.node()!.clientHeight;
    initialTransform = computeTransform(w, h);
    g.attr('transform', initialTransform.toString());
  }
  window.addEventListener('resize', resize);
  resize();

  // Zoom / pan
  const zoom = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.3, 15])
    .on('zoom', (event) => { g.attr('transform', event.transform.toString()); });
  svg.call(zoom);

  // Visibility
  function updateVisibility() {
    for (const id in visibilities) {
      if (layerGroups[id]) layerGroups[id].style('display', visibilities[id] ? null : 'none');
    }
    updateLegend();
  }

  // Legend
  function updateLegend() {
    legendEl.html('');
    layerOrder.forEach(def => {
      if (!visibilities[def.id]) return;
      const feat = features.find(f => f.id === def.id);
      if (!feat || isEmpty(feat)) return;
      if (feat.type === 'Feature' && !feat.geometry) return;
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
  svg.selectAll('*').remove();
  svg.on('.zoom', null);
  d3.select(togglesSelector).html('');
  d3.select(legendSelector).html('');
}
