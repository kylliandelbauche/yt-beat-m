import { expect, test } from "@playwright/test";
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Song } from "../src/song";

let original: string, root: string, beatId: string, secondBeat: string;
let headers: Record<string, string>;
async function create(
  request: APIRequestContext,
  title: string,
  beat = beatId,
) {
  const selection = (
    await (await request.post("/api/songs/pick-file", { headers })).json()
  ).selection;
  const response = await request.post("/api/songs", {
    headers,
    data: {
      title,
      state: "Topline",
      selection_id: selection.selection_id,
      beat_id: beat,
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
function image(panel: Locator) {
  return panel.locator(".song-detail-cover img");
}
async function menu(page: Page, panel: Locator) {
  await panel
    .getByRole("button", { name: "Changer la pochette du son", exact: true })
    .click();
  return page.getByRole("menu", { name: "Pochette du son", exact: true });
}
async function pick(page: Page, panel: Locator) {
  await (await menu(page, panel))
    .getByRole("menuitemradio", { name: "Choisir une image…", exact: true })
    .click();
  await expect(image(panel)).toHaveAttribute("src", /^data:image\/png;base64,/);
}
async function save(panel: Locator) {
  await panel
    .getByRole("button", { name: "Enregistrer le son", exact: true })
    .click();
  await expect(
    panel.getByRole("button", { name: "Modifier le son", exact: true }),
  ).toBeEnabled();
}
async function rects(panel: Locator) {
  return panel
    .locator(
      ".detail-header,.detail-header > button,.song-detail-title,.song-detail-cover,.song-cover-change,.song-detail-controls,.song-detail-tags,.song-dates,.song-file-actions",
    )
    .evaluateAll((es) =>
      es.map((e) => {
        const r = e.getBoundingClientRect();
        return [r.x, r.y, r.width, r.height].map(
          (n) => Math.round(n * 100) / 100,
        );
      }),
    );
}
test.beforeEach(async ({ request, page }) => {
  original = (await (await request.get("/api/library")).json()).library.root;
  headers = {
    Origin: "http://127.0.0.1:8767",
    "X-Session-Token": (await (await request.get("/api/session")).json()).token,
  };
  root = await mkdtemp(path.join(tmpdir(), "beat-m-cover100-"));
  expect(
    (
      await request.post("/api/library", {
        headers,
        data: { path: root, create: true, name: "Pochettes de test" },
      })
    ).ok(),
  ).toBe(true);
  const beats = [];
  for (const id of ["COVERTEST01", "COVERTEST02"]) {
    const job = (
      await (
        await request.post("/api/imports", {
          headers,
          data: { url: `https://youtu.be/${id}` },
        })
      ).json()
    ).job;
    await expect
      .poll(
        async () =>
          (await (await request.get("/api/imports")).json()).jobs.find(
            (j: { id: string }) => j.id === job.id,
          )?.state,
      )
      .toBe("completed");
    beats.push(
      (await (await request.get("/api/imports")).json()).jobs.find(
        (j: { id: string }) => j.id === job.id,
      ).beat_id,
    );
  }
  [beatId, secondBeat] = beats;
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
  test(`aperçu, menu clavier, annulation et géométrie constante à ${width}`, async ({
    page,
    request,
  }, info) => {
    const song = await create(request, "Pochette à choisir");
    await page.setViewportSize({ width, height });
    const panel = await open(page, song.title),
      before = await rects(panel);
    const button = panel.getByRole("button", {
      name: "Changer la pochette du son",
      exact: true,
    });
    await expect(button).toHaveCSS("width", "32px");
    await expect(button).toHaveCSS("height", "32px");
    await expect(button).toHaveCSS("border-radius", "7px");
    let popup = await menu(page, panel);
    await expect(
      popup.getByRole("menuitemradio", { name: "Choisir une image…" }),
    ).toBeFocused();
    await expect(
      popup.getByRole("menuitemradio", { name: "Image de la prod" }),
    ).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("ArrowDown");
    await expect(
      popup.getByRole("menuitemradio", { name: "Image de la prod" }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(button).toBeFocused();
    await expect(panel).toBeVisible();
    // Cancelling the native chooser preserves mode and the whole draft.
    await page.route("**/api/songs/pick-cover", (route) =>
      route.fulfill({ json: { image: null } }),
    );
    popup = await menu(page, panel);
    await popup
      .getByRole("menuitemradio", { name: "Choisir une image…" })
      .click();
    await expect(button).toBeEnabled();
    await expect(
      panel.getByRole("button", { name: "Modifier le son", exact: true }),
    ).toBeVisible();
    await expect(image(panel)).toHaveAttribute("src", song.artwork_url!);
    await page.unroute("**/api/songs/pick-cover");
    await pick(page, panel);
    await expect(button).toBeFocused();
    expect(await rects(panel)).toEqual(before);
    expect(
      (await (await request.get(`/api/songs/${song.id}`)).json()).cover_source,
    ).toBe("prod");
    await page.screenshot({
      path: info.outputPath(`cover-preview-${width}.png`),
    });
    await panel
      .getByRole("button", {
        name: "Annuler les modifications du son",
        exact: true,
      })
      .click();
    await expect(image(panel)).toHaveAttribute("src", song.artwork_url!);
    expect(await rects(panel)).toEqual(before);
    await pick(page, panel);
    await save(panel);
    await expect(image(panel)).toHaveAttribute(
      "src",
      new RegExp(`/api/songs/${song.id}/artwork`),
    );
    expect(await rects(panel)).toEqual(before);
    popup = await menu(page, panel);
    await expect(
      popup.getByRole("menuitemradio", { name: "Choisir une image…" }),
    ).toHaveAttribute("aria-checked", "true");
    await page.screenshot({ path: info.outputPath(`cover-menu-${width}.png`) });
    await page.keyboard.press("Escape");
  });
}

test("Save commun, attente/erreur/réessai et lecteur inchangé avec les deux cartes", async ({
  page,
  request,
}) => {
  const song = await create(request, "Pochette et lecteur");
  const panel = await open(page, song.title),
    before = await rects(panel);
  await panel
    .getByRole("button", { name: `Écouter le son ${song.title}`, exact: true })
    .click();
  await expect
    .poll(() =>
      page.locator("audio").evaluate((e: HTMLAudioElement) => !e.paused),
    )
    .toBe(true);
  await page.evaluate(() => {
    const media = document.querySelector("audio")!;
    (window as unknown as { originalAudio: HTMLAudioElement }).originalAudio =
      media;
    media.currentTime = 4;
    media.volume = 0.37;
  });
  await pick(page, panel);
  await panel
    .getByLabel("Titre du son", { exact: true })
    .fill("Titre et image ensemble");
  const playerImage = page.locator(".local-player img");
  await expect(playerImage).toHaveAttribute("src", song.artwork_url!);
  let release: () => void = () => {};
  const pendingSave = new Promise<void>((resolve) => {
    release = resolve;
  });
  let first = true;
  await page.route(`**/api/songs/${song.id}`, async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    if (first) {
      first = false;
      await pendingSave;
      await route.fulfill({
        status: 400,
        json: { detail: "Échec simulé : réessayer." },
      });
    } else await route.continue();
  });
  await panel
    .getByRole("button", { name: "Enregistrer le son", exact: true })
    .click();
  await expect(
    panel.getByRole("button", { name: "Enregistrer le son", exact: true }),
  ).toBeDisabled();
  expect(await rects(panel)).toEqual(before);
  release();
  await expect(panel.getByRole("alert")).toContainText("Échec simulé");
  expect(await rects(panel)).toEqual(before);
  await expect(image(panel)).toHaveAttribute("src", /^data:/);
  expect(
    (await (await request.get(`/api/songs/${song.id}`)).json()).cover_source,
  ).toBe("prod");
  await save(panel);
  const saved = (await (
    await request.get(`/api/songs/${song.id}`)
  ).json()) as Song;
  expect(saved.title).toBe("Titre et image ensemble");
  await expect(playerImage).toHaveAttribute("src", saved.artwork_url!);
  const card = page.locator(".song-card").filter({
    has: page.getByRole("button", {
      name: `Détails du son ${saved.title}`,
      exact: true,
    }),
  });
  await expect(card.locator("img")).toHaveAttribute("src", saved.artwork_url!);
  await page
    .getByRole("button", { name: "Sons en grandes pochettes", exact: true })
    .click();
  await expect(card.locator("img")).toHaveAttribute("src", saved.artwork_url!);
  const audio = await page.evaluate(() => {
    const media = document.querySelector("audio")!;
    return {
      same:
        media ===
        (window as unknown as { originalAudio: HTMLAudioElement })
          .originalAudio,
      time: media.currentTime,
      paused: media.paused,
      volume: media.volume,
    };
  });
  expect(audio.same).toBe(true);
  expect(audio.time).toBeGreaterThan(4);
  expect(audio.paused).toBe(false);
  expect(audio.volume).toBe(0.37);
  await page.reload();
  await page.getByRole("button", { name: "Mes sons", exact: true }).click();
  await page
    .getByRole("button", { name: `Détails du son ${saved.title}`, exact: true })
    .click();
  await expect(
    image(
      page.getByRole("complementary", { name: "Fiche du son", exact: true }),
    ),
  ).toHaveAttribute("src", saved.artwork_url!);
});

test("source personnelle conservée au changement de prod, héritage et repli neutre", async ({
  page,
  request,
}) => {
  const song = await create(request, "Sources de pochette");
  const panel = await open(page, song.title);
  await pick(page, panel);
  await save(panel);
  const chosen = await image(panel).getAttribute("src");
  await panel
    .getByRole("button", { name: "Modifier le son", exact: true })
    .click();
  await panel
    .getByRole("button", {
      name: "Choisir ou retirer la prod associée",
      exact: true,
    })
    .click();
  const prodDialog = page.getByRole("dialog", {
    name: "Choisir une prod",
    exact: true,
  });
  await expect(prodDialog).toBeVisible();
  // The fixture prods intentionally share a title; IDs distinguish their entities.
  await expect(prodDialog.locator(".relation-row img")).toHaveCount(2);
  await prodDialog
    .locator('.relation-row[aria-pressed="false"]')
    .filter({ has: page.locator("img") })
    .click();
  await expect(prodDialog).not.toBeVisible();
  await expect(image(panel)).toHaveAttribute("src", chosen!);
  await save(panel);
  let saved = (await (
    await request.get(`/api/songs/${song.id}`)
  ).json()) as Song;
  expect(saved.beat_id).toBe(secondBeat);
  await (await menu(page, panel))
    .getByRole("menuitemradio", { name: "Image de la prod", exact: true })
    .click();
  await expect(image(panel)).toHaveAttribute("src", saved.beat_artwork_url!);
  await panel
    .getByRole("button", {
      name: "Annuler les modifications du son",
      exact: true,
    })
    .click();
  await expect(image(panel)).toHaveAttribute("src", saved.artwork_url!);
  await (await menu(page, panel))
    .getByRole("menuitemradio", { name: "Image de la prod", exact: true })
    .click();
  await save(panel);
  saved = (await (await request.get(`/api/songs/${song.id}`)).json()) as Song;
  expect(saved.cover_source).toBe("prod");
  await panel
    .getByRole("button", { name: "Modifier le son", exact: true })
    .click();
  await panel
    .getByRole("button", {
      name: "Choisir ou retirer la prod associée",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Aucune prod", exact: true }).click();
  await expect(image(panel)).toHaveCount(0);
  await save(panel);
  expect(
    (await (await request.get(`/api/songs/${song.id}`)).json()).artwork_url,
  ).toBeNull();
});

test("erreur de sélection stable et protection d’un brouillon de pochette seule", async ({
  page,
  request,
}) => {
  const song = await create(request, "Erreur de pochette");
  await create(request, "Autre son");
  const panel = await open(page, song.title),
    before = await rects(panel);
  await page.route("**/api/songs/pick-cover", (route) =>
    route.fulfill({
      status: 400,
      json: { detail: "Pochette : JPEG ou PNG de 2 Mo maximum." },
    }),
  );
  await (await menu(page, panel))
    .getByRole("menuitemradio", { name: "Choisir une image…" })
    .click();
  await expect(panel.getByRole("alert")).toContainText("2 Mo");
  expect(await rects(panel)).toEqual(before);
  await expect(image(panel)).toHaveAttribute("src", song.artwork_url!);
  await page.unroute("**/api/songs/pick-cover");
  await pick(page, panel);
  await page
    .getByRole("button", { name: "Détails du son Autre son", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", {
      name: "Modifications du son non enregistrées",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Continuer l’édition", exact: true })
    .click();
  await expect(image(panel)).toHaveAttribute("src", /^data:/);
  await panel
    .getByRole("button", {
      name: "Annuler les modifications du son",
      exact: true,
    })
    .click();
  expect(
    (await (await request.get(`/api/songs/${song.id}`)).json()).cover_source,
  ).toBe("prod");
});
