import { expect, test } from '@playwright/test'

test('polices locales chargées, accents lisibles et lecteur utilisable sans requête externe', async ({ page }) => {
  const external: string[] = []
  const fonts = new Set<string>()
  page.on('response', (response) => { if (response.url().endsWith('.woff2') && response.ok()) fonts.add(response.url()) })
  await page.route('**/*', async (route) => {
    if (new URL(route.request().url()).hostname !== '127.0.0.1') { external.push(route.request().url()); await route.abort() }
    else await route.continue()
  })
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Détails de R&B Mélancolique', exact: true })).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await expect.poll(() => fonts.size).toBe(2)
  const loaded = await page.evaluate(() => Array.from(document.fonts).filter((face) => face.status === 'loaded').map((face) => face.family))
  expect(loaded.join(' ')).toContain('Beat m Text')
  expect(loaded.join(' ')).toContain('Beat m Display')
  await expect(page.locator('.section-heading h2')).toHaveCSS('font-family', /Beat m Display/)
  await expect(page.locator('.beat-title').first()).toHaveCSS('font-family', /Beat m Display/)
  await expect(page.locator('.beat-maker').first()).toHaveCSS('font-family', /Beat m Text/)
  await page.getByRole('button', { name: 'Écouter R&B Mélancolique', exact: true }).click()
  const audio = page.locator('audio')
  await expect(audio).toHaveJSProperty('paused', false)
  await audio.evaluate((el: HTMLAudioElement) => { el.pause(); el.currentTime = 7; el.dataset.identity = 'local-font-player' })
  await page.getByRole('button', { name: 'Détails de R&B Mélancolique', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'R&B Mélancolique', exact: true })).toHaveCSS('font-family', /Beat m Display/)
  const title = (await dialog.locator('h2').boundingBox())!
  await dialog.getByRole('button', { name: 'Modifier la prod', exact: true }).click()
  const edit = dialog.getByRole('textbox', { name: 'Titre de la prod', exact: true })
  await expect(edit).toHaveCSS('font-family', /Beat m Display/)
  const after = (await edit.boundingBox())!
  expect([after.x, after.y, after.width, after.height]).toEqual([title.x, title.y, title.width, title.height])
  await expect(dialog.locator('.detail-description textarea')).toHaveCSS('height', '280px')
  await page.keyboard.press('Escape')
  await expect(audio).toHaveAttribute('data-identity', 'local-font-player')
  await expect(audio).toHaveJSProperty('paused', true)
  await expect(audio).toHaveJSProperty('currentTime', 7)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Détails de R&B Mélancolique', exact: true })).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await page.getByRole('button', { name: 'Écouter R&B Mélancolique', exact: true }).click()
  await expect(audio).toHaveJSProperty('paused', false)
  expect(external).toEqual([])
})

test('un chargement lent des polices garde une interface lisible et des éléments stables', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const pending: (() => Promise<void>)[] = []
  await page.route('**/fonts/*.woff2', async (route) => {
    await new Promise<void>((resolve) => { pending.push(async () => { await route.continue(); resolve() }) })
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: 'Détails de R&B Mélancolique', exact: true })).toBeVisible()
  await expect.poll(() => pending.length).toBe(2)
  // Past the font-display: optional block window, the fallback must remain usable.
  await page.waitForTimeout(250)
  const boxes = () => page.locator('.section-heading, .catalog-filters, .beat-card, .local-player').evaluateAll((elements) => elements.map((el) => { const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height] }))
  const before = await boxes()
  await expect(page.getByRole('button', { name: 'Détails de R&B Mélancolique', exact: true })).toBeVisible()
  await Promise.all(pending.map((release) => release()))
  await page.evaluate(() => document.fonts.ready)
  expect(await boxes()).toEqual(before)
  await page.screenshot({ path: testInfo.outputPath('font-fallback-after-late-response.png'), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
