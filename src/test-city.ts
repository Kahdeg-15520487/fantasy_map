/**
 * Quick test: City (MFCG) wrapper
 */
import { init, createGenerator } from './city/index';

async function main() {
  console.log('Initializing MFCG engine...');
  await init();
  console.log('Engine initialized.');

  const gen = createGenerator();
  console.log('Generating city...');
  const city = await gen.generate({ size: 27, seed: 800047775 });

  console.log(`City: ${city.name}, seed: ${city.seed}, size: ${city.size}`);

  console.log('Exporting JSON...');
  const json = await city.exportJson();
  console.log(`JSON length: ${json.length} chars`);

  console.log('Exporting SVG...');
  const svg = await city.exportSvg();
  console.log(`SVG length: ${svg.length} chars`);

  console.log('Exporting PNG...');
  const png = await city.exportPng();
  console.log(`PNG size: ${png.length} bytes`);

  console.log('All exports successful!');
}

main().catch(err => {
  console.error('Test failed:', err.message);
  process.exit(1);
});
