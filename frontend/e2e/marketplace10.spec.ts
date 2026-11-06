import { expect, test } from "@playwright/test";
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let original: string, root: string, beat: string;
let headers: Record<string, string>;
async function detail(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", {
      name: "Détails de Prod marché de test",
      exact: true,
    })
    .click();
  const panel = page.getByRole("region", {
    name: "Prod marché de test",
    exact: true,
  });
  await expect(panel.getByLabel("BPM", { exact: true })).toHaveValue("150");
  await page
    .getByRole("complementary", { name: "Volet de la prod", exact: true })
    .scrollIntoViewIfNeeded();
  await page.evaluate(() => document.fonts.ready);
  return panel;
}
async function lookup(page: Page) {
  await page
    .getByRole("button", {
      name: "Compléter depuis la page de vente",
      exact: true,
    })
    .click();
  return page.getByRole("dialog", {
    name: "Informations de la page de vente",
    exact: true,
  });
}
async function data(request: APIRequestContext) {
  return await (await request.get(`/api/beats/${beat}`)).json();
}
async function geometry(
  root: Locator,
  selector = ".detail-header,.detail-header > button,.detail-title,.cover-block,.detail-links,.detail-rail",
) {
  return root.locator(selector).evaluateAll((es) =>
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
  root = await mkdtemp(path.join(tmpdir(), "beat-m-market10-"));
  expect(
    (
      await request.post("/api/library", {
        headers,
        data: { path: root, create: true, name: "Boutiques de test" },
      })
    ).ok(),
  ).toBe(true);
  const job = (
    await (
      await request.post("/api/imports", {
        headers,
        data: { url: "https://youtu.be/MARKETTEST1" },
      })
    ).json()
  ).job;
  await expect
    .poll(async () => {
      const state = (
        await (await request.get("/api/imports")).json()
      ).jobs.find((j: { id: string }) => j.id === job.id);
      beat = state?.beat_id;
      return state?.state;
    })
    .toBe("completed");
  await expect
    .poll(async () => (await data(request)).marketplace.state)
    .toBe("ready");
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
  test(`propositions en brouillon, annulation et Save fixes à ${width}`, async ({
    page,
    request,
  }, info) => {
    await request.patch(`/api/beats/${beat}/metadata`, {
      headers,
      data: { bpm: 150, musical_key: "Ab minor" },
    });
    await page.setViewportSize({ width, height });
    const panel = await detail(page),
      before = await geometry(panel);
    let modal = await lookup(page);
    await expect(modal).toContainText("24 juin 2026");
    await expect(modal).toContainText("La date YouTube reste inchangée");
    await modal
      .getByRole("checkbox", {
        name: "Utiliser Tonalité : F minor",
        exact: true,
      })
      .check();
    await modal
      .getByRole("checkbox", {
        name: "Utiliser Tags : Triste · Piano",
        exact: true,
      })
      .check();
    await page.screenshot({
      path: info.outputPath(`marketplace-${width}.png`),
    });
    await modal
      .getByRole("button", { name: "Utiliser la sélection", exact: true })
      .click();
    await expect(modal).not.toBeVisible();
    await expect(
      panel.getByRole("button", { name: "Tonalité : F minor", exact: true }),
    ).toBeVisible();
    expect((await data(request)).musical_key).toBe("Ab minor");
    expect(await geometry(panel)).toEqual(before);
    await panel
      .getByRole("button", { name: "Annuler les modifications", exact: true })
      .click();
    await expect(
      panel.getByRole("button", { name: "Tonalité : Ab minor", exact: true }),
    ).toBeVisible();
    modal = await lookup(page);
    await modal
      .getByRole("checkbox", {
        name: "Utiliser Tonalité : F minor",
        exact: true,
      })
      .check();
    await modal
      .getByRole("checkbox", {
        name: "Utiliser Tags : Triste · Piano",
        exact: true,
      })
      .check();
    await modal
      .getByRole("button", { name: "Utiliser la sélection", exact: true })
      .click();
    await panel
      .getByRole("button", {
        name: "Enregistrer les modifications",
        exact: true,
      })
      .click();
    await expect(
      panel.getByRole("button", { name: "Modifier la prod", exact: true }),
    ).toBeEnabled();
    const saved = await data(request);
    expect(saved.musical_key).toBe("F minor");
    expect(saved.tags).toEqual(["Triste", "Piano"]);
    expect(saved.metadata_provenance.musical_key).toBe("manual");
    expect(
      saved.metadata_provenance.marketplace_accepted.musical_key.sources[0]
        .source,
    ).toBe("Jake B");
    expect(saved.published_on).toBe("2026-01-01");
    expect(await geometry(panel)).toEqual(before);
    await page.reload();
    await page
      .getByRole("button", {
        name: "Détails de Prod marché de test",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("button", { name: "Tonalité : F minor", exact: true }),
    ).toBeVisible();
  });
}

test("champs manquants complétés, lien direct et cache sans relire la boutique", async ({
  page,
  request,
}) => {
  const saved = await data(request);
  expect(saved.bpm).toBe(150);
  expect(saved.musical_key).toBe("F minor");
  expect(saved.tags).toEqual([]);
  expect(saved.metadata_provenance.bpm).toBe("marketplace");
  const panel = await detail(page);
  await expect(
    panel.getByRole("link", { name: "Page de vente", exact: true }),
  ).toHaveAttribute(
    "href",
    "https://jakebmusic.com/produit/prod-marche-de-test/",
  );
  let posts = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/enrichment") && r.method() === "POST") posts++;
  });
  const modal = await lookup(page);
  await expect(
    modal.getByRole("checkbox", { name: "Utiliser BPM : 150", exact: true }),
  ).toBeDisabled();
  await expect(modal).toContainText("Déjà présent");
  await modal
    .getByRole("button", {
      name: "Fermer les informations de vente",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Compléter depuis la page de vente",
      exact: true,
    }),
  ).toBeFocused();
  expect(posts).toBe(0);
});

test("lecture et brouillon préservés, erreur de relecture et fenêtre stable", async ({
  page,
  request,
}) => {
  const panel = await detail(page);
  await page
    .getByRole("button", { name: "Écouter Prod marché de test", exact: true })
    .first()
    .click();
  await expect
    .poll(() =>
      page.locator("audio").evaluate((e: HTMLAudioElement) => !e.paused),
    )
    .toBe(true);
  await page.evaluate(() => {
    const media = document.querySelector("audio")!;
    (window as unknown as { oldAudio: HTMLAudioElement }).oldAudio = media;
    media.currentTime = 3;
    media.volume = 0.42;
  });
  await panel
    .getByRole("button", { name: "Modifier la prod", exact: true })
    .click();
  await panel.getByLabel("BPM", { exact: true }).fill("177");
  const modal = await lookup(page),
    before = await modal.boundingBox();
  await modal
    .getByRole("button", { name: "Relire la page", exact: true })
    .click();
  await expect(modal.getByRole("alert")).toContainText("Attends une minute");
  expect(await modal.boundingBox()).toEqual(before);
  await modal
    .getByRole("button", {
      name: "Fermer les informations de vente",
      exact: true,
    })
    .click();
  await expect(panel.getByLabel("BPM", { exact: true })).toHaveValue("177");
  expect((await data(request)).bpm).toBe(150);
  const audio = await page.evaluate(() => {
    const a = document.querySelector("audio")!;
    return {
      same:
        a === (window as unknown as { oldAudio: HTMLAudioElement }).oldAudio,
      time: a.currentTime,
      volume: a.volume,
      paused: a.paused,
    };
  });
  expect(audio.same).toBe(true);
  expect(audio.time).toBeGreaterThan(3);
  expect(audio.volume).toBe(0.42);
  expect(audio.paused).toBe(false);
});

test("échec initial, réessai et fermeture clavier sans perdre le focus", async ({
  page,
}) => {
  const panel = await detail(page);
  await page.route("**/api/beats/*/enrichment", (route) =>
    route.fulfill({ status: 503, json: { detail: "Lecture indisponible." } }),
  );
  const modal = await lookup(page),
    frame = await modal.boundingBox();
  await expect(modal.getByRole("alert")).toContainText("Lecture indisponible");
  await expect(
    modal.getByRole("button", { name: "Relire la page", exact: true }),
  ).toBeEnabled();
  expect(await modal.boundingBox()).toEqual(frame);
  await page.unroute("**/api/beats/*/enrichment");
  // A fresh open reads the persisted result; no new network lookup is necessary.
  await page.keyboard.press("Escape");
  await expect(modal).not.toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Compléter depuis la page de vente",
      exact: true,
    }),
  ).toBeFocused();
  await lookup(page);
  await expect(
    page.getByRole("checkbox", { name: "Utiliser BPM : 150", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toBeVisible();
});
