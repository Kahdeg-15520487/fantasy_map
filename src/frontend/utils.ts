/**
 * Shared utilities for the frontend.
 *
 * Fixes applied:
 *  Sweep 3: C3 DOM-based sanitization, M1 shared positionTooltip,
 *           L10 xlink:href stripping, L12 debounce type ergonomics
 */

// ── SVG Sanitization (C3: DOM-based, not regex-only) ────────────

/** Tags considered dangerous in SVG context. */
const DANGEROUS_TAGS = new Set([
  'script', 'iframe', 'object', 'embed', 'style', 'use',
  'image', 'foreignobject',
]);

/** Attributes that are event handlers. */
const EVENT_HANDLER_RE = /^on[a-z]/i;

/** URI schemes that can execute code. */
const DANGEROUS_URI_RE = /^\s*javascript\s*:/i;

/**
 * Sanitize an SVG DOM tree by walking nodes and removing dangerous elements
 * and attributes. This is safe against HTML entity encoding bypasses because
 * it operates on the parsed DOM, not the raw string.
 */
export function sanitizeSvgDom(svg: Element | DocumentFragment): void {
  // Collect elements to remove (can't remove during walk)
  const toRemove: Element[] = [];

  const walk = (node: Element) => {
    // Check if this element is dangerous
    const tag = node.tagName?.toLowerCase();
    if (tag && DANGEROUS_TAGS.has(tag)) {
      toRemove.push(node);
      return; // Don't walk children of removed elements
    }

    // Check attributes
    const attrs = node.attributes;
    if (attrs) {
      const attrToRemove: string[] = [];
      for (let i = 0; i < attrs.length; i++) {
        const attr = attrs[i];
        const name = attr.name.toLowerCase();
        // Remove event handlers
        if (EVENT_HANDLER_RE.test(name)) {
          attrToRemove.push(attr.name);
          continue;
        }
        // Remove javascript: URIs in href/xlink:href
        if ((name === 'href' || name === 'xlink:href') && DANGEROUS_URI_RE.test(attr.value)) {
          attrToRemove.push(attr.name);
        }
      }
      for (const name of attrToRemove) {
        node.removeAttribute(name);
      }
    }

    // Walk children
    const children = Array.from(node.children);
    for (const child of children) {
      walk(child);
    }
  };

  // Walk the tree
  const children = Array.from(svg.children || []);
  for (const child of children) {
    walk(child);
  }

  // Remove dangerous elements
  for (const el of toRemove) {
    el.parentNode?.removeChild(el);
  }
}

/**
 * Legacy regex-based sanitizer (kept for string contexts where DOMParser is
 * not available). For DOM-based flows, prefer sanitizeSvgDom().
 */
export function sanitizeSvg(svg: string): string {
  let s = svg;

  // Remove dangerous tags and their contents
  s = s.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  s = s.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
  s = s.replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '');
  s = s.replace(/<embed\b[^>]*\/?>/gi, '');
  s = s.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

  // Remove elements that can reference external resources or leak data
  s = s.replace(/<use\b[^>]*\/?>/gi, '');
  s = s.replace(/<image\b[^>]*\/?>/gi, '');
  s = s.replace(/<foreignObject\b[^<]*(?:(?!<\/foreignObject>)<[^<]*)*<\/foreignObject>/gi, '');

  // Remove <a> tags (any with href or xlink:href)
  s = s.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, '');

  // Remove on* event handler attributes
  s = s.replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, '');
  s = s.replace(/\bon\w+\s*=\s*[^\s>]*/gi, '');

  // Neutralize javascript: URIs in any remaining attributes
  s = s.replace(/javascript\s*:/gi, '');

  return s;
}

// ── Tooltip positioning (M1: shared) ────────────────────────────

/**
 * Position a tooltip element relative to the #map-container.
 * Falls back to viewport coordinates if container is missing.
 */
export function positionTooltip(
  tooltipEl: HTMLElement,
  event: MouseEvent,
): void {
  const mapContainer = document.getElementById('map-container');
  if (!mapContainer) {
    tooltipEl.style.left = (event.clientX + 12) + 'px';
    tooltipEl.style.top = (event.clientY - 10) + 'px';
    return;
  }
  const rect = mapContainer.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  tooltipEl.style.left = (x + 12) + 'px';
  tooltipEl.style.top = (y - 10) + 'px';
}

// ── Debounce (L12: fixed return type) ───────────────────────────

/** Debounced function with a cancel method. */
export interface DebouncedFn {
  (...args: unknown[]): void;
  cancel(): void;
}

/** Create a debounced version of `fn` that waits `ms` after the last call. */
export function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): DebouncedFn {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const debounced = function(this: unknown, ...args: unknown[]) {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn.apply(this, args);
    }, ms);
  } as DebouncedFn;
  debounced.cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return debounced;
}
