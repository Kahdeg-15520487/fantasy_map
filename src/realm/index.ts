/**
 * Perilous Shores (realm) — Regional overworld map generator public API
 */
import { initEngine } from './engine';
import { RealmOptions, GeneratedRealm, RealmGenerator } from './types';

let initialized = false;

export async function init(): Promise<void> {
  if (initialized) return;
  await initEngine();

  // Patch Assets.getText (both openfl and lime) to handle null returns gracefully
  // NOTE: must NOT return non-null for unknown IDs — palette loading ("full_colour") calls JSON.parse
  const g = globalThis as any;
  const patchGetText = (assetsObj: any) => {
    if (!assetsObj?.getText) return;
    const origGetText = assetsObj.getText.bind(assetsObj);
    assetsObj.getText = function(id: string) {
      try {
        return origGetText(id);
      } catch(_) {}
      // Only return fallback for known text asset IDs (grammar, names)
      // Other IDs (palettes, etc.) must return null to avoid JSON.parse errors
      if (id === 'grammar' || id === 'centrepiece') return '{}';
      if (['english', 'elven', 'demonic', 'male', 'female'].includes(id)) return '';
      return null;
    };
  };
  patchGetText(g.RealmAssets);  // openfl.utils.Assets

  // Pre-populate palette JSONs into the asset cache
  // These are normally loaded via XHR; in headless mode we inject them directly
  const paletteIds = ['default', 'bw', 'antique', 'soft', 'cartoon', 'october', 'full_colour'];
  const LimeAssets = g.RealmLimeAssets;
  const lib = LimeAssets?.libraries?.h?.['default'];
  if (lib?.cachedText) {
    const fs = require('fs');
    const path = require('path');
    for (const id of paletteIds) {
      const fpath = path.join(__dirname, '..', '..', 'packages', 'realm', 'assets', id + '.json');
      if (fs.existsSync(fpath)) {
        lib.cachedText.h[id] = fs.readFileSync(fpath, 'utf-8');
      }
    }
  }

  initialized = true;
}

export function createGenerator(): RealmGenerator {
  if (!initialized) {
    throw new Error('Realm runtime not initialized. Call init() first.');
  }

  const g = globalThis as any;

  return {
    async generate(options: RealmOptions = {}): Promise<GeneratedRealm> {
      const seed = options.seed ?? Math.floor(Math.random() * 2147483647);

      const Blueprint = g.RealmBlueprint;
      if (!Blueprint) throw new Error('RealmBlueprint not available');

      // Parse tags: get from options.tags string or use defaults
      const tags: string[] = options.tags
        ? options.tags.split(',').map((t) => t.trim()).filter(Boolean)
        : [];

      // Ensure correct base URL (Main constructor normally sets this but doesn't run in headless)
      const URLState = g.URLState;
      if (URLState) URLState.baseURL = 'https://watabou.github.io/perilous-shores/';

      // Create Blueprint (constructor handles seed and Bc.resolve)
      // Reset tiltMode to 0 (flat mode, browser default) — Scene constructor normally does this
      const Region = g.RealmRegion;
      if (!Region) throw new Error('RealmRegion not available');
      Region.tiltMode = 0;

      const bp = new Blueprint(seed, tags);
      // Override dimensions from options
      bp.width = options.width ?? 1800;
      bp.height = options.height ?? 1800;
      bp.hexes = 0;  // Ensure flat layout (matches browser default)
      const region = new Region(bp);

      // Create Scene for SVG export (must be created before Fe.export needs the view)
      const Scene = g.RealmMapScene;
      let view: any = null;
      if (Scene && !Scene.inst) {
        try {
          new Scene();
          if (Scene.inst?.view) {
            Scene.inst.view.draw(region);
            view = Scene.inst.view;
            Scene.inst.region = region;
          }
        } catch (e: any) {
          console.error('[Realm] Scene creation failed:', e.message);
        }
      }

      return {
        name: region.bp?.name || region.getFileName?.() || 'Unnamed Realm',
        seed,
        width: bp.width,
        height: bp.height,
        options: { ...options, seed },
        region,

        exportJson(): Promise<string> {
          return new Promise((resolve, reject) => {
            const Serializer = g.RealmSerializer;
            if (!Serializer?.saveAsJSON) {
              resolve('{}');
              return;
            }
            g.__captureCb = (data: string) => {
              resolve(data);
              g.__captureCb = null;
            };
            try {
              Serializer.saveAsJSON(region);
            } catch (e: any) {
              resolve('{}');
            }
            // Fallback: if no capture after 1s, resolve empty
            setTimeout(() => {
              if (g.__captureCb) {
                g.__captureCb = null;
                resolve('{}');
              }
            }, 1000);
          });
        },

        exportSvg(): Promise<string> {
          return new Promise((resolve, reject) => {
            const SvgExporter = g.RealmSvgExporter;
            const finalView = view || g.RealmMapScene?.inst?.view;
            if (!SvgExporter?.export || !finalView) {
              resolve('<svg></svg>');
              return;
            }

            g.__captureCb = (data: string) => {
              resolve(data);
              g.__captureCb = null;
            };
            try {
              if (finalView) {
                SvgExporter.export(region, finalView);
              } else {
                resolve('<svg></svg>');
              }
            } catch (e: any) {
              console.error('SVG export error:', e.message);
              resolve('<svg></svg>');
            }
            // Fallback
            setTimeout(() => {
              if (g.__captureCb) {
                g.__captureCb = null;
                resolve('<svg></svg>');
              }
            }, 5000);
          });
        },

        exportPng(): Promise<Buffer> {
          return new Promise((resolve, reject) => {
            // PNG export is complex — try scene-based approach
            const view = g.RealmMapScene?.inst?.view;
            if (view?.exportPNG) {
              g.__captureCb = (data: string) => {
                resolve(Buffer.from(data, 'base64'));
                g.__captureCb = null;
              };
              try {
                view.exportPNG();
              } catch (e: any) {
                resolve(Buffer.alloc(0));
              }
            } else {
              resolve(Buffer.alloc(0));
            }
            setTimeout(() => {
              if (g.__captureCb) {
                g.__captureCb = null;
                resolve(Buffer.alloc(0));
              }
            }, 5000);
          });
        },
      };
    },
  };
}

export type { RealmOptions, GeneratedRealm, RealmGenerator };
