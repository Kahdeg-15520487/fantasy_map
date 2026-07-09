/**
 * Unified demo: initializes all 6 Watabou generators and tests generation.
 * Uses seed URLs from verification/*.txt for reproducible output.
 */
import * as fs from 'fs';
import * as path from 'path';

// ── City (MFCG) ────────────────────────────────────────────────
import { init as initCity, createGenerator as createCityGen } from './city/index';
import type { CityOptions } from './city/types';

// ── Realm + Village (have generate APIs) ───────────────────────
import { init as initRealm, createGenerator as createRealmGen } from './realm/index';
import { init as initVillage, createGenerator as createVillageGen } from './village/index';

// ── Engines without a generate wrapper (init-only smoke test) ──
import { initEngine as initCaveEngine } from './cave/engine';
import { initEngine as initDungeonEngine } from './dungeon/engine';
import { initEngine as initDwellingEngine } from './dwelling/engine';

const OUTPUT_DIR = path.resolve(__dirname, '..', 'output');
const VERIFICATION_DIR = path.resolve(__dirname, '..', 'verification');

interface GeneratorInfo {
  name: string;
  verDir: string;
  initFn: () => Promise<any>;
  generateFn?: (seed: number) => Promise<any>;
}

function parseSeedUrl(url: string): { seed: number; params: Record<string, string> } {
  // Parse URL manually to avoid URL constructor issues with polyfills
  const qIndex = url.indexOf('?');
  const seed: number = (() => {
    const m = url.match(/seed=(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  })();
  const params: Record<string, string> = {};
  if (qIndex >= 0) {
    const qs = url.substring(qIndex + 1);
    for (const pair of qs.split('&')) {
      const [key, value] = pair.split('=');
      if (key && key !== 'seed') {
        params[key] = decodeURIComponent(value || '');
      }
    }
  }
  return { seed, params };
}

function readVerificationTxt(verDir: string): { name: string; url: string; seed: number }[] {
  const dir = path.join(VERIFICATION_DIR, verDir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.txt'))
    .map(f => {
      const url = fs.readFileSync(path.join(dir, f), 'utf-8').trim();
      const { seed } = parseSeedUrl(url);
      return { name: f.replace('.txt', ''), url, seed };
    });
}

async function testCity(): Promise<boolean> {
  console.log('\n🏙️  City (MFCG)');
  try {
    await initCity();
    const gen = createCityGen();
    const samples = readVerificationTxt('city');
    if (samples.length === 0) {
      console.log('  ⚠ No verification files found');
      return false;
    }
    const sample = samples[0];
    console.log(`  Generating "${sample.name}" (seed: ${sample.seed})...`);

    const city = await gen.generate({ size: 27, seed: sample.seed });
    console.log(`  ✅ City: ${city.name}`);

    // Export JSON
    const json = await city.exportJson();
    fs.writeFileSync(path.join(OUTPUT_DIR, `${sample.name}.json`), json);
    console.log(`  ✅ JSON: ${json.length} chars`);

    // Export SVG
    const svg = await city.exportSvg();
    fs.writeFileSync(path.join(OUTPUT_DIR, `${sample.name}.svg`), svg);
    console.log(`  ✅ SVG: ${svg.length} chars`);

    // PNG export intentionally skipped (not supported in headless Node canvas).

    return true;
  } catch (e: any) {
    console.log(`  ❌ Failed: ${e.message}`);
    return false;
  }
}

async function testRealm(): Promise<boolean> {
  console.log('\n🌍 Perilous Shores (realm)');
  try {
    await initRealm();
    const gen = createRealmGen();
    const samples = readVerificationTxt('realm');
    const seed = samples[0]?.seed ?? 12345;
    const tags = samples[0] ? parseSeedUrl(samples[0].url).params.tags : undefined;
    const name = samples[0]?.name ?? 'realm';
    console.log(`  Generating "${name}" (seed: ${seed})...`);

    const realm = await gen.generate({ seed, tags });
    console.log(`  ✅ Realm: ${realm.name}`);

    const json = await realm.exportJson();
    fs.writeFileSync(path.join(OUTPUT_DIR, `${name}.json`), json);
    console.log(`  ✅ JSON: ${json.length} chars`);

    const svg = await realm.exportSvg();
    fs.writeFileSync(path.join(OUTPUT_DIR, `${name}.svg`), svg);
    console.log(`  ✅ SVG: ${svg.length} chars`);

    return json.length > 2 && svg.length > 20;
  } catch (e: any) {
    console.log(`  ❌ Failed: ${e.message}`);
    return false;
  }
}

async function testVillage(): Promise<boolean> {
  console.log('\n🏠 Village Generator');
  try {
    await initVillage();
    const gen = createVillageGen();
    const samples = readVerificationTxt('village');
    const seed = samples[0]?.seed ?? 12345;
    const tags = samples[0] ? parseSeedUrl(samples[0].url).params.tags : undefined;
    const name = samples[0]?.name ?? 'village';
    console.log(`  Generating "${name}" (seed: ${seed})...`);

    const village = await gen.generate({ seed, tags });
    console.log(`  ✅ Village: ${village.name}`);

    const json = await village.exportJson();
    fs.writeFileSync(path.join(OUTPUT_DIR, `${name}.json`), json);
    console.log(`  ✅ JSON: ${json.length} chars`);

    const svg = await village.exportSvg();
    fs.writeFileSync(path.join(OUTPUT_DIR, `${name}.svg`), svg);
    console.log(`  ✅ SVG: ${svg.length} chars`);

    return json.length > 2;
  } catch (e: any) {
    console.log(`  ❌ Failed: ${e.message}`);
    return false;
  }
}

async function testEngine(name: string, initFn: () => Promise<any>): Promise<boolean> {
  console.log(`\n🔧 ${name}`);
  try {
    // Set a 30-second timeout
    const result = await Promise.race([
      initFn().then(() => true),
      new Promise<boolean>((_, reject) => setTimeout(() => reject(new Error('Timeout after 30s')), 30000))
    ]);
    if (!result) return false;

    const g = globalThis as any;

    // List available classes (potential model/export classes)
    const classNames = Object.keys(g).filter(k =>
      k.length <= 3 && k[0] === k[0].toUpperCase() && typeof g[k] === 'function'
    ).sort();
    console.log(`  ✅ Engine initialized`);
    console.log(`  Available classes: ${classNames.slice(0, 20).join(', ')}${classNames.length > 20 ? ', ...' : ''}`);

    return true;
  } catch (e: any) {
    console.log(`  ❌ Failed: ${e.message}`);
    return false;
  }
}

async function main() {
  console.log('=== Watabou Generators Unified Demo ===\n');

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const results: Record<string, boolean> = {};

  // Test City (full flow)
  results.city = await testCity();

  // Test realm + village (full generation via their index.ts APIs)
  results.realm = await testRealm();
  results.village = await testVillage();

  // Test remaining engines (init only, report available classes)
  results.cave = await testEngine('Cave Generator', initCaveEngine);
  results.dungeon = await testEngine('One Page Dungeon', initDungeonEngine);
  results.dwelling = await testEngine('Dwellings', initDwellingEngine);

  // Summary
  console.log('\n=== Summary ===');
  for (const [name, ok] of Object.entries(results)) {
    console.log(`  ${ok ? '✅' : '❌'} ${name}`);
  }

  const allOk = Object.values(results).every(v => v);
  if (allOk) {
    console.log('\n🎉 All generators initialized successfully!');
  } else {
    console.log('\n⚠ Some generators failed initialization.');
  }

  // The Haxe/OpenFL runtimes leave open handles (timers, canvas, RAF polyfills)
  // that keep the Node event loop alive. Force exit once work is done.
  process.exit(allOk ? 0 : 1);
}

main().catch(err => {
  console.error('Demo failed:', err);
  process.exit(1);
});
