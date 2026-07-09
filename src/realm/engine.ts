/**
 * Perilous Shores (realm) — Regional overworld map generator
 */
import { createEngine, GeneratorConfig, GeneratorRuntime } from '../shared/engine-base';
import * as path from 'path';
import * as fs from 'fs';

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
    // Inline text assets (grammar, names) — these are normally loaded via XHR
    const assetsDir = path.join(PACKAGES_DIR, 'assets');
    const assets: Record<string, string> = {
      'grammar': 'grammar.json',
      'centrepiece': 'centrepiece.json',
      'english': 'english.txt',
      'elven': 'elven.txt',
      'demonic': 'demonic.txt',
      'male': 'given_male.txt',
      'female': 'given_female.txt',
    };
    for (const [id, filename] of Object.entries(assets)) {
      const fpath = path.join(assetsDir, filename);
      if (fs.existsSync(fpath)) {
        const content = fs.readFileSync(fpath, 'utf-8');
        // Replace Jb.getText("id") with the literal content
        src = src.replace(`Jb.getText("${id}")`, JSON.stringify(content));
      }
    }

    // Expose classes using minified names before S.main()
    // m=Random, nb=URLState, Ce=Exporter (SystemExporter), Qd=Blueprint, ba=Region, 
    // gb=MapScene, ug=Serializer, Fe=SvgExporter, Jb=Assets, Na=lime.utils.Assets,
    // K=MapView (holds display toggles: showMatte, showCompass, showClouds, etc.)
    src = src.replace('S.main()',
      ';window.UtilsRandom=m;window.URLState=nb;window.SystemExporter=Ce;' +
      'window.RealmBlueprint=Qd;window.RealmRegion=ba;window.RealmMapScene=gb;' +
      'window.RealmSerializer=ug;window.RealmSvgExporter=Fe;' +
      'window.RealmAssets=Jb;window.RealmLimeAssets=Na;' +
      'window.RealmMapView=K;' +
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
