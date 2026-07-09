/**
 * Fantasy World Map — main application.
 *
 * Displays a realm SVG backdrop with clickable town/village markers.
 * Clicking a town zooms in and opens the city/village GeoJSON detail view.
 *
 * Fixes applied:
 *  Sweep 1: #3 race condition, #6 theme path, #7 error boundaries,
 *           #8 tooltip offset, #9 regen button, #11 SVG sanitization,
 *           #17 loading indicator, #18 theme convention docs
 *  Sweep 2: #1 keydown lifecycle, #4 SVG namespace, #5 incomplete sanitizer,
 *           #7 null assertions, #8 d3.json typing, #10 shared sanitizeSvg,
 *           #12 redundant html(''), #17 module-level DOM selections
 *  Sweep 3: C2 null guards, C3 DOM-based sanitizer, M1 shared positionTooltip,
 *           M4 loading flicker fix, L7 user error feedback, L8 missing SVG guard
 */
/* d3 is loaded via CDN <script> — available as window.d3 */
declare const d3: typeof import('d3');
import { render, reset } from './renderer';
import { Theme, GeoCollection } from './types';
import { sanitizeSvg, sanitizeSvgDom, positionTooltip } from './utils';

// ── State ────────────────────────────────────────────────────────

interface TownMarker {
  q: number;
  r: number;
  x: number;
  y: number;
  name: string;
  type: 'village' | 'town' | 'city';
  seed: number;
  /** Relative path to the town's GeoJSON file (e.g. "city/duskvale.json"). */
  file: string;
}

interface AppState {
  towns: TownMarker[];
  realmSvg: string;
  realmTheme: Theme;
  currentView: 'realm' | 'detail';
  currentTown: TownMarker | null;
  /** Active request counter — prevents stale async responses from rendering. */
  requestSeq: number;
  /** Callback invoked when "New Map" is clicked. Set by the host page. */
  onRegen: (() => void) | null;
}

const state: AppState = {
  towns: [],
  realmSvg: '',
  realmTheme: { title: 'Fantasy World', padding: 60, layers: [] },
  currentView: 'realm',
  currentTown: null,
  requestSeq: 0,
  onRegen: null,
};

// ── Lazy DOM refs — evaluated only after DOM is ready ────────────

function getDomRefs() {
  return {
    svgEl: d3.select('#map'),
    tooltip: d3.select('#tooltip'),
    legend: d3.select('#legend'),
    toggles: d3.select('#layer-toggles'),
    titleEl: d3.select('#map-title'),
    backBtn: d3.select('#btn-back'),
    regenBtn: d3.select('#btn-regen'),
    container: d3.select('#map-container'),
    loadingEl: d3.select('#loading'),
  };
}

// ── Loading indicator ──────────────────────────────────────────

function showLoading(refs: ReturnType<typeof getDomRefs>): void {
  refs.loadingEl.classed('hidden', false);
}

function hideLoading(refs: ReturnType<typeof getDomRefs>): void {
  refs.loadingEl.classed('hidden', true);
}

// ── Show user-visible error (L7) ──────────────────────────────

function showError(refs: ReturnType<typeof getDomRefs>, message: string): void {
  hideLoading(refs);
  // Show error in the title area as a fallback
  refs.titleEl.text('⚠️ ' + message);
}

// ── Realm view ───────────────────────────────────────────────────

function showRealm(refs: ReturnType<typeof getDomRefs>): void {
  state.currentView = 'realm';
  state.currentTown = null;
  refs.backBtn.style('display', 'none');
  refs.titleEl.text('🗺️ ' + state.realmTheme.title);

  reset('#map', '#layer-toggles', '#legend');

  // L8: Guard missing SVG element
  const svgNode = refs.svgEl.node();
  if (!svgNode) {
    console.error('SVG element #map not found');
    return;
  }

  try {
    // C3: Use DOMParser + sanitizeSvgDom for safe SVG namespace handling
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg">${state.realmSvg}</svg>`,
      'image/svg+xml',
    );

    // C3: Sanitize the parsed DOM tree (handles entity-encoded payloads)
    const svgRoot = svgDoc.querySelector('svg');
    if (svgRoot) {
      sanitizeSvgDom(svgRoot);

      const g = refs.svgEl.append('g').attr('class', 'realm-bg');
      // Import nodes from the correctly-namespaced, sanitized document
      const imported = document.importNode(svgRoot, true);
      while (imported.firstChild) {
        svgNode.appendChild(imported.firstChild);
      }
      // Reparent into the group
      const gNode = g.node();
      if (gNode) {
        while (svgNode.lastChild && svgNode.lastChild !== gNode) {
          gNode.insertBefore(svgNode.lastChild, gNode.firstChild);
        }
      }
    }

    // Add town markers
    const g = refs.svgEl.select<SVGGElement>('.realm-bg');
    const gNode = g.node();

    state.towns.forEach(town => {
      const marker = g.append('circle')
        .attr('cx', town.x)
        .attr('cy', -town.y)
        .attr('r', town.type === 'city' ? 6 : town.type === 'town' ? 4.5 : 3.5)
        .attr('fill', town.type === 'city' ? '#e74c3c' : town.type === 'town' ? '#f39c12' : '#3498db')
        .attr('stroke', '#fff')
        .attr('stroke-width', 1.5)
        .attr('class', 'town-marker')
        // M8: Add ARIA role for accessibility
        .attr('role', 'button')
        .attr('tabindex', '0')
        .attr('aria-label', `${town.name} (${town.type})`)
        .style('cursor', 'pointer')
        .on('mouseenter', function() {
          const tipEl = document.getElementById('tooltip');
          if (tipEl) {
            tipEl.textContent = town.name + ' (' + town.type + ')';
            tipEl.style.opacity = '1';
          }
        })
        .on('mousemove', function(ev: MouseEvent) {
          const tipEl = document.getElementById('tooltip');
          if (tipEl) positionTooltip(tipEl, ev);
        })
        .on('mouseleave', function() {
          const tipEl = document.getElementById('tooltip');
          if (tipEl) tipEl.style.opacity = '0';
        })
        .on('click', function() { openTown(town, refs); })
        // M9: Keyboard activation for town markers
        .on('keydown', function(ev: KeyboardEvent) {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            openTown(town, refs);
          }
        });
    });

    // Fit realm SVG to viewport
    const bbox = gNode?.getBBox();
    if (bbox && bbox.width > 0) {
      const w = refs.container.node()?.clientWidth ?? 800;
      const h = refs.container.node()?.clientHeight ?? 600;
      const pad = 40;
      const scale = Math.min((w - pad * 2) / bbox.width, (h - pad * 2) / bbox.height);
      const tx = (w - bbox.width * scale) / 2 - bbox.x * scale;
      const ty = (h - bbox.height * scale) / 2 - bbox.y * scale;
      g.attr('transform', `translate(${tx},${ty}) scale(${scale})`);
    }
  } catch (err) {
    console.error('Failed to render realm view:', err);
    showError(refs, 'Failed to render realm');
  }
}

// ── Town detail view ─────────────────────────────────────────────

async function openTown(town: TownMarker, refs: ReturnType<typeof getDomRefs>): Promise<void> {
  const seq = ++state.requestSeq;
  state.currentView = 'detail';
  state.currentTown = town;
  refs.backBtn.style('display', 'inline-block');
  refs.titleEl.text('🏘️ ' + town.name);

  reset('#map', '#layer-toggles', '#legend');
  showLoading(refs);

  try {
    const themeUrl = town.file.replace(/\.json$/, '_theme.json');
    const [geojson, theme] = await Promise.all([
      d3.json<GeoCollection>(town.file),
      d3.json<Theme>(themeUrl).catch((err) => {
        console.warn(`Theme file not found at "${themeUrl}", using default theme:`, err);
        return null;
      }),
    ]);

    // M4: Guard — if stale request, abort
    if (seq !== state.requestSeq) return;

    if (!geojson || !geojson.features) {
      console.error(`Invalid GeoJSON for "${town.name}" at ${town.file}`);
      showError(refs, `Failed to load ${town.name}`);
      showRealm(refs);
      return;
    }

    const resolvedTheme: Theme = theme || {
      title: town.name,
      padding: 60,
      layers: [],
    };

    hideLoading(refs);

    const w = refs.container.node()?.clientWidth ?? 800;
    const h = refs.container.node()?.clientHeight ?? 600;

    const g = refs.svgEl.append('g');
    const initialScale = 0.01;
    g.attr('transform', `translate(${w / 2},${h / 2}) scale(${initialScale})`);

    g.transition()
      .duration(600)
      .ease(d3.easeCubicInOut)
      .attr('transform', `translate(${w / 2},${h / 2}) scale(1)`)
      .on('end', () => {
        if (seq !== state.requestSeq) return;
        try {
          render({
            geojson,
            theme: resolvedTheme,
            container: '#map-container',
            svgSelector: '#map',
            legendSelector: '#legend',
            tooltipSelector: '#tooltip',
            togglesSelector: '#layer-toggles',
          });
        } catch (err) {
          console.error('Failed to render town detail:', err);
          if (seq === state.requestSeq) showRealm(refs);
        }
      });

  } catch (err) {
    console.error('Failed to load town data:', err);
    // M4: Only hide loading / show realm if this is still the active request
    if (seq === state.requestSeq) {
      hideLoading(refs);
      showError(refs, `Failed to load ${town.name}`);
      showRealm(refs);
    }
  }
}

// ── Keydown lifecycle ────────────────────────────────────────────

let keydownHandler: ((e: KeyboardEvent) => void) | null = null;

function installKeydownHandler(refs: ReturnType<typeof getDomRefs>): void {
  if (keydownHandler) {
    window.removeEventListener('keydown', keydownHandler);
  }
  keydownHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && state.currentView === 'detail') {
      showRealm(refs);
    }
  };
  window.addEventListener('keydown', keydownHandler);
}

// ── Init ─────────────────────────────────────────────────────────

export async function initWorldMap(config: {
  realmSvgUrl: string;
  realmTheme: Theme;
  townsDataUrl: string;
  onRegen?: () => void;
}): Promise<void> {
  const refs = getDomRefs();

  state.realmTheme = config.realmTheme;
  state.onRegen = config.onRegen ?? null;

  showLoading(refs);

  try {
    const svgResp = await fetch(config.realmSvgUrl);
    if (!svgResp.ok) throw new Error(`Failed to fetch realm SVG: ${svgResp.status} ${svgResp.statusText}`);
    let svgText = await svgResp.text();
    const match = svgText.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
    if (match) svgText = match[1];
    state.realmSvg = sanitizeSvg(svgText);

    const townsResp = await fetch(config.townsDataUrl);
    if (!townsResp.ok) throw new Error(`Failed to fetch towns data: ${townsResp.status} ${townsResp.statusText}`);
    state.towns = await townsResp.json();

    hideLoading(refs);

    installKeydownHandler(refs);

    refs.regenBtn.on('click', () => {
      if (typeof state.onRegen === 'function') {
        state.onRegen();
      } else {
        console.warn('No regen callback registered. Pass onRegen to initWorldMap().');
      }
    });

    showRealm(refs);
  } catch (err) {
    console.error('Failed to initialize world map:', err);
    showError(refs, 'Failed to load map data');
  }
}
