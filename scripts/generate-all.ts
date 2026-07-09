/**
 * Orchestrator: generates all frontend data by spawning each engine
 * in its own child process (required because Haxe bundles clobber
 * each other's globals when loaded in the same Node process).
 *
 * Phase 1: Realm (sequential — must finish first to produce towns.json)
 * Phase 2: Towns (parallel — each city/village in its own process)
 *
 * Usage: npm run generate
 */
import { exec } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

const ROOT = path.resolve(__dirname, '..')
const PUBLIC = path.join(ROOT, 'frontend', 'public')
const CONCURRENCY = 4 // max parallel town generations

function runSync(cmd: string): void {
  console.log(`\n▶ ${cmd}`)
  const { execSync } = require('child_process')
  execSync(`npx tsx ${cmd}`, {
    cwd: ROOT,
    stdio: 'inherit',
    timeout: 120_000,
  })
}

function runAsync(cmd: string, label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`\n▶ [${label}] ${cmd}`)
    const child = exec(`npx tsx ${cmd}`, {
      cwd: ROOT,
      timeout: 120_000,
      maxBuffer: 1024 * 1024, // 1MB stdout buffer
    })
    child.stdout?.pipe(process.stdout)
    child.stderr?.pipe(process.stderr)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${label} exited with code ${code}`))
    })
    child.on('error', reject)
  })
}

function loadTowns(): Array<{ name: string; type: string; seed: number; size?: number; tags?: string }> {
  const townsPath = path.join(PUBLIC, 'towns.json')
  if (!fs.existsSync(townsPath)) {
    throw new Error(`${townsPath} not found — did generate-realm succeed?`)
  }
  return JSON.parse(fs.readFileSync(townsPath, 'utf-8'))
}

/** Run tasks in parallel with a concurrency limit. */
async function parallelLimit<T>(
  tasks: Array<{ run: () => Promise<T>; label: string }>,
  limit: number
): Promise<Array<{ label: string; ok: boolean; error?: string }>> {
  const results: Array<{ label: string; ok: boolean; error?: string }> = []
  let index = 0

  async function worker() {
    while (index < tasks.length) {
      const i = index++
      const task = tasks[i]
      try {
        await task.run()
        results[i] = { label: task.label, ok: true }
      } catch (err: any) {
        results[i] = { label: task.label, ok: false, error: err.message }
        console.error(`[generate] Failed: ${task.label} — ${err.message}`)
      }
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()))
  return results
}

async function main() {
  const startTime = Date.now()

  // ── Collect passthrough args for realm ──────────────────────────
  const passthrough: string[] = []
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === '--seed' || process.argv[i] === '--tags' || process.argv[i] === '--hexes') {
      passthrough.push(process.argv[i], process.argv[i + 1])
      i++
    } else if (process.argv[i] === '--width' || process.argv[i] === '--height') {
      passthrough.push(process.argv[i], process.argv[i + 1])
      i++
    }
  }

  // ── Phase 1: Realm (must be sequential — writes towns.json) ──
  runSync(`scripts/generate-realm.ts${passthrough.length > 0 ? ' ' + passthrough.join(' ') : ''}`)

  // ── Phase 2: Towns (parallel) ────────────────────────────────
  const towns = loadTowns()
  console.log(`\n[generate] Processing ${towns.length} towns in parallel (max ${CONCURRENCY})...`)

  const tasks = towns.map((town) => {
    const engineType = town.type === 'village' ? 'village' : 'city'
    const args = [
      `--type ${engineType}`,
      `--name "${town.name.replace(/"/g, '\\"')}"`,
      `--seed ${town.seed}`,
    ]
    if (town.size) args.push(`--size ${town.size}`)
    if (town.tags) args.push(`--tags "${town.tags}"`)

    const cmd = `scripts/generate-town.ts ${args.join(' ')}`
    return {
      label: `${town.name} (${engineType})`,
      run: () => runAsync(cmd, town.name),
    }
  })

  const results = await parallelLimit(tasks, CONCURRENCY)
  const ok = results.filter((r) => r.ok).length
  const fail = results.filter((r) => !r.ok).length

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`\n[generate] Done in ${elapsed}s — ${ok} towns OK, ${fail} failed`)
  process.exit(fail > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('[generate] Fatal:', err)
  process.exit(1)
})
