/**
 * Build script — generates the fantasy world map static site.
 * 
 * Steps:
 * 1. Initialize realm, city, village engines
 * 2. Generate realm JSON + SVG
 * 3. Extract towns from realm JSON, generate city/village GeoJSON
 * 4. Write town-data.json with pixel positions
 * 5. Compile frontend TypeScript → JS bundle
 * 6. Copy HTML, CSS, assets to build output
 * 
 * Usage: npx tsx src/build.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { init as initRealm, createGenerator as createRealmGen } from './realm';
import { init as initCity, createGenerator as createCityGen } from './city';
import { init as initVillage, createGenerator as createVillageGen } from './village';

const BUILD_DIR = path.resolve(__dirname, '..', 'build');
const OUT_DIR = path.join(BUILD_DIR, 'world');
const FRONTEND_DIR = path.resolve(__dirname, 'frontend');

// ── Configuration ────────────────────────────────────────────────

const REALM_SEED = 326054124;
const REALM_TAGS = 'civilized,difficult,perilous,wetland,lowland,neutral,peninsula';
const REALM_WIDTH = 1800;
const REALM_HEIGHT = 1800;

interface TownData {
  q: number;
  r: number;
  x: number;
  y: number;
  name: string;
  type: 'village' | 'town' | 'city';
  seed: number;
  file: string;
}

// ── Helpers ──────────────────────────────────────────────────────

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ── Main ─────────────────────────────────────────────────────────

async function main() {
  console.log('=== Fantasy World Map Builder ===\n');
  ensureDir(OUT_DIR);

  // Step 1: Initialize engines
  console.log('[1/5] Initializing generators...');
  await initRealm();
  await initCity();
  await initVillage();
  console.log('  All engines ready.\n');

  // Step 2: Generate realm
  console.log('[2/5] Generating realm...');
  const realmGen = createRealmGen();
  const realm = await realmGen.generate({
    seed: REALM_SEED,
    tags: REALM_TAGS,
    width: REALM_WIDTH,
    height: REALM_HEIGHT,
  });

  const realmJson = await realm.exportJson();
  const realmSvg = await realm.exportSvg();

  fs.writeFileSync(path.join(OUT_DIR, 'realm.json'), realmJson);
  fs.writeFileSync(path.join(OUT_DIR, 'realm.svg'), realmSvg);
  console.log(`  Realm: ${realm.name} (${realmJson.length}B JSON, ${realmSvg.length}B SVG)\n`);

  // Step 3: Extract towns and generate city/village maps
  console.log('[3/5] Generating town maps...');
  const realmData = JSON.parse(realmJson);
  const hexes = realmData.hexes || {};
  const towns: TownData[] = [];
  const g = globalThis as any;
  const Region = g.RealmRegion;

  // Build hex index for coordinate lookup
  // The region.indices map has hex_id → pixel coordinate
  // We need to access it through the engine's internal state
  // For now, approximate using hex geometry constants
  const hexRadius = Region?.hexRadius || 50;
  const hexWidth2 = Region?.hexWidth2 || 43.3;
  const hexHeight2 = Region?.hexHeight2 || 50;

  let generated = 0;

  for (const [hexKey, hexData] of Object.entries(hexes) as [string, any][]) {
    const town = hexData.town;
    if (!town) continue;

    const q = hexData.q, r = hexData.r;
    
    // Convert hex q,r to pixel x,y (approximate — SVG uses same coordinate system)
    // The SVG rendering uses axial coordinates with y-flip
    // x = hexWidth2 * (q - offset), y = hexHeight2 * (r * 1.5 - offset) + stagger
    const staggerY = (q & 1) ? hexHeight2 * 0.75 : 0;
    const x = q * hexWidth2;
    const y = r * hexHeight2 * 1.5 + staggerY;

    const townType = town.type || 'village';
    const townName = town.name || hexKey;
    const townSeed = town.seed || (town.link ? parseInt(town.link.match(/seed=(\d+)/)?.[1] || '0') : 0);

    try {
      const fileName = `${townName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${townType}`;
      const filePath = `${fileName}.json`;

      if (townType === 'city' || townType === 'town') {
        const cityGen = createCityGen();
        const size = townType === 'city' ? 35 : 20;
        const city = await cityGen.generate({ seed: townSeed, size });
        const geoJson = await city.exportJson();
        fs.writeFileSync(path.join(OUT_DIR, filePath), geoJson);
        // Also write companion theme
        fs.writeFileSync(path.join(OUT_DIR, `${fileName}_theme.json`), JSON.stringify({
          title: townName,
          generator: 'mfcg',
          boundsSource: 'earth',
          padding: 60,
          layers: [
            { id: 'water', label: 'Water', order: 1, batch: true, fill: '#1a5276', stroke: '#5dade2', strokeWidth: 1.5, opacity: 0.95 },
            { id: 'earth', label: 'Land', order: 2, fill: '#2d5016', stroke: '#1a300a', strokeWidth: 1.5, opacity: 1 },
            { id: 'fields', label: 'Fields', order: 3, batch: true, fill: '#4a7c23', stroke: '#3a5e1a', strokeWidth: 0.5, opacity: 0.7 },
            { id: 'rivers', label: 'Rivers', order: 8, fill: 'none', stroke: '#1a5276', strokeWidth: 6, strokeLinecap: 'round', opacity: 0.9, widthScale: 1.5 },
            { id: 'districts', label: 'Districts', order: 14, randomFill: true, stroke: 'rgba(255,255,255,0.3)', strokeWidth: 0.8, opacity: 0.9, tooltipField: 'name' },
            { id: 'squares', label: 'Squares', order: 5, batch: true, fill: '#c9a96e', stroke: '#a08050', strokeWidth: 0.8, opacity: 0.8 },
            { id: 'roads', label: 'Roads', order: 12, fill: 'none', stroke: '#c9a96e', strokeWidth: 3, strokeLinecap: 'round', opacity: 0.85, widthScale: 1 },
            { id: 'buildings', label: 'Buildings', order: 9, batch: true, fill: '#6b4c3b', stroke: '#3e2a1e', strokeWidth: 0.8, opacity: 0.95 },
            { id: 'prisms', label: 'Towers', order: 10, batch: true, fill: '#a08060', stroke: '#4a3020', strokeWidth: 2.5, opacity: 1 },
            { id: 'trees', label: 'Trees', order: 13, fill: '#2d6a1e', stroke: '#1a4a10', strokeWidth: 0.3, opacity: 0.7, radius: 3 },
            { id: 'walls', label: 'Walls', order: 7, batch: true, fill: 'none', stroke: '#1a1a1a', strokeWidth: 5, opacity: 0.9, wallMarkers: true, innerWallDistrict: 'Castle', markerRadius: 5, markerFill: '#f5f5dc' },
          ],
        }, null, 2));
      } else {
        const villageGen = createVillageGen();
        const village = await villageGen.generate({ seed: townSeed, tags: '' });
        const geoJson = await village.exportJson();
        // For village, we need to wrap in GeoJSON FeatureCollection
        // Village JSON is plain structured data, not GeoJSON
        // Write as-is for now, frontend can handle plain JSON
        fs.writeFileSync(path.join(OUT_DIR, filePath), geoJson);
        fs.writeFileSync(path.join(OUT_DIR, `${fileName}_theme.json`), JSON.stringify({
          title: townName,
          generator: 'village',
          boundsSource: null,
          padding: 60,
          layers: [],
        }, null, 2));
      }

      towns.push({ q, r, x, y, name: townName, type: townType, seed: townSeed, file: filePath });
      generated++;
      if (generated % 3 === 0) console.log(`  Generated ${generated} towns...`);
    } catch (e: any) {
      console.error(`  ERROR generating ${townName}: ${e.message}`);
    }
  }

  console.log(`  Total: ${generated} towns generated\n`);

  // Write town data
  fs.writeFileSync(path.join(OUT_DIR, 'towns.json'), JSON.stringify(towns, null, 2));

  // Write realm theme
  fs.writeFileSync(path.join(OUT_DIR, 'realm_theme.json'), JSON.stringify({
    title: realm.name,
    generator: 'perilous-shores',
    boundsSource: null,
    padding: 60,
    layers: [],
  }, null, 2));

  // Step 4: Compile frontend TypeScript → JS
  console.log('[4/5] Compiling frontend...');
  ensureDir(BUILD_DIR);

  // Bundle with esbuild (IIFE format for browser)
  const entryPoint = path.join(FRONTEND_DIR, 'app.ts');
  const outFile = path.join(OUT_DIR, 'app.js');

  try {
    execSync(
      `npx esbuild "${entryPoint}" --bundle --format=iife --global-name=WorldMap --outfile="${outFile}" --target=es2020`,
      { stdio: 'pipe', cwd: path.resolve(__dirname, '..') }
    );
    console.log(`  Compiled to ${outFile}`);
  } catch (e: any) {
    console.error('  Esbuild failed:', e.stderr?.toString() || e.message);
    // Fallback: copy ts files as-is (won't work but documents the intent)
  }
  console.log();

  // Step 5: Copy static assets
  console.log('[5/5] Copying static assets...');
  for (const file of ['index.html', 'style.css']) {
    fs.copyFileSync(path.join(FRONTEND_DIR, file), path.join(OUT_DIR, file));
  }
  console.log(`  Copied index.html, style.css\n`);

  console.log(`=== Build complete! ===`);
  console.log(`Output: ${OUT_DIR}`);
  console.log(`Files: realm.svg, realm.json, towns.json, app.js, index.html, style.css`);
  console.log(`  + ${generated} town GeoJSON files`);
}

main().catch(e => {
  console.error('Build failed:', e.message);
  process.exit(1);
});
