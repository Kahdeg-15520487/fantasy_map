import { initEngine } from './village/engine';

async function main() {
  console.log('Testing Village...');
  const g = globalThis as any;
  
  try {
    await initEngine();
    console.log('Engine OK');
    
    // Access classes via Haxe package names
    const JSONExporter = g['com.watabou.village.JSONExporter'];
    const Exporter = g['com.watabou.system.Exporter'];
    const Random = g['com.watabou.utils.Random'];
    const VillageGrammar = g['com.watabou.village.VillageGrammar'];
    const Names = g['com.watabou.village.Names'];
    
    console.log('JSONExporter:', typeof JSONExporter);
    console.log('Exporter:', typeof Exporter);
    console.log('Random:', typeof Random);
    console.log('VillageGrammar:', typeof VillageGrammar);
    console.log('Names:', typeof Names);
    
    if (Random) {
      console.log('Random.seed:', Random.seed);
      console.log('Random.reset:', typeof Random.reset);
      console.log('Random.float:', typeof Random.float);
    }
    
    if (JSONExporter) {
      console.log('JSONExporter.export:', typeof JSONExporter.export);
      console.log('JSONExporter.getData:', typeof JSONExporter.getData);
    }
    
    // Look for the scene/view
    console.log('\nLooking for scene classes...');
    for (const key of Object.keys(g)) {
      const v = g[key];
      if (typeof v === 'function' && v.prototype) {
        const proto = v.prototype;
        if (proto.village !== undefined || (proto.exportPNG && proto.exportSVG)) {
          console.log(key + ': has village/export methods');
          console.log('  proto keys:', Object.getOwnPropertyNames(proto).filter(k => !k.startsWith('__')).slice(0,20).join(', '));
        }
      }
    }
  } catch(e: any) {
    console.error('Failed:', e.message);
  }
  console.log('Done');
}
main();
