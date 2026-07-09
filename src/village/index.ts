/**
 * Village Generator public API
 */
import * as fs from 'fs';
import * as path from 'path';
import { initEngine } from './engine';
import { VillageOptions, GeneratedVillage, VillageGenerator } from './types';

let initialized = false;

// The village SVG exporter (view.exportSVG -> Ha.create(2*viewW2, 2*viewH2, ...))
// always sizes its canvas to the village's natural world extent, with plain
// `width`/`height` attributes and no `viewBox`. That size is baked into the model
// (population/tags), not the export process, so we can't just "generate it bigger".
// To render it at 2x without altering any content/geometry, we add a `viewBox`
// matching the original pixel size and double the `width`/`height` attributes —
// browsers/viewers then scale the identical vector content up losslessly.
function doubleSvgDisplaySize(svg: string): string {
  const match = svg.match(/<svg\b([^>]*)\bwidth="([\d.]+)"([^>]*)\bheight="([\d.]+)"([^>]*)>/);
  if (!match) return svg;
  const [full, before, widthStr, between, heightStr, after] = match;
  if (/viewBox=/.test(full)) return svg; // already has one; leave as-is
  const width = parseFloat(widthStr);
  const height = parseFloat(heightStr);
  const replaced =
    `<svg${before}width="${width * 2}"${between}height="${height * 2}"${after} viewBox="0 0 ${width} ${height}">`;
  return svg.replace(full, replaced);
}

export async function init(): Promise<void> {
  if (initialized) return;
  await initEngine();

  // Initialize the Style palette. In the browser this happens at app startup via
  // `Style.setPalette(Palette.fromAsset("default"))`, but that path relies on the
  // async OpenFL asset manifest which never resolves headless. Without it, every
  // Style color/font field is undefined and building a VillageView throws
  // "Cannot read properties of undefined (reading 'color')".
  const g = globalThis as any;
  try {
    const Style = g.VillageStyle;
    const Palette = g.UtilsPalette;
    const palettePath = path.resolve(__dirname, '..', '..', 'packages', 'village', 'assets', 'village_default.json');
    if (Style?.setPalette && Palette?.fromJSON && fs.existsSync(palettePath)) {
      const json = fs.readFileSync(palettePath, 'utf-8');
      Style.setPalette(Palette.fromJSON(json), true);
    }
  } catch (e: any) {
    console.error('[Village] Palette init failed:', e.message);
  }

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

      // Use Blueprint.fromURL() for proper tag + name parsing. The real
      // realm->village link is ?seed=X&name=Green%20Crossing&tags=river&from=perilous
      // — the `name` param forces the village to use the realm's assigned name
      // instead of generating its own from the grammar (which would mismatch the
      // realm map's town label).
      let bp: any;
      if ((options.tags || options.name) && Blueprint.fromURL) {
        const params: string[] = ['seed=' + seed];
        if (options.name) params.push('name=' + encodeURIComponent(options.name));
        if (options.tags) params.push('tags=' + encodeURIComponent(options.tags));
        const oldSearch = g.location.search;
        g.location.search = '?' + params.join('&');
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

      // Force the assigned name onto the blueprint so the rendered SVG title
      // matches the realm's town label even if fromURL didn't apply it.
      if (options.name) bp.name = options.name;

      // Create village model directly
      const Region = g.VillageRegion;
      if (!Region) throw new Error('VillageRegion not available');
      const village = new Region(bp);

      // The Region constructor generates its own name from the grammar. Override
      // it with the realm's assigned name so the SVG title matches the map label.
      if (options.name) {
        try {
          village.name = options.name;
          if (village.legend) village.legend.name = options.name;
        } catch (_) {}
      }

      // Build a real VillageView so SVG export has geometry to serialize.
      // Without this, Scene.inst.view is undefined and exportSvg() returns an
      // empty <svg></svg>. The view constructor builds all render layers.
      let view: any = null;
      try {
        const View = g.VillageView;
        if (View) {
          view = new View(village);
          // The view defaults to size 0. In the browser the Scene sizes it to the
          // stage; headless it stays 0, so layout() computes map scale 0 and the
          // SVG export's `scale(1/scaleX)` becomes Infinity. Sizing the view to the
          // village's natural pixel extent (2*viewW2 x 2*viewH2) makes the map scale
          // exactly 1, producing clean SVG coordinates.
          const w2 = Number(village.viewW2) || 0;
          const h2 = Number(village.viewH2) || 0;
          if (w2 > 0 && h2 > 0 && typeof view.setSize === 'function') {
            view.setSize(2 * w2, 2 * h2);
          } else if (typeof view.layout === 'function') {
            view.layout();
          }
        }
      } catch (e: any) {
        console.error('[Village] View creation failed:', e.message);
      }

      // Ensure scene inst exists for export
      const Scene = g.VillageScene;
      if (Scene && !Scene.inst) {
        Scene.inst = { village, view };
      } else if (Scene?.inst) {
        Scene.inst.village = village;
        if (view) Scene.inst.view = view;
      }

      return {
        name: village.name || 'Unnamed Village',
        seed,
        options: { ...options, seed },

        exportJson(): Promise<string> {
          return new Promise((resolve) => {
            const JSONExporter = g.VillageJSONExporter;
            if (!JSONExporter?.export) {
              resolve('{}');
              return;
            }
            const cid = g.__nextCaptureId();
            g.__captureCbs[cid] = (data: string) => {
              resolve(data);
              delete g.__captureCbs[cid];
            };
            try {
              JSONExporter.export(village);
            } catch (_) {
              delete g.__captureCbs[cid];
              resolve('{}');
              return;
            }
            setTimeout(() => {
              if (g.__captureCbs[cid]) {
                delete g.__captureCbs[cid];
                resolve('{}');
              }
            }, 2000);
          });
        },

        exportSvg(): Promise<string> {
          return new Promise((resolve) => {
            const view = g.VillageScene?.inst?.view;
            if (!view?.exportSVG) {
              resolve('<svg></svg>');
              return;
            }
            const cid = g.__nextCaptureId();
            g.__captureCbs[cid] = (data: string) => {
              resolve(doubleSvgDisplaySize(data));
              delete g.__captureCbs[cid];
            };
            try {
              view.exportSVG();
            } catch (_) {
              delete g.__captureCbs[cid];
              resolve('<svg></svg>');
              return;
            }
            setTimeout(() => {
              if (g.__captureCbs[cid]) {
                delete g.__captureCbs[cid];
                resolve('<svg></svg>');
              }
            }, 5000);
          });
        },

        exportPng(): Promise<Buffer> {
          return new Promise((resolve) => {
            const view = g.VillageScene?.inst?.view;
            if (!view?.exportPNG) {
              resolve(Buffer.alloc(0));
              return;
            }
            const cid = g.__nextCaptureId();
            g.__captureCbs[cid] = (data: string) => {
              resolve(Buffer.from(data, 'base64'));
              delete g.__captureCbs[cid];
            };
            try {
              view.exportPNG();
            } catch (_) {
              delete g.__captureCbs[cid];
              resolve(Buffer.alloc(0));
              return;
            }
            setTimeout(() => {
              if (g.__captureCbs[cid]) {
                delete g.__captureCbs[cid];
                resolve(Buffer.alloc(0));
              }
            }, 5000);
          });
        },
      };
    },
  };
}

export type { VillageOptions, GeneratedVillage, VillageGenerator };
