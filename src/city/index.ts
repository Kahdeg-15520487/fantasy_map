/**
 * City (MFCG) — Medieval Fantasy City Generator public API
 */
import { initEngine } from './engine';
import { CityOptions, GeneratedCity, CityGenerator } from './types';

let initialized = false;

export async function init(): Promise<void> {
  if (initialized) return;
  await initEngine();
  initialized = true;
}

export function createGenerator(): CityGenerator {
  if (!initialized) {
    throw new Error('City runtime not initialized. Call init() first.');
  }

  const g = globalThis as any;
  const { C, Fd, Ub, be, ia } = g;

  return {
    async generate(options: CityOptions = {}): Promise<GeneratedCity> {
      const seed = options.seed ?? Math.floor(Math.random() * 2147483647);
      C.reset(seed);
      const size = options.size ?? 25;

      const bp = new Fd(size, seed);
      // Set ALL properties with correct defaults (matching fromURL behavior)
      bp.name = options.name ?? null;
      bp.citadel = options.citadel ?? true;
      bp.inner = options.urbanCastle ?? false;
      bp.plaza = options.plaza ?? true;
      bp.temple = options.temple ?? true;
      bp.walls = options.walls ?? true;
      bp.shanty = options.shantytown ?? false;
      bp.river = options.river ?? false;
      bp.coast = options.coast ?? true;
      bp.greens = options.greens ?? false;
      bp.hub = options.hub ?? false;
      bp.gates = options.gates ?? -1;
      bp.coastDir = options.sea ?? 0.0;

      const city = new Ub(bp);

      if (!ia.inst) {
        try { new ia(); } catch (_) {}
      }

      return {
        name: city.name || 'Unnamed City',
        seed,
        size,
        options: { ...options, seed, size },

        exportJson(): Promise<string> {
          return new Promise((resolve) => {
            g.__captureCb = (data: string) => resolve(data);
            setTimeout(() => be.asJSON(), 50);
          });
        },

        exportSvg(): Promise<string> {
          return new Promise((resolve) => {
            g.__captureCb = (data: string) => resolve(data);
            setTimeout(() => be.asSVG(), 50);
          });
        },

        exportPng(): Promise<Buffer> {
          return new Promise((resolve) => {
            g.__captureCb = (data: string) => resolve(Buffer.from(data, 'base64'));
            setTimeout(() => be.asPNG(), 50);
          });
        },
      };
    },
  };
}

export type { CityOptions, GeneratedCity, CityGenerator };
