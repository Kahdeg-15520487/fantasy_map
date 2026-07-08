/**
 * Integration test: generate realm, then all 13 towns sequentially
 */
import { init as initRealm, createGenerator as createRealmGen } from './realm';
import { init as initCity, createGenerator as createCityGen } from './city';
import { init as initVillage, createGenerator as createVillageGen } from './village';

async function main() {
  console.log('init all engines...');
  await initRealm();
  await initCity();
  await initVillage();
  console.log('all ready\n');

  // Generate realm
  console.log('generating realm...');
  const realmGen = createRealmGen();
  const realm = await realmGen.generate({ seed: 326054124, tags: 'civilized,difficult,perilous,wetland,lowland,neutral,peninsula', width: 1800, height: 1800 });
  const realmJson = await realm.exportJson();
  console.log('realm:', realm.name, realmJson.length, 'B');

  const realmData = JSON.parse(realmJson);
  const hexes = realmData.hexes || {};
  const towns = Object.entries(hexes).filter(([k, v]: [string, any]) => v.town);
  console.log('towns to generate:', towns.length, '\n');

  for (let i = 0; i < towns.length; i++) {
    const [hexKey, hexData] = towns[i] as [string, any];
    const town = hexData.town;
    const name = town.name;
    const type = town.type;
    const seed = parseInt(town.link.match(/seed=(\d+)/)?.[1] || '0');

    console.log(`[${i+1}/${towns.length}] ${name} (${type}) seed=${seed} hex=${hexKey}`);

    try {
      if (type === 'city' || type === 'town') {
        const cityGen = createCityGen();
        const size = type === 'city' ? 35 : 20;
        console.log(`  step1: createCityGen done, calling generate(size=${size})...`);
        const t0 = Date.now();
        const city = await cityGen.generate({ seed, size });
        console.log(`  step2: generate done in ${Date.now()-t0}ms`);
        const t1 = Date.now();
        const json = await city.exportJson();
        console.log(`  step3: exportJson done in ${Date.now()-t1}ms, ${json.length}B`);
      } else {
        const villageGen = createVillageGen();
        console.log(`  step1: createVillageGen done, calling generate()...`);
        const t0 = Date.now();
        const village = await villageGen.generate({ seed, tags: '' });
        console.log(`  step2: generate done in ${Date.now()-t0}ms`);
        const t1 = Date.now();
        const json = await village.exportJson();
        console.log(`  step3: exportJson done in ${Date.now()-t1}ms, ${json.length}B`);
      }
    } catch (e: any) {
      console.log(`  ERROR: ${e.message}`);
      console.log(`  stack: ${e.stack}`);
    }
  }

  console.log('DONE');
  process.exit(0);
}
main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
