/**
 * Fantasy World Map — main application.
 * 
 * Displays a realm SVG backdrop with clickable town/village markers.
 * Clicking a town zooms in and opens the city/village GeoJSON detail view.
 */

import { render, reset } from './renderer';
import { Theme } from './types';

// ── State ────────────────────────────────────────────────────────

interface TownMarker {
  q: number;
  r: number;
  x: number;
  y: number;
  name: string;
  type: 'village' | 'town' | 'city';
  seed: number;
  file: string;
}

interface AppState {
  towns: TownMarker[];
  realmSvg: string;
  realmTheme: Theme;
  currentView: 'realm' | 'detail';
  currentTown: TownMarker | null;
}

const state: AppState = {
  towns: [],
  realmSvg: '',
  realmTheme: { title: 'Fantasy World', padding: 60, layers: [] },
  currentView: 'realm',
  currentTown: null,
};

// ── DOM refs ─────────────────────────────────────────────────────

const svgEl = d3.select('#map');
const tooltip = d3.select('#tooltip');
const legend = d3.select('#legend');
const toggles = d3.select('#layer-toggles');
const titleEl = d3.select('#map-title');
const backBtn = d3.select('#btn-back');
const container = d3.select('#map-container');

// ── Realm view ───────────────────────────────────────────────────

function showRealm() {
  state.currentView = 'realm';
  state.currentTown = null;
  backBtn.style('display', 'none');
  titleEl.text('🗺️ ' + state.realmTheme.title);

  reset('#map', '#layer-toggles', '#legend');

  // Embed the realm SVG
  svgEl.html('');
  const g = svgEl.append('g').attr('class', 'realm-bg');
  g.html(state.realmSvg);

  // Add town markers
  state.towns.forEach(town => {
    const marker = g.append('circle')
      .attr('cx', town.x)
      .attr('cy', -town.y)
      .attr('r', town.type === 'city' ? 6 : town.type === 'town' ? 4.5 : 3.5)
      .attr('fill', town.type === 'city' ? '#e74c3c' : town.type === 'town' ? '#f39c12' : '#3498db')
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5)
      .attr('class', 'town-marker')
      .style('cursor', 'pointer')
      .on('mouseenter', function() {
        tooltip.style('opacity', 1).text(town.name + ' (' + town.type + ')');
      })
      .on('mousemove', function(ev: MouseEvent) {
        tooltip.style('left', (ev.offsetX + 12) + 'px')
              .style('top', (ev.offsetY - 10) + 'px');
      })
      .on('mouseleave', function() { tooltip.style('opacity', 0); })
      .on('click', function() { openTown(town); });
  });

  // Fit realm SVG to viewport
  const bbox = (g.node() as SVGGElement)?.getBBox();
  if (bbox && bbox.width > 0) {
    const w = container.node()!.clientWidth;
    const h = container.node()!.clientHeight;
    const pad = 40;
    const scale = Math.min((w - pad * 2) / bbox.width, (h - pad * 2) / bbox.height);
    const tx = (w - bbox.width * scale) / 2 - bbox.x * scale;
    const ty = (h - bbox.height * scale) / 2 - bbox.y * scale;
    g.attr('transform', `translate(${tx},${ty}) scale(${scale})`);
  }
}

// ── Town detail view ─────────────────────────────────────────────

async function openTown(town: TownMarker) {
  state.currentView = 'detail';
  state.currentTown = town;
  backBtn.style('display', 'inline-block');
  titleEl.text('🏘️ ' + town.name);

  reset('#map', '#layer-toggles', '#legend');

  try {
    // Load town GeoJSON + theme
    const [geojson, theme] = await Promise.all([
      d3.json(town.file) as Promise<any>,
      d3.json(town.file.replace(/\.json$/, '_theme.json')) as Promise<any>,
    ]);

    const resolvedTheme: Theme = theme || {
      title: town.name,
      padding: 60,
      layers: [],
    };

    const w = container.node()!.clientWidth;
    const h = container.node()!.clientHeight;

    // Simple zoom-in from realm center
    const g = svgEl.append('g');
    const initialScale = 0.01;
    g.attr('transform', `translate(${w/2},${h/2}) scale(${initialScale})`);

    // Animate zoom
    g.transition()
      .duration(600)
      .ease(d3.easeCubicInOut)
      .attr('transform', `translate(${w/2},${h/2}) scale(1)`);

    // Render the town map after a slight delay
    setTimeout(() => {
      reset('#map', '#layer-toggles', '#legend');
      render({
        geojson,
        theme: resolvedTheme,
        container: '#map-container',
        svgSelector: '#map',
        legendSelector: '#legend',
        tooltipSelector: '#tooltip',
        togglesSelector: '#layer-toggles',
      });
    }, 300);

  } catch (err) {
    console.error('Failed to load town data:', err);
    showRealm();
  }
}

// ── Back button ──────────────────────────────────────────────────

backBtn.on('click', () => {
  if (state.currentView === 'detail') {
    showRealm();
  }
});

// ── Keyboard ──────────────────────────────────────────────────────

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.currentView === 'detail') {
    showRealm();
  }
});

// ── Init ─────────────────────────────────────────────────────────

export async function initWorldMap(config: {
  realmSvgUrl: string;
  realmTheme: Theme;
  townsDataUrl: string;
}) {
  state.realmTheme = config.realmTheme;

  try {
    // Load realm SVG
    const svgResp = await fetch(config.realmSvgUrl);
    state.realmSvg = await svgResp.text();
    // Extract inner SVG content (strip <?xml> and <svg> wrapper)
    const match = state.realmSvg.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
    if (match) state.realmSvg = match[1];

    // Load town data
    const townsResp = await fetch(config.townsDataUrl);
    state.towns = await townsResp.json();

    // Show realm
    showRealm();
  } catch (err) {
    console.error('Failed to initialize world map:', err);
  }
}
