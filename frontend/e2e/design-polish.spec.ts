import { expect, test } from '@playwright/test'

function contrast(a: string, b: string) {
  const luminance = (value: string) => {
    const rgb = value.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((v) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 })
    return rgb.reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0)
  }
  const values = [luminance(a), luminance(b)].sort((x, y) => x - y)
  return (values[1] + 0.05) / (values[0] + 0.05)
}

for (const viewport of [{ width: 1440, height: 1000 }, { width: 900, height: 900 }, { width: 390, height: 844 }]) {
  test(`capsules stables entre filtres inactifs et actifs, audio préservé sur ${viewport.width}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport)
    await page.goto('/')
    await page.getByRole('button', { name: 'Écouter R&B Mélancolique', exact: true }).click()
    const audio = page.locator('audio')
    await expect(audio).toHaveJSProperty('paused', false)
    await audio.evaluate((el: HTMLAudioElement) => { el.pause(); el.currentTime = 8; el.dataset.identity = 'polish-player' })
    const menus = page.locator('.filter-menu > summary')
    const positions = () => menus.evaluateAll((elements) => elements.map((el) => { const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height] }))
    const before = await positions()
    const tone = page.locator('.filter-menu').filter({ has: page.locator('summary', { hasText: 'Tonalité' }) })
    await tone.locator('summary').click()
    await tone.getByRole('checkbox', { name: 'F# minor', exact: true }).check()
    await tone.getByRole('checkbox', { name: 'Non renseigné', exact: true }).check()
    await expect(tone.locator('summary')).toHaveAttribute('data-active', 'true')
    await expect(tone.locator('.filter-count')).toHaveText('2')
    expect(await positions()).toEqual(before)
    await page.keyboard.press('Escape')
    const bpm = page.locator('.filter-menu').filter({ has: page.locator('summary', { hasText: 'BPM' }) })
    await bpm.locator('summary').click()
    await bpm.getByLabel('BPM minimum').fill('130')
    await bpm.getByLabel('BPM maximum').fill('150')
    await bpm.getByRole('button', { name: 'Appliquer les BPM', exact: true }).click()
    await expect(bpm.locator('summary')).toHaveAttribute('data-active', 'true')
    expect(await positions()).toEqual(before)
    await page.keyboard.press('Escape')
    await tone.locator('summary').focus()
    await expect(tone.locator('summary')).toBeFocused()
    await expect(tone.locator('summary')).toHaveCSS('outline-style', 'solid')
    await expect(audio).toHaveAttribute('data-identity', 'polish-player')
    await expect(audio).toHaveJSProperty('paused', true)
    await expect(audio).toHaveJSProperty('currentTime', 8)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('active-filters.png'), fullPage: true })
  })
}

test('contraste du bouton d’import et des champs en repos, survol, focus et activation', async ({ page }) => {
  await page.goto('/')
  const button = page.getByRole('button', { name: 'Importer la prod', exact: true })
  const size = await button.boundingBox()
  const ratio = () => button.evaluate((el) => { const s = getComputedStyle(el); return [s.color, s.backgroundColor] })
  for (const state of ['rest', 'hover', 'focus', 'active']) {
    if (state === 'hover') await button.hover()
    if (state === 'focus') await button.focus()
    if (state === 'active') await page.mouse.down()
    const colors = await ratio()
    expect(contrast(colors[0], colors[1])).toBeGreaterThanOrEqual(4.5)
    expect(await button.boundingBox()).toEqual(size)
  }
  await page.mouse.up()
  const input = page.getByRole('textbox', { name: 'Lien YouTube de la prod' })
  const colors = await input.evaluate((el) => [getComputedStyle(el, '::placeholder').color, getComputedStyle(el).backgroundColor, getComputedStyle(el).borderColor])
  expect(contrast(colors[0], colors[1])).toBeGreaterThanOrEqual(4.5)
  expect(contrast(colors[2], colors[1])).toBeGreaterThanOrEqual(3)
})

test('recherche pleine largeur et contrôles tactiles confortables sans agrandir les cartes horizontales', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const filters = (await page.locator('.catalog-filters').boundingBox())!
  const search = (await page.getByRole('searchbox', { name: 'Rechercher une prod' }).boundingBox())!
  expect(search.width).toBe(filters.width)
  for (const control of await page.locator('.filter-menu > summary, .catalog-favorites, .catalog-order button, .catalog-sort select, .collection-tools > button').all()) {
    expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  }
  await page.getByRole('button', { name: 'Cartes horizontales', exact: true }).click()
  await expect(page.locator('.beat-card').first()).toHaveCSS('height', '128px')
  const favorite = page.locator('.beat-card').first().locator('.beat-favorite')
  expect((await favorite.boundingBox())!.width).toBeGreaterThanOrEqual(32)
  await expect(favorite.locator('[data-icon="heart"]')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
