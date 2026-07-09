<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from 'vue'
import * as d3 from 'd3'
import type { TownMarker } from '../types'

const props = defineProps<{
  svg: string
  towns: TownMarker[]
}>()

const emit = defineEmits<{
  selectTown: [town: TownMarker]
}>()

const containerRef = ref<HTMLDivElement | null>(null)
const svgRef = ref<SVGSVGElement | null>(null)
const tooltipRef = ref<HTMLDivElement | null>(null)

function markerHitRadius(type: string) {
  return type === 'city' ? 40 : type === 'town' ? 20 : 10
}

// The map's fit-to-viewport transform uniformly scales down the whole realm-bg
// group (often to ~0.3-0.5x for an 1800-unit canvas), which shrank marker radii
// (specified in the same map-local units) down to just 1-3 screen px. Markers
// are kept in map-local coordinates (so they stay correctly positioned as the
// map is resized) but wrapped in their own <g transform="translate(x,y)
// scale(1/mapScale)">, which cancels out the ambient scale for that subtree so
// the circle inside renders at a constant, always-visible screen-space size.
let currentMapScale = 1
function updateMarkerScale() {
  const svgEl = svgRef.value
  if (!svgEl) return
  d3.select(svgEl)
    .selectAll<SVGGElement, unknown>('.town-marker-anchor')
    .attr('transform', function () {
      const el = this as SVGGElement
      const x = parseFloat(el.dataset.x || '0')
      const y = parseFloat(el.dataset.y || '0')
      return `translate(${x},${y}) scale(${1 / currentMapScale})`
    })
}

function fitToViewport() {
  const svgEl = svgRef.value
  const containerEl = containerRef.value
  if (!svgEl || !containerEl) return

  const g = d3.select(svgEl).select<SVGGElement>('.realm-bg')
  const bbox = g.node()?.getBBox()
  if (!bbox || bbox.width <= 0) return

  const w = containerEl.clientWidth
  const h = containerEl.clientHeight
  const pad = 40
  const scale = Math.min((w - pad * 2) / bbox.width, (h - pad * 2) / bbox.height)
  const tx = (w - bbox.width * scale) / 2 - bbox.x * scale
  const ty = (h - bbox.height * scale) / 2 - bbox.y * scale
  g.attr('transform', `translate(${tx},${ty}) scale(${scale})`)

  currentMapScale = scale
  updateMarkerScale()
}

function handleMarkerMouseEnter(town: TownMarker) {
  const tip = tooltipRef.value
  if (tip) {
    tip.textContent = `${town.name} (${town.type})`
    tip.style.opacity = '1'
  }
}

function handleMarkerMouseMove(event: MouseEvent) {
  const tip = tooltipRef.value
  const container = containerRef.value
  if (!tip || !container) return
  const rect = container.getBoundingClientRect()
  tip.style.left = (event.clientX - rect.left + 12) + 'px'
  tip.style.top = (event.clientY - rect.top - 10) + 'px'
}

function handleMarkerMouseLeave() {
  const tip = tooltipRef.value
  if (tip) tip.style.opacity = '0'
}

function handleMarkerClick(town: TownMarker) {
  emit('selectTown', town)
}

function handleMarkerKeydown(event: KeyboardEvent, town: TownMarker) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    emit('selectTown', town)
  }
}

watch(() => props.svg, async () => {
  await nextTick()
  const svgEl = svgRef.value
  if (!svgEl || !props.svg) return

  // Parse the full sanitized document (root <svg> included) so we can carry over
  // its presentation attributes.
  const parser = new DOMParser()
  const doc = parser.parseFromString(props.svg, 'image/svg+xml')
  const parsed = doc.querySelector('svg')
  if (!parsed || doc.querySelector('parsererror')) return

  // Import and reparent
  const imported = document.importNode(parsed, true)
  const g = d3.select(svgEl).append('g').attr('class', 'realm-bg')
  const gNode = g.node()
  if (!gNode) return

  // The Watabou exporter sets default presentation attributes on the root <svg>
  // (fill="none", fill-rule="evenodd", stroke-linejoin/linecap="round") that
  // shapes inherit when they don't specify their own. Carry them over onto the
  // group so unfilled shapes don't fall back to the SVG spec default (solid
  // black fill) once reparented under our own <svg> element.
  for (const attr of ['fill', 'fill-rule', 'stroke-linejoin', 'stroke-linecap']) {
    const value = imported.getAttribute(attr)
    if (value) gNode.setAttribute(attr, value)
  }

  while (imported.firstChild) {
    gNode.appendChild(imported.firstChild)
  }

  // Add town markers. Each marker is a <g class="town-marker-anchor"> holding
  // the map-local (x,y) in data attributes; updateMarkerScale() sets its
  // transform (translate + counter-scale) so the circle inside stays a
  // constant screen size regardless of map zoom (see fitToViewport/
  // updateMarkerScale above).
  //
  // Each anchor holds a single invisible "hit" circle that owns all
  // pointer/keyboard interaction — sized to cover the town's icon glyph on
  // the SVG so hovering/clicking the icon works without a visible dot marker.
  for (const town of props.towns) {
    const anchor = g.append('g')
      .attr('class', 'town-marker-anchor')
      .attr('data-x', String(town.x))
      .attr('data-y', String(-town.y))

    anchor.append('circle')
      .attr('cx', 0)
      .attr('cy', 0)
      .attr('r', markerHitRadius(town.type))
      .attr('fill', 'transparent')
      .attr('class', 'town-marker-hit')
      .attr('role', 'button')
      .attr('tabindex', '0')
      .attr('aria-label', `${town.name} (${town.type})`)
      .style('cursor', 'pointer')
      .style('pointer-events', 'all')
      .on('mouseenter', () => handleMarkerMouseEnter(town))
      .on('mousemove', (ev: MouseEvent) => handleMarkerMouseMove(ev))
      .on('mouseleave', handleMarkerMouseLeave)
      .on('click', () => handleMarkerClick(town))
      .on('keydown', (ev: KeyboardEvent) => handleMarkerKeydown(ev, town))
  }

  fitToViewport()
  window.addEventListener('resize', fitToViewport)
}, { immediate: true })
</script>

<template>
  <div ref="containerRef" id="map-container" class="map-container">
    <svg ref="svgRef" id="map" role="img" aria-label="Fantasy world map"></svg>
    <div ref="tooltipRef" id="tooltip" role="tooltip"></div>
  </div>
</template>

<style scoped>
.map-container {
  flex: 1;
  position: relative;
  overflow: hidden;
}
#map {
  width: 100%;
  height: 100%;
  display: block;
}
#tooltip {
  position: absolute;
  top: 0; left: 0;
  background: rgba(0,0,0,0.85);
  color: #fff;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 13px;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s;
  white-space: nowrap;
  z-index: 100;
}
.town-marker-hit {
  transition: filter 0.2s;
}
@media (prefers-reduced-motion: reduce) {
  .town-marker-hit { transition: none; }
}
</style>
