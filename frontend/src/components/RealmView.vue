<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from 'vue'
import type { TownMarker } from '../types'

declare const d3: any

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

function markerColor(type: string) {
  return type === 'city' ? '#e74c3c' : type === 'town' ? '#f39c12' : '#3498db'
}

function markerRadius(type: string) {
  return type === 'city' ? 6 : type === 'town' ? 4.5 : 3.5
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

  // Inject sanitized SVG via DOMParser for correct namespace
  const parser = new DOMParser()
  const doc = parser.parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${props.svg}</svg>`, 'image/svg+xml')
  const parsed = doc.querySelector('svg')
  if (!parsed) return

  // Import and reparent
  const imported = document.importNode(parsed, true)
  const g = d3.select(svgEl).append('g').attr('class', 'realm-bg')
  const gNode = g.node()
  while (imported.firstChild) {
    gNode.appendChild(imported.firstChild)
  }

  // Add town markers
  for (const town of props.towns) {
    g.append('circle')
      .attr('cx', town.x)
      .attr('cy', -town.y)
      .attr('r', markerRadius(town.type))
      .attr('fill', markerColor(town.type))
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5)
      .attr('class', 'town-marker')
      .attr('role', 'button')
      .attr('tabindex', '0')
      .attr('aria-label', `${town.name} (${town.type})`)
      .style('cursor', 'pointer')
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
.town-marker {
  transition: transform 0.2s, filter 0.2s;
}
.town-marker:hover {
  filter: brightness(1.5);
}
@media (prefers-reduced-motion: reduce) {
  .town-marker { transition: none; }
}
</style>
