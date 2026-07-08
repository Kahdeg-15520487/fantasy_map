/**
 * Dwellings (dwelling) — Building interior floorplan generator
 * Supports multi-floor output (ground through upper floors + basement)
 */
import { createEngine, GeneratorConfig, GeneratorRuntime } from '../shared/engine-base';
import * as path from 'path';

const PACKAGES_DIR = path.resolve(__dirname, '..', '..', 'packages', 'dwelling');

const CONFIG: GeneratorConfig = {
  appName: 'Dwellings',
  jsBundlePath: path.join(PACKAGES_DIR, 'Dwellings.js'),
  fonts: [
    ['ShareTech-regular.ttf', 'Share Tech Regular'],
    ['ShareTechMono-regular.ttf', 'Share Tech Mono'],
  ],
  fontsDir: path.join(PACKAGES_DIR, 'fonts'),
  classExports: ['C', 'Aa', 'ba'],
  mainCallPattern: 'ka.main()',
  baseUrl: 'https://watabou.github.io/dwellings/',
};

let runtime: GeneratorRuntime | null = null;

export async function initEngine(): Promise<GeneratorRuntime> {
  if (runtime) return runtime;
  runtime = await createEngine(CONFIG);
  return runtime;
}
