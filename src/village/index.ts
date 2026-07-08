/**
 * Village Generator public API
 */
import { initEngine } from './engine';
import { VillageOptions, GeneratedVillage, VillageGenerator } from './types';

let initialized = false;

export async function init(): Promise<void> {
  if (initialized) return;
  await initEngine();
  initialized = true;
}

export function createGenerator(): VillageGenerator {
  if (!initialized) {
    throw new Error('Village runtime not initialized. Call init() first.');
  }

  const g = globalThis as any;

  return {
    async generate(options: VillageOptions = {}): Promise<GeneratedVillage> {
      const seed = options.seed ?? Math.floor(Math.random() * 2147483647);
      const Random = g.UtilsRandom;
      if (Random?.reset) Random.reset(seed);

      const Blueprint = g.VillageBlueprint;
      if (!Blueprint) throw new Error('VillageBlueprint not available');
      
      // Use Blueprint.fromURL() for proper tag parsing
      let bp: any;
      if (options.tags && Blueprint.fromURL) {
        // Simulate URL parameters
        const tagStr = options.tags;
        // Temporarily set location.search to pass tags
        const oldSearch = g.location.search;
        g.location.search = '?seed=' + seed + '&tags=' + encodeURIComponent(tagStr);
        try {
          bp = Blueprint.fromURL();
          if (!bp) bp = Blueprint.random();
        } finally {
          g.location.search = oldSearch;
        }
      } else {
        bp = new Blueprint();
        bp.seed = seed;
      }

      // Create village model directly
      const Region = g.VillageRegion;
      if (!Region) throw new Error('VillageRegion not available');
      const village = new Region(bp);
      
      // Ensure scene inst exists for export
      const Scene = g.VillageScene;
      if (Scene && !Scene.inst) {
        // Set inst manually without triggering full scene init
        Scene.inst = { village };
      } else if (Scene?.inst) {
        Scene.inst.village = village;
      }

      return {
        name: village.name || 'Unnamed Village',
        seed,
        options: { ...options, seed },

        exportJson(): Promise<string> {
          return new Promise((resolve) => {
            const JSONExporter = g.VillageJSONExporter;
            if (JSONExporter?.export) {
              g.__captureCb = (data: string) => resolve(data);
              setTimeout(() => JSONExporter.export(village), 100);
            } else {
              resolve('{}');
            }
          });
        },

        exportSvg(): Promise<string> {
          return new Promise((resolve) => {
            const view = g.VillageScene?.inst?.view;
            if (view?.exportSVG) {
              g.__captureCb = (data: string) => resolve(data);
              setTimeout(() => view.exportSVG(), 100);
            } else {
              resolve('<svg></svg>');
            }
          });
        },

        exportPng(): Promise<Buffer> {
          return new Promise((resolve) => {
            const view = g.VillageScene?.inst?.view;
            if (view?.exportPNG) {
              g.__captureCb = (data: string) => resolve(Buffer.from(data, 'base64'));
              setTimeout(() => view.exportPNG(), 100);
            } else {
              resolve(Buffer.alloc(0));
            }
          });
        },
      };
    },
  };
}

export type { VillageOptions, GeneratedVillage, VillageGenerator };
