import { expect, test } from '@playwright/test'

test('tout le bloc inférieur ouvre les détails sans effet audio, image et favori restent indépendants', async ({ page }) => {
  test.setTimeout(60000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const card = page.locator('.covers-grid .beat-card').filter({ has: page.getByRole('button', { name: 'Détails de R&B Mélancolique', exact: true }) })
  const info = card.getByRole('button', { name: 'Détails de R&B Mélancolique', exact: true })
  await page.getByRole('button', { name: 'Écouter Drill minuit', exact: true }).click()
  const audio = page.locator('audio')
  await expect(audio).toHaveJSProperty('paused', false)
  const src = await audio.getAttribute('src')
  await audio.evaluate(async (el: HTMLAudioElement) => {
    // Properties update before queued media events; flush setup before counting clicks.
    const paused = new Promise<void>((resolve) => el.addEventListener('pause', () => resolve(), { once: true }))
    el.pause(); await paused
    const seeked = new Promise<void>((resolve) => el.addEventListener('seeked', () => resolve(), { once: true }))
    el.currentTime = 7; await seeked
    el.playbackRate = .25; el.dataset.identity = 'other-track'
  })
  await audio.evaluate((el) => {
    for (const name of ['play', 'pause', 'emptied', 'seeking']) { el.dataset[name] = '0'; el.addEventListener(name, () => { el.dataset[name] = String(Number(el.dataset[name]) + 1) }) }
  })
  const events = () => audio.evaluate((el) => ['play', 'pause', 'emptied', 'seeking'].map((name) => el.dataset[name]))
  for (const playing of [false, true]) {
    if (playing) await audio.evaluate((el: HTMLAudioElement) => el.play())
    await expect(audio).toHaveJSProperty('paused', !playing)
    const counters = await events()
    for (const target of ['.beat-title', '.beat-maker', '.beat-duration', '.beat-bpm', '.beat-musical-key', '.details-hint', 'padding', 'gap', 'bottom']) {
      const time = await audio.evaluate((el: HTMLAudioElement) => el.currentTime)
      if (['padding', 'gap', 'bottom'].includes(target)) {
        const r = (await info.boundingBox())!
        await page.mouse.click(r.x + (target === 'padding' ? 4 : 20), r.y + (target === 'padding' ? 4 : target === 'gap' ? 41 : r.height - 4))
      } else await info.locator(target).click()
      await expect(page.getByRole('dialog').getByRole('heading', { name: 'R&B Mélancolique', exact: true })).toBeVisible()
      await expect(audio).toHaveAttribute('src', src!)
      await expect(audio).toHaveAttribute('data-identity', 'other-track')
      await expect(audio).toHaveJSProperty('paused', !playing)
      expect(await audio.evaluate((el: HTMLAudioElement) => el.currentTime)).toBeGreaterThanOrEqual(time)
      expect(await events()).toEqual(counters)
      await page.keyboard.press('Escape')
      await expect(info).toBeFocused()
    }
    const favorite = card.locator('.beat-favorite')
    const original = await favorite.getAttribute('aria-pressed')
    await favorite.click()
    await expect(favorite).toHaveAttribute('aria-pressed', original === 'true' ? 'false' : 'true')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(await events()).toEqual(counters)
    await favorite.click()
    await expect(favorite).toHaveAttribute('aria-pressed', original!)
    await info.focus(); await info.press('Enter')
    await expect(page.getByRole('dialog')).toBeVisible()
    expect(await events()).toEqual(counters)
    await page.keyboard.press('Escape')
  }
  await card.getByRole('button', { name: 'Écouter R&B Mélancolique', exact: true }).click()
  await expect(audio).toHaveJSProperty('paused', false)
  await audio.evaluate((el: HTMLAudioElement) => { el.currentTime = 7; el.dataset.identity = 'target-track' })
  await card.getByRole('button', { name: 'Mettre en pause R&B Mélancolique', exact: true }).click()
  await expect(audio).toHaveJSProperty('paused', true)
  await expect(card).toHaveClass(/selected/)
  await card.getByRole('button', { name: 'Écouter R&B Mélancolique', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(audio).toHaveJSProperty('paused', false)
  await expect(audio).toHaveAttribute('data-identity', 'target-track')
  expect(await audio.evaluate((el: HTMLAudioElement) => el.currentTime)).toBeGreaterThanOrEqual(7)
  await expect(card.locator('button')).toHaveCount(3)
  expect(await card.locator('button button').count()).toBe(0)
  await expect(card.locator('.details-hint')).not.toHaveAttribute('tabindex')
})

test('cartes de 265 × 365 issues du contenu, géométrie fixe au survol, focus et lecture', async ({ page }, testInfo) => {
  await page.route('**/api/beats?*', async (route) => {
    const response = await route.fetch(), data = await response.json()
    data.beats = data.beats.slice(0, 2).map((beat: object, i: number) => ({ ...beat, title: i ? 'Court' : 'Un très long titre de prod '.repeat(12), beatmaker: i ? null : 'Nom du beatmaker '.repeat(12), channel: null, bpm: i ? null : 125, musical_key: i ? null : 'G# minor' }))
    await route.fulfill({ json: data })
  })
  await page.goto('/')
  const cards = page.locator('.covers-grid .beat-card')
  await expect(cards).toHaveCount(2)
  const first = cards.first()
  const geometry = () => first.locator(':scope, .beat-select, .beat-card-info, .beat-title, .beat-subtitle, .beat-card-footer, .beat-favorite').evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height] }))
  const before = await geometry()
  for (const card of await cards.all()) {
    const r = (await card.boundingBox())!
    expect([r.width, r.height]).toEqual([265, 365])
    const image = (await card.locator('.beat-select').boundingBox())!, info = (await card.locator('.beat-card-info').boundingBox())!
    expect([image.width, image.height, info.width, info.height]).toEqual([263, 263, 263, 100])
  }
  await expect(first.locator('.beat-music')).toHaveText('125|Sol♯ min')
  await expect(cards.last().locator('.beat-music')).toHaveText('—|—')
  await expect(page.locator('.listen-label')).toHaveCount(0)
  await first.locator('.beat-select').hover()
  await expect(first.locator('.cover-play')).toHaveCSS('opacity', '1')
  const play = (await first.locator('.cover-play').boundingBox())!
  expect([play.width, play.height]).toEqual([40, 40])
  expect(await geometry()).toEqual(before)
  await first.locator('.beat-card-info').hover()
  await expect(first.locator('.details-hint')).toHaveCSS('color', 'rgb(199, 238, 217)')
  expect(await geometry()).toEqual(before)
  await first.locator('.beat-card-info').focus()
  expect(await geometry()).toEqual(before)
  await first.locator('.beat-select').click()
  await expect(first).toHaveClass(/is-playing/)
  await page.mouse.move(0, 0)
  await expect(first.locator('.cover-play')).toHaveCSS('opacity', '1')
  expect(await geometry()).toEqual(before)
  await first.locator('.beat-select').click()
  await expect(page.locator('audio')).toHaveJSProperty('paused', true)
  await expect(first.locator('.cover-play svg')).toHaveAttribute('data-icon', 'play')
  expect(await geometry()).toEqual(before)
  await page.screenshot({ path: testInfo.outputPath('compact-covers.png') })
})
