import { init, createGenerator } from './city/index';
import * as fs from 'fs';

async function main() {
  await init();
  const gen = createGenerator();
  // All params from duskvale.txt (except sea which isn't on Blueprint)
  const city = await gen.generate({
    size: 27, seed: 800047775,
    citadel: true, urbanCastle: true, plaza: true, temple: true,
    walls: false, shantytown: true, coast: true, river: true,
    greens: false, gates: -1, sea: 1.4
  });
  console.log('City:', city.name);
  const json = await city.exportJson();
  const svg = await city.exportSvg();
  fs.writeFileSync('output/duskvale_full.json', json);
  fs.writeFileSync('output/duskvale_full.svg', svg);
  
  const refJson = fs.statSync('verification/city/duskvale.json').size;
  const refSvg = fs.statSync('verification/city/duskvale.svg').size;
  console.log(`JSON: ${json.length} vs ref ${refJson} (${((json.length/refJson-1)*100).toFixed(1)}%)`);
  console.log(`SVG: ${svg.length} vs ref ${refSvg} (${((svg.length/refSvg-1)*100).toFixed(1)}%)`);
}

main().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
