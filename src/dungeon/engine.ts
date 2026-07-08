/**
 * One Page Dungeon (dungeon) wrapper
 */
import { createEngine, GeneratorConfig, GeneratorRuntime } from '../shared/engine-base';
import * as path from 'path';

const PACKAGES_DIR = path.resolve(__dirname, '..', '..', 'packages', 'dungeon');

const CONFIG: GeneratorConfig = {
  appName: 'Dungeon',
  jsBundlePath: path.join(PACKAGES_DIR, 'Dungeon.js'),
  fonts: [
    ['ShareTech-Regular.ttf', 'Share Tech Regular'],
    ['ShareTechMono-Regular.ttf', 'Share Tech Mono'],
    ['Grenze-Bold.ttf', 'Grenze Bold'],
    ['Neuton-Regular.ttf', 'Neuton Regular'],
    ['Neuton-Italic.ttf', 'Neuton Italic'],
    ['Neuton-ExtraBold.ttf', 'Neuton ExtraBold'],
  ],
  fontsDir: path.join(PACKAGES_DIR, 'fonts'),
  classExports: ['C', 'Aa', 'ba'],
  mainCallPattern: 'K.main()',
  baseUrl: 'https://watabou.github.io/one-page-dungeon/',
};

let runtime: GeneratorRuntime | null = null;

export async function initEngine(): Promise<GeneratorRuntime> {
  if (runtime) return runtime;
  runtime = await createEngine(CONFIG);
  return runtime;
}
