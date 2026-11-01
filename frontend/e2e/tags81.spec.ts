import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
const id = "00000000-0000-0000-0000-000000000001";
async function headers(page: Page) {
  return {
    Origin: "http://127.0.0.1:8767",
    "X-Session-Token": (await (await page.request.get("/api/session")).json())
      .token,
  };
}
async function panel(page: Page) {
  await page
    .getByRole("button", { name: "Détails de R&B Mélancolique", exact: true })
    .click();
  const p = page.getByRole("region", { name: "R&B Mélancolique", exact: true });
  await expect(p.getByLabel("Titre de la prod", { exact: true })).toHaveValue(
    "R&B Mélancolique",
  );
  await p.scrollIntoViewIfNeeded();
  return p;
}
async function rects(root: Locator, selector: string) {
  return root.locator(selector).evaluateAll((es) =>
    es.map((e) => {
      const r = e.getBoundingClientRect();
      return [r.x, r.y, r.width, r.height];
    }),
  );
}
for (const width of [1440, 390]) {
  test(`fiche : un seul Save, fermeture conserve le brouillon et Annuler ne crée rien à ${width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const h = await headers(page),
      old = (await (await page.request.get(`/api/beats/${id}`)).json()).tags;
    const label = `Draft81-${width}`;
    try {
      await page
        .getByRole("button", { name: "Écouter R&B Mélancolique", exact: true })
        .click();
      await page.locator("audio").evaluate((a: HTMLAudioElement) => {
        a.pause();
        a.currentTime = 7;
        a.dataset.identity = "tags81";
      });
      const p = await panel(page),
        plus = p.getByRole("button", { name: "Choisir mes tags", exact: true });
      const selector =
        ".detail-title-input input,.detail-cover,.detail-music,#detail-bpm,.detail-tags,.detail-header > button";
      const before = await rects(p, selector);
      expect(before.length).toBeGreaterThanOrEqual(8);
      await plus.click();
      let picker = page.getByRole("dialog", {
        name: "Choisir mes tags",
        exact: true,
      });
      await expect(
        p.getByRole("button", {
          name: "Enregistrer les modifications",
          exact: true,
        }),
      ).toBeVisible();
      await expect(picker).toHaveCSS("width", "288px");
      await expect(picker).toHaveCSS("height", "264px");
      await expect(
        picker.getByRole("button", { name: "Utiliser la sélection" }),
      ).toHaveCount(0);
      await picker.getByRole("searchbox").fill(label);
      await picker.getByRole("searchbox").press("Enter");
      await expect(
        picker.getByRole("checkbox", { name: label, exact: true }),
      ).toBeChecked();
      await picker.screenshot({ path: info.outputPath("tag-picker.png") });
      await page.keyboard.press("Escape");
      await expect(plus).toBeFocused();
      expect(await rects(p, selector)).toEqual(before);
      expect(
        (await (await page.request.get("/api/catalog/filters")).json()).tags,
      ).not.toContain(label);
      await p
        .getByRole("button", { name: "Annuler les modifications", exact: true })
        .click();
      expect(
        (await (await page.request.get("/api/catalog/filters")).json()).tags,
      ).not.toContain(label);
      expect(
        (await (await page.request.get(`/api/beats/${id}`)).json()).tags,
      ).toEqual(old);
      expect(await rects(p, selector)).toEqual(before);
      await plus.click();
      picker = page.getByRole("dialog", {
        name: "Choisir mes tags",
        exact: true,
      });
      await picker.getByRole("searchbox").fill(label);
      await picker
        .getByRole("button", { name: `Créer « ${label} »`, exact: true })
        .click();
      await page.keyboard.press("Escape");
      await plus.click();
      await expect(
        page
          .getByRole("dialog", { name: "Choisir mes tags", exact: true })
          .getByRole("checkbox", { name: label, exact: true }),
      ).toBeChecked();
      await p
        .getByRole("button", {
          name: "Enregistrer les modifications",
          exact: true,
        })
        .click();
      await expect(p.getByRole("status")).toHaveText(
        "Informations enregistrées.",
      );
      expect(
        (await (await page.request.get(`/api/beats/${id}`)).json()).tags,
      ).toEqual([...old, label]);
      expect(await rects(p, selector)).toEqual(before);
      await expect(page.locator("audio")).toHaveAttribute(
        "data-identity",
        "tags81",
      );
      await expect(page.locator("audio")).toHaveJSProperty("currentTime", 7);
    } finally {
      await page.request.patch(`/api/beats/${id}/metadata`, {
        headers: h,
        data: { tags: old },
      });
      const tag = (
        await (await page.request.get("/api/catalog/tags")).json()
      ).tags.find((t: { label: string }) => t.label === label);
      if (tag)
        await page.request.delete(`/api/catalog/tags/${tag.id}`, {
          headers: h,
          data: { expected_label: label },
        });
    }
  });
  test(`réglages Tags : même rubrique, erreur/retry, confirmation et géométrie fixe à ${width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const h = await headers(page),
      label = `Manager81-${width}`;
    const old = (await (await page.request.get(`/api/beats/${id}`)).json())
      .tags;
    await page.request.patch(`/api/beats/${id}/metadata`, {
      headers: h,
      data: { tags: [...old, label], recreate_tags: [label] },
    });
    try {
      const filter = page
        .locator(".filter-menu")
        .filter({ has: page.locator("summary", { hasText: "Tags" }) });
      await filter.locator("summary").click();
      await filter
        .getByRole("button", { name: "Gérer les tags", exact: true })
        .click();
      const modal = page.getByRole("dialog", { name: "Réglages", exact: true }),
        manager = modal.locator(".catalog-tags");
      await expect(
        modal.getByRole("button", { name: "Tags", exact: true }),
      ).toHaveAttribute("aria-current", "page");
      await expect(modal).toHaveCSS("height", "648px");
      if (width === 1440) await expect(modal).toHaveCSS("width", "752px");
      await expect(
        manager.getByRole("button", { name: `Renommer ${label}`, exact: true }),
      ).toBeEnabled();
      await modal.screenshot({ path: info.outputPath("tags-library.png") });
      await manager.getByRole("searchbox").fill(label);
      await expect(
        manager.getByRole("button", { name: `Renommer ${label}`, exact: true }),
      ).toBeEnabled();
      const selector =
        ".catalog-tags-search,.catalog-tags-list,.catalog-tag-row,.catalog-tag-row > button,.catalog-tags-feedback";
      const before = await rects(manager, selector);
      const textBefore = await manager
        .locator(".catalog-tag-label")
        .evaluate((el) => {
          const r = el.getBoundingClientRect();
          return [r.x, r.y];
        });
      await manager
        .getByRole("button", { name: `Renommer ${label}`, exact: true })
        .click();
      const name = manager.getByRole("textbox", {
        name: "Nom du tag",
        exact: true,
      });
      await expect(name).toBeFocused();
      const textAfter = await name.evaluate((el: HTMLInputElement) => {
        const r = el.getBoundingClientRect(),
          s = getComputedStyle(el);
        return [
          r.x + parseFloat(s.borderLeftWidth) + parseFloat(s.paddingLeft),
          r.y + (r.height - parseFloat(s.lineHeight)) / 2,
        ];
      });
      expect(textAfter).toEqual(textBefore);
      expect(await rects(manager, selector)).toEqual(before);
      await name.fill(label + "-renamed");
      let release!: () => void;
      const pending = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route("**/api/catalog/tags/*", async (route) => {
        await pending;
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Conflit contrôlé, réessaie." }),
        });
      });
      await manager
        .getByRole("button", {
          name: `Enregistrer le tag ${label}`,
          exact: true,
        })
        .click();
      await expect(
        manager.getByRole("button", {
          name: `Enregistrer le tag ${label}`,
          exact: true,
        }),
      ).toBeDisabled();
      await modal
        .getByRole("button", { name: "Fermer les réglages", exact: true })
        .click();
      await expect(modal).toBeVisible();
      expect(await rects(manager, selector)).toEqual(before);
      release();
      await expect(manager.getByRole("alert")).toHaveText(
        "Conflit contrôlé, réessaie.",
      );
      await expect(name).toHaveValue(label + "-renamed");
      expect(await rects(manager, selector)).toEqual(before);
      await page.unroute("**/api/catalog/tags/*");
      await manager
        .getByRole("button", {
          name: `Enregistrer le tag ${label}`,
          exact: true,
        })
        .click();
      await expect(manager.getByRole("status")).toHaveText("Tag renommé.");
      expect(await rects(manager, selector)).toEqual(before);
      await manager
        .getByRole("button", {
          name: `Supprimer ${label}-renamed`,
          exact: true,
        })
        .click();
      await expect(
        manager.getByText(`Supprimer « ${label}-renamed » ?`, { exact: true }),
      ).toBeVisible();
      expect(await rects(manager, selector)).toEqual(before);
      await manager.screenshot({ path: info.outputPath("tags-settings.png") });
      await manager
        .getByRole("button", { name: "Annuler", exact: true })
        .click();
      await manager
        .getByRole("button", {
          name: `Supprimer ${label}-renamed`,
          exact: true,
        })
        .click();
      await manager
        .getByRole("button", { name: "Supprimer", exact: true })
        .click();
      await expect(manager.getByRole("status")).toHaveText("Tag supprimé.");
      await expect(manager.getByRole("searchbox")).toBeFocused();
      expect(
        (await (await page.request.get(`/api/beats/${id}`)).json()).tags,
      ).toEqual(old);
      await modal
        .getByRole("button", { name: "Fermer les réglages", exact: true })
        .click();
      await expect(filter.locator("summary")).toBeFocused();
      await page.getByRole("button", { name: "Réglages", exact: true }).click();
      await page
        .getByRole("dialog", { name: "Réglages", exact: true })
        .getByRole("button", { name: "Tags", exact: true })
        .click();
      await expect(
        page
          .getByRole("dialog", { name: "Réglages", exact: true })
          .locator(".catalog-tags"),
      ).toBeVisible();
    } finally {
      await page.unroute("**/api/catalog/tags/*");
      await page.request.patch(`/api/beats/${id}/metadata`, {
        headers: h,
        data: { tags: old },
      });
      for (const tag of (
        await (await page.request.get("/api/catalog/tags")).json()
      ).tags.filter((t: { label: string }) => t.label.startsWith(label)))
        await page.request.delete(`/api/catalog/tags/${tag.id}`, {
          headers: h,
          data: { expected_label: tag.label },
        });
    }
  });
}
