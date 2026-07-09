const DANGEROUS_TAGS = new Set([
  'script', 'iframe', 'object', 'embed', 'style', 'use',
  'image', 'foreignobject',
])

const EVENT_HANDLER_RE = /^on[a-z]/i
const DANGEROUS_URI_RE = /^\s*javascript\s*:/i

/** Sanitize an SVG DOM tree by walking nodes and removing dangerous elements. */
export function sanitizeSvgDom(svg: Element): void {
  const toRemove: Element[] = []

  const walk = (node: Element) => {
    const tag = node.tagName?.toLowerCase()
    if (tag && DANGEROUS_TAGS.has(tag)) {
      toRemove.push(node)
      return
    }

    const attrs = node.attributes
    if (attrs) {
      const attrToRemove: string[] = []
      for (let i = 0; i < attrs.length; i++) {
        const attr = attrs[i]
        const name = attr.name.toLowerCase()
        if (EVENT_HANDLER_RE.test(name)) {
          attrToRemove.push(attr.name)
        } else if ((name === 'href' || name === 'xlink:href') && DANGEROUS_URI_RE.test(attr.value)) {
          attrToRemove.push(attr.name)
        }
      }
      for (const name of attrToRemove) {
        node.removeAttribute(name)
      }
    }

    for (const child of Array.from(node.children)) {
      walk(child)
    }
  }

  for (const child of Array.from(svg.children)) {
    walk(child)
  }

  for (const el of toRemove) {
    el.parentNode?.removeChild(el)
  }
}

/** Regex-based sanitizer for string contexts. */
export function sanitizeSvg(svg: string): string {
  let s = svg
  s = s.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
  s = s.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
  s = s.replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
  s = s.replace(/<embed\b[^>]*\/?>/gi, '')
  s = s.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
  s = s.replace(/<use\b[^>]*\/?>/gi, '')
  s = s.replace(/<image\b[^>]*\/?>/gi, '')
  s = s.replace(/<foreignObject\b[^<]*(?:(?!<\/foreignObject>)<[^<]*)*<\/foreignObject>/gi, '')
  s = s.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, '')
  s = s.replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, '')
  s = s.replace(/\bon\w+\s*=\s*[^\s>]*/gi, '')
  s = s.replace(/javascript\s*:/gi, '')
  return s
}
