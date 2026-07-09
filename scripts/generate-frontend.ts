/**
 * Generate all frontend data using the actual Watabou generators.
 * Run from project root (CJS context) to avoid ESM/CJS interop issues.
 *
 * Usage: npx tsx scripts/generate-frontend.ts
 */
import * as fs from 'fs'
import * as path from 'path'

const ROOT = __dirname.replace('\\scripts', '').replace('/scripts', '')
const PUBLIC = path.join(ROOT, 'frontend', 'public')

process.chdir(ROOT)

async function main() {
  fs.mkdirSync(PUBLIC, { recursive: true })

  // ── Init engines ────────────────────────────────────────────

  console.log('🗺️  Initializing realm engine...')
  const { initEngine: initRealmEngine } = require(path.join(ROOT, 'src', 'realm', 'engine'))
  await initRealmEngine()
  console.log('  ✅ Realm engine ready')

  console.log('🏘️  Initializing city engine...')
  const { init: initCity, createGenerator: createCityGen } = require(path.join(ROOT, 'src', 'city', 'index'))
  await initCity()
  const cityGen = createCityGen()
  console.log('  ✅ City engine ready')

  console.log('🏠 Initializing village engine...')
  const { init: initVillage, createGenerator: createVillageGen } = require(path.join(ROOT, 'src', 'village', 'index'))
  await initVillage()
  const villageGen = createVillageGen()
  console.log('  ✅ Village engine ready')

  // ── Generate realm ──────────────────────────────────────────

  console.log('\n🌍 Generating realm...')
  const g = globalThis as any
  const seed = 34234433

  if (g.UtilsRandom?.reset) g.UtilsRandom.reset(seed)

  const RealmBlueprint = g.RealmBlueprint
  const RealmRegion = g.RealmRegion

  if (!RealmBlueprint || !RealmRegion) {
    console.error('Realm classes not available. Check realm engine initialization.')
    process.exit(1)
  }

  const bp = new RealmBlueprint()
  bp.seed = seed
  const region = new RealmRegion(bp)

  // Export realm SVG
  const RealmSvgExporter = g.RealmSvgExporter
  let realmSvg = ''
  if (RealmSvgExporter) {
    await new Promise<void>(resolve => {
      g.__captureCb = (data: string) => { realmSvg = data; resolve() }
      setTimeout(() => RealmSvgExporter.export(region), 100)
      setTimeout(() => resolve(), 3000) // safety timeout
    })
  }

  if (!realmSvg) {
    console.error('Failed to generate realm SVG')
    process.exit(1)
  }

  // Strip XML declaration
  const svgMatch = realmSvg.match(/<svg[^>]*>([\s\S]*)<\/svg>/)
  if (svgMatch) {
    realmSvg = `<svg xmlns="http://www.w3.org/2000/svg">${svgMatch[1]}</svg>`
  }

  fs.writeFileSync(path.join(PUBLIC, 'realm.svg'), realmSvg)
  console.log('  ✅ realm.svg')

  // Extract towns from region
  const towns: Array<{
    q: number; r: number; x: number; y: number
    name: string; type: 'village' | 'town' | 'city'
    seed: number; file: string
  }> = []

  const hexMap = region.hexMap || region.hexes || {}
  let townIdx = 0

  for (const [key, hex] of Object.entries(hexMap as Record<string, any>)) {
    const terrain = hex.terrain || hex.type || ''
    if (terrain === 'town' || terrain === 'village' || terrain === 'city' || terrain === 'capitol') {
      const type = terrain === 'capitol' || terrain === 'city' ? 'city'
        : terrain === 'town' ? 'town' : 'village'

      const x = hex.x ?? hex.pixelX ?? (hex.q || 0) * 70
      const y = hex.y ?? hex.pixelY ?? (hex.r || 0) * 70
      const name = hex.name || hex.location || `${type} ${townIdx + 1}`
      const file = `${type}s/${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.json`

      towns.push({ q: hex.q || 0, r: hex.r || 0, x, y, name, type, seed: seed + townIdx * 1000, file })
      townIdx++
    }
  }

  console.log(`  Found ${towns.length} towns`)

  fs.writeFileSync(path.join(PUBLIC, 'towns.json'), JSON.stringify(towns, null, 2))
  console.log('  ✅ towns.json')

  // Write realm theme
  const realmTheme = {
    title: region.name || 'Perilous Shores',
    generator: 'perilous-shores',
    boundsSource: null,
    padding: 60,
    layers: [
      { id: 'water', label: 'Water', order: 0, fill: '#1a3c5e', stroke: 'none' },
      { id: 'land', label: 'Land', order: 1, fill: '#2d5a27', stroke: 'none' },
      { id: 'forests', label: 'Forests', order: 2, fill: '#1a4a1a', stroke: 'none', opacity: 0.6 },
      { id: 'mountains', label: 'Mountains', order: 3, fill: '#6b6b6b', stroke: '#4a4a4a', strokeWidth: 1 },
      { id: 'roads', label: 'Roads', order: 4, fill: 'none', stroke: '#8b7355', strokeWidth: 2 },
      { id: 'borders', label: 'Borders', order: 5, fill: 'none', stroke: '#ffffff33', strokeWidth: 1 },
      { id: 'labels', label: 'Labels', order: 6, fill: '#e0e0e0', stroke: 'none', radius: 0 },
    ],
  }
  fs.writeFileSync(path.join(PUBLIC, 'realm.json'), JSON.stringify(realmTheme, null, 2))
  console.log('  ✅ realm.json')

  // ── Generate town maps ──────────────────────────────────────

  console.log('\n🏙️  Generating town maps...')

  for (const town of towns) {
    const dir = path.join(PUBLIC, path.dirname(town.file))
    fs.mkdirSync(dir, { recursive: true })

    try {
      if (town.type === 'city') {
        const city = await cityGen.generate({ seed: town.seed, size: 20 })
        const json = await city.exportJson()
        fs.writeFileSync(path.join(PUBLIC, town.file), json)

        const themeFile = town.file.replace('.json', '_theme.json')
        const cityTheme = {
          title: city.name,
          padding: 40,
          layers: [
            { id: 'districts', label: 'Districts', order: 0, randomFill: true, tooltipField: 'name', strokeWidth: 0.8, stroke: 'rgba(255,255,255,0.35)' },
            { id: 'walls', label: 'Walls', order: 1, batch: true, fill: 'none', stroke: '#1a1a1a', strokeWidth: 2, wallMarkers: true, markerRadius: 3 },
            { id: 'roads', label: 'Roads', order: 2, batch: true, fill: 'none', stroke: '#8b7355', strokeWidth: 1.5 },
            { id: 'rivers', label: 'Rivers', order: 3, batch: true, fill: 'none', stroke: '#3498db', strokeWidth: 2 },
            { id: 'buildings', label: 'Buildings', order: 4, batch: true, fill: '#d4c4a8', stroke: '#8b7355', strokeWidth: 0.5 },
          ],
        }
        fs.writeFileSync(path.join(PUBLIC, themeFile), JSON.stringify(cityTheme, null, 2))
        console.log(`  ✅ ${city.name} (city, seed ${town.seed})`)
      } else {
        const village = await villageGen.generate({ seed: town.seed })
        const json = await village.exportJson()
        fs.writeFileSync(path.join(PUBLIC, town.file), json)

        const themeFile = town.file.replace('.json', '_theme.json')
        const villageTheme = {
          title: village.name,
          padding: 40,
          layers: [
            { id: 'districts', label: 'Districts', order: 0, randomFill: true, tooltipField: 'name', strokeWidth: 0.8, stroke: 'rgba(255,255,255,0.35)' },
            { id: 'walls', label: 'Walls', order: 1, batch: true, fill: 'none', stroke: '#1a1a1a', strokeWidth: 2, wallMarkers: true, markerRadius: 3 },
            { id: 'roads', label: 'Roads', order: 2, batch: true, fill: 'none', stroke: '#8b7355', strokeWidth: 1.5 },
            { id: 'buildings', label: 'Buildings', order: 3, batch: true, fill: '#d4c4a8', stroke: '#8b7355', strokeWidth: 0.5 },
          ],
        }
        fs.writeFileSync(path.join(PUBLIC, themeFile), JSON.stringify(villageTheme, null, 2))
        console.log(`  ✅ ${village.name} (village, seed ${town.seed})`)
      }
    } catch (err: any) {
      console.error(`  ❌ ${town.name}: ${err.message}`)
    }
  }

  console.log('\n🎉 Done! Run `npm run dev` in frontend/ to view.')
}

main().catch(err => {
  console.error('Generation failed:', err)
  process.exit(1)
})
