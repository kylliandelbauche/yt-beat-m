import { expect, test } from '@playwright/test'

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 650 }, { width: 1024, height: 420 }]) {
  test(`pop-up centrée et contenu défilant sur ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport)
    const title = 'Une prod au titre très long '.repeat(18)
    await page.route('**/api/beats/00000000-0000-0000-0000-000000000001', async (route) => {
      const response = await route.fetch()
      await route.fulfill({ json: { ...await response.json(), title, description: 'Description très longue et lien https://example.org/'.repeat(200) } })
    })
    await page.goto('/')
    const trigger = page.getByRole('button', { name: 'Détails de R&B Mélancolique', exact: true })
    await trigger.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: title.trim(), exact: true })).toBeVisible()
    const bounds = (await dialog.boundingBox())!
    expect(Math.abs(bounds.x + bounds.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(1)
    expect(Math.abs(bounds.y + bounds.height / 2 - viewport.height / 2)).toBeLessThanOrEqual(1)
    expect(bounds.x).toBeGreaterThan(0)
    expect(bounds.y).toBeGreaterThan(0)
    expect(bounds.x + bounds.width).toBeLessThan(viewport.width)
    expect(bounds.y + bounds.height).toBeLessThan(viewport.height)
    const scroll = dialog.locator('.description-scroll')
    await scroll.evaluate((element) => { element.scrollTop = element.scrollHeight })
    await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
    expect(await scroll.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
    const close = dialog.getByRole('button', { name: 'Fermer la fiche', exact: true })
    await expect(close).toBeInViewport()
    await close.focus()
    await page.keyboard.press('Tab')
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)
    await trigger.evaluate((element: HTMLElement) => element.focus())
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)
    await page.keyboard.press('Shift+Tab')
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)
    expect((await scroll.boundingBox())!.height).toBe(280)
    if (viewport.width > 1000 && viewport.height > 700) { expect(bounds.width).toBe(900); expect(bounds.height).toBe(652) }
    await page.screenshot({ path: testInfo.outputPath('detail-read.png') })
    const backgroundPosition = await page.evaluate(() => window.scrollY)
    await page.mouse.move(2, 2)
    await page.mouse.wheel(0, 600)
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(backgroundPosition)
    await close.click()
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('')
  })
}

test('une piste en pause garde sa position après ouverture et fermeture de la pop-up', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Écouter R&B Mélancolique', exact: true }).click()
  const audio = page.locator('audio')
  await expect(audio).toHaveJSProperty('paused', false)
  await audio.evaluate((element: HTMLAudioElement) => { element.pause(); element.currentTime = 7 })
  await page.getByRole('button', { name: 'Détails de R&B Mélancolique', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(audio).toHaveJSProperty('paused', true)
  await expect(audio).toHaveJSProperty('currentTime', 7)
})

test('clic extérieur : fermeture, retour du focus et lecture conservée sans clic traversant', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Écouter R&B Mélancolique', exact: true }).click()
  const audio = page.locator('audio')
  await expect(audio).toHaveJSProperty('paused', false)
  await audio.evaluate((element: HTMLAudioElement) => { element.currentTime = 5 })
  const trigger = page.getByRole('button', { name: 'Détails de R&B Mélancolique', exact: true })
  await trigger.click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('heading', { name: 'R&B Mélancolique', exact: true }).click()
  const bounds = (await dialog.boundingBox())!
  await page.mouse.click(bounds.x + 2, bounds.y + 2)
  await expect(dialog).toBeVisible()
  const underneath = (await page.locator('.beat-details-button').first().boundingBox())!
  expect(underneath.x + 2).toBeLessThan(bounds.x)
  await page.mouse.click(underneath.x + 2, underneath.y + underneath.height / 2)
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await expect(audio).toHaveJSProperty('paused', false)
  expect(await audio.evaluate((element: HTMLAudioElement) => element.currentTime)).toBeGreaterThanOrEqual(5)
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('')
})

test('un glisser entre la fiche et le fond ne ferme pas la pop-up', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Détails de R&B Mélancolique', exact: true }).click()
  const dialog = page.getByRole('dialog')
  const bounds = (await dialog.boundingBox())!
  for (const [from, to] of [
    [[bounds.x + 2, bounds.y + 2], [2, 2]],
    [[2, 2], [bounds.x + 2, bounds.y + 2]],
  ]) {
    await page.mouse.move(from[0], from[1])
    await page.mouse.down()
    await page.mouse.move(to[0], to[1], { steps: 5 })
    await page.mouse.up()
    await expect(dialog).toBeVisible()
  }
  await page.mouse.click(2, 2)
  await expect(dialog).toHaveCount(0)
})

test.describe('tactile', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 650 } })
  test('un tap sur le fond ferme la fiche', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Détails de R&B Mélancolique', exact: true }).tap()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.touchscreen.tap(2, 2)
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
})

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 650 }]) {
  test(`pochette, titre et clavier du lecteur ouvrent la prod masquée sans changer la lecture sur ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/')
    await page.getByRole('button', { name: 'Écouter R&B Mélancolique', exact: true }).click()
    const audio = page.locator('audio')
    await expect(audio).toHaveJSProperty('paused', false)
    await audio.evaluate((el: HTMLAudioElement) => { el.pause(); el.currentTime = 7; el.dataset.identity = 'persistent-player' })
    const source = await audio.getAttribute('src')
    await page.getByRole('searchbox', { name: 'Rechercher une prod' }).fill('Drill')
    await expect(page.getByRole('button', { name: 'Détails de R&B Mélancolique', exact: true })).toHaveCount(0)
    const player = page.getByRole('complementary', { name: 'Lecteur audio' })
    const trigger = player.getByRole('button', { name: 'Détails depuis le lecteur : R&B Mélancolique', exact: true })
    const bounds = await player.boundingBox()
    await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')
    for (const target of ['.player-artwork', 'p', 'keyboard']) {
      if (target === 'p') await audio.evaluate((el: HTMLAudioElement) => el.play())
      else await audio.evaluate((el: HTMLAudioElement) => { el.pause(); el.currentTime = 7 })
      const paused = target !== 'p'
      if (target === 'keyboard') { await trigger.focus(); await page.keyboard.press('Enter') }
      else await trigger.locator(target).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByRole('heading', { name: 'R&B Mélancolique', exact: true })).toBeVisible()
      await expect(audio).toHaveCount(1)
      await expect(audio).toHaveAttribute('data-identity', 'persistent-player')
      await expect(audio).toHaveAttribute('src', source!)
      await expect(audio).toHaveJSProperty('paused', paused)
      if (paused) await expect(audio).toHaveJSProperty('currentTime', 7)
      else expect(await audio.evaluate((el: HTMLAudioElement) => el.currentTime)).toBeGreaterThanOrEqual(7)
      await page.keyboard.press('Escape')
      await expect(dialog).toHaveCount(0)
      await expect(trigger).toBeFocused()
      await expect(audio).toHaveJSProperty('paused', paused)
      expect(await player.boundingBox()).toEqual(bounds)
    }
  })
}
