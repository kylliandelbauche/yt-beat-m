import { expect, test } from '@playwright/test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

test('choisir un dossier sans copier son chemin, annuler et récupérer une erreur', async ({ page }) => {
  const original = (await (await page.request.get('/api/library')).json()).library
  let chosen: string | null = original.root
  let failure = false
  let calls = 0
  await page.route('**/api/library/pick-folder', async (route) => {
    expect(route.request().method()).toBe('POST')
    calls += 1
    await route.fulfill(failure ? { status: 400, json: { detail: 'Sélecteur indisponible. Tu peux saisir le chemin.' } } : { json: { path: chosen } })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Écouter R&B Mélancolique', exact: true }).click()
  const audio = page.locator('audio')
  await expect(audio).toHaveJSProperty('paused', false)
  await audio.evaluate((el: HTMLAudioElement) => { el.pause(); el.currentTime = 7 })
  await page.getByRole('button', { name: 'Bibliothèque', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Bibliothèque', exact: true })
  await dialog.getByRole('button', { name: 'Ouvrir un dossier', exact: true }).click()
  await expect(dialog.getByRole('textbox', { name: 'Dossier de bibliothèque', exact: true })).toHaveValue(original.root)
  expect(calls).toBe(1)
  chosen = null
  await dialog.getByRole('button', { name: 'Ouvrir un dossier', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Ouvrir un dossier', exact: true })).toBeEnabled()
  await expect(dialog.getByRole('textbox', { name: 'Dossier de bibliothèque', exact: true })).toHaveValue(original.root)
  failure = true
  await dialog.getByRole('button', { name: 'Ouvrir un dossier', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('Sélecteur indisponible')
  await expect(dialog.getByRole('textbox', { name: 'Dossier de bibliothèque', exact: true })).toBeEnabled()
  failure = false
  await dialog.getByRole('button', { name: 'Ouvrir la bibliothèque', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(audio).toHaveJSProperty('paused', true)
  await expect(audio).toHaveJSProperty('currentTime', 7)
  expect((await (await page.request.get('/api/library')).json()).library.id).toBe(original.id)
})

test('choisir le dossier vide de création et ouvrir une bibliothèque sans chemin collé', async ({ page }) => {
  const original = (await (await page.request.get('/api/library')).json()).library
  const root = await mkdtemp(path.join(tmpdir(), 'folder-picker-'))
  const token = (await (await page.request.get('/api/session')).json()).token
  const headers = { Origin: 'http://127.0.0.1:8767', 'X-Session-Token': token }
  try {
    await page.route('**/api/library/pick-folder', (route) => route.fulfill({ json: { path: root } }))
    await page.goto('/')
    await page.getByRole('button', { name: 'Bibliothèque', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Bibliothèque', exact: true })
    await dialog.getByRole('button', { name: 'Créer une bibliothèque', exact: true }).click()
    await dialog.getByRole('button', { name: 'Choisir un dossier', exact: true }).click()
    await expect(dialog.getByRole('textbox', { name: 'Dossier de bibliothèque', exact: true })).toHaveValue(root)
    await dialog.getByRole('textbox', { name: 'Nom de la bibliothèque', exact: true }).fill('Ma bibliothèque choisie')
    await dialog.getByRole('button', { name: 'Créer la bibliothèque', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Ma bibliothèque choisie', exact: true })).toBeVisible()
    await expect(page.getByRole('searchbox', { name: 'Rechercher une prod', exact: true })).toBeFocused()
    expect((await (await page.request.get('/api/library')).json()).library.root).toBe(await realpath(root))
  } finally {
    expect((await page.request.post('/api/library', { headers, data: { path: original.root } })).ok()).toBe(true)
    await rm(root, { recursive: true, force: true })
  }
})
