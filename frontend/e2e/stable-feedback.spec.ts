import { expect, test } from '@playwright/test'

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 650 }]) {
  test(`le contenu de la fiche reste fixe pendant les retours de sauvegarde sur ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport)
    let fail = false
    let releaseSave: (() => void) | undefined
    const pendingSave = new Promise<void>((resolve) => { releaseSave = resolve })
    await page.route('**/api/beats/*/metadata', async (route) => {
      if (fail) return route.fulfill({ status: 503, json: { detail: 'Stockage temporairement indisponible.' } })
      await pendingSave
      const detail = await page.request.get(route.request().url().replace('/metadata', ''))
      await route.fulfill({ json: { ...await detail.json(), bpm: 155 } })
    })
    await page.goto('/')
    await page.getByRole('button', { name: 'Écouter R&B Mélancolique', exact: true }).click()
    const audio = page.locator('audio')
    await expect(audio).toHaveJSProperty('paused', false)
    await audio.evaluate((el: HTMLAudioElement) => { el.pause(); el.currentTime = 8 })
    await page.getByRole('button', { name: 'Détails de R&B Mélancolique', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: 'R&B Mélancolique', exact: true })).toBeVisible()
    const geometry = () => dialog.evaluate((el) => {
      const selectors = [':scope', '.modal-header', '.modal-actions', '.modal-actions button:nth-child(1)', '.modal-actions button:nth-child(2)', '.modal-actions button:nth-child(3)', '.details-columns', '.detail-artwork', '.detail-music', '.detail-right', '.detail-identity', '.detail-dates', '.detail-description']
      return selectors.map((selector) => {
        const node = selector === ':scope' ? el : el.querySelector(selector)!
        const r = node.getBoundingClientRect()
        return [r.x, r.y, r.width, r.height]
      })
    })
    const read = await geometry()
    await dialog.getByRole('button', { name: 'Modifier la prod', exact: true }).click()
    await dialog.getByLabel('BPM', { exact: true }).fill('155')
    const edit = await geometry()
    const save = dialog.getByRole('button', { name: 'Enregistrer les modifications', exact: true })
    await save.click()
    await expect(save).toBeDisabled()
    expect(await geometry()).toEqual(edit)
    releaseSave?.()
    const editAction = dialog.getByRole('button', { name: 'Modifier la prod', exact: true })
    await expect(editAction.locator('svg')).toHaveAttribute('data-icon', 'check')
    await expect(dialog.getByRole('status')).toHaveText('Informations enregistrées.')
    expect(await geometry()).toEqual(read)
    await page.screenshot({ path: testInfo.outputPath('saved-without-shift.png') })
    await expect(editAction.locator('svg')).toHaveAttribute('data-icon', 'edit', { timeout: 6000 })
    expect(await geometry()).toEqual(read)
    await expect(audio).toHaveJSProperty('paused', true)
    await expect(audio).toHaveJSProperty('currentTime', 8)
    fail = true
    await editAction.click()
    await dialog.getByLabel('BPM', { exact: true }).fill('160')
    const editAgain = await geometry()
    await save.click()
    await expect(dialog.getByRole('alert')).toContainText('Stockage temporairement indisponible.')
    expect(await geometry()).toEqual(editAgain)
    await dialog.getByRole('button', { name: 'Masquer le message d’erreur', exact: true }).click()
    await expect(save).toBeFocused()
    expect(await geometry()).toEqual(editAgain)
    await dialog.getByRole('button', { name: 'Fermer la fiche', exact: true }).click()
    await expect(dialog.getByText('Des modifications ne sont pas enregistrées.', { exact: true })).toBeVisible()
    expect(await geometry()).toEqual(editAgain)
    await dialog.getByRole('button', { name: 'Continuer l’édition', exact: true }).click()
    await expect(save).toBeFocused()
    expect(await geometry()).toEqual(editAgain)
    await dialog.getByRole('button', { name: 'Annuler les modifications', exact: true }).click()
    expect(await geometry()).toEqual(read)
    await expect(editAction).toBeFocused()
  })
}
