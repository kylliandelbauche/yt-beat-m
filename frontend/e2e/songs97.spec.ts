import { expect, test } from "@playwright/test";
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { mkdtemp, rm, readFile, writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let original: { root: string }, root: string, beatId: string;
let headers: Record<string, string>;
const longTitle =
  "Un morceau dont le titre est particulièrement long et reste sur une seule ligne partout dans la bibliothèque";
async function create(
  request: APIRequestContext,
  title: string,
  linked = true,
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
      beat_id: linked ? beatId : null,
    },
  });
  expect(response.ok()).toBe(true);
  return response.json();
}
async function show(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Mes sons", exact: true }).click();
  await expect(page.locator(".songs-center")).toBeVisible();
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
  return panel.evaluate((root) =>
    [
      ...root.querySelectorAll<HTMLElement>(
        ".detail-header, .detail-header > button, .song-detail-title, .song-detail-cover, .song-detail-controls, .song-detail-tags, .song-dates, .song-dates small, .song-date-field, .song-added, .song-file-actions",
      ),
    ].map((el) => {
      const b = el.getBoundingClientRect(),
        css = getComputedStyle(el);
      let origin: number[] = [];
      if (el instanceof HTMLInputElement)
        origin = [
          b.x +
            parseFloat(css.paddingLeft) +
            parseFloat(css.borderLeftWidth) -
            el.scrollLeft,
          b.y + (b.height - parseFloat(css.lineHeight)) / 2,
        ];
      return [
        el.className.replace(" primary", ""),
        ...[b.x, b.y, b.width, b.height, ...origin].map(
          (n) => Math.round(n * 100) / 100,
        ),
        css.fontFamily,
        css.fontSize,
        css.lineHeight,
      ];
    }),
  );
}
test.beforeAll(async ({ request }) => {
  original = (await (await request.get("/api/library")).json()).library;
  headers = {
    Origin: "http://127.0.0.1:8767",
    "X-Session-Token": (await (await request.get("/api/session")).json()).token,
  };
  root = await mkdtemp(path.join(tmpdir(), "beat-m-songs97-"));
  expect(
    (
      await request.post("/api/library", {
        headers,
        data: { path: root, create: true, name: "Sons de test" },
      })
    ).ok(),
  ).toBe(true);
  const response = await request.post("/api/imports", {
    headers,
    data: { url: "https://youtu.be/SONGTEST001" },
  });
  const job = (await response.json()).job;
  await expect
    .poll(async () => {
      const status = (
        await (await request.get("/api/imports")).json()
      ).jobs.find((j: { id: string }) => j.id === job.id);
      beatId = status?.beat_id;
      return status?.state;
    })
    .toBe("completed");
});
test.afterAll(async ({ request }) => {
  if (original?.root)
    await request.post("/api/library", {
      headers,
      data: { path: original.root },
    });
  if (root) await rm(root, { recursive: true, force: true });
});
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

test("création MP3 obligatoire, annulation native et liens dans les deux sens", async ({
  page,
  request,
}) => {
  await show(page);
  await expect(page.getByText("Ton premier son t’attend")).toBeVisible();
  await page.route("**/api/songs/pick-file", (route) =>
    route.fulfill({ json: { selection: null } }),
  );
  const cancelled = page.waitForResponse((r) =>
    r.url().endsWith("/api/songs/pick-file"),
  );
  await page
    .locator(".song-heading")
    .getByRole("button", { name: "Ajouter un son", exact: true })
    .click();
  await cancelled;
  await expect(
    page
      .locator(".song-heading")
      .getByRole("button", { name: "Ajouter un son", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("complementary", { name: "Fiche du son", exact: true }),
  ).toHaveCount(0);
  await page.unroute("**/api/songs/pick-file");
  await page
    .locator(".song-heading")
    .getByRole("button", { name: "Ajouter un son", exact: true })
    .click();
  const panel = page.getByRole("complementary", {
    name: "Fiche du son",
    exact: true,
  });
  await expect(panel.getByLabel("Titre du son", { exact: true })).toHaveValue(
    "Morceau de test",
  );
  expect((await (await request.get("/api/songs")).json()).total).toBe(0);
  await panel.getByLabel("Titre du son", { exact: true }).fill(longTitle);
  await panel
    .getByRole("button", {
      name: "Choisir ou retirer la prod associée",
      exact: true,
    })
    .click();
  const picker = page.getByRole("dialog", {
    name: "Choisir une prod",
    exact: true,
  });
  await picker
    .getByRole("button", { name: "Prod importée de test", exact: false })
    .click();
  await expect(picker).toHaveCount(0);
  await panel
    .getByLabel("Date de création", { exact: true })
    .fill("2026-11-01");
  await panel
    .getByRole("button", { name: "Enregistrer le son", exact: true })
    .click();
  await expect(
    panel.getByRole("button", { name: "Modifier le son", exact: true }),
  ).toBeEnabled();
  await expect(
    panel.getByRole("button", { name: "Modifier le son", exact: true }),
  ).toBeFocused();
  await expect(page.locator(".song-card")).toHaveCount(1);
  const song = (await (await request.get("/api/songs")).json()).songs[0];
  expect(song.beat_id).toBe(beatId);
  expect(song.created_on).toBe("2026-11-01");
  await create(request, "Deuxième version");
  await panel
    .getByRole("button", { name: "Ouvrir la prod associée", exact: true })
    .click();
  await expect(
    page.getByLabel("Titre de la prod", { exact: true }),
  ).toHaveValue("Prod importée de test");
  await page.getByRole("button", { name: "Sons liés", exact: true }).click();
  const inverse = page.getByRole("dialog", {
    name: "Sons liés à cette prod",
    exact: true,
  });
  await expect(inverse.getByText("2 son(s)")).toBeVisible();
  await inverse.getByRole("button", { name: /Deuxième version/ }).click();
  await expect(panel.getByLabel("Titre du son", { exact: true })).toHaveValue(
    "Deuxième version",
  );
  await page.reload();
  await page.getByRole("button", { name: "Mes sons", exact: true }).click();
  await expect(page.locator(".song-card")).toHaveCount(2);
});

test("brouillon protégé, état carte immédiat et géométrie stable en erreur et succès", async ({
  page,
  request,
}) => {
  const song = await create(request, "Brouillon protégé");
  await show(page);
  const panel = await open(page, song.title);
  const geometryRead = await geometry(panel);
  const card = page.locator(".song-card").filter({
    has: page.getByRole("button", {
      name: `Détails du son ${song.title}`,
      exact: true,
    }),
  });
  await panel
    .getByRole("button", { name: "Modifier le son", exact: true })
    .click();
  expect(await geometry(panel)).toEqual(geometryRead);
  await panel
    .getByLabel("Titre du son", { exact: true })
    .fill("À ne pas enregistrer implicitement");
  await card
    .getByLabel(`État du son ${song.title}`, { exact: true })
    .selectOption("Mixage");
  const guard = page.getByRole("dialog", {
    name: "Modifications du son non enregistrées",
    exact: true,
  });
  await expect(guard).toBeVisible();
  await guard
    .getByRole("button", { name: "Continuer l’édition", exact: true })
    .click();
  await expect(guard).toHaveCount(0);
  expect(
    (await (await request.get(`/api/songs/${song.id}`)).json()).state,
  ).toBe("Topline");
  await expect(panel.getByLabel("Titre du son", { exact: true })).toHaveValue(
    "À ne pas enregistrer implicitement",
  );
  await card
    .getByLabel(`État du son ${song.title}`, { exact: true })
    .selectOption("Mixage");
  await guard
    .getByRole("button", { name: "Abandonner et continuer", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await (await request.get(`/api/songs/${song.id}`)).json()).state,
    )
    .toBe("Mixage");
  expect(
    (await (await request.get(`/api/songs/${song.id}`)).json()).title,
  ).toBe(song.title);
  await open(page, song.title);
  await panel
    .getByRole("button", { name: "Modifier le son", exact: true })
    .click();
  await panel
    .getByLabel("Titre du son", { exact: true })
    .fill("Version sauvegardée");
  const before = await geometry(panel);
  await page.route(`**/api/songs/${song.id}`, (route) =>
    route.request().method() === "PATCH"
      ? route.fulfill({
          status: 409,
          json: { detail: "Conflit simulé ; brouillon conservé." },
        })
      : route.continue(),
  );
  await panel
    .getByRole("button", { name: "Enregistrer le son", exact: true })
    .click();
  await expect(panel.getByRole("alert")).toContainText("Conflit simulé");
  expect(await geometry(panel)).toEqual(before);
  await expect(panel.getByLabel("Titre du son", { exact: true })).toHaveValue(
    "Version sauvegardée",
  );
  await page.unroute(`**/api/songs/${song.id}`);
  await panel
    .getByRole("button", { name: "Enregistrer le son", exact: true })
    .click();
  await expect(
    panel.getByRole("button", { name: "Modifier le son", exact: true }),
  ).toBeEnabled();
  expect(await geometry(panel)).toEqual(before);
  await page.setViewportSize({ width: 1024, height: 620 });
  const narrow = await geometry(panel);
  await panel
    .getByRole("button", { name: "Modifier le son", exact: true })
    .click();
  expect(await geometry(panel)).toEqual(narrow);
  await panel
    .getByRole("button", {
      name: "Annuler les modifications du son",
      exact: true,
    })
    .click();
  expect(await geometry(panel)).toEqual(narrow);
  await panel
    .getByRole("button", { name: "Afficher le fichier", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    panel.getByRole("button", { name: "Changer le fichier lié", exact: true }),
  ).toBeInViewport();
});

test("lecteur unique, navigation, filtre et sauvegarde sans reprise ni remise à zéro", async ({
  page,
  request,
}) => {
  const song = await create(request, "Audio persistant");
  await show(page);
  await page
    .getByRole("button", { name: `Écouter le son ${song.title}`, exact: true })
    .click();
  const audio = page.locator("audio");
  await expect(audio).toHaveCount(1);
  await expect(audio).toHaveJSProperty("paused", false);
  await audio.evaluate((el: HTMLAudioElement) => {
    el.pause();
    el.currentTime = 7;
    el.volume = 0.4;
    el.dataset.identity = "song-media";
  });
  await page
    .getByLabel("Rechercher un son", { exact: true })
    .fill("autre titre absent");
  await expect(page.locator(".song-card")).toHaveCount(0);
  await page
    .getByRole("button", {
      name: `Détails depuis le lecteur : ${song.title}`,
      exact: true,
    })
    .click();
  const panel = page.getByRole("complementary", {
    name: "Fiche du son",
    exact: true,
  });
  await expect(panel.getByLabel("Titre du son", { exact: true })).toHaveValue(
    song.title,
  );
  await panel
    .getByRole("button", { name: "Modifier le son", exact: true })
    .click();
  await panel
    .getByLabel("État du son dans la fiche", { exact: true })
    .selectOption("Master");
  await panel
    .getByRole("button", { name: "Enregistrer le son", exact: true })
    .click();
  await expect(
    panel.getByRole("button", { name: "Modifier le son", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Beatmakers", exact: true }).click();
  await expect(audio).toHaveAttribute("data-identity", "song-media");
  await expect(audio).toHaveJSProperty("paused", true);
  await expect(audio).toHaveJSProperty("currentTime", 7);
  await expect(audio).toHaveJSProperty("volume", 0.4);
  await panel
    .getByRole("button", { name: `Écouter le son ${song.title}`, exact: true })
    .click();
  await expect(audio).toHaveJSProperty("paused", false);
  await expect(
    panel.getByRole("button", {
      name: `Mettre en pause le son ${song.title}`,
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(audio).toHaveJSProperty("paused", true);
});

test("dispositions Paper, couverture héritée et filtres/favoris réels", async ({
  page,
  request,
}, info) => {
  const song = await create(request, "Dimensions Paper");
  await show(page);
  await page.getByLabel("Rechercher un son", { exact: true }).fill(song.title);
  await expect(page.locator(".song-card")).toHaveCount(1);
  const panel = await open(page, song.title);
  await page
    .getByRole("button", { name: "Sons en cartes horizontales", exact: true })
    .click();
  const card = page.locator(".song-card");
  expect((await card.boundingBox())!.height).toBe(136);
  expect((await page.locator(".song-card-cover").boundingBox())!.width).toBe(
    120,
  );
  expect(
    (await panel.locator(".song-detail-cover").boundingBox())!.height,
  ).toBe(152);
  const crop = await panel
    .locator(".song-detail-cover .beat-artwork")
    .evaluate((el) => {
      const r = el.getBoundingClientRect(),
        p = el.closest(".song-detail-cover")!.getBoundingClientRect();
      return [r.width, r.height, r.y - p.y];
    });
  expect(crop).toEqual([272, 272, -60]);
  expect((await card.boundingBox())!.width).toBe(368);
  expect((await card.boundingBox())!.y).toBe(172);
  await page.screenshot({ path: info.outputPath("songs-horizontal.png") });
  await page
    .getByRole("button", { name: "Sons en grandes pochettes", exact: true })
    .click();
  await page.screenshot({ path: info.outputPath("songs-covers.png") });
  const cover = (await page.locator(".song-card-cover").boundingBox())!;
  const title = (await page.locator(".song-card-title").boundingBox())!;
  expect(title.y).toBeGreaterThanOrEqual(cover.y + cover.height);
  const cardBox = (await card.boundingBox())!;
  expect(cover.width).toBe(cardBox.width - 16);
  expect(cardBox.height).toBe(cardBox.width + 124);
  await expect(card.locator("img")).toHaveAttribute(
    "src",
    `/api/beats/${beatId}/artwork`,
  );
  await card
    .getByRole("button", {
      name: `Ajouter aux favoris le son ${song.title}`,
      exact: true,
    })
    .click();
  await expect(
    card.getByRole("button", {
      name: `Retirer des favoris le son ${song.title}`,
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Favoris", exact: true }).click();
  await expect(card).toHaveCount(1);
  await page.getByLabel("Prod associée", { exact: true }).selectOption("false");
  await expect(card).toHaveCount(0);
  await page.getByLabel("Prod associée", { exact: true }).selectOption("true");
  await expect(card).toHaveCount(1);
  await panel
    .getByRole("button", { name: "Replier la fiche", exact: true })
    .click();
  await expect.poll(async () => (await card.boundingBox())!.width).toBe(344);
  expect((await card.boundingBox())!.height).toBe(468);
});

test("fichier absent, reconnexion choisie et retrait de prod conservent le morceau", async ({
  page,
  request,
}) => {
  const song = await create(request, "Fichier reconnecté");
  const source = path.join(path.dirname(original.root), "Morceau de test.mp3");
  const bytes = await readFile(source);
  try {
    await unlink(source);
    await show(page);
    await page
      .getByLabel("Rechercher un son", { exact: true })
      .fill(song.title);
    await expect(page.locator(".song-card")).toHaveCount(1);
    await expect(
      page.getByRole("button", {
        name: `Écouter le son ${song.title}`,
        exact: true,
      }),
    ).toBeDisabled();
    const panel = await open(page, song.title);
    await expect(
      panel.getByRole("button", { name: "Afficher le fichier", exact: true }),
    ).toBeDisabled();
    await expect(
      panel.getByText("Fichier indisponible · reconnecter le MP3"),
    ).toBeVisible();
    await writeFile(source, bytes);
    await panel
      .getByRole("button", { name: "Changer le fichier lié", exact: true })
      .click();
    await expect(
      panel.getByRole("button", { name: "Enregistrer le son", exact: true }),
    ).toBeEnabled();
    await panel
      .getByRole("button", {
        name: "Choisir ou retirer la prod associée",
        exact: true,
      })
      .click();
    await page
      .getByRole("dialog", { name: "Choisir une prod", exact: true })
      .getByRole("button", { name: "Aucune prod", exact: true })
      .click();
    await panel
      .getByRole("button", { name: "Enregistrer le son", exact: true })
      .click();
    await expect(
      panel.getByRole("button", { name: "Modifier le son", exact: true }),
    ).toBeEnabled();
    const updated = await (await request.get(`/api/songs/${song.id}`)).json();
    expect(updated.id).toBe(song.id);
    expect(updated.file_available).toBe(true);
    expect(updated.beat_id).toBeNull();
    await expect(
      panel.getByRole("button", {
        name: "Ouvrir la prod associée",
        exact: true,
      }),
    ).toBeDisabled();
    expect(await readFile(source)).toEqual(bytes);
  } finally {
    await writeFile(source, bytes);
  }
});

test("liste paginée, relance après erreur et navigation au clavier", async ({
  page,
  request,
}) => {
  for (let index = 0; index < 50; index++)
    await create(request, `Pagination ${index}`, false);
  await page.route("**/api/songs?*", (route) =>
    route.fulfill({
      status: 503,
      json: { detail: "Liste temporairement indisponible" },
    }),
  );
  await show(page);
  await expect(page.locator(".song-feedback")).toContainText(
    "Liste temporairement indisponible",
  );
  await page.unroute("**/api/songs?*");
  await page
    .locator(".song-feedback")
    .getByRole("button", { name: "Réessayer", exact: true })
    .click();
  await page
    .getByLabel("Rechercher un son", { exact: true })
    .fill("Pagination");
  await expect(page.locator(".song-card")).toHaveCount(48);
  await page
    .getByRole("button", { name: "Afficher plus de sons", exact: true })
    .click();
  await expect(page.locator(".song-card")).toHaveCount(50);
  await page
    .getByRole("button", { name: "Sons en cartes horizontales", exact: true })
    .click();
  const play = page.locator(".song-card-cover").first();
  await play.focus();
  await play.press("Enter");
  await expect(page.locator("audio")).toHaveJSProperty("paused", false);
  const title = page.locator(".song-card-title").first();
  await title.focus();
  await title.press("Enter");
  await expect(
    page.getByRole("complementary", { name: "Fiche du son", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(title).toBeFocused();
});

test("action carte en attente, erreur relançable et ancienne fiche rechargée sans écraser le brouillon", async ({
  page,
  request,
}) => {
  const song = await create(request, "Concurrence contrôlée");
  await show(page);
  const panel = await open(page, song.title);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let fail = true;
  await page.route(`**/api/songs/${song.id}`, async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    await gate;
    if (fail)
      return route.fulfill({
        status: 503,
        json: { detail: "État non enregistré" },
      });
    return route.continue();
  });
  await page
    .getByLabel(`État du son ${song.title}`, { exact: true })
    .selectOption("Out");
  await expect(
    panel.getByRole("button", { name: "Modifier le son", exact: true }),
  ).toBeDisabled();
  release();
  await expect(page.locator(".song-feedback")).toContainText(
    "État non enregistré",
  );
  await expect(
    page.getByLabel(`État du son ${song.title}`, { exact: true }),
  ).toHaveValue("Topline");
  fail = false;
  await page
    .locator(".song-feedback")
    .getByRole("button", { name: "Réessayer", exact: true })
    .click();
  await expect(
    page.getByLabel(`État du son ${song.title}`, { exact: true }),
  ).toHaveValue("Out");
  await page.unroute(`**/api/songs/${song.id}`);
  await panel
    .getByRole("button", { name: "Modifier le son", exact: true })
    .click();
  await panel
    .getByLabel("Titre du son", { exact: true })
    .fill("Brouillon local");
  const current = await (await request.get(`/api/songs/${song.id}`)).json();
  expect(
    (
      await request.patch(`/api/songs/${song.id}`, {
        headers,
        data: { expected_revision: current.revision, title: "Autre fenêtre" },
      })
    ).ok(),
  ).toBe(true);
  await panel
    .getByRole("button", { name: "Enregistrer le son", exact: true })
    .click();
  await expect(panel.getByRole("alert")).toContainText("Ce morceau a changé");
  await expect(panel.getByLabel("Titre du son", { exact: true })).toHaveValue(
    "Brouillon local",
  );
  await panel
    .getByRole("button", { name: "Recharger la fiche", exact: true })
    .click();
  await page
    .getByRole("dialog", {
      name: "Modifications du son non enregistrées",
      exact: true,
    })
    .getByRole("button", { name: "Abandonner et continuer", exact: true })
    .click();
  await expect(panel.getByLabel("Titre du son", { exact: true })).toHaveValue(
    "Autre fenêtre",
  );
});

test("erreur audio du son visible et reprise réelle depuis la bibliothèque", async ({
  page,
  request,
}) => {
  const song = await create(request, "Reprise du morceau");
  await page.route(`**/api/songs/${song.id}/audio`, (route) =>
    route.fulfill({ status: 404, json: { detail: "Fichier indisponible" } }),
  );
  await show(page);
  await page
    .getByRole("button", { name: `Écouter le son ${song.title}`, exact: true })
    .click();
  await expect(page.locator(".song-feedback")).toContainText(
    "Fichier audio indisponible",
  );
  await expect(page.locator("audio")).toHaveJSProperty("paused", true);
  await page.unroute(`**/api/songs/${song.id}/audio`);
  await page
    .locator(".song-feedback")
    .getByRole("button", { name: "Réessayer", exact: true })
    .click();
  await expect(page.locator("audio")).toHaveJSProperty("paused", false);
  await expect(page.locator(".song-feedback")).not.toContainText(
    "Fichier audio indisponible",
  );
});
