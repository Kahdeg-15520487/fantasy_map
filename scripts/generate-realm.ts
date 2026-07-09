/**
 * Generate realm (world map) data for the frontend.
 *
 * Produces:
 *   frontend/public/realm.svg     — world map SVG
 *   frontend/public/realm.json    — Theme { title, padding, layers }
 *   frontend/public/towns.json    — TownMarker[]
 *
 * Two modes:
 *   1. Interactive (no args):       npx tsx scripts/generate-realm.ts
 *   2. CLI (with flags):            npx tsx scripts/generate-realm.ts --seed 123 --tags "peninsula,civilized"
 *
 * CLI flags:
 *   --seed <num>     deterministic seed
 *   --tags <str>     comma-separated tags (see TAG_OPTIONS below)
 *   --width <num>    SVG width (default 1800)
 *   --height <num>   SVG height (default 1800)
 *   --hexes <0|3>    0=flat, 3=3D tilted (default 0)
 *   --matte          include the decorative parchment border/frame
 *                    (omit for borderless output, which is the default)
 */
import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'

const PUBLIC = path.resolve(__dirname, '..', 'frontend', 'public')

// ── Tag definitions ────────────────────────────────────────────────

interface Choice {
  value: string
  label: string
  desc: string
}

const GEOGRAPHY: Choice[] = [
  { value: 'island',    label: 'Island',        desc: 'An island or small archipelago' },
  { value: 'peninsula', label: 'Peninsula',     desc: 'A peninsula, headland or isthmus' },
  { value: 'coast',     label: 'Coast',         desc: 'A coastal region' },
  { value: 'bay',       label: 'Bay',           desc: 'A bay or gulf' },
  { value: 'fjord',     label: 'Fjord',         desc: 'A fjord' },
  { value: 'archipelago',label:'Archipelago',   desc: 'Many relatively small islands' },
  { value: 'lake',      label: 'Lake',          desc: 'A waterbody surrounded by earth' },
  { value: 'land',      label: 'Land',          desc: 'A landlocked region' },
]

const LANDSCAPE_GROUPS: Array<{ name: string; choices: Choice[] }> = [
  {
    name: 'Elevation',
    choices: [
      { value: 'highland', label: 'Highland', desc: 'Higher mountains, more of them' },
      { value: 'lowland',  label: 'Lowland',  desc: 'Lower mountains, fewer of them' },
      { value: 'none',     label: 'Balanced', desc: 'Neither — leave to chance' },
    ],
  },
  {
    name: 'Climate',
    choices: [
      { value: 'barren',   label: 'Barren',   desc: 'Fewer rivers/forests/swamps, more deserts. Fewer settlements.' },
      { value: 'wetland',  label: 'Wetland',  desc: 'More rivers and swamps, fewer forests, no deserts' },
      { value: 'none',     label: 'Balanced', desc: 'Neither — leave to chance' },
    ],
  },
]

const OPTIONS: Choice[] = [
  { value: 'woodland',  label: 'Woodland',  desc: 'Extra forests' },
  { value: 'difficult', label: 'Difficult', desc: 'More mountains, forests, deserts and swamps' },
  { value: 'civilized', label: 'Civilized', desc: '50% more settlements' },
]

const DANGER: Choice[] = [
  { value: 'safe',     label: 'Safe',     desc: 'No dangers, towns less defended' },
  { value: 'perilous', label: 'Perilous', desc: 'More dangers, towns more defended' },
  { value: 'none',     label: 'Neutral',  desc: 'Leave danger to chance' },
]

const ALIGNMENT: Choice[] = [
  { value: 'neutral', label: 'Neutral', desc: 'Default' },
  { value: 'lawful',  label: 'Lawful',  desc: 'Smoother coastlines, lawful names' },
  { value: 'chaotic', label: 'Chaotic', desc: 'Jagged coastlines, chaotic names' },
  { value: 'good',    label: 'Good',    desc: 'Benevolent feature names' },
  { value: 'evil',    label: 'Evil',    desc: 'Sinister feature names' },
]

// ── Interactive prompt ─────────────────────────────────────────────

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()))
  })
}

function showChoices(choices: Choice[], allowRandom = true): void {
  choices.forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.label.padEnd(14)} ${c.desc}`)
  })
  if (allowRandom) console.log(`  ${choices.length + 1}. Random`)
  console.log()
}

async function pick(
  rl: readline.Interface,
  prompt: string,
  choices: Choice[],
  allowRandom = true
): Promise<string> {
  console.log(prompt)
  showChoices(choices, allowRandom)
  const max = choices.length + (allowRandom ? 1 : 0)
  while (true) {
    const raw = await ask(rl, `  Pick [1-${max}]: `)
    const n = parseInt(raw, 10)
    if (n >= 1 && n <= choices.length) return choices[n - 1].value
    if (allowRandom && n === choices.length + 1) return 'random'
    console.log(`  Enter a number 1-${max}`)
  }
}

async function yesNo(rl: readline.Interface, question: string): Promise<boolean> {
  while (true) {
    const raw = await ask(rl, `${question} [y/n]: `)
    if (raw === 'y' || raw === 'Y') return true
    if (raw === 'n' || raw === 'N') return false
  }
}

async function askSeed(rl: readline.Interface): Promise<number | undefined> {
  console.log('\nSeed (leave blank for random):')
  const raw = await ask(rl, '  > ')
  if (!raw) return undefined
  const n = parseInt(raw, 10)
  if (isNaN(n) || n <= 0) {
    console.log('  Invalid seed — using random')
    return undefined
  }
  return n
}

async function interactive() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

  console.log('\n╔══════════════════════════════════════╗')
  console.log('║   🗺️  Realm Generator — Interactive   ║')
  console.log('╚══════════════════════════════════════╝\n')

  // Geography
  const geo = await pick(rl, '🌍 Geography template:', GEOGRAPHY)
  const tagList = geo !== 'random' ? [geo] : []

  // Landscape
  for (const group of LANDSCAPE_GROUPS) {
    const val = await pick(rl, `\n⛰️  ${group.name}:`, group.choices, false)
    if (val !== 'none') tagList.push(val)
  }

  // Options (multi-select)
  console.log('\n📋 Optional modifiers (pick as many as you want):')
  for (const opt of OPTIONS) {
    if (await yesNo(rl, `  Include ${opt.label}? (${opt.desc})`)) {
      tagList.push(opt.value)
    }
  }

  // Danger
  const danger = await pick(rl, `\n⚠️  Danger level:`, DANGER, false)
  if (danger !== 'none') tagList.push(danger)

  // Alignment
  const alignment = await pick(rl, `\n⚖️  Alignment:`, ALIGNMENT, false)
  if (alignment !== 'neutral') tagList.push(alignment)

  // Seed
  const seed = await askSeed(rl)

  rl.close()

  const tags = tagList.length > 0 ? tagList.join(',') : undefined
  console.log(`\n🎲 Generating with tags: ${tags || 'random'}${seed ? `, seed: ${seed}` : ''}\n`)

  return { seed, tags }
}

// ── CLI parsing ────────────────────────────────────────────────────

function parseCli() {
  const args: Record<string, string | undefined> = {}
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i].startsWith('--')) {
      const key = process.argv[i].slice(2)
      const val = process.argv[i + 1]
      if (val && !val.startsWith('--')) {
        args[key] = val
        i++
      } else {
        args[key] = 'true'
      }
    }
  }
  return {
    seed: args.seed ? parseInt(args.seed, 10) : undefined,
    tags: args.tags || undefined,
    width: args.width ? parseInt(args.width, 10) : undefined,
    height: args.height ? parseInt(args.height, 10) : undefined,
    hexes: args.hexes ? parseInt(args.hexes, 10) : undefined,
    // Include the decorative parchment border/frame. Supports either
    // `--matte` (boolean flag) or `--matte false`/`--matte true`. Defaults
    // to undefined (unset) -> generate() applies its own default of false
    // (borderless).
    matte: args.matte !== undefined ? args.matte !== 'false' : undefined,
  }
}

// ── Main generation ─────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(PUBLIC, { recursive: true })

  // Determine mode: interactive if TTY and no CLI args, CLI otherwise
  const hasArgs = process.argv.length > 2
  const isTTY = process.stdin.isTTY

  let seed: number | undefined
  let tags: string | undefined
  let width: number | undefined
  let height: number | undefined
  let hexes: number | undefined
  let matte: boolean | undefined

  if (hasArgs) {
    const cli = parseCli()
    seed = cli.seed
    tags = cli.tags
    width = cli.width
    height = cli.height
    hexes = cli.hexes
    matte = cli.matte
  } else if (isTTY) {
    const result = await interactive()
    seed = result.seed
    tags = result.tags

    // Print the equivalent CLI command for future non-interactive re-runs
    const cliArgs: string[] = []
    if (seed !== undefined) cliArgs.push(`--seed ${seed}`)
    if (tags) cliArgs.push(`--tags "${tags}"`)
    const cmd = `npm run generate -- ${cliArgs.join(' ')}`
    console.log(`\n📋  Equivalent CLI command:\n    ${cmd}\n`)
  } else {
    console.log('[realm] No TTY detected — using random world.')
  }

  // ── Generate ────────────────────────────────────────────────────
  console.log('[realm] Initialising engine...')
  const { init } = require(path.resolve(__dirname, '..', 'src', 'realm', 'index'))
  await init()

  console.log('[realm] Generating...')
  const { createGenerator } = require(path.resolve(__dirname, '..', 'src', 'realm', 'index'))
  const gen = createGenerator()
  const realm = await gen.generate({
    ...(seed !== undefined ? { seed } : {}),
    ...(matte !== undefined ? { showMatte: matte } : {}),
    ...(tags ? { tags } : {}),
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
    ...(hexes !== undefined ? { hexes } : {}),
  })

  const name = realm.name || 'Fantasy World'
  console.log(`[realm] Generated: "${name}" (seed=${realm.seed})`)

  // ── Export SVG ──────────────────────────────────────────────────
  console.log('[realm] Exporting SVG...')
  const svg = await realm.exportSvg()
  const svgPath = path.join(PUBLIC, 'realm.svg')
  fs.writeFileSync(svgPath, svg, 'utf-8')
  console.log(`[realm] Wrote ${svgPath} (${(svg.length / 1024).toFixed(0)} KB)`)

  // ── Export JSON (hex data) ──────────────────────────────────────
  console.log('[realm] Exporting JSON...')
  const jsonStr = await realm.exportJson()
  const realmData = JSON.parse(jsonStr)

  // ── Extract towns from hex data ─────────────────────────────────
  const towns: Array<{
    name: string; type: string; seed: number; q: number; r: number
    size?: number; tags?: string
  }> = []

  if (realmData.hexes) {
    for (const [, hex] of Object.entries(realmData.hexes) as [string, any][]) {
      if (!hex?.town) continue
      const t = hex.town
      const seedMatch = t.link?.match(/[?&]seed=(\d+)/)
      const townSeed = seedMatch ? parseInt(seedMatch[1], 10) : Math.floor(Math.random() * 2147483647)
      const sizeMatch = t.link?.match(/[?&]size=(\d+)/)
      const tagsMatch = t.link?.match(/[?&]tags=([^&]+)/)

      towns.push({
        name: t.name,
        type: t.type,
        seed: townSeed,
        q: hex.q,
        r: hex.r,
        size: sizeMatch ? parseInt(sizeMatch[1], 10) : undefined,
        tags: tagsMatch ? decodeURIComponent(tagsMatch[1]) : undefined,
      })
    }
  }
  console.log(`[realm] Found ${towns.length} towns: ${towns.map(t => t.name).join(', ')}`)

  // ── Get precise town pixel positions ──────────────────────────────
  // The exported SVG wraps all map content in a single root
  // <g transform="translate(w/2 h/2)"> that centers the map on the canvas;
  // every hex/POI group (including each town's label) is a LOCAL sibling
  // nested one level inside it. The frontend (RealmView.vue) imports the
  // whole SVG — root group included — into an untransformed wrapper <g>, but
  // appends town markers as siblings OUTSIDE that root group's transform.
  // So marker coordinates must be in ABSOLUTE/canvas space: rootDx + localX,
  // rootDy + localY. Omitting the root offset here shifts every marker by
  // exactly (-rootDx, -rootDy) from its true icon position.
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

  // Prefer the icon's EXACT rendered bounding box, read directly from the
  // live Haxe/OpenFL sprite object (captured via realm.getTownIconBounds() —
  // see src/realm/index.ts, which intercepts View.drawTown to record each
  // town's icon sprite as it's created). This gives the true visual center
  // of the icon glyph, correctly accounting for its actual (randomized,
  // per-town) house-cluster layout — no fixed pixel guessing needed.
  try {
    const islands: any[] = realm.region?.islands || []
    for (const island of islands) {
      for (const t of island.towns || []) {
        const tname: string = t.name ?? t.getName?.()
        if (!tname) continue
        const bounds = realm.getTownIconBounds?.(t)
        if (bounds && bounds.width > 0 && bounds.height > 0) {
          townPositions[tname] = {
            x: rootDx + bounds.x + bounds.width / 2,
            y: -(rootDy + bounds.y + bounds.height / 2),
          }
          continue
        }
        // Fall back to the icon anchor (cell.center + getOffset()) if the
        // live bounding box wasn't captured for this town.
        const center = t.cell?.center
        const offset = t.getOffset?.()
        if (!center || !offset) continue
        townPositions[tname] = {
          x: rootDx + center.x + offset.x,
          y: -(rootDy + center.y + offset.y),
        }
      }
    }
  } catch (e: any) {
    console.warn('[realm] Could not read town positions from region model:', e.message)
  }

  // Fallback for any town not found via the live model — approximate using
  // the label's SVG position (still needs the root offset added).
  //
  // Labels can render two ways depending on length/word-wrap:
  //   flat:   <text transform="translate(x y)">Name</text>
  //   wrapped: <text transform="translate(x y)"><tspan ...>Word1 </tspan><tspan ...>Word2</tspan></text>
  // (multi-word names may wrap onto a second line as separate <tspan>s).
  // Try the flat form first, then fall back to matching the whole <text>
  // element and checking its concatenated text content.
  for (const town of towns) {
    if (townPositions[town.name]) continue
    const escaped = town.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

    const flatRe = new RegExp(
      `transform="translate\\((-?\\d+\\.?\\d*)\\s+(-?\\d+\\.?\\d*)\\)">${escaped}</text>`
    )
    let match: RegExpMatchArray | null = svg.match(flatRe)

    if (!match) {
      const textBlockRe = /<text[^>]*transform="translate\((-?\d+\.?\d*)\s+(-?\d+\.?\d*)\)"[^>]*>((?:(?!<\/text>)[\s\S])*)<\/text>/g
      let blockMatch: RegExpExecArray | null
      while ((blockMatch = textBlockRe.exec(svg)) !== null) {
        const innerText = blockMatch[3].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
        if (innerText === town.name) {
          match = blockMatch
          break
        }
      }
    }

    if (match) {
      townPositions[town.name] = {
        x: rootDx + parseFloat(match[1]),
        y: -(rootDy + parseFloat(match[2])),
      }
    } else {
      console.warn(`[realm] Could not find position for "${town.name}"`)
    }
  }

  // ── Build towns.json ────────────────────────────────────────────
  const townMarkers = towns.map(t => {
    const pos = townPositions[t.name] || { x: 0, y: 0 }
    return {
      q: t.q, r: t.r, x: pos.x, y: pos.y,
      name: t.name, type: t.type, seed: t.seed,
      file: `/${t.type === 'village' ? 'village' : 'city'}/${t.name.replace(/[^a-zA-Z0-9_-]/g, '')}.json`,
    }
  })

  const townsPath = path.join(PUBLIC, 'towns.json')
  fs.writeFileSync(townsPath, JSON.stringify(townMarkers, null, 2), 'utf-8')
  console.log(`[realm] Wrote ${townsPath} (${townMarkers.length} towns)`)

  // ── Build realm.json (Theme) ────────────────────────────────────
  const theme = { title: name, padding: 60, layers: [] }
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
