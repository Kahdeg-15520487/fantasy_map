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
  const g = globalThis as any;
  const patchGetText = (assetsObj: any) => {
    if (!assetsObj?.getText) return;
    const origGetText = assetsObj.getText.bind(assetsObj);
    assetsObj.getText = function(id: string) {
      try {
        const result = origGetText(id);
        if (result != null) return result;
      } catch(_) {}
      // Fallback for known text asset IDs
      if (id === 'grammar' || id === 'centrepiece') return '{}';
      if (['english', 'elven', 'demonic', 'male', 'female'].includes(id)) return '';
      return '';
    };
  };
  patchGetText(g.RealmAssets);  // openfl.utils.Assets
  patchGetText(g.RealmLimeAssets);  // lime.utils.Assets

  // Force all libraries to treat assets as local (critical for headless mode)
  const LimeAssets = g.RealmLimeAssets;
  if (LimeAssets?.libraries) {
    for (const key of Object.keys(LimeAssets.libraries.h || {})) {
      const lib = LimeAssets.libraries.h[key];
      if (lib && !lib.__patchedIsLocal) {
        lib.__patchedIsLocal = true;
        const origIsLocal = lib.isLocal;
        lib.isLocal = function() { return true; };
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

      // Fix State/SharedObject to prevent JSON parse errors in headless mode
      // Pre-initialize ea (State) with empty shared object to avoid init failures
      const StateClass = g.RealmState;
      if (StateClass && !StateClass.so) {
        StateClass.so = { data: {}, flush() {} };
        StateClass.data = {};
      }

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

      // Ensure scene inst exists for SVG export
      const Scene = g.RealmMapScene;
      if (Scene) {
        if (!Scene.inst) {
          try {
            console.log('[Realm] Creating Scene...');
            new Scene();
            console.log('[Realm] Scene created, inst:', !!Scene.inst);
          } catch (e: any) {
            console.log('[Realm] Scene creation error:', e.message);
          }
        } else {
          console.log('[Realm] Scene already exists');
        }
        if (Scene.inst) {
          Scene.inst.region = region;
          if (Scene.inst.view) {
            try {
              Scene.inst.view.draw(region);
              console.log('[Realm] View.draw() OK');
            } catch (e: any) {
              console.log('[Realm] View.draw() error:', e.message);
            }
          } else {
            console.log('[Realm] No view on scene inst');
          }
        }
      }

      return {
        name: region.bp?.name || region.getFileName?.() || 'Unnamed Realm',
        seed,
        width: bp.width,
        height: bp.height,
        options: { ...options, seed },

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
            if (!SvgExporter?.export) {
              resolve('<svg></svg>');
              return;
            }

            // Get view from scene or create minimal view
            const view = g.RealmMapScene?.inst?.view;
            if (!view) {
              // Try to create scene first
              const Scene = g.RealmMapScene;
              if (Scene) {
                try { new Scene(); } catch (_) {}
                if (Scene.inst) {
                  Scene.inst.region = region;
                }
              }
            }
            const finalView = g.RealmMapScene?.inst?.view;

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
