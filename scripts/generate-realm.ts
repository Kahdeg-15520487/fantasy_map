/**
 * Generate realm (world map) data for the frontend.
 *
 * Produces:
 *   frontend/public/realm.svg     — world map SVG
 *   frontend/public/realm.json    — Theme { title, padding, layers }
 *   frontend/public/towns.json    — TownMarker[]
 *
 * Runs as a standalone child process (each engine needs its own
 * Node process due to Haxe global namespace clobbering).
 *
 * Usage: npx tsx scripts/generate-realm.ts [--seed N]
 */
import * as fs from 'fs'
import * as path from 'path'

const PUBLIC = path.resolve(__dirname, '..', 'frontend', 'public')
const seedArg = process.argv.indexOf('--seed')
const SEED = seedArg >= 0 ? parseInt(process.argv[seedArg + 1], 10) : undefined

async function main() {
  fs.mkdirSync(PUBLIC, { recursive: true })

  console.log('[realm] Initialising engine...')
  const { init } = require(path.resolve(__dirname, '..', 'src', 'realm', 'index'))
  await init()

  console.log('[realm] Generating...')
  const { createGenerator } = require(path.resolve(__dirname, '..', 'src', 'realm', 'index'))
  const gen = createGenerator()
  const realm = await gen.generate(SEED ? { seed: SEED } : {})

  const name = realm.name || 'Fantasy World'
  console.log(`[realm] Generated: "${name}" (seed=${realm.seed})`)

  // ── Export SVG ──────────────────────────────────────────────
  console.log('[realm] Exporting SVG...')
  const svg = await realm.exportSvg()
  const svgPath = path.join(PUBLIC, 'realm.svg')
  fs.writeFileSync(svgPath, svg, 'utf-8')
  console.log(`[realm] Wrote ${svgPath} (${(svg.length / 1024).toFixed(0)} KB)`)

  // ── Export JSON (hex data) ──────────────────────────────────
  console.log('[realm] Exporting JSON...')
  const jsonStr = await realm.exportJson()
  const realmData = JSON.parse(jsonStr)

  // ── Extract towns from hex data ─────────────────────────────
  type TownInfo = {
    name: string
    type: 'city' | 'town' | 'village'
    seed: number
    q: number
    r: number
    size?: number
    tags?: string
  }
  const towns: TownInfo[] = []

  if (realmData.hexes) {
    for (const [_key, hex] of Object.entries(realmData.hexes) as [string, any][]) {
      if (!hex?.town) continue
      const t = hex.town
      // Extract seed from the watabou link
      const seedMatch = t.link?.match(/[?&]seed=(\d+)/)
      const seed = seedMatch ? parseInt(seedMatch[1], 10) : Math.floor(Math.random() * 2147483647)
      const sizeMatch = t.link?.match(/[?&]size=(\d+)/)
      const size = sizeMatch ? parseInt(sizeMatch[1], 10) : undefined
      const tagsMatch = t.link?.match(/[?&]tags=([^&]+)/)

      towns.push({
        name: t.name,
        type: t.type as 'city' | 'town' | 'village',
        seed,
        q: hex.q as number,
        r: hex.r as number,
        size,
        tags: tagsMatch ? decodeURIComponent(tagsMatch[1]) : undefined,
      })
    }
  }
  console.log(`[realm] Found ${towns.length} towns: ${towns.map(t => t.name).join(', ')}`)

  // ── Get precise town pixel positions from the live Region model ─────
  // Previously this scraped the exported SVG for each town's <text ...
  // transform="translate(x y)">Name</text> element. That approximates the
  // town's position using the LABEL's anchor point, which the Watabou
  // renderer places at a deliberate offset from the actual town icon
  // (com.watabou.perilous.mapping.labels.TownLabel adds an extra vertical
  // "getLabelPos()" offset below the icon), causing markers to visibly miss
  // the icon glyph.
  //
  // Instead, read the exact pixel geometry the icon renderer itself uses
  // directly from the live `region` model (see Perilous.js `drawTown`):
  //   iconX = cell.center.x + offset.x
  //   iconY = cell.center.y + offset.y
  // (offset = town.getOffset(), a small coastal/river-adjacency nudge; the
  // renderer also applies a `vantage`/`baseline` factor for 3D-tilt display
  // modes, but our generator forces flat mode — bp.hexes = 0, Region.tiltMode
  // = 0 — in src/realm/index.ts, so those factors are neutral here.)
  //
  // This is in the SAME "centered" coordinate space as the raw SVG path data
  // (origin at the map's center, matching the root <g transform="translate(w/2
  // h/2)">), so it still needs the root offset added below — same as before.
  let rootDx = 0
  let rootDy = 0
  const rootMatch = svg.match(/<\/defs><g transform="translate\((-?\d+\.?\d*)\s+(-?\d+\.?\d*)\)">/)
  if (rootMatch) {
    rootDx = parseFloat(rootMatch[1])
    rootDy = parseFloat(rootMatch[2])
  } else {
    console.warn('[realm] Could not find root <g transform> offset — town markers may be misplaced')
  }

  const townPositions: Record<string, { x: number; y: number }> = {}

  try {
    const islands: any[] = realm.region?.islands || []
    for (const island of islands) {
      for (const t of island.towns || []) {
        const name: string = t.name ?? t.getName?.()
        if (!name) continue
        const center = t.cell?.center
        const offset = t.getOffset?.()
        if (!center || !offset) continue
        townPositions[name] = {
          x: rootDx + center.x + offset.x,
          // SVG y is y-down, but the frontend negates y (attr('cy', -town.y))
          // so we store the negated absolute y here to get correct rendering.
          y: -(rootDy + center.y + offset.y),
        }
      }
    }
  } catch (e: any) {
    console.warn('[realm] Could not read town positions from region model:', e.message)
  }

  // Fallback for any town not found via the live model (e.g. structure
  // mismatch) — approximate using the label's SVG position as before.
  for (const town of towns) {
    if (townPositions[town.name]) continue
    const escaped = town.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const textRe = new RegExp(
      `transform="translate\\((-?\\d+\\.?\\d*)\\s+(-?\\d+\\.?\\d*)\\)">${escaped}</text>`,
      'g'
    )
    const match = textRe.exec(svg)
    if (match) {
      townPositions[town.name] = {
        x: rootDx + parseFloat(match[1]),
        y: -(rootDy + parseFloat(match[2])),
      }
    } else {
      console.warn(`[realm] Could not find position for "${town.name}"`)
    }
  }

  // ── Build towns.json ────────────────────────────────────────
  const townMarkers = towns.map(t => {
    const pos = townPositions[t.name] || { x: 0, y: 0 }
    return {
      q: t.q,
      r: t.r,
      x: pos.x,
      y: pos.y,
      name: t.name,
      type: t.type,
      seed: t.seed,
      file: `/${t.type === 'village' ? 'village' : 'city'}/${t.name.replace(/[^a-zA-Z0-9_-]/g, '')}.json`,
    }
  })

  const townsPath = path.join(PUBLIC, 'towns.json')
  fs.writeFileSync(townsPath, JSON.stringify(townMarkers, null, 2), 'utf-8')
  console.log(`[realm] Wrote ${townsPath} (${townMarkers.length} towns)`)

  // ── Build realm.json (Theme) ────────────────────────────────
  const theme = {
    title: name,
    padding: 60,
    layers: [],
  }
  const themePath = path.join(PUBLIC, 'realm.json')
  fs.writeFileSync(themePath, JSON.stringify(theme, null, 2), 'utf-8')
  console.log(`[realm] Wrote ${themePath}`)

  console.log('[realm] Done.')
  process.exit(0)
}

main().catch(err => {
  console.error('[realm] Fatal:', err)
  process.exit(1)
})
