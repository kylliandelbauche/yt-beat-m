import { expect, test } from '@playwright/test'

test('cartes horizontales compactes, actions séparées et lecteur conservé entre dispositions', async ({ page }, testInfo) => {
  await page.route('**/api/beats?*', async (route) => {
    const response = await route.fetch()
    const result = await response.json()
    result.beats = result.beats.slice(0, 2).map((beat: object, i: number) => ({ ...beat, title: i ? 'Court' : 'Une prod dont le titre est particulièrement long '.repeat(4), bpm: 125, musical_key: 'G# minor', artwork_url: '/test-cover.svg' }))
    await route.fulfill({ json: result })
  })
  await page.route('**/test-cover.svg', (route) => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" fill="#48605b"/></svg>' }))
  await page.goto('/')
  await expect(page.locator('.beat-card')).toHaveCount(2)
  const first = page.locator('.beat-card').first()
  await first.getByRole('button', { name: /^Écouter/ }).click()
  const audio = page.locator('audio')
  await expect(audio).toHaveJSProperty('paused', false)
  await audio.evaluate((el: HTMLAudioElement) => { el.pause(); el.currentTime = 9; el.dataset.identity = 'preserved' })
  const src = await audio.getAttribute('src')
  await page.getByRole('button', { name: 'Cartes horizontales', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Cartes horizontales', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const bounds = (await first.boundingBox())!
  expect(bounds.width).toBe(384); expect(bounds.height).toBe(128)
  expect((await first.locator('.horizontal-cover').boundingBox())!.width).toBe(127)
  await expect(first.locator('.horizontal-music')).toHaveText('125 | Sol♯ min')
  await expect(audio).toHaveAttribute('src', src!)
  await expect(audio).toHaveAttribute('data-identity', 'preserved')
  await expect(audio).toHaveJSProperty('paused', true)
  await expect(audio).toHaveJSProperty('currentTime', 9)
  const play = first.getByRole('button', { name: /^Écouter/ })
  await play.focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab')
  await expect(first.locator('.cover-play')).toHaveCSS('opacity', '1')
  await page.screenshot({ path: testInfo.outputPath('horizontal-desktop.png') })
  await first.getByRole('button', { name: /^Détails de/ }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(audio).toHaveJSProperty('paused', true)
  await page.keyboard.press('Escape')
  await play.focus(); await page.keyboard.press('Enter')
  await expect(audio).toHaveJSProperty('paused', false)
  await page.getByRole('button', { name: 'Grandes pochettes', exact: true }).click()
  await expect(audio).toHaveJSProperty('paused', false)
  await expect(audio).toHaveAttribute('data-identity', 'preserved')
  await page.getByRole('button', { name: 'Cartes horizontales', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  expect((await first.boundingBox())!.height).toBe(128)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('horizontal-mobile.png') })
  await page.reload()
  await expect(page.getByRole('button', { name: 'Cartes horizontales', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.player-artwork img')).toHaveAttribute('src', '/test-cover.svg')
})

test('crayon et Save stables, annulation, erreur et protection des modifications', async ({ page }, testInfo) => {
  let writes = 0
  await page.route('**/api/beats/*/metadata', async (route) => { writes += 1; await route.fulfill({ status: 503, json: { detail: 'Stockage temporairement indisponible.' } }) })
  await page.goto('/')
  await page.getByRole('button', { name: 'Détails de R&B Mélancolique', exact: true }).click()
  const dialog = page.getByRole('dialog')
  const actions = dialog.locator('.modal-actions button')
  const before = await actions.evaluateAll((buttons) => buttons.map((b) => { const r = b.getBoundingClientRect(); return [r.x, r.y, r.width, r.height] }))
  before.forEach((r) => { expect(r[2]).toBe(36); expect(r[3]).toBe(36) })
  const readBackground = await dialog.locator('.description-scroll').evaluate((el) => getComputedStyle(el).backgroundColor)
  await dialog.getByRole('button', { name: 'Modifier la prod', exact: true }).click()
  await expect(dialog.getByLabel('BPM', { exact: true })).toBeEnabled()
  await expect(dialog.getByRole('button', { name: 'Enregistrer les modifications', exact: true })).toBeEnabled()
  expect(writes).toBe(0)
  expect(await actions.evaluateAll((buttons) => buttons.map((b) => { const r = b.getBoundingClientRect(); return [r.x, r.y, r.width, r.height] }))).toEqual(before)
  expect(await dialog.getByRole('textbox', { name: 'Description de la prod', exact: true }).evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(readBackground)
  await dialog.getByLabel('BPM', { exact: true }).fill('155')
  await dialog.getByRole('button', { name: 'Fermer la fiche', exact: true }).click()
  await expect(dialog.getByText('Des modifications ne sont pas enregistrées.', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Continuer l’édition' }).click()
  await dialog.getByRole('button', { name: 'Enregistrer les modifications', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('Stockage temporairement indisponible.')
  await expect(dialog.getByLabel('BPM', { exact: true })).toHaveValue('155')
  await expect(dialog).toBeVisible()
  expect(writes).toBe(1)
  await page.screenshot({ path: testInfo.outputPath('detail-edit-error.png') })
  await dialog.getByRole('button', { name: 'Annuler les modifications', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Modifier la prod', exact: true })).toBeVisible()
  await expect(dialog.getByLabel('BPM', { exact: true })).toHaveValue('140')
  await dialog.getByRole('button', { name: 'Modifier la prod', exact: true }).click()
  await dialog.getByLabel('BPM', { exact: true }).fill('160')
  await page.keyboard.press('Escape')
  await expect(dialog.getByText('Des modifications ne sont pas enregistrées.', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Abandonner et fermer' }).click()
  await expect(dialog).toHaveCount(0)
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('')
})

test('progression mesurée, phases indéterminées, erreur puis relance sans historique', async ({ page }, testInfo) => {
  let job: Record<string, unknown> | null = null
  const base = { id: 'progress-test', source_url: 'https://youtu.be/PROGRESS001', state: 'running', stage: 'extracting', progress: null, error_message: null, beat_id: null }
  await page.route('**/api/imports', async (route) => {
    if (route.request().method() === 'POST') { job = { ...base }; await route.fulfill({ json: { job, beat_id: null, duplicate: false } }) }
    else await route.fulfill({ json: { jobs: job ? [job] : [] } })
  })
  await page.goto('/')
  await expect(page.getByText('Imports récents', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Une nouvelle prod ?', { exact: true })).toHaveCount(0)
  await page.getByRole('textbox', { name: 'Lien YouTube de la prod' }).fill('https://youtu.be/PROGRESS001')
  await page.getByRole('button', { name: 'Importer la prod', exact: true }).click()
  const progress = page.locator('.import-progress-track')
  await expect(progress).toBeVisible()
  await expect(progress).not.toHaveAttribute('aria-valuenow')
  for (const percent of [8, 32, 64]) {
    job = { ...base, stage: 'downloading', progress: percent }
    await expect(progress).toHaveAttribute('aria-valuenow', String(percent))
    await expect(progress.locator('.import-progress-fill')).toHaveCSS('background-color', 'rgb(199, 238, 217)')
    await expect.poll(async () => { const track = (await progress.boundingBox())!; const fill = (await progress.locator('.import-progress-fill').boundingBox())!; return Math.round(100 * fill.width / (track.width - 2)) }).toBe(percent)
  }
  job = { ...base, stage: 'downloading', progress: 64 }
  await expect(progress).toHaveAttribute('aria-valuenow', '64')
  await expect(page.getByRole('status').filter({ hasText: 'Téléchargement · 64 %' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('import-progress.png') })
  job = { ...base, stage: 'converting', progress: 100 }
  await expect(page.getByRole('status').filter({ hasText: 'Conversion MP3' })).toBeVisible()
  await expect(progress).not.toHaveAttribute('aria-valuenow')
  job = { ...base, stage: 'failed', state: 'failed', error_message: 'Réseau indisponible pendant le téléchargement.' }
  await expect(page.getByRole('alert')).toContainText('Réseau indisponible')
  await expect(progress).toHaveCount(0)
  await page.getByRole('button', { name: 'Réessayer', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  job = { ...base, stage: 'completed', state: 'completed', beat_id: '00000000-0000-0000-0000-000000000001', progress: 100 }
  await expect(progress).toHaveAttribute('aria-valuenow', '100')
  await expect(page.getByRole('status').filter({ hasText: 'Prête à écouter · 100 %' })).toBeVisible()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Voir la prod', exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(progress).toHaveAttribute('aria-valuenow', '100')
})


test('une fin d’import attend la fermeture d’un brouillon ouvert et ne rejoue pas les anciennes réussites', async ({ page }) => {
  let ready = false
  let completedPolls = 0
  const old = { id: 'old', state: 'completed', stage: 'completed', progress: 100, beat_id: '00000000-0000-0000-0000-000000000001' }
  await page.route('**/api/imports', (route) => {
    if (ready) completedPolls += 1
    return route.fulfill({ json: { jobs: [old, { id: 'new', state: ready ? 'completed' : 'running', stage: ready ? 'completed' : 'downloading', progress: ready ? 100 : 20, beat_id: ready ? old.beat_id : null }] } })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Détails de Drill minuit', exact: true }).click()
  await page.getByRole('button', { name: 'Modifier la prod', exact: true }).click()
  await page.getByLabel('BPM', { exact: true }).fill('149')
  ready = true
  await expect.poll(() => completedPolls, { timeout: 10000 }).toBeGreaterThan(1)
  await expect(page.getByRole('dialog').getByRole('textbox', { name: 'Titre de la prod', exact: true })).toHaveValue('Drill minuit')
  await expect(page.getByLabel('BPM', { exact: true })).toHaveValue('149')
  await page.getByRole('button', { name: 'Annuler les modifications', exact: true }).click()
  await page.getByRole('button', { name: 'Fermer la fiche', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'R&B Mélancolique', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  const before = completedPolls
  await expect.poll(() => completedPolls, { timeout: 10000 }).toBeGreaterThan(before)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
