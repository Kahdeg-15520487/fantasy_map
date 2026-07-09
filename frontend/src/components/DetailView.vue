<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import * as d3 from 'd3'
import type { TownMarker } from '../types'

const props = defineProps<{
  town: TownMarker
}>()

const emit = defineEmits<{
  back: []
}>()

const containerRef = ref<HTMLDivElement | null>(null)
const svgRef = ref<SVGSVGElement | null>(null)
const loading = ref(true)
const errorMsg = ref('')

let resizeHandler: (() => void) | null = null

function fitToViewport() {
  const svgEl = svgRef.value
  const containerEl = containerRef.value
  if (!svgEl || !containerEl) return

  const g = d3.select(svgEl).select<SVGGElement>('.detail-bg')
  
  // Find the background rect element to use as the true map bounds. Using the entire
  // group's bbox includes roads and rivers extending far beyond the visible map bounds.
  const rectNode = g.select('rect').node()
  const bbox = rectNode ? rectNode.getBBox() : g.node()?.getBBox()
  
  if (!bbox || bbox.width <= 0 || bbox.height <= 0) return

  const w = containerEl.clientWidth
  const h = containerEl.clientHeight
  const pad = 20
  const scale = Math.min((w - pad * 2) / bbox.width, (h - pad * 2) / bbox.height)
  const tx = (w - bbox.width * scale) / 2 - bbox.x * scale
  const ty = (h - bbox.height * scale) / 2 - bbox.y * scale
  g.attr('transform', `translate(${tx},${ty}) scale(${scale})`)
}

onMounted(async () => {
  try {
    const svgUrl = props.town.file.replace(/\.json$/, '.svg')
    const resp = await fetch(svgUrl)
    if (!resp.ok) throw new Error(`Failed to load SVG: ${resp.status}`)

    const svgText = await resp.text()

    loading.value = false
    await nextTick()

    const svgEl = svgRef.value
    if (!svgEl) return

    const parser = new DOMParser()
    const doc = parser.parseFromString(svgText, 'image/svg+xml')
    const parsed = doc.querySelector('svg')
    if (!parsed || doc.querySelector('parsererror')) return

    const imported = document.importNode(parsed, true)
    const g = d3.select(svgEl).append('g').attr('class', 'detail-bg')
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

    fitToViewport()
    resizeHandler = () => fitToViewport()
    window.addEventListener('resize', resizeHandler)
  } catch (err) {
    console.error(err)
    errorMsg.value = `Failed to load ${props.town.name}`
    loading.value = false
  }
})

onUnmounted(() => {
  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler)
    resizeHandler = null
  }
})
</script>

<template>
  <div class="detail-view">
    <div v-if="loading" class="loading">Loading {{ town.name }}…</div>
    <div v-else-if="errorMsg" class="loading error">{{ errorMsg }}</div>

    <div
      v-show="!loading && !errorMsg"
      ref="containerRef"
      class="map-container"
    >
      <svg
        ref="svgRef"
        id="detail-map"
        role="img"
        :aria-label="`Map of ${town.name}`"
      ></svg>
    </div>
  </div>
</template>

<style scoped>
.detail-view {
  flex: 1;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.map-container {
  flex: 1;
  position: relative;
  overflow: hidden;
}
#detail-map {
  width: 100%;
  height: 100%;
  display: block;
}
.loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  opacity: 0.7;
}
.loading.error { color: #e74c3c; }
</style>
