import type { CDPSession, Page } from '@playwright/test'

type Node = { nodeType: number; backendNodeId: number; children?: Node[]; shadowRoots?: Node[] }

// Inspect Chromium's actual rendered text, including native input/textarea editors.
// A CSS-only mirror would miss differences in native baselines and line wrapping.
export async function fields(page: Page, session: CDPSession) {
  const selectors = ['.modal-title .eyebrow', '#detail-title', '.detail-music > div:nth-child(1) dt', '.detail-music > div:nth-child(1) .detail-value', '.detail-music > div:nth-child(2) dt', '#detail-bpm', '.detail-music > div:nth-child(3) dt', '#detail-key', '.detail-identity > div:nth-child(1) dt', '#detail-maker', '.source-identity dt', '.source-identity .identity-value', '.detail-dates > div:nth-child(1) dt', '.detail-dates > div:nth-child(1) dd', '.detail-dates > div:nth-child(2) dt', '.detail-dates > div:nth-child(2) dd', '.detail-description > label', '#detail-description', '.sale-label', '#detail-sale', '.reveal-file', '.youtube-link']
  const { root } = await session.send('DOM.getDocument', { depth: 0, pierce: true })
  return Promise.all(selectors.map(async (selector) => {
    const element = page.getByRole('dialog').locator(selector)
    const metrics = await element.evaluate((el) => {
      const r = el.getBoundingClientRect(), s = getComputedStyle(el)
      const dialog = el.closest('dialog')!.getBoundingClientRect()
      let dy = -dialog.y
      for (let parent = el.parentElement; parent && parent.tagName !== 'DIALOG'; parent = parent.parentElement) dy += parent.scrollTop
      return { box: [r.x - dialog.x, r.y + dy, r.width, r.height], shift: [-dialog.x, dy], font: [s.fontFamily, s.fontSize, s.fontWeight, s.lineHeight, s.letterSpacing, s.fontVariantNumeric], padding: [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft], border: [s.borderTopWidth, s.borderLeftWidth] }
    })
    const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector: `.beat-details ${selector}` })
    const { node } = await session.send('DOM.describeNode', { nodeId, depth: -1, pierce: true })
    const textNodes: Node[] = []
    function visit(node: Node) {
      if (node.nodeType === 3) textNodes.push(node)
      for (const child of [...node.children || [], ...node.shadowRoots || []]) visit(child)
    }
    visit(node)
    const text = (await Promise.all(textNodes.map(async (node) => {
      const { object } = await session.send('DOM.resolveNode', { backendNodeId: node.backendNodeId })
      const { result } = await session.send('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: 'function() { const range = document.createRange(); range.selectNodeContents(this); return [...range.getClientRects()].filter(r => r.width > 0 && r.height > 0).map(r => [r.x, r.y, r.width, r.height]); }', returnByValue: true })
      return (result.value as number[][]).map(([x, y, width, height]) => [x + metrics.shift[0], y + metrics.shift[1], width, height].map((value) => Math.round(value * 1000) / 1000))
    }))).flat()
    const { shift: _, ...rest } = metrics
    return { selector, ...rest, text }
  }))
}

