import { expect, test } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

test('corriger un beatmaker dans la fiche épurée et conserver la correction après actualisation', async ({ page }) => {
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
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: 'Prod beatmaker 1', exact: true })).toBeVisible({ timeout: 15000 })
    await expect(dialog.getByText('Annotations et origine')).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Modifier la prod', exact: true }).click()
    await expect(dialog.getByLabel('Styles', { exact: true })).toHaveCount(0)
    await dialog.getByRole('textbox', { name: 'Nom du beatmaker', exact: true }).fill('Studio Nova')
    await dialog.getByRole('button', { name: 'Enregistrer les modifications', exact: true }).click()
    await expect(dialog.locator('dl').getByText('Studio Nova', { exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Écouter Prod beatmaker 1', exact: true }).click()
    const audio = page.locator('audio')
    await expect(audio).toHaveJSProperty('paused', false)
    await page.getByRole('button', { name: 'Actualiser', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: 'correction(s) conservée(s)' })).toBeVisible()
    await expect(audio).toHaveJSProperty('paused', false)
    await page.reload()
    await page.getByRole('searchbox', { name: 'Rechercher une prod' }).fill('studio nova')
    await page.getByRole('button', { name: 'Détails de Prod beatmaker 1', exact: true }).click()
    await expect(dialog.locator('dl').getByText('Studio Nova', { exact: true })).toBeVisible()
  } finally {
    expect((await page.request.post('/api/library', { headers, data: { path: original.root } })).ok()).toBe(true)
    await rm(root, { recursive: true, force: true })
  }
})
