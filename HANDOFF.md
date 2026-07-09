# Fantasy Map — Project Handoff

> Handoff document describing the current state of the project, the architecture,
> what works, what's broken, and what to do next. Written for a fresh agent
> picking up the work.

---

## 1. Goal

Build a working **Vue 3 + TypeScript + Vite** frontend for a fantasy map project.
The map data is produced by the **actual Watabou generator engines** (realm, city,
village, cave, dungeon, dwelling), which are pre-compiled Haxe/OpenFL JavaScript
bundles wrapped by thin TypeScript adapters.

The end-to-end pipeline is:

```
Watabou Haxe engines  ──►  generate JSON + SVG  ──►  frontend/public/  ──►  Vue app renders
   (packages/*.js)          (src/*/index.ts)                                (frontend/)
```

---

## 2. Hard Constraints / User Preferences (READ FIRST)

These came directly from the user and are **non-negotiable**:

1. **DO NOT touch the `verification/` folder.** Ever.
2. **DO NOT run terminal commands without asking the user first.** The user runs
   commands themselves and pastes back output. Ask before every command.
3. **DO NOT use placeholder / sample / fake data.** Everything must flow through the
   real Watabou generators. The user pushed back hard on this multiple times.
4. **DO NOT reimplement the Haxe SVG/JSON export logic.** It is the original app's
   functionality — we only *wrap* it and give it a valid environment (canvas, stage
   size, palette, assets). Fixes belong in the TS wrapper, not the `.js` bundles.
5. Use **Vue + TypeScript** for the frontend.
6. **D3 v7 is loaded via CDN `<script>`** in `index.html` (global `window.d3`), NOT
   bundled. In TS it is `declare const d3: any`.
7. **PNG export is not needed** and is disabled (headless node-canvas can't do it).

---

## 3. Repository Layout

```
fantasy_map/
├── packages/                 # Pre-compiled Watabou Haxe/OpenFL bundles + assets
│   ├── realm/    Realm.js    + assets/ (palettes, grammar)
│   ├── city/     mfcg.js     + assets/ (fonts, etc.)
│   ├── village/  Village.js  + assets/ (DOWNLOADED — see §7)
│   ├── cave/     ...
│   ├── dungeon/  ...
│   └── dwelling/ ...
│
├── src/                      # TypeScript wrappers around the engines
│   ├── shared/engine-base.ts # Core: DOM/canvas/window polyfills, eval bundle, Blob capture
│   ├── realm/  engine.ts index.ts types.ts   # WORKING (full generate + export)
│   ├── city/   engine.ts index.ts types.ts   # WORKING (full generate + export)
│   ├── village/engine.ts index.ts types.ts   # WORKING (full generate + export)
│   ├── cave/   engine.ts types.ts            # init-only smoke test (no generate wrapper)
│   ├── dungeon/engine.ts types.ts            # init-only smoke test
│   ├── dwelling/engine.ts types.ts           # init-only smoke test
│   ├── demo.ts               # Unified demo — runs all 6 engines, writes output/
│   ├── frontend/             # OLD vanilla-TS frontend (superseded by frontend/) — legacy
│   └── test-*.ts             # Ad-hoc scratch test files (can be ignored/deleted)
│
├── frontend/                 # NEW standalone Vue + Vite + TS app (the real frontend)
│   ├── index.html            # Loads D3 v7 from CDN
│   ├── package.json          # Its OWN package.json — separate from root
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── public/               # Generated data goes here (realm.svg, realm_theme.json, ...)
│   └── src/
│       ├── App.vue
│       ├── main.ts
│       ├── types.ts
│       ├── components/RealmView.vue     # World map view
│       ├── components/DetailView.vue    # City/village detail view
│       ├── composables/useRenderer.ts   # D3 GeoJSON renderer
│       └── utils/{sanitize,tooltip}.ts
│
├── scripts/generate-frontend.ts  # BROKEN single-process generator (see §6)
├── output/                   # demo.ts writes here (duskvale.*, icelog.*, sloate_peninsula.*)
├── serve.ts                  # legacy static server for old src/frontend
├── verification/             # ⛔ DO NOT TOUCH
├── package.json              # root scripts (demo, demo:*, generate)
└── tsconfig.json
```

---

## 4. Engine Architecture (CRITICAL — read before touching engines)

All six engines are **pre-compiled Haxe/OpenFL bundles** (`packages/*/*.js`). They are
minified and share the **same global namespace**. Key facts:

### 4.1 How wrapping works (`src/shared/engine-base.ts`)
- Sets up a **headless DOM/window/canvas environment** (node-canvas via the `canvas`
  npm package) so the OpenFL runtime can run under Node.
- `eval()`s the Haxe bundle onto `globalThis`.
- Intercepts `Blob` construction to **capture export output** — when the Haxe app
  "saves" a file, it creates a Blob; we capture its text via a global `__captureCb`.
- Patches asset text loaders (`getText`) to return inlined asset strings.

### 4.2 Shared-global class clobbering (THE big gotcha)
Every engine `eval`s its bundle onto the **same `globalThis`**, redefining the same
minified class names (`Ub`, `Fd`, `C`, `Rb`, `w`, ...). **Loading a second engine
clobbers the first engine's globals.**

- **City** uses raw minified globals: `Ub` (City), `Fd` (Blueprint), `C` (Random), `ia` (Scene), `be` (Exporter), etc.
- **Realm** namespaces its exports: `RealmRegion`, `RealmBlueprint`, `RealmSvgExporter`, `UtilsRandom`.
- **Village** namespaces: `VillageRegion`, `VillageBlueprint`, `VillageView`, `VillageJSONExporter`, `VillageStyle`, `UtilsPalette`.

Namespacing is done in each engine's `engine.ts` via a regex that finds the Haxe class
registration `g["com.watabou...ClassName"]=<minified>;` and appends
`window.<FriendlyName>=<minified>;`.

### 4.3 Module-corruption bug (why order matters)
When **realm's bundle `eval`s first**, it corrupts CJS module bindings so that a later
**dynamic** `import`/`require` of city's `engine-base` fails with
`import_engine_base.createEngine is not a function`.

- **Static** imports at the top of a file work (cached before any `eval` runs).
- The **demo works** because `src/demo.ts` statically imports all engines up front and
  runs **city first**, before realm's bundle corrupts anything.
- **`scripts/generate-frontend.ts` is broken** precisely because it can't load multiple
  engines in one process in the wrong order. → **See §6 for the fix (child processes).**

---

## 5. Current Status

### ✅ Working
- **`npm run demo`** runs all 6 engines and writes to `output/`:
  | Engine   | Seed name         | JSON     | SVG      | Notes |
  |----------|-------------------|----------|----------|-------|
  | City     | `duskvale`        | 289 KB   | 338 KB   | full generate + export |
  | Realm    | `sloate_peninsula`| 65 KB    | 4.9 MB   | full generate + export |
  | Village  | `icelog`          | 33 KB    | 3.6 MB   | full generate + export (was broken, now fixed) |
  | Cave     | —                 | —        | —        | init-only smoke test |
  | Dungeon  | —                 | —        | —        | init-only smoke test |
  | Dwelling | —                 | —        | —        | init-only smoke test |
- Demo exits cleanly via `process.exit()` (Haxe/OpenFL leave open handles that otherwise hang Node).
- **Frontend (`frontend/`)** exists as a standalone Vue+Vite+TS project (ported from the
  old `src/frontend/` vanilla-TS version after 3 code-review sweeps / 41+ fixes).

### 🟡 Recently fixed (verify these look right)
These were the last things worked on. **The user should re-run `npm run demo` and open
the SVGs in a browser to confirm no console errors.**

1. **Village SVG was empty (11 chars)** → now 3.6 MB.
   - Root cause: `VillageView` constructor reads colors/fonts from the `Style` class,
     which is only populated by `Style.setPalette(...)` at browser startup — skipped headless.
   - Fix (`src/village/index.ts` `init()`): read `packages/village/assets/village_default.json`
     and call `Style.setPalette(Palette.fromJSON(json), true)` — the exact browser code path.
   - Also: build a real `VillageView`, size it, and attach to `Scene.inst.view` so export has geometry.

2. **City SVG `NaN` / Village SVG `Infinity`** in transforms (`translate(NaN -40)`,
   `M NaN,0`, `scale(Infinity Infinity)`).
   - Root cause (shared): headless OpenFL stage is created **0×0** (`lime.embed(..., 0, 0, ...)`),
     so scene/view `rWidth`/`rHeight` = 0 → scale math divides by zero.
   - **City fix** (`src/city/index.ts`): after `new ia()` scene, call `scene.setSize(1024, 1024)`
     so `scene.get_mapScale()` (= `rWidth / (viewport.width + b)`) is valid before `Rd.export`.
   - **Village fix** (`src/village/index.ts`): `view.setSize(2*viewW2, 2*viewH2)` → `map.scaleX = 1`
     → export's `la.scale(b, 1/scaleX, ...)` = 1 instead of `1/0 = Infinity`.
   - ⚠️ **Verification pending**: user was going to re-run and confirm the browser console is clean.

### ❌ Broken / Not done
- **`scripts/generate-frontend.ts`** — single-process; can't load realm + city + village
  together (module corruption, §4.3). **Needs rewrite as child-process-per-engine.**
- **`frontend/public/` is incomplete** — only has `realm.svg` + `realm_theme.json`. Needs
  the full data set (see §8 data convention).
- **`cd frontend && npm install`** — not yet run.
- **Frontend never launched** (`npm run dev` inside `frontend/`) — untested end-to-end.
- **Cave / Dungeon / Dwelling** have no `index.ts` generate wrapper — only init smoke tests.

---

## 6. The Multi-Engine Generation Problem (MOST IMPORTANT NEXT STEP)

**You cannot generate realm + city + village in one Node process** because each Haxe
bundle `eval` clobbers globals and corrupts CJS module bindings for the next engine (§4.3).

**Required design: one child process per engine.** Options:

- `child_process.fork` a small script per engine, each: init → generate → export → write files → `process.exit()`.
- Or separate `npm run generate:realm`, `generate:city`, `generate:village` scripts
  (each `tsx <entry>.ts`) orchestrated by a parent script that runs them sequentially.

Each per-engine child should mirror what `src/demo.ts` does for that one engine, but
write into `frontend/public/` using the §8 convention instead of `output/`.

The realm generator produces **town locations** — those seeds/positions should be fed
into the city/village child processes so the detail maps correspond to realm towns.

---

## 7. Village Assets (downloaded — do not delete)

`packages/village/` originally shipped **without** the runtime assets the engine needs.
They were downloaded from the live webapp `https://watabou.github.io/village-generator/Assets/`
into `packages/village/assets/`:

| File                    | Asset id     | Purpose |
|-------------------------|--------------|---------|
| `grammar.json`          | `grammar`    | name generation grammar |
| `given_male.txt`        | `givenMale`  | male given names |
| `given_female.txt`      | `givenFemale`| female given names |
| `village_default.json`  | `default`    | **palette** (colors/fonts/strokes) |
| `village_sand.json`     | `sand`       | palette |
| `village_cold.json`     | `cold`       | palette |
| `village_night.json`    | `night`      | palette |
| `village_bw.json`       | `bw`         | palette |
| `village_minimal.json`  | `minimal`    | palette |

- The OpenFL asset manifest that maps id → path is embedded inside `packages/village/Village.js`
  (search for `Assets%2Fvillage_default.json`).
- **grammar/name assets** are loaded via `getText("grammar")` (string literal) → inlined by a
  regex in `src/village/engine.ts` (`\w+\.getText("id")`, receiver-agnostic).
- **Palettes** are loaded via `Palette.fromAsset("default")` → `getText(variable)` (NOT a literal),
  so getText-inlining doesn't match. Instead `src/village/index.ts` reads the palette file
  directly and calls `Style.setPalette(Palette.fromJSON(json), true)`.

---

## 8. Frontend Data Convention

Files the Vue app expects in `frontend/public/`:

```
/realm.json          # realm world map as GeoJSON (for RealmView)   ← NOTE: convention is realm.json
/realm.svg           # realm world map as SVG (currently present)
/realm_theme.json    # realm palette/theme (currently present)
/towns.json          # list of towns { name, type: 'city'|'village', x, y, ... }
/city/<name>.json          # per-city GeoJSON
/city/<name>_theme.json    # per-city theme
/village/<name>.json        # per-village GeoJSON
/village/<name>_theme.json  # per-village theme
```

- `RealmView.vue` renders the realm + clickable town markers.
- Clicking a town loads `DetailView.vue` which renders `/<type>/<name>.json` via `useRenderer.ts` (D3 GeoJSON).
- **D3 is a CDN global** (`window.d3`), referenced as `declare const d3: any`.

---

## 9. Key Files Reference

| File | Role |
|------|------|
| `src/shared/engine-base.ts` | Headless DOM/canvas/window polyfills, bundle eval, Blob-capture export, getText patching |
| `src/demo.ts` | Runs all 6 engines (city FIRST), writes `output/`, force-exits |
| `src/realm/index.ts` | Realm generate + export (JSON/SVG). Reference implementation for export fallback timeouts |
| `src/city/index.ts` | City generate + export. **Has the `scene.setSize(1024,1024)` NaN fix** |
| `src/village/index.ts` | Village generate + export. **Has palette init + view.setSize fixes** |
| `src/village/engine.ts` | Village bundle init + asset inlining + class namespacing (`VillageStyle`, `UtilsPalette`, etc.) |
| `scripts/generate-frontend.ts` | ⚠️ BROKEN single-process generator — rewrite as child-process-per-engine |
| `frontend/` | The real Vue app (standalone project) |

---

## 10. Recommended Next Steps (in order)

1. **Verify the SVG fixes** — user re-runs `npm run demo`, opens `output/duskvale.svg` and
   `output/icelog.svg` in a browser, confirms no `NaN` / `Infinity` in the console.
2. **Rewrite generation as child-process-per-engine** (§6). One process per engine,
   each writes into `frontend/public/` using the §8 convention.
3. **Wire realm towns → city/village** — realm output provides town names/positions; feed
   those as seeds so detail maps match realm towns. Produce `towns.json`.
4. `cd frontend && npm install`.
5. `cd frontend && npm run dev` — smoke-test the Vue app end-to-end against generated data.
6. Wire root `package.json` scripts to orchestrate the full pipeline (generate → build frontend).
7. (Optional) Add generate wrappers for cave/dungeon/dwelling if their maps are needed.

---

## 11. Gotchas Cheat-Sheet

- ⛔ Never touch `verification/`.
- 🙋 Always ask before running commands.
- 🚫 No placeholder data — real generators only.
- 🔧 Fix the TS wrapper, never the Haxe `.js` bundles.
- 🧩 Multi-engine in one process = broken. Use child processes.
- 🥇 In any single process that must load several engines statically, load **city first**.
- 📐 Headless stage is 0×0 — any scene/view must be `setSize()`'d before SVG export or you get NaN/Infinity.
- 🎨 Village needs `Style.setPalette(...)` before building a `VillageView`, or it throws `undefined ... 'color'`.
- 🖼️ PNG export is disabled (node-canvas throws); JSON + SVG only.
- 🌐 D3 is a CDN global, not an npm import.
- 🧹 `src/frontend/` (vanilla TS) and `src/test-*.ts` are legacy/scratch; the live frontend is `frontend/`.
