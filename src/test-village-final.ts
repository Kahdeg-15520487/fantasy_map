import { init, createGenerator } from './village/index';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log('Initializing Village...');
  await init();
  console.log('OK\n');

  // Test with verification seed
  const seed = 1713304636;
  console.log(`Seed: ${seed}, tags: grove,palisade,sparse,farmland,island,isolated`);
  const gen = createGenerator();
  const v = await gen.generate({ seed, tags: 'grove,palisade,sparse,farmland,island,isolated' });
  console.log(`Village: ${v.name}`);

  const outDir = path.resolve(__dirname, '..', 'output');
  
  // Export JSON
  console.log('\nExporting JSON...');
  try {
    const json = await v.exportJson();
    console.log(`JSON: ${json.length} chars`);
    if (json.length > 10) {
      fs.writeFileSync(path.join(outDir, 'village_test.json'), json);
      console.log('  Saved to output/village_test.json');
    }
  } catch(e: any) { console.log(`JSON failed: ${e.message}`); }

  // Export SVG
  console.log('\nExporting SVG...');
  try {
    const svg = await v.exportSvg();
    console.log(`SVG: ${svg.length} chars`);
    if (svg.length > 100) {
      fs.writeFileSync(path.join(outDir, 'village_test.svg'), svg);
      console.log('  Saved to output/village_test.svg');
    }
  } catch(e: any) { console.log(`SVG failed: ${e.message}`); }

  // Export PNG
  console.log('\nExporting PNG...');
  try {
    const png = await v.exportPng();
    console.log(`PNG: ${png.length} bytes`);
    if (png.length > 0) {
      fs.writeFileSync(path.join(outDir, 'village_test.png'), png);
      console.log('  Saved to output/village_test.png');
    }
  } catch(e: any) { console.log(`PNG failed: ${e.message}`); }

  console.log('\nDone!');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
