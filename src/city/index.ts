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

      // Set up Scene and View for export rendering
      // (same pattern as Realm)
      const Scene = g.ia;
      if (Scene && !Scene.inst) {
        try { new Scene(); } catch (_) {}
      }

      return {
        name: city.name || 'Unnamed City',
        seed,
        size,
        options: { ...options, seed, size },

        exportJson(): Promise<string> {
          return new Promise((resolve) => {
            const cid = g.__nextCaptureId();
            g.__captureCbs[cid] = (data: string) => { resolve(data); delete g.__captureCbs[cid]; };
            setTimeout(() => be.asJSON(), 50);
            setTimeout(() => { if (g.__captureCbs[cid]) { delete g.__captureCbs[cid]; resolve('{}'); } }, 2000);
          });
        },

        exportSvg(): Promise<string> {
          return new Promise((resolve) => {
            const cid = g.__nextCaptureId();
            g.__captureCbs[cid] = (data: string) => { resolve(data); delete g.__captureCbs[cid]; };
            setTimeout(() => be.asSVG(), 50);
            setTimeout(() => { if (g.__captureCbs[cid]) { delete g.__captureCbs[cid]; resolve('<svg></svg>'); } }, 2000);
          });
        },

        exportPng(): Promise<Buffer> {
          return new Promise((resolve) => {
            const cid = g.__nextCaptureId();
            g.__captureCbs[cid] = (data: string) => { resolve(Buffer.from(data, 'base64')); delete g.__captureCbs[cid]; };
            setTimeout(() => be.asPNG(), 50);
            setTimeout(() => { if (g.__captureCbs[cid]) { delete g.__captureCbs[cid]; resolve(Buffer.alloc(0)); } }, 2000);
          });
        },
      };
    },
  };
}

export type { CityOptions, GeneratedCity, CityGenerator };
