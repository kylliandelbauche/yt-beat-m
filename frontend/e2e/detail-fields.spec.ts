import { expect, test } from '@playwright/test'
import type { CDPSession, Page } from '@playwright/test'

type Node = { nodeType: number; backendNodeId: number; children?: Node[]; shadowRoots?: Node[] }

// Inspect Chromium's actual rendered text, including native input/textarea editors.
// A CSS-only mirror would miss differences in native baselines and line wrapping.
async function fields(page: Page, session: CDPSession) {
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

for (const viewport of [{ width: 1280, height: 900, missing: false }, { width: 390, height: 650, missing: false }, { width: 1280, height: 900, missing: true }]) {
  test(`22 textes et champs fixes, scroll et brouillon conservés sur ${viewport.width}${viewport.missing ? ' sans métadonnées' : ''}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const title = 'L’été — une prod mélancolique et un titre très long '.repeat(6)
    const description = viewport.missing ? '' : 'Une ligne de description longue pour vérifier les mêmes retours à la ligne dans les deux modes.\n'.repeat(50)
    let attempts = 0
    let release: (() => void) | undefined
    const pending = new Promise<void>((resolve) => { release = resolve })
    await page.route('**/api/beats/00000000-0000-0000-0000-000000000001', async (route) => {
      const response = await route.fetch()
      await route.fulfill({ json: { ...await response.json(), title, description, ...(viewport.missing ? { bpm: null, musical_key: null, beatmaker: null, links: [] } : {}) } })
    })
    await page.route('**/api/beats/*/metadata', async (route) => {
      attempts += 1
      if (attempts === 1) { await pending; return route.fulfill({ status: 503, json: { detail: 'Stockage indisponible. Le brouillon est conservé.' } }) }
      const response = await page.request.get(route.request().url().replace('/metadata', ''))
      await route.fulfill({ json: { ...await response.json(), title, description, ...(viewport.missing ? { bpm: null, musical_key: null, beatmaker: null, links: [] } : { bpm: 155 }) } })
    })
    await page.goto('/')
    await page.getByRole('button', { name: 'Écouter R&B Mélancolique', exact: true }).click()
    const audio = page.locator('audio')
    await expect(audio).toHaveJSProperty('paused', false)
    await audio.evaluate((el: HTMLAudioElement) => { el.pause(); el.currentTime = 7; el.dataset.identity = 'stable-field-audio' })
    const trigger = page.getByRole('button', { name: 'Détails de R&B Mélancolique', exact: true })
    await trigger.click()
    const dialog = page.getByRole('dialog')
    const editor = dialog.getByRole('textbox', { name: 'Titre de la prod', exact: true })
    await expect(editor).toHaveValue(title)
    await page.evaluate(() => document.fonts.ready)
    await editor.evaluate((el) => { el.scrollLeft = 64; el.dataset.identity = 'same-title' })
    const desc = dialog.getByRole('textbox', { name: 'Description de la prod', exact: true })
    await desc.evaluate((el) => { el.scrollTop = 120; el.dataset.identity = 'same-description' })
    const session = await page.context().newCDPSession(page)
    await session.send('DOM.enable')
    const before = await fields(page, session)
    expect(before).toHaveLength(22)
    expect(before.every((field) => field.text.length > 0)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('read.png') })
    const actions = () => dialog.locator('.modal-actions button').evaluateAll((buttons) => buttons.map((el) => { const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height] }))
    const actionBoxes = await actions()
    await dialog.getByRole('button', { name: 'Modifier la prod', exact: true }).click()
    await expect(editor).toBeEditable()
    await expect(editor).not.toBeFocused()
    await expect.poll(() => editor.evaluate((el) => el.scrollLeft)).toBe(64)
    expect(await fields(page, session)).toEqual(before)
    await page.screenshot({ path: testInfo.outputPath('edit.png') })
    await expect(desc).toHaveAttribute('data-identity', 'same-description')
    expect(await desc.evaluate((el) => el.scrollTop)).toBe(viewport.missing ? 0 : 120)
    if (!viewport.missing) await dialog.getByLabel('BPM', { exact: true }).fill('155')
    const save = dialog.getByRole('button', { name: 'Enregistrer les modifications', exact: true })
    await save.click()
    await expect(save).toBeDisabled()
    expect(await fields(page, session)).toEqual(before)
    release?.()
    await expect(dialog.getByRole('alert')).toContainText('Stockage indisponible')
    expect(await fields(page, session)).toEqual(before)
    expect(await actions()).toEqual(actionBoxes)
    await page.screenshot({ path: testInfo.outputPath('save-error.png') })
    if (!viewport.missing) {
      await dialog.getByRole('button', { name: 'Fermer la fiche', exact: true }).click()
      await expect(dialog.getByText('Des modifications ne sont pas enregistrées.', { exact: true })).toBeVisible()
      expect(await fields(page, session)).toEqual(before)
      await dialog.getByRole('button', { name: 'Continuer l’édition', exact: true }).click()
      await expect(dialog.getByLabel('BPM', { exact: true })).toHaveValue('155')
    }
    await dialog.getByRole('button', { name: 'Réessayer', exact: true }).click()
    await expect(dialog.getByRole('status')).toHaveText('Informations enregistrées.')
    await expect(editor).toHaveAttribute('readonly', '')
    expect(await fields(page, session)).toEqual(before)
    await dialog.getByRole('button', { name: 'Modifier la prod', exact: true }).click()
    await dialog.getByRole('button', { name: 'Annuler les modifications', exact: true }).click()
    expect(await fields(page, session)).toEqual(before)
    await dialog.getByRole('button', { name: 'Modifier la prod', exact: true }).click()
    await dialog.getByLabel('BPM', { exact: true }).fill('166')
    await dialog.getByRole('button', { name: 'Fermer la fiche', exact: true }).click()
    await expect(dialog.getByText('Des modifications ne sont pas enregistrées.', { exact: true })).toBeVisible()
    await dialog.getByRole('button', { name: 'Continuer l’édition', exact: true }).click()
    await expect(dialog.getByLabel('BPM', { exact: true })).toHaveValue('166')
    await dialog.getByRole('button', { name: 'Annuler les modifications', exact: true }).click()
    expect(await fields(page, session)).toEqual(before)
    await expect(editor).toHaveAttribute('data-identity', 'same-title')
    await expect(audio).toHaveAttribute('data-identity', 'stable-field-audio')
    await expect(audio).toHaveJSProperty('paused', true)
    await expect(audio).toHaveJSProperty('currentTime', 7)
    await page.keyboard.press('Escape')
    await expect(trigger).toBeFocused()
    await session.detach()
  })
}

test('le titre animé garde sa position en édition et les erreurs de saisie restent explicites', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.route('**/api/beats/00000000-0000-0000-0000-000000000001', async (route) => {
    const response = await route.fetch()
    await route.fulfill({ json: { ...await response.json(), title: 'Un long titre qui défile sans retour au début '.repeat(8) } })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Détails de R&B Mélancolique', exact: true }).click()
  const dialog = page.getByRole('dialog')
  const title = dialog.getByRole('textbox', { name: 'Titre de la prod', exact: true })
  await title.hover()
  await expect.poll(() => title.evaluate((el) => el.scrollLeft)).toBeGreaterThan(8)
  await page.mouse.move(0, 0)
  const offset = await title.evaluate((el) => el.scrollLeft)
  await dialog.getByRole('button', { name: 'Modifier la prod', exact: true }).click()
  expect(await title.evaluate((el) => el.scrollLeft)).toBe(offset)
  await title.focus()
  await title.press('End')
  const caretOffset = await title.evaluate((el) => el.scrollLeft)
  expect(caretOffset).toBeGreaterThan(offset)
  await dialog.getByRole('button', { name: 'Annuler les modifications', exact: true }).click()
  expect(await title.evaluate((el) => el.scrollLeft)).toBe(caretOffset)
  await dialog.getByRole('button', { name: 'Modifier la prod', exact: true }).click()
  expect(await title.evaluate((el) => el.scrollLeft)).toBe(caretOffset)
  await title.fill('')
  await dialog.getByRole('button', { name: 'Enregistrer les modifications', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('Titre :')
  await expect(title).toHaveAttribute('aria-invalid', 'true')
  await expect(title).toHaveAttribute('aria-describedby', 'detail-error-message')
  await expect(dialog).toBeVisible()
})
