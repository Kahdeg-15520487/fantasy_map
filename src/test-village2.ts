import { init, createGenerator } from './village/index';

async function main() {
  console.log('Testing Village generator...');
  await init();
  const gen = createGenerator();
  console.log('Generating...');
  const village = await gen.generate({ seed: 1713304636 });
  console.log('Village:', village.name);
  
  try {
    const json = await village.exportJson();
    console.log('JSON:', json.length, 'chars');
  } catch(e: any) { console.log('JSON failed:', e.message); }
  
  try {
    const svg = await village.exportSvg();
    console.log('SVG:', svg.length, 'chars');
  } catch(e: any) { console.log('SVG failed:', e.message); }
  
  try {
    const png = await village.exportPng();
    console.log('PNG:', png.length, 'bytes');
  } catch(e: any) { console.log('PNG failed:', e.message); }
}

main().catch(e => console.error('Fatal:', e.message));
