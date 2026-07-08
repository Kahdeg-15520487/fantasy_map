/**
 * Shared engine base — provides polyfills and bootstrapping for all
 * Watabou Haxe/OpenFL generators running headless in Node.js.
 *
 * Each generator submodule calls createEngine() with its specific config.
 */

import { createCanvas, registerFont } from 'canvas';
import * as path from 'path';
import * as fs from 'fs';

// ── Generator-specific config ──────────────────────────────────

export interface GeneratorConfig {
  /** Lime app name (e.g. "mfcg", "Village", "Dungeon") */
  appName: string;
  /** Path to the compiled Haxe/OpenFL JS bundle */
  jsBundlePath: string;
  /** Font files to register with node-canvas: [filename, fontFamily] */
  fonts: Array<[string, string]>;
  /** Path to font directory (relative to project root) */
  fontsDir: string;
  /** Text assets to inline: assetId → local file path */
  textAssets?: Record<string, string>;
  /** Directory containing text assets */
  assetsDir?: string;
  /** Minified class variable names to expose on window */
  classExports: string[];
  /** The main() call pattern to insert class exports before */
  mainCallPattern: string;
  /** Base URL for the generator (used for location.href) */
  baseUrl: string;
  /** Optional: custom source patches before eval (returns modified source) */
  patchSource?: (src: string) => string;
}

export interface GeneratorRuntime {
  /** Exposed Haxe classes indexed by name */
  classes: Record<string, any>;
  /** Capture the next export (Blob interceptor callback setter) */
  captureExport: (cb: (data: string) => void) => void;
  /** The lime global reference */
  lime: any;
}

// ── Polyfill setup (shared across all generators) ──────────────

let polyfillsInstalled = false;

function installPolyfills(): void {
  if (polyfillsInstalled) return;
  polyfillsInstalled = true;

  const g = globalThis as any;
  g.self = g; g.global = g; g.window = g;

  // Rate-limited requestAnimationFrame
  let rafDepth = 0; const MAX_DEPTH = 5; const rafQueue: any[] = [];
  g.requestAnimationFrame = (cb: any) => {
    if (rafDepth >= MAX_DEPTH) { rafQueue.push(cb); return 0; }
    rafDepth++; try { cb(Date.now()); } finally { rafDepth--; }
    if (rafDepth === 0 && rafQueue.length > 0) {
      const n = rafQueue.shift()!;
      setTimeout(() => g.requestAnimationFrame(n), 10);
    }
    return 0;
  };
  g.cancelAnimationFrame = () => {};

  // DOM stubs
  const makeEl = (tag: string): any => ({
    tagName: tag.toUpperCase(),
    style: { setProperty() {}, removeProperty() {}, getPropertyValue() { return ''; } },
    parentNode: null, children: [] as any[],
    appendChild(c: any) { c.parentNode = this; this.children.push(c); return c; },
    removeChild(c: any) { const i = this.children.indexOf(c); if (i >= 0) { this.children.splice(i, 1); c.parentNode = null; } return c; },
    insertBefore(c: any, ref: any) { c.parentNode = this; const i = ref ? this.children.indexOf(ref) : this.children.length; if (i >= 0) this.children.splice(i, 0, c); else this.children.push(c); return c; },
    addEventListener() {}, removeEventListener() {},
    setAttribute() {}, getAttribute() { return null; },
    cloneNode() { return makeEl(tag); },
    get offsetWidth() { return 0; }, get offsetHeight() { return 0; },
  });

  g.document = {
    createElement: (tag: string) => tag === 'canvas' ? new (g.HTMLCanvasElement)() : makeEl(tag),
    getElementById: (id: string) => id === 'openfl-content' ? makeEl('div') : null,
    createElementNS: (_ns: string, tag: string) => makeEl(tag),
    querySelector: () => null,
    addEventListener() {}, removeEventListener() {},
    documentElement: makeEl('html'),
    body: makeEl('body'),
    createTextNode: (t: string) => ({ textContent: t, nodeType: 3, parentNode: null }),
    head: makeEl('head'),
    createDocumentFragment: () => makeEl('fragment'),
    fonts: {
      load() { return Promise.resolve([]); },
      get ready() { return Promise.resolve(); },
    },
  };

  try { g.navigator = { userAgent: 'Node', getGamepads: () => [], platform: 'Node', clipboard: { writeText() {} } }; } catch (_) {
    Object.defineProperty(g, 'navigator', { value: { userAgent: 'Node', getGamepads: () => [], platform: 'Node', clipboard: { writeText() {} } }, writable: true, configurable: true });
  }
  g.history = { replaceState() {}, pushState() {} };

  // XHR stub
  g.XMLHttpRequest = class {
    _listeners: any = {};
    addEventListener(e: string, fn: any) { (this._listeners[e] = this._listeners[e] || []).push(fn); }
    removeEventListener() {}
    open() {} setRequestHeader() {}
    send() { this.readyState = 4; this.status = 200; this._response = ''; (this._listeners.load || []).forEach((f: any) => f({ target: this })); }
    set onload(_: any) {} get onload() { return null; }
    get response() { return this._response; } get responseText() { return ''; }
    get status() { return this._status || 200; } set status(v: number) { this._status = v; }
    get readyState() { return this._readyState || 0; } set readyState(v: number) { this._readyState = v; }
    _response: any = ''; _status = 0; _readyState = 0;
  };

  g.Blob = class { constructor(_p?: any[], _o?: any) {} };
  // Preserve native URL constructor for URL parsing
  const NativeURL = (globalThis as any).URL;
  g.URL = { createObjectURL() { return ''; }, revokeObjectURL() {} };
  // Restore native URL if available (some polyfill setups need the constructor)
  if (typeof NativeURL === 'function') {
    (g.URL as any).constructor = NativeURL;
  }
  g.AudioContext = class { createGain() { return { connect() {}, gain: { value: 0 } }; } decodeAudioData(_: any, cb: any) { cb?.(); } close() {} };
  g.performance = { now: () => Date.now() };
  g.screen = { width: 1920, height: 1080 };
  g.innerWidth = 1024;
  g.innerHeight = 1024;
  g.devicePixelRatio = 1;
  g.atob = (s: string) => Buffer.from(s, 'base64').toString('binary');
  g.btoa = (s: string) => Buffer.from(s, 'binary').toString('base64');
  g.console = console;

  // Window event system
  const winListeners: any = {};
  g.addEventListener = (e: string, fn: any) => { (winListeners[e] = winListeners[e] || []).push(fn); };
  g.removeEventListener = (e: string, fn: any) => { const a = winListeners[e]; if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } };
  g.dispatchEvent = (ev: any) => { (winListeners[ev.type] || []).forEach((fn: any) => fn(ev)); };

  // Canvas globals
  const HTMLCanvasElementClass = class {
    width = 800; height = 600;
    style: any = { setProperty() {}, removeProperty() {}, getPropertyValue() { return ''; } };
    _nc: any = null;
    get __srcCanvas() { if (!this._nc) this._nc = createCanvas(this.width || 800, this.height || 600); return this._nc; }
    set __srcCanvas(v: any) { this._nc = v; }
    getContext(t: string) { if (t === '2d') { if (!this._nc) this._nc = createCanvas(this.width || 800, this.height || 600); return this._nc.getContext('2d'); } return null; }
    toDataURL(...a: any[]) { if (!this._nc) this._nc = createCanvas(this.width || 800, this.height || 600); return this._nc.toDataURL(...a); }
    toBlob(cb: any) { cb?.(null); }
    getBoundingClientRect() { return { x: 0, y: 0, width: this.width, height: this.height, top: 0, right: this.width, bottom: this.height, left: 0 }; }
    setAttribute() {} getAttribute() { return null; }
    addEventListener() {} removeEventListener() {}
    cloneNode() { return new (g.HTMLCanvasElement)(); }
    parentNode: any = null;
  };
  g.HTMLCanvasElement = HTMLCanvasElementClass;
  // Image stub that works with drawImage
  const NativeImage = class {
    width = 0; height = 0; src = '';
    onload: any = null; onerror: any = null;
    _nc: any = null;
    addEventListener() {} removeEventListener() {}
    setAttribute() {} getAttribute() { return null; }
    // Make it usable as CanvasImageSource
    get __srcImage() {
      if (!this._nc) {
        this._nc = createCanvas(this.width || 100, this.height || 100);
      }
      return this._nc;
    }
  };
  g.Image = NativeImage;
  g.CanvasRenderingContext2D = class {};
  g.ImageData = class {};

  // Suppress non-critical canvas errors
  process.on('uncaughtException', (err: Error) => {
    if (err.message?.includes('Image or Canvas expected') ||
        err.message?.includes('drawImage') ||
        err.message?.includes('createPattern') ||
        err.message?.includes('bitmap') ||
        err.message?.includes('BitmapData')) return;
    console.error('Uncaught:', err.message);
  });

  // Monkey-patch CanvasRenderingContext2D to handle headless canvas limitations
  const origGetContext = g.HTMLCanvasElement.prototype.getContext;
  g.HTMLCanvasElement.prototype.getContext = function(type: string) {
    const ctx = origGetContext.call(this, type);
    if (ctx && type === '2d') {
      const origDrawImage = ctx.drawImage;
      ctx.drawImage = function(...args: any[]) {
        try {
          return origDrawImage.apply(this, args);
        } catch (e: any) {
          // Silently ignore drawImage errors (common in headless canvas)
          if (!e.message?.includes('Image or Canvas') && !e.message?.includes('drawImage')) {
            throw e;
          }
        }
      };
      const origCreatePattern = ctx.createPattern;
      ctx.createPattern = function(...args: any[]) {
        try {
          return origCreatePattern.apply(this, args);
        } catch (e: any) {
          return null;
        }
      };
    }
    return ctx;
  };
}

// ── Engine factory ─────────────────────────────────────────────

export async function createEngine(config: GeneratorConfig): Promise<GeneratorRuntime> {
  // Install shared polyfills (idempotent)
  installPolyfills();

  const g = globalThis as any;
  g.location = { href: config.baseUrl, search: '', hostname: 'watabou.github.io' };

  // Register fonts
  for (const [file, family] of config.fonts) {
    const fontPath = path.join(config.fontsDir, file);
    if (fs.existsSync(fontPath)) {
      try { registerFont(fontPath, { family }); } catch (_) {}
    }
  }

  // Load and patch JS bundle
  let src = fs.readFileSync(config.jsBundlePath, 'utf-8');

  // Patch $lime_init to use globalThis
  const limeIdx = src.indexOf('$lime_init(');
  if (limeIdx >= 0) {
    let parens = 1; let endIdx = limeIdx + 11;
    while (parens > 0 && endIdx < src.length) {
      if (src[endIdx] === '(') parens++;
      else if (src[endIdx] === ')') parens--;
      endIdx++;
    }
    const before = src.substring(0, limeIdx);
    const after = src.substring(endIdx);
    src = before + '$lime_init(globalThis, globalThis);' + after;
  }

  // Inline text assets (if any)
  if (config.textAssets && config.assetsDir) {
    for (const [id, filename] of Object.entries(config.textAssets)) {
      const fpath = path.join(config.assetsDir, filename);
      if (fs.existsSync(fpath)) {
        const content = fs.readFileSync(fpath, 'utf-8');
        src = src.replace(`ac.getText("${id}")`, JSON.stringify(content));
      }
    }
  }

  // Expose key classes before main()
  // mainCallPattern is the exact text to find (e.g., "S.main()", "aa.main()")
  // The replacement inserts class exports with leading semicolon before it
  const exportLines = config.classExports.map(name => `window.${name}=${name};`).join('');
  src = src.replace(
    config.mainCallPattern,
    ';' + exportLines + config.mainCallPattern
  );

  // Apply custom source patches (generator-specific)
  if (config.patchSource) {
    src = config.patchSource(src);
  }

  // Patch Lime asset system to serve text synchronously (headless mode needs sync assets)
  // Replace isLocal check in the asset loader to force synchronous loading
  // Matches: if(X.isLocal(Y,Z))return ... in the lime.utils.Assets.getAsset method
  src = src.replace(/if\(\w+\.isLocal\(\w+,\w+\)\)return/g, 'if(true)return');

  // Execute with proper this context
  const wrappedSource = `(function(window){${src}}).call(globalThis, globalThis);`;
  eval(wrappedSource);

  // Initialize the Lime app
  const stderrWrite = process.stderr.write;
  process.stderr.write = (() => true) as any;
  try {
    g.lime.embed(config.appName, 'openfl-content', 0, 0, { parameters: {} });
  } finally {
    process.stderr.write = stderrWrite;
  }

  // Patch Assets.getText (both lime and openfl) to never throw and return empty string as fallback
  // This prevents crashes from async-only text assets in headless mode
  const patchGetText = (assetsObj: any) => {
    if (!assetsObj?.getText) return;
    const origGetText = assetsObj.getText;
    assetsObj.getText = function(id: string) {
      try {
        const result = origGetText.call(assetsObj, id);
        if (result != null) return result;
      } catch(e: any) { /* fall through to fallback */ }
      // Return appropriate fallback for common asset IDs
      if (id === 'grammar' || id === 'centrepiece') return '{}';
      if (id === 'english' || id === 'elven' || id === 'demonic' || id === 'male' || id === 'female') return '';
      return '';
    };
  };
  patchGetText(g.lime?.utils?.Assets);
  patchGetText(g.openfl?.utils?.Assets);

  // Set up Blob interception for export capture
  g.__captureCb = null;
  const OrigBlob = g.Blob;
  g.Blob = class extends OrigBlob {
    constructor(parts?: any[], opts?: any) {
      super(parts, opts);
      if (parts && parts.length > 0 && opts?.type && g.__captureCb) {
        const mime = opts.type as string;
        if (mime === 'image/svg+xml' || mime === 'application/json' || mime === 'image/png') {
          const data = typeof parts[0] === 'string' ? parts[0] : '';
          g.__captureCb(data);
          g.__captureCb = null;
        }
      }
    }
  };
  g.saveAs = () => {};

  const captureExport = (cb: (data: string) => void) => { g.__captureCb = cb; };

  // Build runtime interface
  const classes: Record<string, any> = {};
  for (const name of config.classExports) {
    classes[name] = (g as any)[name];
  }

  return {
    classes,
    captureExport,
    lime: g.lime,
  };
}
