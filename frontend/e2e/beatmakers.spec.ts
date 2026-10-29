import { expect, test } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

test('associer un profil dans la fiche et conserver la relation après actualisation', async ({ page }) => {
  test.setTimeout(60000)
  const original = (await (await page.request.get('/api/library')).json()).library
  const root = await mkdtemp(path.join(tmpdir(), 'beatmaker-browser-'))
  const token = (await (await page.request.get('/api/session')).json()).token
  const headers = { Origin: 'http://127.0.0.1:8767', 'X-Session-Token': token }
  try {
    expect((await page.request.post('/api/library', { headers, data: { path: root, create: true, name: 'Identité des beatmakers' } })).ok()).toBe(true)
    await page.goto('/')
    await page.getByRole('textbox', { name: 'Lien YouTube de la prod' }).fill('https://youtu.be/CREATOR0001')
    await page.getByRole('button', { name: 'Importer la prod', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: /^Prod / })
    await expect(dialog.getByRole('heading', { name: 'Prod beatmaker 1', exact: true })).toBeVisible({ timeout: 15000 })
    await expect(dialog.getByText('Annotations et origine')).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Modifier la prod', exact: true }).click()
    await expect(dialog.getByLabel('Styles', { exact: true })).toHaveCount(0)
    const studio = await (await page.request.post('/api/beatmakers', { headers, data: { name: 'Studio Nova' } })).json()
    await dialog.getByRole('button', { name: 'Associer', exact: true }).click()
    const picker = page.getByRole('dialog', { name: 'Associer des beatmakers', exact: true })
    await picker.getByRole('button', { name: 'Retirer les associations', exact: true }).click()
    await picker.getByRole('checkbox', { name: studio.name, exact: true }).check()
    await picker.getByRole('button', { name: 'Utiliser la sélection', exact: true }).click()
    await dialog.getByRole('button', { name: 'Enregistrer les modifications', exact: true }).click()
    await expect(dialog.getByRole('status')).toHaveText('Informations enregistrées.')
    await expect(dialog.getByRole('button', { name: 'Studio Nova', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await page.getByRole('button', { name: 'Écouter Prod beatmaker 1', exact: true }).click()
    const audio = page.locator('audio')
    await expect(audio).toHaveJSProperty('paused', false)
    await page.getByRole('button', { name: 'Actualiser', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: 'correction(s) conservée(s)' })).toBeVisible()
    await expect(audio).toHaveJSProperty('paused', false)
    await page.reload()
    await page.getByRole('searchbox', { name: 'Rechercher une prod' }).fill('studio nova')
    await page.getByRole('button', { name: 'Détails de Prod beatmaker 1', exact: true }).click()
    await expect(dialog.getByRole('button', { name: 'Studio Nova', exact: true })).toBeVisible()
  } finally {
    expect((await page.request.post('/api/library', { headers, data: { path: original.root } })).ok()).toBe(true)
    await rm(root, { recursive: true, force: true })
  }
})

test('me reste une proposition de chaîne, la correction conserve le collaborateur et la règle ne fuit pas vers les autres invités', async ({ page }) => {
  const original = (await (await page.request.get('/api/library')).json()).library
  const root = await mkdtemp(path.join(tmpdir(), 'self-credit-browser-'))
  const token = (await (await page.request.get('/api/session')).json()).token
  const headers = { Origin: 'http://127.0.0.1:8767', 'X-Session-Token': token }
  try {
    expect((await page.request.post('/api/library', { headers, data: { path: root, create: true, name: 'Collaborations de test' } })).ok()).toBe(true)
    await page.goto('/')
    await page.getByRole('textbox', { name: 'Lien YouTube de la prod' }).fill('https://youtu.be/SELFCREDIT1')
    await page.getByRole('button', { name: 'Importer la prod', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: /^Prod / })
    const maker = dialog.locator('#detail-maker')
    await expect(maker).toHaveValue('prodlacco x @m3nacebeats')
    await expect(maker).toHaveAttribute('title', /proposé depuis la chaîne YouTube/)
    await expect(maker).toHaveAttribute('aria-description', /À vérifier/)
    const before = await dialog.locator('#detail-maker, .modal-actions button').evaluateAll((elements) => elements.map((el) => { const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height] }))
    await dialog.getByRole('button', { name: 'Modifier la prod', exact: true }).click()
    const laco = await (await page.request.post('/api/beatmakers', { headers, data: { name: 'Laco' } })).json()
    await dialog.getByRole('button', { name: 'Associer', exact: true }).click()
    const picker = page.getByRole('dialog', { name: 'Associer des beatmakers', exact: true })
    await picker.getByRole('checkbox', { name: 'prodlacco', exact: true }).uncheck()
    await picker.getByRole('checkbox', { name: 'Laco', exact: true }).check()
    await picker.getByRole('button', { name: 'Utiliser la sélection', exact: true }).click()
    await dialog.getByRole('button', { name: 'Enregistrer les modifications', exact: true }).click()
    await expect(dialog.getByRole('status')).toHaveText('Informations enregistrées.')
    await expect(dialog.getByRole('button', { name: 'Laco', exact: true })).toBeVisible()
    await expect(dialog.getByRole('button', { name: '@m3nacebeats', exact: true })).toBeVisible()
    expect(await dialog.locator('#detail-maker, .modal-actions button').evaluateAll((elements) => elements.map((el) => { const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height] }))).toEqual(before)
    const first = (await (await page.request.get('/api/beats')).json()).beats[0]
    expect((await page.request.patch(`/api/beats/${first.id}/beatmaker`, { headers, data: { beatmaker: 'Laco x @m3nacebeats', remember_channel: true } })).ok()).toBe(true)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await page.getByRole('textbox', { name: 'Lien YouTube de la prod' }).fill('https://youtu.be/SELFCREDIT2')
    await page.getByRole('button', { name: 'Importer la prod', exact: true }).click()
    await expect(maker).toHaveValue('Laco x @Other')
    await expect(maker).toHaveAttribute('title', /règle de chaîne mémorisée/)
    const second = (await (await page.request.get('/api/beats')).json()).beats.find((b: { title: string }) => b.title === 'Prod crédit 2')
    expect(second.beatmakers.map((p: { id: string }) => p.id)).toContain(laco.id)
    expect(second.beatmakers.map((p: { name: string }) => p.name)).not.toContain('@m3nacebeats')
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await page.getByRole('button', { name: 'Écouter Prod crédit 1', exact: true }).click()
    const audio = page.locator('audio')
    await expect(audio).toHaveJSProperty('paused', false)
    await audio.evaluate((el: HTMLAudioElement) => { el.pause(); el.currentTime = 7; el.dataset.identity = 'self-credit-player' })
    await page.getByRole('button', { name: 'Actualiser', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: 'correction(s) conservée(s)' })).toBeVisible()
    await expect(audio).toHaveJSProperty('currentTime', 7)
    await expect(audio).toHaveAttribute('data-identity', 'self-credit-player')
    await page.getByRole('searchbox', { name: 'Rechercher une prod' }).fill('m3nacebeats')
    await expect(page.locator('.beat-card')).toHaveCount(1)
    await expect(page.locator('.beat-maker')).toHaveText('@m3nacebeats × Laco')
  } finally {
    expect((await page.request.post('/api/library', { headers, data: { path: original.root } })).ok()).toBe(true)
    await rm(root, { recursive: true, force: true })
  }
})
