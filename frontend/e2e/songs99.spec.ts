import { expect, test } from "@playwright/test";
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Song } from "../src/song";

let original: string, root: string;
let headers: Record<string, string>;
const notes =
  "  Notes de travail\n\n" +
  "Une ligne de notes conservée, avec ses espaces et ses retours.\n".repeat(70);
const lyrics =
  "[Refrain]\nParoles synthétiques pour la recette 🙂\n\n" +
  "Ligne de test, sans contenu musical personnel.\n".repeat(90);
async function create(request: APIRequestContext, title: string, fields = {}) {
  const selection = (
    await (await request.post("/api/songs/pick-file", { headers })).json()
  ).selection;
  const response = await request.post("/api/songs", {
    headers,
    data: {
      title,
      state: "Topline",
      selection_id: selection.selection_id,
      notes,
      lyrics,
      ...fields,
    },
  });
  expect(response.ok()).toBe(true);
  return response.json() as Promise<Song>;
}
async function open(page: Page, title: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "Mes sons", exact: true }).click();
  await page
    .getByRole("button", { name: `Détails du son ${title}`, exact: true })
    .click();
  const panel = page.getByRole("complementary", {
    name: "Fiche du son",
    exact: true,
  });
  await expect(panel.getByLabel("Titre du son", { exact: true })).toHaveValue(
    title,
  );
  await page.evaluate(() => document.fonts.ready);
  return panel;
}
async function description(panel: Locator) {
  await panel
    .getByRole("button", { name: "Description du son", exact: true })
    .click();
  await expect(
    panel.getByRole("tab", { name: "Notes", exact: true }),
  ).toBeVisible();
}
async function rects(root: Locator, selector: string) {
  return root.locator(selector).evaluateAll((es) =>
    es.map((e) => {
      const r = e.getBoundingClientRect(),
        css = getComputedStyle(e);
      return [
        ...[r.x, r.y, r.width, r.height].map((n) => Math.round(n * 100) / 100),
        css.fontSize,
        css.lineHeight,
        css.paddingLeft,
        css.borderLeftWidth,
      ];
    }),
  );
}
const panelGeometry =
  ".detail-header,.detail-header > button,.song-detail-title,.song-text-tabs,.song-text-tabs > button,.song-text-block:not([hidden]),.song-text-block:not([hidden]) > textarea,.song-text-block:not([hidden]) > button";
async function save(panel: Locator) {
  await panel
    .getByRole("button", { name: "Enregistrer le son", exact: true })
    .click();
  await expect(
    panel.getByRole("button", { name: "Modifier le son", exact: true }),
  ).toBeEnabled();
}

test.beforeEach(async ({ request, page }) => {
  original = (await (await request.get("/api/library")).json()).library.root;
  headers = {
    Origin: "http://127.0.0.1:8767",
    "X-Session-Token": (await (await request.get("/api/session")).json()).token,
  };
  root = await mkdtemp(path.join(tmpdir(), "beat-m-text99-"));
  expect(
    (
      await request.post("/api/library", {
        headers,
        data: { path: root, create: true, name: "Textes de test" },
      })
    ).ok(),
  ).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
});
test.afterEach(async ({ request }) => {
  if (original)
    await request.post("/api/library", { headers, data: { path: original } });
  if (root) await rm(root, { recursive: true, force: true });
});

for (const [width, height] of [
  [1440, 900],
  [1024, 620],
]) {
  test(`même brouillon, fermetures sans Save, focus et géométrie à ${width}`, async ({
    page,
    request,
  }, info) => {
    const song = await create(request, "Texte à conserver");
    await page.setViewportSize({ width, height });
    const panel = await open(page, song.title);
    await description(panel);
    if (width === 1024) {
      const contained = await page
        .locator(".local-player")
        .evaluate((player) => {
          const b = player.getBoundingClientRect();
          return [...player.querySelectorAll("button,.range-control")].every(
            (el) => {
              const r = el.getBoundingClientRect();
              return r.left >= b.left && r.right <= b.right;
            },
          );
        });
      expect(contained).toBe(true);
    }
    const before = await rects(panel, panelGeometry);
    expect(before.length).toBe(11);
    await panel
      .getByRole("button", { name: "Modifier le son", exact: true })
      .click();
    expect(await rects(panel, panelGeometry)).toEqual(before);
    const input = panel.getByRole("textbox", {
      name: "Notes du son",
      exact: true,
    });
    await input.fill(notes + "\nBrouillon Notes");
    await panel.getByRole("tab", { name: "Paroles", exact: true }).click();
    await panel
      .getByRole("textbox", { name: "Paroles du son", exact: true })
      .fill(lyrics + "\nBrouillon Paroles");
    // Both text fields and the other information belong to the same Save.
    await panel
      .getByRole("button", { name: "Informations du son", exact: true })
      .click();
    await panel
      .getByLabel("Titre du son", { exact: true })
      .fill("Titre modifié");
    await description(panel);
    await panel.getByRole("tab", { name: "Notes", exact: true }).click();
    await expect(input).toHaveValue(notes + "\nBrouillon Notes");
    await input.evaluate((el: HTMLTextAreaElement) => {
      el.setSelectionRange(20, 25);
      el.scrollTop = 180;
    });
    const position = await input.evaluate(
      (el: HTMLTextAreaElement) => el.scrollTop,
    );
    let writes = 0;
    page.on("request", (r) => {
      if (r.method() === "PATCH" && r.url().endsWith(`/api/songs/${song.id}`))
        writes++;
    });
    const expand = panel.getByRole("button", {
      name: "Agrandir les notes",
      exact: true,
    });
    for (const close of ["button", "escape", "outside"]) {
      await expand.click();
      const modal = page.getByRole("dialog", {
        name: "Notes agrandies",
        exact: true,
      });
      await expect(modal).toHaveCSS("width", "800px");
      await expect(modal).toHaveCSS(
        "height",
        `${Math.min(680, height - 24)}px`,
      );
      const large = modal.getByRole("textbox", {
        name: "Notes du son agrandies",
        exact: true,
      });
      await expect(large).toHaveValue(notes + "\nBrouillon Notes");
      await expect(large).toBeEditable();
      expect(
        await modal.getByRole("button", { name: /Enregistrer/ }).count(),
      ).toBe(0);
      if (close === "button")
        await modal
          .getByRole("button", {
            name: "Revenir à la fiche du son",
            exact: true,
          })
          .click();
      if (close === "escape") await page.keyboard.press("Escape");
      if (close === "outside") await page.mouse.click(4, 4);
      await expect(modal).toHaveCount(0);
      await expect(expand).toBeFocused();
      expect(
        await input.evaluate((el: HTMLTextAreaElement) => el.scrollTop),
      ).toBe(position);
      expect(
        await input.evaluate((el: HTMLTextAreaElement) => [
          el.selectionStart,
          el.selectionEnd,
        ]),
      ).toEqual([20, 25]);
      expect(await rects(panel, panelGeometry)).toEqual(before);
      expect(writes).toBe(0);
    }
    await expand.click();
    const modal = page.getByRole("dialog", {
      name: "Notes agrandies",
      exact: true,
    });
    await modal
      .getByRole("textbox", { name: "Notes du son agrandies", exact: true })
      .fill("Modifié dans la fenêtre agrandie\n\n" + notes);
    await modal.screenshot({
      path: info.outputPath(`text-expanded-${width}.png`),
    });
    await page.keyboard.press("Escape");
    await expect(input).toHaveValue(
      "Modifié dans la fenêtre agrandie\n\n" + notes,
    );
    const stored: Song = await (
      await request.get(`/api/songs/${song.id}`)
    ).json();
    expect(stored.notes).toBe(notes);
    await save(panel);
    expect(writes).toBe(1);
    expect(await rects(panel, panelGeometry)).toEqual(before);
    const saved: Song = await (
      await request.get(`/api/songs/${song.id}`)
    ).json();
    expect(saved.title).toBe("Titre modifié");
    expect(saved.notes).toBe("Modifié dans la fenêtre agrandie\n\n" + notes);
    expect(saved.lyrics).toBe(lyrics + "\nBrouillon Paroles");
    await page.screenshot({
      path: info.outputPath(`description-${width}.png`),
    });
    await panel
      .getByRole("button", { name: "Modifier le son", exact: true })
      .click();
    await input.fill("À annuler");
    await panel.getByRole("tab", { name: "Paroles", exact: true }).click();
    await panel
      .getByRole("textbox", { name: "Paroles du son", exact: true })
      .fill("À annuler aussi");
    await panel
      .getByRole("button", {
        name: "Annuler les modifications du son",
        exact: true,
      })
      .click();
    await expect(
      panel.getByRole("textbox", { name: "Paroles du son", exact: true }),
    ).toHaveValue(saved.lyrics!);
    await panel.getByRole("tab", { name: "Notes", exact: true }).click();
    await expect(input).toHaveValue(saved.notes!);
    expect(await rects(panel, panelGeometry)).toEqual(before);
  });
}

test("erreur de Save garde les deux textes, reprise atomique et réouverture", async ({
  page,
  request,
}) => {
  const song = await create(request, "Reprise");
  const panel = await open(page, song.title);
  await description(panel);
  await panel
    .getByRole("button", { name: "Modifier le son", exact: true })
    .click();
  await panel
    .getByRole("textbox", { name: "Notes du son", exact: true })
    .fill("Notes après erreur");
  await panel.getByRole("tab", { name: "Paroles", exact: true }).click();
  await panel
    .getByRole("textbox", { name: "Paroles du son", exact: true })
    .fill("Paroles après erreur");
  const shape = await rects(panel, panelGeometry);
  await page.keyboard.press("Escape");
  const guard = page.getByRole("dialog", {
    name: "Modifications du son non enregistrées",
    exact: true,
  });
  await expect(guard).toBeVisible();
  await guard
    .getByRole("button", { name: "Continuer l’édition", exact: true })
    .click();
  await expect(guard).toHaveCount(0);
  await expect(
    panel.getByRole("textbox", { name: "Paroles du son", exact: true }),
  ).toHaveValue("Paroles après erreur");
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**/api/songs/${song.id}`, async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    await pending;
    await route.fulfill({
      status: 409,
      json: { detail: "Conflit de recette, réessaie." },
    });
  });
  const button = panel.getByRole("button", {
    name: "Enregistrer le son",
    exact: true,
  });
  await button.click();
  await expect(button).toBeDisabled();
  expect(await rects(panel, panelGeometry)).toEqual(shape);
  release();
  await expect(panel.getByRole("alert")).toContainText("Conflit de recette");
  await expect(
    panel.getByRole("textbox", { name: "Paroles du son", exact: true }),
  ).toHaveValue("Paroles après erreur");
  expect(await rects(panel, panelGeometry)).toEqual(shape);
  await page.unroute(`**/api/songs/${song.id}`);
  await save(panel);
  const reopened = await open(page, song.title);
  await description(reopened);
  await expect(
    reopened.getByRole("textbox", { name: "Notes du son", exact: true }),
  ).toHaveValue("Notes après erreur");
  await reopened.getByRole("tab", { name: "Paroles", exact: true }).click();
  await expect(
    reopened.getByRole("textbox", { name: "Paroles du son", exact: true }),
  ).toHaveValue("Paroles après erreur");
});

test("texte HTML inerte, lecture seule agrandie et continuité audio", async ({
  page,
  request,
}) => {
  const raw =
    '<img src="x" onerror="window.untrusted = true"><script>window.untrusted = true</script>\nTexte brut.';
  const song = await create(request, "Lecture", { notes: raw });
  const panel = await open(page, song.title);
  await page
    .locator(".song-card")
    .getByRole("button", { name: "Écouter le son Lecture", exact: true })
    .click();
  const audio = page.locator("audio");
  await expect(audio).toHaveJSProperty("paused", false);
  await audio.evaluate((el: HTMLAudioElement) => {
    el.currentTime = 7;
    el.volume = 0.35;
    el.dataset.identity = "text99";
  });
  await description(panel);
  const input = panel.getByRole("textbox", {
    name: "Notes du son",
    exact: true,
  });
  await expect(input).toHaveValue(raw);
  await expect(input).toHaveJSProperty("readOnly", true);
  await panel
    .getByRole("button", { name: "Agrandir les notes", exact: true })
    .click();
  const modal = page.getByRole("dialog", {
    name: "Notes agrandies",
    exact: true,
  });
  await expect(modal.getByRole("textbox")).toHaveValue(raw);
  await expect(modal.getByRole("textbox")).toHaveJSProperty("readOnly", true);
  await expect(modal.locator("img,script")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => (window as unknown as { untrusted?: boolean }).untrusted,
    ),
  ).toBeUndefined();
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);
  await expect(audio).toHaveAttribute("data-identity", "text99");
  await expect(audio).toHaveJSProperty("paused", false);
  await expect(audio).toHaveJSProperty("volume", 0.35);
  expect(
    await audio.evaluate((el: HTMLAudioElement) => el.currentTime),
  ).toBeGreaterThanOrEqual(7);
  expect(
    (await (await request.get(`/api/songs/${song.id}`)).json()).revision,
  ).toBe(song.revision);
});

test("clavier, indicateur seul à160ms, mouvement réduit et défilement interne", async ({
  page,
  request,
}) => {
  const song = await create(request, "Clavier");
  const panel = await open(page, song.title);
  await description(panel);
  const notesTab = panel.getByRole("tab", { name: "Notes", exact: true });
  const lyricsTab = panel.getByRole("tab", { name: "Paroles", exact: true });
  const shape = await rects(
    panel,
    ".song-text-tabs,.song-text-tabs > button,.song-text-block:not([hidden])",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(panel.locator(".song-text-indicator")).toHaveCSS(
    "transition-duration",
    "0.16s",
  );
  await notesTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(lyricsTab).toBeFocused();
  await expect(lyricsTab).toHaveAttribute("aria-selected", "true");
  expect(
    await rects(
      panel,
      ".song-text-tabs,.song-text-tabs > button,.song-text-block:not([hidden])",
    ),
  ).toEqual(shape);
  const input = panel.getByRole("textbox", {
    name: "Paroles du son",
    exact: true,
  });
  expect(await input.evaluate((el) => el.scrollHeight)).toBeGreaterThan(
    await input.evaluate((el) => el.clientHeight),
  );
  await input.evaluate((el) => {
    el.scrollTop = 220;
  });
  await notesTab.click();
  await lyricsTab.click();
  expect(await input.evaluate((el) => el.scrollTop)).toBe(220);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(panel.locator(".song-text-indicator")).toHaveCSS(
    "transition-duration",
    "0s",
  );
  await lyricsTab.focus();
  await page.keyboard.press("Home");
  await expect(notesTab).toBeFocused();
  await expect(notesTab).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Réglages", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Réglages", exact: true });
  await settings.getByRole("button", { name: "Thèmes", exact: true }).click();
  // The supported dark mode uses the same text controls and fixed dimensions.
  await settings.getByRole("button", { name: "Sombre", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-mode", "dark");
  await settings
    .getByRole("button", { name: "Fermer les réglages", exact: true })
    .click();
  expect(
    await rects(
      panel,
      ".song-text-tabs,.song-text-tabs > button,.song-text-block:not([hidden])",
    ),
  ).toEqual(shape);
});

test("collage au-delà de la limite : brouillon intact, erreur fixe et correction sans perte", async ({
  page,
  request,
}) => {
  const song = await create(request, "Limite");
  const panel = await open(page, song.title);
  await description(panel);
  const shape = await rects(panel, panelGeometry);
  await panel
    .getByRole("button", { name: "Modifier le son", exact: true })
    .click();
  const input = panel.getByRole("textbox", {
    name: "Notes du son",
    exact: true,
  });
  const long = "x".repeat(50_001);
  await input.fill(long);
  await expect(input).toHaveValue(long);
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(panel.getByRole("alert")).toContainText("50 000");
  expect(await rects(panel, panelGeometry)).toEqual(shape);
  await panel
    .getByRole("button", { name: "Enregistrer le son", exact: true })
    .click();
  expect(
    (await (await request.get(`/api/songs/${song.id}`)).json()).notes,
  ).toBe(notes);
  await panel
    .getByRole("button", { name: "Agrandir les notes", exact: true })
    .click();
  const modal = page.getByRole("dialog", {
    name: "Notes agrandies",
    exact: true,
  });
  const large = modal.getByRole("textbox");
  await expect(large).toHaveValue(long);
  await expect(modal.getByRole("alert")).toContainText(
    "Le texte reste dans le brouillon",
  );
  const modalShape = await rects(modal, ".modal-header,.modal-close,textarea");
  await large.fill("Texte corrigé");
  await expect(modal.getByRole("alert")).toHaveCount(0);
  expect(await rects(modal, ".modal-header,.modal-close,textarea")).toEqual(
    modalShape,
  );
  await page.keyboard.press("Escape");
  await expect(input).toHaveValue("Texte corrigé");
  await save(panel);
  const saved: Song = await (await request.get(`/api/songs/${song.id}`)).json();
  expect(saved.notes).toBe("Texte corrigé");
  expect(saved.lyrics).toBe(lyrics);
  expect(await rects(panel, panelGeometry)).toEqual(shape);
});
