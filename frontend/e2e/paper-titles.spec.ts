import { expect, test } from '@playwright/test'

const identity = '00000000-0000-0000-0000-000000000001'
const longTitle = 'L’été — late nights ~ brazilian funk x sexy drill type beat ' + 'UnTrèsLongTitreSansEspaces'.repeat(10)

for (const viewport of [{ width: 1280, height: 900 }, { width: 900, height: 700 }, { width: 390, height: 650 }]) {
  test(`titres sur une ligne et géométrie Paper stable en lecture et édition à ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    let savedTitle = longTitle
    let submitted: Record<string, unknown> | undefined
    await page.route('**/api/beats?*', async (route) => {
      const response = await route.fetch()
      const result = await response.json()
      result.beats = result.beats.filter((beat: { id: string }) => [identity, '00000000-0000-0000-0000-000000000002'].includes(beat.id)).map((beat: { id: string }) => ({ ...beat, title: beat.id === identity ? savedTitle : 'Court' }))
      await route.fulfill({ json: result })
    })
    await page.route(`**/api/beats/${identity}`, async (route) => {
      const response = await route.fetch()
      await route.fulfill({ json: { ...await response.json(), title: savedTitle } })
    })
    await page.route(`**/api/beats/${identity}/metadata`, async (route) => {
      submitted = route.request().postDataJSON()
      savedTitle = submitted!.title as string
      const response = await page.request.get(`/api/beats/${identity}`)
      await route.fulfill({ json: { ...await response.json(), title: savedTitle } })
    })
    await page.goto('/')
    await page.getByRole('button', { name: `Écouter ${longTitle}`, exact: true }).click()
    const audio = page.locator('audio')
    await expect(audio).toHaveJSProperty('paused', false)
    await audio.evaluate((el: HTMLAudioElement) => { el.dataset.identity = 'paper-title-player' })
    for (const layout of ['Grandes pochettes', 'Cartes horizontales']) {
      await page.getByRole('button', { name: layout, exact: true }).click()
      const horizontal = layout === 'Cartes horizontales'
      const titles = page.locator(horizontal ? '.horizontal-title' : '.beat-card .beat-title')
      await expect(titles).toHaveCount(2)
      const geometry = await page.locator('.beat-card').evaluateAll((cards, isHorizontal) => cards.map((card) => {
        const r = card.getBoundingClientRect()
        const selectors = isHorizontal ? ['.horizontal-title', '.horizontal-maker', '.horizontal-music', '.horizontal-footer'] : ['.beat-title', '.beat-subtitle', '.listen-label', '.beat-details-button']
        const title = card.querySelector<HTMLElement>(selectors[0])!
        const text = title.querySelector('.scroll-title-text')!.getBoundingClientRect()
        return { height: r.height, width: r.width, titleHeight: title.clientHeight, textHeight: text.height, lineHeight: Number.parseFloat(getComputedStyle(title).lineHeight), offsets: selectors.map((s) => card.querySelector(s)!.getBoundingClientRect().top - r.top) }
      }), horizontal)
      expect(geometry[0].height).toBe(geometry[1].height)
      expect(geometry[0].offsets).toEqual(geometry[1].offsets)
      for (const item of geometry) {
        expect(item.textHeight).toBeCloseTo(item.lineHeight, 1)
        expect(item.titleHeight).toBeLessThan(item.lineHeight * 2)
        if (horizontal) { expect(item.height).toBe(128); if (viewport.width >= 900) expect(item.width).toBe(384) }
      }
      const full = titles.filter({ hasText: longTitle })
      await expect(full).toHaveAttribute('title', longTitle)
      await full.hover()
      expect(await full.locator('.scroll-title-text').evaluate((el) => el.getAnimations().length)).toBe(0)
      await page.screenshot({ path: testInfo.outputPath(`${horizontal ? 'horizontal' : 'covers'}.png`), fullPage: true })
    }
    await page.getByRole('button', { name: `Détails de ${longTitle}`, exact: true }).click()
    const dialog = page.getByRole('dialog')
    const heading = dialog.getByRole('heading', { name: longTitle, exact: true })
    await expect(heading).toBeVisible()
    await heading.focus()
    await expect(heading.locator('#detail-title')).toHaveAttribute('title', longTitle)
    await expect(heading.locator('#detail-title')).toHaveCSS('white-space', 'nowrap')
    const readTitle = (await heading.boundingBox())!
    expect(readTitle.height).toBe(52)
    const layout = () => dialog.locator('.detail-right').evaluate((el) => {
      const top = el.getBoundingClientRect().top
      return Array.from(el.children).map((child) => { const r = child.getBoundingClientRect(); return [r.x, r.y - top, r.width, r.height] })
    })
    const before = await layout()
    await page.screenshot({ path: testInfo.outputPath('detail-read.png') })
    await dialog.getByRole('button', { name: 'Modifier la prod', exact: true }).click()
    const edit = dialog.getByRole('textbox', { name: 'Titre de la prod', exact: true })
    await expect(edit).toHaveAttribute('type', 'text')
    await expect(edit).toHaveValue(longTitle)
    expect(await layout()).toEqual(before)
    expect((await edit.boundingBox())!.height).toBe(readTitle.height)
    await edit.fill(`${longTitle} — fin`)
    await edit.press('End')
    expect(await edit.evaluate((el: HTMLInputElement) => el.selectionStart)).toBe(`${longTitle} — fin`.length)
    await page.screenshot({ path: testInfo.outputPath('detail-edit.png') })
    await dialog.getByRole('button', { name: 'Enregistrer les modifications', exact: true }).click()
    await expect(dialog.getByRole('heading', { name: `${longTitle} — fin`, exact: true })).toBeVisible()
    expect(submitted?.title).toBe(`${longTitle} — fin`)
    expect(await layout()).toEqual(before)
    await expect(audio).toHaveAttribute('data-identity', 'paper-title-player')
    await expect(audio).toHaveJSProperty('paused', false)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: `Détails de ${savedTitle}`, exact: true })).toBeFocused()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}
