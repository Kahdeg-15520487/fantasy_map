import { init, createGenerator } from './index';

async function main() {
  await init();
  const gen = createGenerator();

  for (const size of [20, 35]) {
    console.log(`\n--- size=${size} ---`);
    const t0 = Date.now();
    const city = await gen.generate({ seed: 99999, size });
    console.log(`gen: ${Date.now() - t0}ms, name: ${city.name}`);

    const t1 = Date.now();
    const json = await city.exportJson();
    console.log(`json export: ${Date.now() - t1}ms, ${json.length}B`);
  }
}
main().catch(e => console.error('FATAL:', e.message));
