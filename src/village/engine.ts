/**
 * Village Generator wrapper
 */
import { createEngine, GeneratorConfig, GeneratorRuntime } from '../shared/engine-base';
import * as path from 'path';

const PACKAGES_DIR = path.resolve(__dirname, '..', '..', 'packages', 'village');

const CONFIG: GeneratorConfig = {
  appName: 'Village',
  jsBundlePath: path.join(PACKAGES_DIR, 'Village.js'),
  fonts: [
    ['ShareTech-Regular.ttf', 'Share Tech Regular'],
    ['ShareTechMono-Regular.ttf', 'Share Tech Mono'],
    ['Cinzel-Bold.ttf', 'Cinzel Bold'],
  ],
  fontsDir: path.join(PACKAGES_DIR, 'fonts'),
  classExports: [],
  mainCallPattern: 'S.main()',
  baseUrl: 'https://watabou.github.io/village-generator/',
  patchSource: (src: string): string => {
    // Expose key Haxe classes to window via their registration patterns
    const classMap: Record<string, string> = {
      'com.watabou.village.JSONExporter': 'VillageJSONExporter',
      'com.watabou.system.Exporter': 'SystemExporter',
      'com.watabou.utils.Random': 'UtilsRandom',
      'com.watabou.village.scenes.VillageScene': 'VillageScene',
      'com.watabou.village.model.Blueprint': 'VillageBlueprint',
      'com.watabou.village.model.Region': 'VillageRegion',
      'com.watabou.village.mapping.VillageView': 'VillageView',
      'com.watabou.village.model.Params': 'VillageParams',
      'com.watabou.village.Main': 'VillageMain',
      'com.watabou.village.Names': 'VillageNames',
      'com.watabou.village.VillageGrammar': 'VillageGrammar',
      'com.watabou.system.URLState': 'URLState',
    };
    for (const [haxeClass, windowName] of Object.entries(classMap)) {
      const escaped = haxeClass.replace(/\./g, '\\.');
      const regex = new RegExp('g\\[\"' + escaped + '\"\\]=\\w+;?', 'g');
      src = src.replace(regex, (m: string) => {
        const name = m.match(/=(\w+)/);
        return m + 'window.' + windowName + '=' + (name ? name[1] : 'null') + ';';
      });
    }
    return src;
  },
};

let runtime: GeneratorRuntime | null = null;

export async function initEngine(): Promise<GeneratorRuntime> {
  if (runtime) return runtime;
  runtime = await createEngine(CONFIG);
  return runtime;
}
