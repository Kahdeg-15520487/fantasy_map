/**
 * Cave Generator wrapper
 */
import { createEngine, GeneratorConfig, GeneratorRuntime } from '../shared/engine-base';
import * as path from 'path';

const PACKAGES_DIR = path.resolve(__dirname, '..', '..', 'packages', 'cave');

const CONFIG: GeneratorConfig = {
  appName: 'Cave',
  jsBundlePath: path.join(PACKAGES_DIR, 'Cave.js'),
  fonts: [
    ['ShareTech-Regular.ttf', 'Share Tech Regular'],
    ['ShareTechMono-Regular.ttf', 'Share Tech Mono'],
    ['Marcellus-Regular.ttf', 'Marcellus'],
  ],
  fontsDir: path.join(PACKAGES_DIR, 'fonts'),
  classExports: ['C', 'Aa', 'ba'],
  mainCallPattern: 'J.main()',
  baseUrl: 'https://watabou.github.io/cave-generator/',
};

let runtime: GeneratorRuntime | null = null;

export async function initEngine(): Promise<GeneratorRuntime> {
  if (runtime) return runtime;
  runtime = await createEngine(CONFIG);
  return runtime;
}
