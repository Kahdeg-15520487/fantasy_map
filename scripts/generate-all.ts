/**
 * Orchestrator: generates all frontend data by spawning each engine
 * in its own child process (required because Haxe bundles clobber
 * each other's globals when loaded in the same Node process).
 *
 * Usage: npm run generate
 */
import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

const ROOT = path.resolve(__dirname, '..')
const PUBLIC = path.join(ROOT, 'frontend', 'public')

function run(cmd: string): void {
  console.log(`\n▶ ${cmd}`)
  execSync(`npx tsx ${cmd}`, {
    cwd: ROOT,
    stdio: 'inherit',
    timeout: 120_000, // 2 min per engine — realm SVG can take a while
  })
}

function loadTowns(): Array<{ name: string; type: string; seed: number; size?: number; tags?: string }> {
  const townsPath = path.join(PUBLIC, 'towns.json')
  if (!fs.existsSync(townsPath)) {
    throw new Error(`${townsPath} not found — did generate-realm succeed?`)
  }
  return JSON.parse(fs.readFileSync(townsPath, 'utf-8'))
}

async function main() {
  const startTime = Date.now()

  // ── Phase 1: Realm ──────────────────────────────────────────
  run('scripts/generate-realm.ts')

  // ── Phase 2: Towns ──────────────────────────────────────────
  const towns = loadTowns()
  console.log(`\n[generate] Processing ${towns.length} towns...`)

  let ok = 0
  let fail = 0

  for (const town of towns) {
    const engineType = town.type === 'village' ? 'village' : 'city'
    const args = [
      `--type ${engineType}`,
      `--name "${town.name.replace(/"/g, '\\"')}"`,
      `--seed ${town.seed}`,
    ]
    if (town.size) args.push(`--size ${town.size}`)
    if (town.tags) args.push(`--tags "${town.tags}"`)

    try {
      run(`scripts/generate-town.ts ${args.join(' ')}`)
      ok++
    } catch (err) {
      console.error(`[generate] Failed: ${town.name} (${engineType})`)
      fail++
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`\n[generate] Done in ${elapsed}s — ${ok} towns OK, ${fail} failed`)
  process.exit(fail > 0 ? 1 : 0)
}

main().catch(err => {
  console.error('[generate] Fatal:', err)
  process.exit(1)
})
