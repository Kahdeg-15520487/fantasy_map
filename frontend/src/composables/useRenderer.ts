/**
 * GeoJSON rendering engine — Vue composable.
 */
import { ref, onUnmounted, type Ref } from 'vue'
import * as d3 from 'd3'
import type { GeoCollection, GeoFeature, GeoGeometry, GeoGeometryCollection, LayerDef, Theme, Ring, Polygon, Coord } from '../types'

// ── Coordinate helpers ──────────────────────────────────────────

function projectY(y: number): number { return -y }

function extractCoords(obj: unknown, xs: number[], ys: number[]): void {
  if (!obj || typeof obj !== 'object') return
  const arr = obj as Record<string, unknown>
  if (Array.isArray(arr) && arr.length === 2 && typeof arr[0] === 'number' && typeof arr[1] === 'number') {
    xs.push(arr[0]); ys.push(arr[1]); return
  }
  if (Array.isArray(arr) && arr.length > 0 && Array.isArray(arr[0]) && (arr[0] as unknown[]).length === 2 && typeof (arr[0] as unknown[])[0] === 'number') {
    for (const item of arr) { const p = item as Coord; xs.push(p[0]); ys.push(p[1]) }
    return
  }
  if (Array.isArray(arr)) { for (const item of arr) extractCoords(item, xs, ys) }
  else { for (const v of Object.values(arr)) extractCoords(v, xs, ys) }
}

function closeRing(ring: Ring): Ring {
  if (!ring || ring.length < 2) return ring || []
  const f = ring[0], l = ring[ring.length - 1]
  if (f[0] === l[0] && f[1] === l[1]) return ring
  return ring.concat([[f[0], f[1]]])
}

function ringsToPathD(rings: Polygon): string {
  const parts: string[] = []
  for (const ringGroup of rings) {
    const ring = closeRing(ringGroup)
    if (ring.length < 3) continue
    let d = ''
    for (let i = 0; i < ring.length; i++) {
      d += (i === 0 ? 'M' : 'L') + ring[i][0] + ',' + projectY(ring[i][1])
    }
    d += 'Z'
    parts.push(d)
  }
  return parts.join(' ')
}

function collectRings(node: GeoGeometry, out: Polygon[][]): void {
  if (node.type === 'MultiPolygon') {
    ((node as any).coordinates || []).forEach((pc: Polygon) => out.push(pc))
  } else if (node.type === 'Polygon') {
    out.push((node as any).coordinates)
  } else if (node.type === 'GeometryCollection') {
    ((node as GeoGeometryCollection).geometries || []).forEach((g) => collectRings(g, out))
  }
}

function isEmpty(feature: GeoFeature): boolean {
  if (!feature) return true
  if (feature.type === 'GeometryCollection') return !feature.geometries || feature.geometries.length === 0
  if (feature.type === 'MultiPolygon' || feature.type === 'MultiPoint') return !feature.coordinates || (feature.coordinates as any[]).length === 0
  return false
}

// ── District colors ─────────────────────────────────────────────

const colorCache = new Map<string, string[]>()

function generateColors(n: number, key?: string): string[] {
  if (key) { const c = colorCache.get(key); if (c && c.length === n) return c }
  const warmLen = 115, colors: string[] = []
  for (let i = 0; i < n; i++) {
    const pos = ((i * 137.5) % warmLen) / warmLen
    const deg = pos < 55 / warmLen ? pos * warmLen : 300 + (pos - 55 / warmLen) * warmLen
    colors.push(`hsla(${Math.round(deg)},45%,32%,0.3)`)
  }
  if (key) colorCache.set(key, colors)
  return colors
}

// ── Compute bounds ──────────────────────────────────────────────

function computeBounds(features: GeoFeature[], theme: Theme) {
  const srcId = theme.boundsSource || null
  if (srcId) {
    const src = features.find(f => f.id === srcId)
    if (src?.coordinates) {
      if (src.type === 'MultiPolygon') {
        const polygons = src.coordinates as Polygon[]
        if (polygons?.[0]?.[0]?.length) {
          const ring = polygons[0][0]
          return { x0: d3.min(ring.map((p: Coord) => p[0])) ?? 0, y0: d3.min(ring.map((p: Coord) => p[1])) ?? 0, x1: d3.max(ring.map((p: Coord) => p[0])) ?? 1, y1: d3.max(ring.map((p: Coord) => p[1])) ?? 1 }
        }
      } else if (src.type === 'Polygon') {
        const polygon = src.coordinates as Polygon
        if (polygon?.[0]?.length) {
          const ring = polygon[0]
          return { x0: d3.min(ring.map((p: Coord) => p[0])) ?? 0, y0: d3.min(ring.map((p: Coord) => p[1])) ?? 0, x1: d3.max(ring.map((p: Coord) => p[0])) ?? 1, y1: d3.max(ring.map((p: Coord) => p[1])) ?? 1 }
        }
      }
    }
  }
  const allX: number[] = [], allY: number[] = []
  for (const f of features) extractCoords(f, allX, allY)
  const xMin = d3.min(allX), xMax = d3.max(allX), yMin = d3.min(allY), yMax = d3.max(allY)
  const x0 = xMin ?? 0, x1 = xMax != null ? xMax : (xMin != null ? xMin + 1 : 1)
  const y0 = yMin ?? 0, y1 = yMax != null ? yMax : (yMin != null ? yMin + 1 : 1)
  return { x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1) || (Math.min(x0, x1) + 1), y1: Math.max(y0, y1) || (Math.min(y0, y1) + 1) }
}

function deduplicatedEdgePath(coordsList: Polygon[][]): string {
  const edgeMap: Record<string, [Coord, Coord]> = {}
  const vk = (p: Coord) => p[0].toFixed(2) + ',' + p[1].toFixed(2)
  const ek = (a: Coord, b: Coord) => { const ka = vk(a), kb = vk(b); return ka < kb ? ka + '|' + kb : kb + '|' + ka }
  for (const coords of coordsList) {
    const ring = closeRing(coords[0])
    for (let i = 0; i < ring.length - 1; i++) edgeMap[ek(ring[i], ring[i + 1])] = [ring[i], ring[i + 1]]
  }
  return Object.values(edgeMap).map(e => `M${e[0][0]},${projectY(e[0][1])}L${e[1][0]},${projectY(e[1][1])}`).join(' ')
}

// ── Composable ──────────────────────────────────────────────────

export interface RenderOptions {
  geojson: GeoCollection
  theme: Theme
  svgRef: Ref<SVGSVGElement | null>
  tooltipRef: Ref<HTMLDivElement | null>
  containerRef: Ref<HTMLDivElement | null>
}

export function useRenderer() {
  const visibilities = ref<Record<string, boolean>>({})
  const layerLabels = ref<{ id: string; label: string }[]>([])
  const zoomRef = ref<any>(null)
  const resizeHandler = ref<(() => void) | null>(null)

  function cleanup() {
    if (resizeHandler.value) {
      window.removeEventListener('resize', resizeHandler.value)
      resizeHandler.value = null
    }
    colorCache.clear()
  }

  onUnmounted(cleanup)

  function render(opts: RenderOptions) {
    const { geojson, theme, svgRef, tooltipRef, containerRef } = opts
    const svgEl = svgRef.value
    const tooltipEl = tooltipRef.value
    const containerEl = containerRef.value
    if (!svgEl || !containerEl) return

    cleanup()

    const svg = d3.select(svgEl)
    const g = svg.append('g')
    const features: GeoFeature[] = geojson.features || []

    // Layer definitions
    const layerDefs: Record<string, LayerDef> = {}
    const layerOrder = (theme.layers || []).slice().sort((a: LayerDef, b: LayerDef) => (a.order || 99) - (b.order || 99))
    layerOrder.forEach((d: LayerDef) => { layerDefs[d.id] = d })

    // Feature index
    const featureIndex = new Map<string, GeoFeature[]>()
    for (const f of features) {
      const key = f.id || ''
      if (!featureIndex.has(key)) featureIndex.set(key, [])
      featureIndex.get(key)!.push(f)
    }

    // Toggle state
    const vis: Record<string, boolean> = {}
    const labels: { id: string; label: string }[] = []
    layerOrder.forEach((def: LayerDef) => {
      const feats = featureIndex.get(def.id)
      if (!feats || feats.length === 0 || feats.every(isEmpty)) return
      vis[def.id] = true
      labels.push({ id: def.id, label: def.label })
    })
    visibilities.value = vis
    layerLabels.value = labels

    // Projection
    const d3proj = d3.geoIdentity().reflectY(true)
    const pathGen = d3.geoPath().projection(d3proj)

    const layerGroups: Record<string, any> = {}

    const sortedFeatures = features.slice().sort((a: GeoFeature, b: GeoFeature) => {
      const da = layerDefs[a.id || ''], db = layerDefs[b.id || '']
      return (da ? da.order || 99 : 99) - (db ? db.order || 99 : 99)
    })

    // Inner wall → district injection (clone to avoid mutation)
    const wallsDef = layerDefs['walls']
    if (wallsDef?.innerWallDistrict) {
      const wallsFeat = featureIndex.get('walls')?.[0]
      if (wallsFeat?.type === 'GeometryCollection') {
        const geoms = (wallsFeat as GeoGeometryCollection).geometries || []
        const innerIdx = geoms.length >= 2 ? geoms.length - 1 : (geoms.length === 1 ? 0 : -1)
        if (innerIdx >= 0) {
          const innerWallGeom = geoms[innerIdx]
          if (innerWallGeom.type === 'Polygon') {
            const districtFeat = featureIndex.get('districts')?.[0]
            if (districtFeat?.type === 'GeometryCollection') {
              const cloned = { ...districtFeat, geometries: [...(districtFeat as GeoGeometryCollection).geometries] }
              const feats = featureIndex.get('districts')
              if (feats) feats[0] = cloned as GeoFeature
              ;(cloned as GeoGeometryCollection).geometries.push({
                type: 'Polygon',
                coordinates: (innerWallGeom as any).coordinates,
                name: wallsDef.innerWallDistrict,
              })
            }
          }
        }
      }
    }

    // Render features
    sortedFeatures.forEach((feature: GeoFeature) => {
      const id = feature.id
      const def = layerDefs[id || '']
      if (!def || isEmpty(feature)) return
      if (feature.type === 'Feature' && !feature.geometry) return
      const layerG = g.append('g').attr('class', `layer layer-${id}`)
      layerGroups[id!] = layerG
      renderFeature(layerG, feature, def, id!)
    })

    // ── Render helpers ────────────────────────────────────────

    function renderPolygon(parentG: any, rings: Polygon, def: LayerDef, _id: string, tooltipName: string | null) {
      if (!rings?.[0] || rings[0].length < 3) return
      const el = parentG.append('path')
        .attr('d', ringsToPathD(rings))
        .attr('fill', def.fill || 'none')
        .attr('stroke', def.stroke || 'none')
        .attr('stroke-width', def.strokeWidth ?? 1)
        .attr('opacity', def.opacity ?? 1)
        .attr('stroke-linejoin', def.strokeLinejoin || 'miter')
        .attr('fill-rule', 'evenodd')

      if (tooltipName && tooltipEl) {
        el.on('mouseenter', () => { tooltipEl.textContent = tooltipName; tooltipEl.style.opacity = '1' })
          .on('mousemove', (ev: MouseEvent) => {
            const rect = containerEl.getBoundingClientRect()
            tooltipEl.style.left = (ev.clientX - rect.left + 12) + 'px'
            tooltipEl.style.top = (ev.clientY - rect.top - 10) + 'px'
          })
          .on('mouseleave', () => { tooltipEl.style.opacity = '0' })
      }
    }

    function renderGeometry(parentG: any, geom: GeoGeometry, def: LayerDef, id: string, tooltipName: string | null) {
      if (!geom?.type) return
      if (geom.type === 'GeometryCollection') {
        for (const child of (geom as GeoGeometryCollection).geometries || []) renderGeometry(parentG, child, def, id, child.name || null)
        return
      }
      if (geom.type === 'MultiPoint') {
        for (const c of (geom as any).coordinates || []) {
          parentG.append('circle').attr('cx', c[0]).attr('cy', projectY(c[1]))
            .attr('r', def.radius ?? 2.5).attr('fill', def.fill).attr('stroke', def.stroke)
            .attr('stroke-width', def.strokeWidth ?? 1).attr('opacity', def.opacity ?? 1)
        }
        return
      }
      if (geom.type === 'Polygon') {
        renderPolygon(parentG, (geom as any).coordinates, def, id, tooltipName)
        return
      }
      if (geom.type === 'LineString') {
        const el = parentG.append('path').datum(geom).attr('d', pathGen)
          .attr('fill', 'none').attr('stroke', def.stroke || 'none')
          .attr('opacity', def.opacity ?? 1).attr('stroke-linejoin', 'round')
          .attr('stroke-linecap', def.strokeLinecap || 'round')
        el.attr('stroke-width', (def.widthScale && (geom as any).width) ? (geom as any).width / def.widthScale : (def.strokeWidth ?? 1))
        return
      }
      parentG.append('path').datum(geom).attr('d', pathGen)
        .attr('fill', def.fill || 'none').attr('stroke', def.stroke || 'none')
        .attr('stroke-width', def.strokeWidth ?? 1).attr('opacity', def.opacity ?? 1)
        .attr('stroke-linejoin', def.strokeLinejoin || 'miter')
    }

    function renderFeature(parentG: any, feature: GeoFeature, def: LayerDef, id: string) {
      // District random fill
      if (def.randomFill && feature.type === 'GeometryCollection') {
        const coll = feature as GeoGeometryCollection
        const geoms = (coll.geometries || []).filter(g => g.type === 'Polygon')
        const colors = generateColors(geoms.length, id)
        geoms.forEach((geom, i) => {
          const fillDef = { ...def, fill: colors[i], stroke: 'none', strokeWidth: 0 }
          const tipVal = def.tooltipField && geom.name ? geom.name : null
          renderPolygon(parentG, (geom as any).coordinates, fillDef, id, tipVal)
        })
        const borderD = deduplicatedEdgePath(geoms.map(g => (g as any).coordinates))
        if (borderD) {
          parentG.append('path').attr('d', borderD).attr('fill', 'none')
            .attr('stroke', def.stroke || 'rgba(255,255,255,0.35)')
            .attr('stroke-width', def.strokeWidth ?? 0.8).attr('opacity', def.opacity ?? 1)
        }
        return
      }

      // Batched
      if (def.batch) {
        const allRings: Polygon[][] = []
        collectRings(feature as GeoGeometry, allRings)
        if (allRings.length > 0) {
          parentG.append('path').attr('d', allRings.map(r => ringsToPathD(r)).join(' '))
            .attr('fill', def.fill || 'none').attr('stroke', def.stroke || 'none')
            .attr('stroke-width', def.strokeWidth ?? 1).attr('opacity', def.opacity ?? 1)
            .attr('stroke-linejoin', def.strokeLinejoin || 'miter').attr('fill-rule', 'evenodd')

          if (def.wallMarkers) {
            const mr = def.markerRadius || 4, mf = def.markerFill || '#fff', ms = def.stroke || '#1a1a1a'
            for (const rings of allRings) {
              const ring = closeRing(rings[0]), n = ring.length - 1
              for (let v = 0; v < n; v++) {
                const prev = ring[(v - 1 + n) % n], curr = ring[v], next = ring[(v + 1) % n]
                const v1x = curr[0] - prev[0], v1y = curr[1] - prev[1]
                const v2x = next[0] - curr[0], v2y = next[1] - curr[1]
                const sine = Math.abs(v1x * v2y - v1y * v2x) / (Math.sqrt(v1x * v1x + v1y * v1y) * Math.sqrt(v2x * v2x + v2y * v2y))
                if (sine < 0.02) {
                  const len = Math.sqrt(v1x * v1x + v1y * v1y), ux = v1x / len, uy = v1y / len
                  for (let side = -1; side <= 1; side += 2) {
                    const gx = curr[0] + ux * mr * side, gy = curr[1] + uy * mr * side
                    parentG.append('rect').attr('x', gx - mr).attr('y', projectY(gy) - mr)
                      .attr('width', mr * 2).attr('height', mr * 2).attr('fill', mf).attr('stroke', ms).attr('stroke-width', 2)
                  }
                } else {
                  parentG.append('circle').attr('cx', curr[0]).attr('cy', projectY(curr[1]))
                    .attr('r', mr).attr('fill', mf).attr('stroke', ms).attr('stroke-width', 2)
                }
              }
            }
          }
        }
        return
      }

      // Individual
      if (feature.type === 'GeometryCollection') {
        for (const geom of (feature as GeoGeometryCollection).geometries || []) renderGeometry(parentG, geom, def, id, geom.name || null)
      } else if (feature.type === 'MultiPolygon') {
        for (const poly of (feature.coordinates as Polygon[]) || []) renderPolygon(parentG, poly, def, id, null)
      } else if (feature.type === 'Polygon') {
        renderPolygon(parentG, feature.coordinates as Polygon, def, id, null)
      } else if (feature.type === 'MultiPoint') {
        for (const c of (feature.coordinates as Coord[]) || []) {
          parentG.append('circle').attr('cx', c[0]).attr('cy', projectY(c[1]))
            .attr('r', def.radius || 3).attr('fill', def.fill).attr('stroke', def.stroke)
            .attr('stroke-width', def.strokeWidth ?? 1).attr('opacity', def.opacity ?? 1)
        }
      } else {
        renderGeometry(parentG, feature as GeoGeometry, def, id, null)
      }
    }

    // ── Fit to viewport ──────────────────────────────────────

    const bounds = computeBounds(features, theme)
    const dataW = bounds.x1 - bounds.x0 || 1
    const dataH = bounds.y1 - bounds.y0 || 1
    const padding = theme.padding || 60

    function computeTransform(w: number, h: number) {
      const scale = Math.min((w - padding * 2) / dataW, (h - padding * 2) / dataH)
      const tx = (w - dataW * scale) / 2 - bounds.x0 * scale
      const ty = (h - dataH * scale) / 2 + bounds.y1 * scale
      return d3.zoomIdentity.translate(tx, ty).scale(scale)
    }

    function onResize() {
      const w = containerEl.clientWidth, h = containerEl.clientHeight
      g.attr('transform', computeTransform(w, h).toString())
    }
    window.addEventListener('resize', onResize)
    resizeHandler.value = onResize
    onResize()

    // Zoom
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 15])
      .on('zoom', (event: any) => { g.attr('transform', event.transform.toString()) })
    svg.call(zoom)
    zoomRef.value = zoom

    // Visibility toggle
    function toggleLayer(id: string, visible: boolean) {
      visibilities.value[id] = visible
      if (layerGroups[id]) layerGroups[id].style('display', visible ? null : 'none')
    }

    return { toggleLayer, cleanup }
  }

  return { render, visibilities, layerLabels, cleanup }
}
