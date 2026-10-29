import { expect, test } from '@playwright/test'

for (const width of [1280, 390]) {
  test(`contrôles natifs et préférences conservées au changement de piste sur ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    await page.getByRole('button', { name: 'Écouter R&B Mélancolique', exact: true }).click()
    const audio = page.locator('audio')
    await expect(audio).toHaveJSProperty('paused', false)
    await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.duration)).toBeGreaterThan(29)
    await audio.focus()
    await page.keyboard.press('Space')
    await expect(audio).toHaveJSProperty('paused', true)
    const position = await audio.evaluate((el: HTMLAudioElement) => el.currentTime)
    await page.keyboard.press('ArrowRight')
    await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.currentTime)).toBeGreaterThan(position)
    await page.keyboard.press('ArrowDown')
    const volume = await audio.evaluate((el: HTMLAudioElement) => el.volume)
    expect(volume).toBeLessThan(1)
    await page.keyboard.press('Space')
    await expect(audio).toHaveJSProperty('paused', false)
    await audio.evaluate((el: HTMLAudioElement) => { el.muted = true })
    await page.getByRole('button', { name: 'Écouter Drill minuit', exact: true }).click()
    await expect(audio).toHaveCount(1)
    await expect(audio).toHaveJSProperty('paused', false)
    await expect(audio).toHaveJSProperty('volume', volume)
    await expect(audio).toHaveJSProperty('muted', true)
    // play() can clear paused before the new native controls have metadata.
    await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA)).toBe(true)
    await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.currentTime)).toBeGreaterThan(0)
    await audio.evaluate((el: HTMLAudioElement) => { el.muted = false })
    await audio.focus()
    await page.keyboard.press('ArrowUp')
    await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.volume)).toBeGreaterThan(volume)
  })

  for (const unavailable of ['missing', 'unreadable']) {
    test(`erreur audio réelle ${unavailable}, relance et géométrie stable sur ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      let fail = true
      await page.route('**/api/beats/00000000-0000-0000-0000-000000000002/audio', (route) => {
        if (!fail) return route.continue()
        return route.fulfill(unavailable === 'missing'
          ? { status: 404, json: { detail: 'Fichier introuvable ; vérifier le disque.' } }
          : { contentType: 'audio/mpeg', body: 'Ce fichier ne contient pas de MP3.' })
      })
      await page.goto('/')
      const geometry = () => page.locator('.local-player, .player-description, audio, .catalog-stage, .collection-toolbar').evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); const fixed = el.closest('.local-player'); return [r.x + (fixed ? 0 : scrollX), r.y + (fixed ? 0 : scrollY), r.width, r.height] }))
      await expect(page.getByRole('button', { name: 'Écouter Drill minuit', exact: true })).toBeVisible()
      const before = await geometry()
      await page.getByRole('button', { name: 'Écouter Drill minuit', exact: true }).click()
      const audio = page.locator('audio')
      await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.error?.code)).toBe(4)
      await expect(page.getByRole('alert')).toContainText('Fichier audio indisponible')
      await expect(page.getByRole('button', { name: /^Mettre en pause/ })).toHaveCount(0)
      expect(await geometry()).toEqual(before)
      fail = false
      await page.getByRole('button', { name: 'Écouter Drill minuit', exact: true }).click()
      await expect(audio).toHaveJSProperty('paused', false)
      await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.currentTime)).toBeGreaterThan(0)
      await expect(page.getByRole('alert')).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Mettre en pause Drill minuit', exact: true })).toBeVisible()
      expect(await geometry()).toEqual(before)
    })
  }
}

test('prod importée puis rechargée : pochette, recherche et lecture avec Internet bloqué', async ({ page }) => {
  const external: string[] = []
  // Routing disables the HTTP cache; local assets must actually be served again.
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.hostname !== '127.0.0.1') { external.push(url.hostname); return route.abort() }
    return route.continue()
  })
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Lien YouTube de la prod' }).fill('https://youtu.be/OFFLINEMP30')
  const response = page.waitForResponse((r) => r.url().endsWith('/api/imports') && r.request().method() === 'POST')
  await page.getByRole('button', { name: 'Importer la prod', exact: true }).click()
  const imported = await (await response).json()
  const identity = imported.job.id
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Prod importée de test', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.reload()
  await page.getByRole('searchbox', { name: 'Rechercher une prod' }).fill('importée')
  const card = page.locator('.beat-card').filter({ has: page.locator(`img[src="/api/beats/${identity}/artwork"]`) })
  await expect(card).toBeVisible()
  await expect.poll(() => card.locator('img').evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true)
  await card.getByRole('button', { name: 'Écouter Prod importée de test', exact: true }).click()
  const audio = page.locator('audio')
  await expect(audio).toHaveAttribute('src', `/api/beats/${identity}/audio`)
  await expect(audio).toHaveJSProperty('paused', false)
  await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.currentTime)).toBeGreaterThan(0)
  await audio.focus()
  await page.keyboard.press('Space')
  await expect(audio).toHaveJSProperty('paused', true)
  const position = await audio.evaluate((el: HTMLAudioElement) => el.currentTime)
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.currentTime)).toBeGreaterThan(position)
  expect(external).toEqual([])
})
