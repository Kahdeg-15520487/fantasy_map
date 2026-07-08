/**
 * Perilous Shores (realm) — Regional overworld map generator
 */
import { createEngine, GeneratorConfig, GeneratorRuntime } from '../shared/engine-base';
import * as path from 'path';

const PACKAGES_DIR = path.resolve(__dirname, '..', '..', 'packages', 'realm');

const CONFIG: GeneratorConfig = {
  appName: 'Perilous',
  jsBundlePath: path.join(PACKAGES_DIR, 'Perilous.js'),
  fonts: [
    ['ShareTech-Regular.ttf', 'Share Tech Regular'],
    ['ShareTechMono-Regular.ttf', 'Share Tech Mono'],
    ['LovedbytheKing-Regular.ttf', 'Loved by the King'],
    ['CaveatBrush-Regular.ttf', 'Caveat Brush'],
  ],
  fontsDir: path.join(PACKAGES_DIR, 'fonts'),
  classExports: [],
  mainCallPattern: 'S.main()',
  baseUrl: 'https://watabou.github.io/perilous-shores/',
  patchSource: (src: string): string => {
    // Expose classes using minified names before S.main()
    // m=Random, nb=URLState, Ce=Exporter (SystemExporter), Qd=Blueprint, ba=Region, 
    // gb=MapScene, ug=Serializer, Fe=SvgExporter, Jb=Assets, Na=lime.utils.Assets
    src = src.replace('S.main()',
      ';window.UtilsRandom=m;window.URLState=nb;window.SystemExporter=Ce;' +
      'window.RealmBlueprint=Qd;window.RealmRegion=ba;window.RealmMapScene=gb;' +
      'window.RealmSerializer=ug;window.RealmSvgExporter=Fe;' +
      'window.RealmAssets=Jb;window.RealmLimeAssets=Na;' +
      'window.RealmState=ea;S.main()');
    return src;
  },
};

let runtime: GeneratorRuntime | null = null;

export async function initEngine(): Promise<GeneratorRuntime> {
  if (runtime) return runtime;
  runtime = await createEngine(CONFIG);
  return runtime;
}
