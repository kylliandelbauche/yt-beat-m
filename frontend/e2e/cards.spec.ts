import { expect, test } from '@playwright/test'

const longTitle = 'L’été — une prod R&B mélancolique ' + 'TrèsLongTitreSansEspaces'.repeat(12)

test.beforeEach(async ({ page }) => {
  await page.route('**/api/beats?*', async (route) => {
    const response = await route.fetch()
    const result = await response.json()
    result.beats = result.beats.slice(0, 2).map((beat: Record<string, unknown>, index: number) => ({
      ...beat,
      title: index ? 'Court' : longTitle,
      beatmaker: index ? null : 'Beatmaker au nom très long '.repeat(8),
      channel: null,
      duration_seconds: index ? null : 130,
      artwork_url: index ? null : '/test-cover.svg',
    }))
    await route.fulfill({ json: result })
  })
  await page.route('**/test-cover.svg', (route) => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#415c54"/></svg>' }))
  await page.route('**/api/beats/00000000-0000-0000-0000-000000000001', async (route) => {
    const response = await route.fetch()
    await route.fulfill({ json: { ...await response.json(), title: longTitle } })
  })
})

test('cartes alignées malgré les titres longs, pochettes et données manquantes', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: `Écouter ${longTitle}`, exact: true })).toBeVisible()
  await expect(page.locator('.beat-artwork img')).toHaveJSProperty('complete', true)
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1000, height: 800 }, { width: 390, height: 700 }]) {
    await page.setViewportSize(viewport)
    const layout = await page.locator('.beat-card').evaluateAll((cards) => cards.map((card) => {
      const bounds = card.getBoundingClientRect()
      return {
        height: bounds.height,
        offsets: ['.beat-artwork', '.beat-title', '.beat-subtitle', '.listen-label', '.beat-details-button'].map((selector) => card.querySelector(selector)!.getBoundingClientRect().top - bounds.top),
        fits: card.scrollWidth <= card.clientWidth,
      }
    }))
    expect(layout).toHaveLength(2)
    expect(Math.abs(layout[0].height - layout[1].height)).toBeLessThanOrEqual(1)
    layout[0].offsets.forEach((offset, index) => expect(Math.abs(offset - layout[1].offsets[index])).toBeLessThanOrEqual(1))
    expect(layout.every((item) => item.fits)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  }
})

test('seul le titre trop long défile au survol ou au clavier et s’adapte au redimensionnement', async ({ page }) => {
  await page.goto('/')
  const listen = page.getByRole('button', { name: `Écouter ${longTitle}`, exact: true })
  const text = listen.locator('.scroll-title-text')
  await expect(listen).toBeVisible()
  await expect(listen.locator('.beat-title')).toHaveAttribute('title', longTitle)
  const start = await text.evaluate((element) => element.getBoundingClientRect().x)
  await listen.hover()
  await expect.poll(() => text.evaluate((element) => element.getBoundingClientRect().x)).toBeLessThan(start - 1)
  const before = await listen.boundingBox()
  const endPosition = await text.evaluate(async (element) => {
    const animation = element.getAnimations()[0]
    animation.pause()
    const timing = animation.effect!.getTiming()
    animation.currentTime = timing.delay + Number(timing.duration)
    await new Promise(requestAnimationFrame)
    return { right: element.getBoundingClientRect().right, frame: element.parentElement!.getBoundingClientRect().right }
  })
  expect(Math.abs(endPosition.right - endPosition.frame)).toBeLessThanOrEqual(1)
  expect(await listen.boundingBox()).toEqual(before)
  await page.mouse.move(0, 0)
  await listen.focus()
  await expect.poll(() => text.evaluate((element) => element.getAnimations().filter((animation) => animation.playState === 'running').length)).toBe(1)
  const short = page.getByRole('button', { name: 'Écouter Court', exact: true })
  await short.focus()
  expect(await short.locator('.scroll-title-text').evaluate((element) => element.getAnimations().length)).toBe(0)
  const frame = listen.locator('.beat-title')
  const initialWidth = (await frame.boundingBox())!.width
  await page.setViewportSize({ width: 390, height: 700 })
  await expect.poll(async () => (await frame.boundingBox())!.width).not.toBe(initialWidth)
  await listen.focus()
  await expect.poll(() => text.evaluate(async (element) => {
    const animation = element.getAnimations()[0]
    animation.pause()
    const timing = animation.effect!.getTiming()
    animation.currentTime = timing.delay + Number(timing.duration)
    await new Promise(requestAnimationFrame)
    return Math.abs(element.getBoundingClientRect().right - element.parentElement!.getBoundingClientRect().right)
  })).toBeLessThanOrEqual(1)
})

test('réduction des animations respectée et titre complet disponible au clavier', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const listen = page.getByRole('button', { name: `Écouter ${longTitle}`, exact: true })
  await listen.focus()
  await listen.hover()
  await expect(listen.locator('.beat-title')).toHaveAttribute('title', longTitle)
  expect(await listen.locator('.scroll-title-text').evaluate((element) => element.getAnimations().length)).toBe(0)
  const details = page.getByRole('button', { name: `Détails de ${longTitle}`, exact: true })
  await details.focus()
  await details.press('Enter')
  await expect(page.getByRole('dialog').getByRole('heading', { name: longTitle, exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(details).toBeFocused()
})
