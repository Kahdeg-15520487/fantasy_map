import { init, createGenerator } from './realm/index';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log('Init Realm...');
  await init();
  console.log('OK\n');

  const gen = createGenerator();
  // From sloate_peninsula.txt
  const seed = 326054124;
  const tags = 'civilized,difficult,perilous,wetland,lowland,neutral,peninsula';
  console.log(`Generate seed=${seed} tags=${tags}`);
  const realm = await gen.generate({ seed, tags, width: 1800, height: 1800 });
  console.log(`Realm: ${realm.name}`);

  const outDir = path.resolve(__dirname, '..', 'output');

  // JSON
  try {
    const json = await realm.exportJson();
    console.log(`JSON: ${json.length} chars`);
    fs.writeFileSync(path.join(outDir, 'realm_sloate.json'), json);
    const refSize = fs.statSync(path.join(__dirname, '..', 'verification', 'realm', 'sloate_peninsula.json')).size;
    console.log(`  Ref: ${refSize} chars (${((json.length/refSize-1)*100).toFixed(1)}%)`);
  } catch(e: any) { console.log(`JSON fail: ${e.message}`); }

  // SVG
  try {
    const svg = await realm.exportSvg();
    console.log(`SVG: ${svg.length} chars`);
    if (svg.length > 100) fs.writeFileSync(path.join(outDir, 'realm_sloate.svg'), svg);
  } catch(e: any) { console.log(`SVG fail: ${e.message}`); }

  console.log('Done');
}
main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
