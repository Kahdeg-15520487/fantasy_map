/**
 * Generate a single city or village for the frontend.
 *
 * Produces:
 *   frontend/public/<type>/<name>.json        — GeoJSON FeatureCollection
 *   frontend/public/<type>/<name>_theme.json   — Theme with layer defs
 *
 * Usage: npx tsx scripts/generate-town.ts --type <city|village> --name "Town Name" --seed <num> [--size <num>] [--tags <str>]
 */
import * as fs from 'fs'
import * as path from 'path'

const PUBLIC = path.resolve(__dirname, '..', 'frontend', 'public')

function parseArg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1]
  return undefined
}

// ── Built-in theme defaults ──────────────────────────────────────

const CITY_THEME_LAYERS = [
  { id: 'earth',    label: 'Earth',    order: 1,  fill: '#3b4d3b', stroke: 'none' },
  { id: 'water',    label: 'Water',    order: 2,  fill: '#2c5f7c', stroke: 'none' },
  { id: 'rivers',   label: 'Rivers',   order: 3,  fill: 'none', stroke: '#4a8faa', strokeWidth: 2, strokeLinecap: 'round' },
  { id: 'roads',    label: 'Roads',    order: 4,  fill: 'none', stroke: '#8b7355', strokeWidth: 1.5, strokeLinecap: 'round' },
  { id: 'planks',   label: 'Planks',   order: 5,  fill: 'none', stroke: '#8b7355', strokeWidth: 2, strokeLinecap: 'round' },
  { id: 'walls',    label: 'Walls',    order: 6,  fill: 'none', stroke: '#5a4a3a', strokeWidth: 3, strokeLinejoin: 'round', wallMarkers: true, markerRadius: 3, markerFill: '#e8d5b0' },
  { id: 'gates',    label: 'Gates',    order: 7,  fill: '#e8d5b0', stroke: '#5a4a3a', strokeWidth: 1, radius: 4 },
  { id: 'districts',label: 'Districts',order: 8,  randomFill: true, stroke: 'rgba(255,255,255,0.35)', strokeWidth: 0.8, tooltipField: 'name' },
  { id: 'buildings',label: 'Buildings',order: 9,  fill: '#5a4a3a', stroke: 'none', opacity: 0.85 },
  { id: 'prisms',   label: 'Prisms',   order: 10, fill: '#4a6a8a', stroke: 'none', opacity: 0.7 },
  { id: 'squares',  label: 'Squares',  order: 11, fill: '#6a5a4a', stroke: 'none', opacity: 0.6 },
  { id: 'greens',   label: 'Greens',   order: 12, fill: '#4a6a3a', stroke: 'none', opacity: 0.5 },
  { id: 'fields',   label: 'Fields',   order: 13, fill: '#5a6a3a', stroke: 'none', opacity: 0.65 },
  { id: 'trees',    label: 'Trees',    order: 14, fill: '#2a4a2a', stroke: 'none', radius: 3, opacity: 0.7 },
]

const VILLAGE_THEME_LAYERS = [
  { id: 'earth',     label: 'Earth',      order: 1,  fill: '#4a6a3a', stroke: 'none' },
  { id: 'water',     label: 'Water',      order: 2,  fill: '#2c5f7c', stroke: 'none' },
  { id: 'roads',     label: 'Roads',      order: 3,  fill: 'none', stroke: '#8b7355', strokeWidth: 2, strokeLinecap: 'round' },
  { id: 'planks',    label: 'Planks',     order: 4,  fill: 'none', stroke: '#8b7355', strokeWidth: 2.5, strokeLinecap: 'round' },
  { id: 'palisade',  label: 'Palisade',   order: 5,  fill: 'none', stroke: '#5a4a3a', strokeWidth: 2.5, strokeLinecap: 'round' },
  { id: 'fields',    label: 'Fields',     order: 6,  fill: '#7a8a4a', stroke: 'none', opacity: 0.6 },
  { id: 'buildings', label: 'Buildings',  order: 7,  fill: '#6a5a4a', stroke: 'none', opacity: 0.85 },
  { id: 'prisms',    label: 'Prisms',     order: 8,  fill: '#5a7a5a', stroke: 'none', opacity: 0.7 },
  { id: 'squares',   label: 'Squares',    order: 9,  fill: '#7a6a5a', stroke: 'none', opacity: 0.6 },
  { id: 'trees',     label: 'Trees',      order: 10, fill: '#3a5a3a', stroke: 'none', radius: 3, opacity: 0.7 },
  { id: 'extendable',label: 'Extendable', order: 11, fill: '#5a4a3a', stroke: 'none', radius: 2, opacity: 0.5 },
]

async function main() {
  const type = parseArg('type')
  const name = parseArg('name')
  const seedStr = parseArg('seed')
  const sizeStr = parseArg('size')
  const tags = parseArg('tags')

  if (!type || !name || !seedStr) {
    console.error('Usage: tsx scripts/generate-town.ts --type <city|village> --name "Name" --seed <num> [--size <num>]')
    process.exit(1)
  }

  const seed = parseInt(seedStr, 10)
  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '')
  const outDir = path.join(PUBLIC, type === 'village' ? 'village' : 'city')
  fs.mkdirSync(outDir, { recursive: true })

  console.log(`[${type}] Generating "${name}" (seed=${seed})...`)

  // Each engine needs its own process — we're called as a child process,
  // so we only init ONE engine here.
  const enginePath = path.resolve(__dirname, '..', 'src', type, 'index')
  const { init, createGenerator } = require(enginePath)
  await init()

  const MAX_RETRIES = 5
  let result: any = null
  let lastError: Error | null = null

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const currentSeed = attempt === 0 ? seed : Math.floor(Math.random() * 2147483647)
      const gen = createGenerator()
      result = await gen.generate({
        seed: currentSeed,
        ...(sizeStr ? { size: parseInt(sizeStr, 10) } : {}),
        ...(tags ? { tags } : {}),
      })
      break // success
    } catch (err: any) {
      lastError = err
      if (attempt + 1 < MAX_RETRIES) {
        console.warn(`[${type}] Attempt ${attempt + 1} failed (seed=${seed}): ${err.message}. Retrying with new seed...`)
      }
    }
  }

  if (!result) {
    throw new Error(`[${type}] Failed after ${MAX_RETRIES} attempts. Last error: ${lastError?.message}`)
  }

  // ── Export JSON ──────────────────────────────────────────────
  const json = await result.exportJson()
  const jsonPath = path.join(outDir, `${safeName}.json`)
  fs.writeFileSync(jsonPath, json, 'utf-8')
  console.log(`[${type}] Wrote ${jsonPath} (${(json.length / 1024).toFixed(0)} KB)`)

  // ── Export SVG ──────────────────────────────────────────────
  const svg = await result.exportSvg()
  const svgPath = path.join(outDir, `${safeName}.svg`)
  fs.writeFileSync(svgPath, svg, 'utf-8')
  console.log(`[${type}] Wrote ${svgPath} (${(svg.length / 1024).toFixed(0)} KB)`)

  // ── Write theme ──────────────────────────────────────────────
  const layers = type === 'village' ? VILLAGE_THEME_LAYERS : CITY_THEME_LAYERS
  const theme = {
    title: name,
    padding: 60,
    layers,
  }
  const themePath = path.join(outDir, `${safeName}_theme.json`)
  fs.writeFileSync(themePath, JSON.stringify(theme, null, 2), 'utf-8')
  console.log(`[${type}] Wrote ${themePath}`)

  console.log(`[${type}] Done.`)
  process.exit(0)
}

main().catch(err => {
  console.error(`[town] Fatal:`, err)
  process.exit(1)
})
