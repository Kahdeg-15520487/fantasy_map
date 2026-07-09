<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import type { TownMarker, Theme, GeoCollection } from '../types'
import { useRenderer } from '../composables/useRenderer'

const props = defineProps<{
  town: TownMarker
}>()

const emit = defineEmits<{
  back: []
}>()

const containerRef = ref<HTMLDivElement | null>(null)
const svgRef = ref<SVGSVGElement | null>(null)
const tooltipRef = ref<HTMLDivElement | null>(null)
const loading = ref(true)
const errorMsg = ref('')

const renderer = useRenderer()
let toggleFn: ReturnType<typeof useRenderer>['render'] extends (...args: any[]) => infer R ? R : never = null as any

async function loadTown() {
  loading.value = true
  errorMsg.value = ''

  try {
    const themeUrl = props.town.file.replace(/\.json$/, '_theme.json')
    const [geojsonResp, themeResp] = await Promise.allSettled([
      fetch(props.town.file),
      fetch(themeUrl),
    ])

    if (geojsonResp.status === 'rejected' || !geojsonResp.value.ok) {
      throw new Error(`Failed to load ${props.town.name}`)
    }

    const geojson: GeoCollection = await geojsonResp.value.json()
    const theme: Theme = themeResp.status === 'fulfilled' && themeResp.value.ok
      ? await themeResp.value.json()
      : { title: props.town.name, padding: 60, layers: [] }

    if (!geojson.features) {
      throw new Error(`Invalid GeoJSON for ${props.town.name}`)
    }

    loading.value = false
    await nextTick()

    // Wait for DOM to be ready
    await nextTick()

    toggleFn = renderer.render({
      geojson,
      theme,
      svgRef,
      tooltipRef,
      containerRef,
    })
  } catch (err) {
    console.error(err)
    errorMsg.value = `Failed to load ${props.town.name}`
    loading.value = false
  }
}

onMounted(loadTown)

watch(() => props.town, () => {
  renderer.cleanup()
  loadTown()
})

onUnmounted(() => {
  renderer.cleanup()
})
</script>

<template>
  <div class="detail-view">
    <div v-if="loading" class="loading">Loading {{ town.name }}…</div>
    <div v-else-if="errorMsg" class="loading error">{{ errorMsg }}</div>

    <div v-show="!loading && !errorMsg" ref="containerRef" class="map-container">
      <svg ref="svgRef" id="detail-map" role="img" :aria-label="`Map of ${town.name}`"></svg>
      <div ref="tooltipRef" class="tooltip" role="tooltip"></div>
    </div>

    <div v-if="!loading && !errorMsg && renderer.layerLabels.value.length" class="legend" aria-live="polite">
      <div
        v-for="layer in renderer.layerLabels.value"
        :key="layer.id"
        class="legend-item"
      >
        <label>
          <input
            type="checkbox"
            :checked="renderer.visibilities.value[layer.id]"
            @change="(e: Event) => toggleFn?.toggleLayer(layer.id, (e.target as HTMLInputElement).checked)"
          />
          <span>{{ layer.label }}</span>
        </label>
      </div>
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
.tooltip {
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
.legend {
  position: absolute;
  bottom: 12px;
  right: 12px;
  background: rgba(22,33,62,0.9);
  border: 1px solid #0f3460;
  border-radius: 6px;
  padding: 8px 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-width: 300px;
  z-index: 10;
}
.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}
.legend-item label {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}
.legend-item input[type="checkbox"] {
  cursor: pointer;
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
