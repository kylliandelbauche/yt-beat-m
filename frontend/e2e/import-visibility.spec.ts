import { expect, test } from '@playwright/test'

for (const width of [1280, 390]) {
  test(`progression uniquement pendant l’import, slot stable et prochain import/doublon à ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const firstId = '00000000-0000-0000-0000-000000000001'
    const secondId = '00000000-0000-0000-0000-000000000002'
    const old = { id: 'old-success', source_url: 'https://youtu.be/PROGRESS000', state: 'completed', stage: 'completed', progress: 100, error_message: null, beat_id: firstId }
    let job: Record<string, unknown> | null = null
    let submissions = 0
    let polls = 0
    await page.route('**/api/imports', async (route) => {
      if (route.request().method() === 'POST') {
        submissions += 1
        if (submissions === 3) return route.fulfill({ json: { job: null, beat_id: firstId, duplicate: true } })
        job = { id: `visibility-${submissions}`, source_url: route.request().postDataJSON().url, state: 'running', stage: 'downloading', progress: 32, error_message: null, beat_id: null }
        return route.fulfill({ json: { job, beat_id: null, duplicate: false } })
      }
      polls += 1
      await route.fulfill({ json: { jobs: job ? [job, old] : [old] } })
    })
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Écouter R&B Mélancolique', exact: true })).toBeVisible()
    await expect.poll(() => polls).toBeGreaterThan(0)
    const progress = page.getByRole('progressbar')
    const noProgress = async () => {
      await expect(progress).toHaveCount(0)
      await expect(page.locator('.import-progress-track')).toHaveCount(0)
      await expect(page.locator('.import-progress-list')).toHaveText('')
    }
    await noProgress()
    await page.getByRole('button', { name: 'Écouter R&B Mélancolique', exact: true }).click()
    const audio = page.locator('audio')
    await expect(audio).toHaveJSProperty('paused', false)
    await audio.evaluate((el: HTMLAudioElement) => { el.pause(); el.currentTime = 7; el.dataset.identity = 'import-visibility' })
    const geometry = () => page.locator('.import-form input, .import-submit, .import-progress-list, .section-heading, .catalog-filters, .collection-toolbar').evaluateAll((elements) => elements.map((el) => { const r = el.getBoundingClientRect(); return [r.x + scrollX, r.y + scrollY, r.width, r.height] }))
    const before = await geometry()
    for (const [number, beatId, title] of [[1, firstId, 'R&B Mélancolique'], [2, secondId, 'Drill minuit']] as const) {
      await page.locator('#youtube-url').fill(`https://youtu.be/PROGRESS00${number}`)
      await page.getByRole('button', { name: 'Importer la prod', exact: true }).click()
      await expect(progress).toHaveAttribute('aria-valuenow', '32')
      expect(await geometry()).toEqual(before)
      job = { ...job!, state: 'completed', stage: 'completed', progress: 100, beat_id: beatId }
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByRole('textbox', { name: 'Titre de la prod', exact: true })).toHaveValue(title)
      await noProgress()
      expect(await geometry()).toEqual(before)
      await page.keyboard.press('Escape')
      await expect(dialog).toHaveCount(0)
      await noProgress()
      expect(await geometry()).toEqual(before)
    }
    const priorPolls = polls
    await expect.poll(() => polls, { timeout: 10000 }).toBeGreaterThan(priorPolls)
    await noProgress()
    await page.locator('#youtube-url').fill('https://youtu.be/PROGRESS001')
    await page.getByRole('button', { name: 'Importer la prod', exact: true }).click()
    await expect(page.getByRole('dialog').getByRole('textbox', { name: 'Titre de la prod', exact: true })).toHaveValue('R&B Mélancolique')
    await noProgress()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(audio).toHaveAttribute('data-identity', 'import-visibility')
    await expect(audio).toHaveJSProperty('currentTime', 7)
    expect(await geometry()).toEqual(before)
    await page.reload()
    await expect(page.getByRole('button', { name: 'Écouter R&B Mélancolique', exact: true })).toBeVisible()
    await noProgress()
  })
}
