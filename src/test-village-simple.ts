import { init, createGenerator } from './village/index';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log('Init...');
  await init();
  console.log('OK\n');
  
  const gen = createGenerator();
  const seed = 1713304636;
  console.log(`Generate seed=${seed} tags=grove,palisade,sparse,farmland,island,isolated`);
  const v = await gen.generate({ seed, tags: 'grove,palisade,sparse,farmland,island,isolated' });
  console.log(`Village: ${v.name}`);
  
  const outDir = path.resolve(__dirname, '..', 'output');
  
  // JSON
  try {
    const json = await v.exportJson();
    console.log(`JSON: ${json.length} chars`);
    fs.writeFileSync(path.join(outDir, 'village.json'), json);
    console.log('  Saved');
  } catch(e: any) { console.log(`JSON fail: ${e.message}`); }
  
  // SVG
  try {
    const svg = await v.exportSvg();
    console.log(`SVG: ${svg.length} chars`);
    if (svg.length > 100) fs.writeFileSync(path.join(outDir, 'village.svg'), svg);
  } catch(e: any) { console.log(`SVG fail: ${e.message}`); }
  
  console.log('Done');
}
main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
