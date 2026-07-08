/**
 * City (MFCG) — Medieval Fantasy City Generator wrapper
 * Ported from reveng_mfcg
 */
import { createEngine, GeneratorConfig, GeneratorRuntime } from '../shared/engine-base';
import * as path from 'path';

const PACKAGES_DIR = path.resolve(__dirname, '..', '..', 'packages', 'city');

const CONFIG: GeneratorConfig = {
  appName: 'mfcg',
  jsBundlePath: path.join(PACKAGES_DIR, 'mfcg.js'),
  fonts: [
    ['IMFellGreatPrimer-Regular.ttf', 'IM FELL Great Primer Roman'],
    ['ShareTech-Regular.ttf', 'Share Tech Regular'],
    ['ShareTechMono-Regular.ttf', 'Share Tech Mono'],
  ],
  fontsDir: path.join(PACKAGES_DIR, 'fonts'),
  textAssets: {
    grammar: 'grammar.json',
    english: 'english.txt',
    elven: 'elven.txt',
    male: 'given_male.txt',
    female: 'given_female.txt',
  },
  assetsDir: PACKAGES_DIR,
  classExports: ['Fd', 'Ub', 'be', 'C', 'Aa', 'ba', 'kg', 'Rd', 'ia'],
  mainCallPattern: 'aa.main()',
  baseUrl: 'https://watabou.github.io/city-generator/',
};

let runtime: GeneratorRuntime | null = null;

export async function initEngine(): Promise<GeneratorRuntime> {
  if (runtime) return runtime;
  runtime = await createEngine(CONFIG);
  return runtime;
}
