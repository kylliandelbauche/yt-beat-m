import { expect, test } from "@playwright/test";
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { CatalogTag, Song } from "../src/song";

let original: string, root: string, beatA: string, beatB: string;
let headers: Record<string, string>;
let catalog: Record<string, CatalogTag>;
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
      ...fields,
    },
  });
  expect(response.ok()).toBe(true);
  return response.json() as Promise<Song>;
}
async function show(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Mes sons", exact: true }).click();
  await page.evaluate(() => document.fonts.ready);
}
async function open(page: Page, title: string) {
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
  return panel;
}
async function geometry(panel: Locator) {
  return panel
    .locator(
      ".detail-header,.detail-header > button,.song-detail-title,.song-detail-cover,.song-detail-controls,.song-detail-tags,.song-detail-tags > div,.song-add-tag,.song-dates,.song-added,.song-file-actions",
    )
    .evaluateAll((els) =>
      els.map((el) => {
        const b = el.getBoundingClientRect();
        return [b.x, b.y, b.width, b.height].map(
          (n) => Math.round(n * 100) / 100,
        );
      }),
    );
}
async function settings(page: Page) {
  await page.getByRole("button", { name: "Réglages", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Réglages", exact: true });
  await modal.getByRole("button", { name: "Tags", exact: true }).click();
  return modal;
}
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
  root = await mkdtemp(path.join(tmpdir(), "beat-m-tags98-"));
  expect(
    (
      await request.post("/api/library", {
        headers,
        data: { path: root, create: true, name: "Tags de test" },
      })
    ).ok(),
  ).toBe(true);
  for (const [video, title, labels] of [
    ["SONGTAGS001", "Prod A", ["Commun", "Été", "RnB"]],
    ["SONGTAGS002", "Prod B", ["RnB", "Autre"]],
  ] as const) {
    const job = (
      await (
        await request.post("/api/imports", {
          headers,
          data: { url: `https://youtu.be/${video}` },
        })
      ).json()
    ).job;
    let beat = "";
    await expect
      .poll(async () => {
        const status = (
          await (await request.get("/api/imports")).json()
        ).jobs.find((j: { id: string }) => j.id === job.id);
        beat = status?.beat_id;
        return status?.state;
      })
      .toBe("completed");
    expect(
      (
        await request.patch(`/api/beats/${beat}/metadata`, {
          headers,
          data: { title, tags: labels },
        })
      ).ok(),
    ).toBe(true);
    if (title === "Prod A") beatA = beat;
    else beatB = beat;
  }
  catalog = Object.fromEntries(
    (await (await request.get("/api/catalog/tags")).json()).tags.map(
      (t: CatalogTag) => [t.label, t],
    ),
  );
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
  test(`brouillon unique, annulation sans orphelin, attente et géométrie fixe à ${width}`, async ({
    page,
    request,
  }, info) => {
    const song = await create(request, "Voix", {
      beat_id: beatA,
      tag_ids: [catalog.Commun.id],
      new_tags: ["Direct"],
    });
    await page.setViewportSize({ width, height });
    await show(page);
    const panel = await open(page, song.title);
    const group = panel.locator(".song-detail-tags");
    await expect(group.locator(".song-tag", { hasText: "Commun" })).toHaveCount(
      1,
    );
    await expect(group.getByText("Prod + son", { exact: true })).toBeVisible();
    const plus = panel.getByRole("button", {
      name: "Choisir les tags du son",
      exact: true,
    });
    const before = await geometry(panel);
    await plus.click();
    let picker = page.getByRole("dialog", {
      name: "Choisir les tags du son",
      exact: true,
    });
    await picker.getByRole("searchbox").fill("Annulé");
    await picker
      .getByRole("button", { name: "Créer « Annulé »", exact: true })
      .click();
    await expect(
      picker.getByRole("checkbox", { name: "Annulé", exact: true }),
    ).toBeChecked();
    await page.keyboard.press("Escape");
    await expect(plus).toBeFocused();
    expect(await geometry(panel)).toEqual(before);
    expect(
      (await (await request.get("/api/catalog/tags")).json()).tags.some(
        (t: CatalogTag) => t.label === "Annulé",
      ),
    ).toBe(false);
    await panel
      .getByRole("button", {
        name: "Annuler les modifications du son",
        exact: true,
      })
      .click();
    expect(await geometry(panel)).toEqual(before);
    await expect(group.getByText("Annulé", { exact: true })).toHaveCount(0);
    await plus.click();
    picker = page.getByRole("dialog", {
      name: "Choisir les tags du son",
      exact: true,
    });
    await picker.getByRole("searchbox").fill("Commun");
    await picker
      .getByRole("checkbox", { name: "Commun", exact: true })
      .uncheck();
    await picker.getByRole("searchbox").fill("Enregistré");
    await picker
      .getByRole("button", { name: "Créer « Enregistré »", exact: true })
      .click();
    await page.keyboard.press("Escape");
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(`**/api/songs/${song.id}`, async (route) => {
      if (route.request().method() === "PATCH") await pending;
      await route.continue();
    });
    const saveButton = panel.getByRole("button", {
      name: "Enregistrer le son",
      exact: true,
    });
    await saveButton.click();
    await expect(saveButton).toBeDisabled();
    expect(await geometry(panel)).toEqual(before);
    release();
    await expect(
      panel.getByRole("button", { name: "Modifier le son", exact: true }),
    ).toBeEnabled();
    await expect(
      panel.getByRole("button", { name: "Modifier le son", exact: true }),
    ).toBeFocused();
    expect(await geometry(panel)).toEqual(before);
    const saved: Song = await (
      await request.get(`/api/songs/${song.id}`)
    ).json();
    expect(saved.tags.find((t) => t.label === "Commun")?.direct).toBe(false);
    expect(saved.tags.some((t) => t.label === "Enregistré" && t.direct)).toBe(
      true,
    );
    await panel.screenshot({ path: info.outputPath(`song-tags-${width}.png`) });
  });
}

test("union sur cartes, recherche et filtre combinés préservent le lecteur", async ({
  page,
  request,
}) => {
  await create(request, "Alpha", {
    beat_id: beatA,
    tag_ids: [catalog.Commun.id],
    new_tags: ["Voix"],
  });
  await create(request, "Beta", { new_tags: ["Solo"] });
  await create(request, "Sans tags");
  await show(page);
  const card = page.locator(".song-card").filter({
    has: page.getByRole("button", {
      name: "Détails du son Alpha",
      exact: true,
    }),
  });
  await expect(card.locator(".song-tag", { hasText: "Commun" })).toHaveCount(1);
  await card
    .getByRole("button", { name: "Écouter le son Alpha", exact: true })
    .click();
  const audio = page.locator("audio");
  await expect(audio).toHaveJSProperty("paused", false);
  await audio.evaluate((a: HTMLAudioElement) => {
    a.dataset.identity = "tags98";
    a.currentTime = 7;
    a.volume = 0.3;
  });
  await page
    .getByRole("button", { name: "Filtrer les sons par tags", exact: true })
    .click();
  let filter = page.getByRole("dialog", {
    name: "Filtrer les sons par tags",
    exact: true,
  });
  await filter.getByRole("checkbox", { name: "Commun", exact: true }).check();
  await page.keyboard.press("Escape");
  await expect(page.locator(".song-card")).toHaveCount(1);
  await page
    .getByRole("textbox", { name: "Rechercher un son", exact: true })
    .fill("ete voix");
  await expect(page.locator(".song-card")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Sons en cartes horizontales", exact: true })
    .click();
  await expect(card.locator(".song-tag")).toHaveCount(4);
  await page
    .getByRole("button", { name: "Filtrer les sons par tags", exact: true })
    .click();
  filter = page.getByRole("dialog", {
    name: "Filtrer les sons par tags",
    exact: true,
  });
  await filter.getByRole("checkbox", { name: "Commun", exact: true }).uncheck();
  await filter.getByRole("checkbox", { name: "Sans tag", exact: true }).check();
  await page.keyboard.press("Escape");
  await page
    .getByRole("textbox", { name: "Rechercher un son", exact: true })
    .fill("");
  await expect(page.locator(".song-card")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Détails du son Sans tags", exact: true }),
  ).toBeVisible();
  await expect(audio).toHaveAttribute("data-identity", "tags98");
  await expect(audio).toHaveJSProperty("paused", false);
  await expect(audio).toHaveJSProperty("volume", 0.3);
  expect(
    await audio.evaluate((a: HTMLAudioElement) => a.currentTime),
  ).toBeGreaterThanOrEqual(7);
});

test("changer/retirer la prod renouvelle les tags hérités sans perdre les directs", async ({
  page,
  request,
}) => {
  const song = await create(request, "Relation", {
    beat_id: beatA,
    tag_ids: [catalog.Commun.id],
    new_tags: ["Direct"],
  });
  await show(page);
  const panel = await open(page, song.title);
  await panel
    .getByRole("button", { name: "Modifier le son", exact: true })
    .click();
  await panel
    .getByRole("button", {
      name: "Choisir ou retirer la prod associée",
      exact: true,
    })
    .click();
  let picker = page.getByRole("dialog", {
    name: "Choisir une prod",
    exact: true,
  });
  await picker.getByRole("button", { name: "Prod B", exact: false }).click();
  await expect(
    panel
      .getByLabel("Tags liés à la prod", { exact: true })
      .getByText("Autre", { exact: true }),
  ).toBeVisible();
  await expect(
    panel
      .getByLabel("Tags ajoutés au son", { exact: true })
      .getByText("Commun", { exact: true }),
  ).toBeVisible();
  await save(panel);
  let saved: Song = await (await request.get(`/api/songs/${song.id}`)).json();
  expect(saved.beat_id).toBe(beatB);
  expect(saved.tags.map((t) => t.label).sort()).toEqual([
    "Autre",
    "Commun",
    "Direct",
    "RnB",
  ]);
  await panel
    .getByRole("button", { name: "Modifier le son", exact: true })
    .click();
  await panel
    .getByRole("button", {
      name: "Choisir ou retirer la prod associée",
      exact: true,
    })
    .click();
  picker = page.getByRole("dialog", { name: "Choisir une prod", exact: true });
  await picker
    .getByRole("button", { name: "Aucune prod", exact: true })
    .click();
  await save(panel);
  saved = await (await request.get(`/api/songs/${song.id}`)).json();
  expect(saved.tags.map((t) => t.label)).toEqual(["Commun", "Direct"]);
  await panel
    .getByRole("button", { name: "Modifier le son", exact: true })
    .click();
  await panel
    .getByRole("button", {
      name: "Choisir ou retirer la prod associée",
      exact: true,
    })
    .click();
  await page
    .getByRole("dialog", { name: "Choisir une prod", exact: true })
    .getByRole("button", { name: "Prod A", exact: false })
    .click();
  await panel
    .getByRole("button", {
      name: "Annuler les modifications du son",
      exact: true,
    })
    .click();
  await expect(
    panel.getByLabel("Tags liés à la prod", { exact: true }),
  ).toHaveText("Aucun tag lié");
});

test("réglages globaux actualisent la lecture ; un ancien brouillon ne rétablit pas un tag supprimé", async ({
  page,
  request,
}) => {
  const song = await create(request, "Ancien brouillon", {
    beat_id: beatA,
    tag_ids: [catalog.Commun.id],
    new_tags: ["Direct"],
  });
  await show(page);
  const panel = await open(page, song.title);
  let modal = await settings(page);
  await modal
    .getByRole("button", { name: "Renommer Commun", exact: true })
    .click();
  await modal
    .getByRole("textbox", { name: "Nom du tag", exact: true })
    .fill("Renommé");
  await modal
    .getByRole("button", { name: "Enregistrer le tag Commun", exact: true })
    .click();
  await expect(modal.getByText("Tag renommé.", { exact: true })).toBeVisible();
  await modal
    .getByRole("button", { name: "Fermer les réglages", exact: true })
    .click();
  await expect(
    panel.locator(".song-tag").filter({ hasText: "Renommé" }),
  ).toHaveCount(1);
  await panel
    .getByRole("button", { name: "Choisir les tags du son", exact: true })
    .click();
  let picker = page.getByRole("dialog", {
    name: "Choisir les tags du son",
    exact: true,
  });
  await picker.getByRole("searchbox").fill("Inédit");
  await picker
    .getByRole("button", { name: "Créer « Inédit »", exact: true })
    .click();
  await page.keyboard.press("Escape");
  modal = await settings(page);
  await modal
    .getByRole("button", { name: "Supprimer Renommé", exact: true })
    .click();
  await modal.getByRole("button", { name: "Supprimer", exact: true }).click();
  await expect(modal.getByText("Tag supprimé.", { exact: true })).toBeVisible();
  await modal
    .getByRole("button", { name: "Fermer les réglages", exact: true })
    .click();
  await panel
    .getByRole("button", { name: "Enregistrer le son", exact: true })
    .click();
  await expect(panel.getByRole("alert")).toContainText("supprimé");
  expect(
    (await (await request.get("/api/catalog/tags")).json()).tags.some(
      (t: CatalogTag) => t.label === "Inédit",
    ),
  ).toBe(false);
  await panel
    .getByRole("button", { name: "Choisir les tags du son", exact: true })
    .click();
  picker = page.getByRole("dialog", {
    name: "Choisir les tags du son",
    exact: true,
  });
  await picker
    .getByRole("checkbox", { name: "Renommé · supprimé", exact: true })
    .uncheck();
  await page.keyboard.press("Escape");
  await save(panel);
  const result: Song = await (
    await request.get(`/api/songs/${song.id}`)
  ).json();
  expect(result.tags.map((t) => t.label).sort()).toEqual([
    "Direct",
    "Inédit",
    "RnB",
    "Été",
  ]);
  expect((await request.get(result.audio_url)).ok()).toBe(true);
});
