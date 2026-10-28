import { expect, test } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

test('Clé française et Abm contextualisé : import, fiche, filtres et corrections conservées', async ({ page }) => {
  const original = (await (await page.request.get('/api/library')).json()).library
  const root = await mkdtemp(path.join(tmpdir(), 'key-extraction-'))
  const token = (await (await page.request.get('/api/session')).json()).token
  const headers = { Origin: 'http://127.0.0.1:8767', 'X-Session-Token': token }
  try {
    expect((await page.request.post('/api/library', { headers, data: { path: root, create: true, name: 'Tonalités de test' } })).ok()).toBe(true)
    await page.goto('/')
    for (const [id, title, key] of [['KEYREGRESS1', 'Prod tonalité 1', 'E minor'], ['KEYREGRESS2', 'Prod tonalité 2', 'Ab minor']]) {
      await page.getByRole('textbox', { name: 'Lien YouTube de la prod', exact: true }).fill(`https://youtu.be/${id}`)
      await page.getByRole('button', { name: 'Importer la prod', exact: true }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByRole('textbox', { name: 'Titre de la prod', exact: true })).toHaveValue(title)
      await expect(dialog.getByLabel('Tonalité', { exact: true })).toHaveValue(key)
      await page.keyboard.press('Escape')
      await expect(dialog).toHaveCount(0)
    }
    const menu = page.locator('.filter-menu').filter({ has: page.locator('summary', { hasText: 'Tonalité' }) })
    await menu.locator('summary').click()
    await menu.getByRole('checkbox', { name: 'Ab minor', exact: true }).check()
    await page.keyboard.press('Escape')
    await expect(page.locator('.beat-card')).toHaveCount(1)
    await page.getByRole('button', { name: 'Détails de Prod tonalité 2', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Modifier la prod', exact: true }).click()
    await dialog.getByLabel('Tonalité', { exact: true }).fill('')
    await dialog.getByRole('button', { name: 'Enregistrer les modifications', exact: true }).click()
    await expect(dialog.getByRole('status')).toContainText('Informations enregistrées.')
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await page.getByRole('button', { name: 'Effacer les filtres', exact: true }).click()
    await expect(page.locator('.beat-card')).toHaveCount(2)
    const audio = page.locator('audio')
    await audio.evaluate((el: HTMLAudioElement) => { el.currentTime = 7; el.dataset.identity = 'kept-key-refresh' })
    await page.getByRole('button', { name: 'Actualiser', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: 'tonalité(s) complétée(s)' })).toBeVisible()
    await expect(audio).toHaveAttribute('data-identity', 'kept-key-refresh')
    await expect(audio).toHaveJSProperty('currentTime', 7)
    await page.getByRole('button', { name: 'Détails de Prod tonalité 2', exact: true }).click()
    await expect(page.getByRole('dialog').getByLabel('Tonalité', { exact: true })).toHaveValue('')
  } finally {
    expect((await page.request.post('/api/library', { headers, data: { path: original.root } })).ok()).toBe(true)
    await rm(root, { recursive: true, force: true })
  }
})
