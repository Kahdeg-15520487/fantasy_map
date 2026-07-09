<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import type { Theme, TownMarker, GeoCollection } from './types'
import { sanitizeSvg } from './utils/sanitize'
import RealmView from './components/RealmView.vue'
import DetailView from './components/DetailView.vue'

const currentView = ref<'realm' | 'detail'>('realm')
const currentTown = ref<TownMarker | null>(null)
const realmSvg = ref('')
const realmTheme = ref<Theme>({ title: 'Fantasy World', padding: 60, layers: [] })
const towns = ref<TownMarker[]>([])
const loading = ref(true)
const errorMsg = ref('')

async function openTown(town: TownMarker) {
  currentView.value = 'detail'
  currentTown.value = town
}

function goBack() {
  currentView.value = 'realm'
  currentTown.value = null
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && currentView.value === 'detail') goBack()
}

onMounted(async () => {
  window.addEventListener('keydown', handleKeydown)
  try {
    const [themeResp, townsResp] = await Promise.all([
      fetch('/realm.json'),
      fetch('/towns.json'),
    ])
    realmTheme.value = await themeResp.json()
    towns.value = await townsResp.json()

    const svgResp = await fetch('/realm.svg')
    const svgText = await svgResp.text()
    // Keep the full document (including the root <svg> tag) rather than just its
    // inner content: the Watabou exporter relies on root-level presentation
    // attributes (fill="none", fill-rule="evenodd", stroke-linejoin/linecap) that
    // shapes inherit when they don't set their own. RealmView re-parses this and
    // copies those attributes onto the group it injects, so dropping the root tag
    // here would make every unfilled shape fall back to the SVG spec default
    // (solid black fill).
    realmSvg.value = sanitizeSvg(svgText)
  } catch (err) {
    console.error(err)
    errorMsg.value = 'Failed to load map data'
  } finally {
    loading.value = false
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="app">
    <header>
      <nav v-if="currentView === 'detail'" class="breadcrumb" aria-label="Breadcrumb">
        <button class="crumb" @click="goBack" title="Back to realm map">🗺️ Realm</button>
        <span class="separator">›</span>
        <span class="crumb current">
          {{ currentTown?.type === 'village' ? '🏘️' : '🏙️' }} {{ currentTown?.name }}
        </span>
      </nav>
      <h1 v-else aria-live="polite">🗺️ {{ realmTheme.title }}</h1>
    </header>

    <div v-if="loading" class="loading">Loading…</div>
    <div v-else-if="errorMsg" class="loading error">{{ errorMsg }}</div>

    <RealmView
      v-show="currentView === 'realm' && !loading && !errorMsg"
      :svg="realmSvg"
      :towns="towns"
      @select-town="openTown"
    />

    <DetailView
      v-if="currentView === 'detail' && currentTown"
      :town="currentTown"
      @back="goBack"
    />
  </div>
</template>

<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: 'Segoe UI', system-ui, sans-serif;
  background: #1a1a2e;
  color: #e0e0e0;
  overflow: hidden;
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
}
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
}
header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  background: #16213e;
  border-bottom: 1px solid #0f3460;
  z-index: 10;
  flex-shrink: 0;
}
header h1 {
  font-size: 18px;
  font-weight: 600;
  flex: 1;
}
button {
  background: #0f3460;
  color: #e0e0e0;
  border: 1px solid #1a5276;
  padding: 6px 14px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}
button:hover { background: #1a5276; }
button:focus-visible { outline: 2px solid #3498db; outline-offset: 2px; }
.breadcrumb {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
}
.breadcrumb .crumb {
  background: none;
  border: none;
  color: #3498db;
  padding: 4px 8px;
  font-size: inherit;
  cursor: pointer;
  border-radius: 4px;
}
.breadcrumb .crumb:hover { background: #0f3460; }
.breadcrumb .crumb.current {
  color: #e0e0e0;
  cursor: default;
  font-weight: 600;
}
.breadcrumb .crumb.current:hover { background: none; }
.breadcrumb .separator {
  color: #555;
  font-size: 18px;
  user-select: none;
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
@media (prefers-reduced-motion: reduce) {
  * { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
}
</style>
