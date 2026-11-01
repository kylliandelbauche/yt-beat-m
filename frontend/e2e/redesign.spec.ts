import { expect, test } from "@playwright/test";
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// Every write targets a disposable library, using the real local API and media server.
let original: { root: string };
let root: string;
let headers: Record<string, string>;
let ids: string[];
const titles = [
  "Première prod",
  "Un titre particulièrement long qui reste toujours sur une seule ligne dans chaque disposition",
  "Troisième prod",
];

async function detail(page: Page, index = 0) {
  await page
    .getByRole("button", { name: `Détails de ${titles[index]}`, exact: true })
    .click();
  const panel = page.getByRole("region", { name: titles[index], exact: true });
  await expect(
    panel.getByLabel("Titre de la prod", { exact: true }),
  ).toHaveValue(titles[index]);
  return panel;
}
async function patch(request: APIRequestContext, index: number, data: object) {
  const response = await request.patch(`/api/beats/${ids[index]}/metadata`, {
    headers,
    data,
  });
  expect(response.ok()).toBe(true);
}
async function boxes(locator: Locator) {
  return locator.evaluateAll((elements) =>
    elements.map((el) => {
      const r = el.getBoundingClientRect();
      return [r.x, r.y, r.width, r.height].map(
        (n) => Math.round(n * 100) / 100,
      );
    }),
  );
}
async function stableText(panel: Locator) {
  return panel.evaluate((root) => {
    // Include the actual label text and the text origin inside native fields,
    // rather than measuring only the outer action buttons.
    return Array.from(
      root.querySelectorAll<HTMLElement>(
        ".detail-header > strong, .detail-title-input input, .detail-cover, .detail-producers, .detail-music, .music-cell > span, #detail-bpm, .detail-tags, .detail-source, .detail-dates, .info-cell > span, .detail-links, .detail-header > button",
      ),
    ).map((el) => {
      const r = el.getBoundingClientRect(),
        css = getComputedStyle(el);
      let text: number[] = [];
      if (el instanceof HTMLInputElement) {
        text = [
          r.x +
            parseFloat(css.borderLeftWidth) +
            parseFloat(css.paddingLeft) -
            el.scrollLeft,
          r.y + (r.height - parseFloat(css.lineHeight)) / 2,
        ];
      } else if (el.firstChild?.nodeType === Node.TEXT_NODE) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const t = range.getBoundingClientRect();
        text = [t.x, t.y];
      }
      return [
        el.id || el.className,
        ...[r.x, r.y, r.width, r.height, ...text].map(
          (n) => Math.round(n * 100) / 100,
        ),
        css.fontFamily,
        css.fontSize,
        css.fontWeight,
        css.lineHeight,
        css.letterSpacing,
      ];
    });
  });
}
async function rangeValue(input: Locator, value: string) {
  await input.evaluate((el: HTMLInputElement, value) => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}
async function settings(
  page: Page,
  section: "Thèmes" | "Bibliothèque" | "Diagnostic",
) {
  await page.getByRole("button", { name: "Réglages", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Réglages", exact: true });
  await modal.getByRole("button", { name: section, exact: true }).click();
  await expect(
    modal.getByRole("heading", { name: section, exact: true }),
  ).toBeVisible();
  return modal;
}

test.beforeAll(async ({ request }) => {
  original = (await (await request.get("/api/library")).json()).library;
  headers = {
    Origin: "http://127.0.0.1:8767",
    "X-Session-Token": (await (await request.get("/api/session")).json()).token,
  };
  root = await mkdtemp(path.join(tmpdir(), "beat-m-paper78-"));
  expect(
    (
      await request.post("/api/library", {
        headers,
        data: { path: root, create: true, name: "Collection Paper" },
      })
    ).ok(),
  ).toBe(true);
  ids = [];
  for (let index = 0; index < 3; index++) {
    const result = await request.post("/api/imports", {
      headers,
      data: { url: `https://youtu.be/REFONTE000${index}` },
    });
    expect(result.ok()).toBe(true);
    const job = (await result.json()).job;
    await expect
      .poll(async () => {
        const status = (
          await (await request.get("/api/imports")).json()
        ).jobs.find((j: { id: string }) => j.id === job.id);
        if (status?.beat_id) ids[index] = status.beat_id;
        return status?.state;
      })
      .toBe("completed");
    await patch(request, index, {
      title: titles[index],
      bpm: index ? 144 : 125,
      musical_key: index ? "Ab minor" : "G# minor",
      styles: index ? ["Drill"] : ["R&B"],
      moods: ["Mélancolique"],
      description: "Description de la prod.\n".repeat(70),
      links: [{ url: "https://example.org/beat", label: "Page de vente" }],
    });
  }
});
test.afterAll(async ({ request }) => {
  if (original?.root)
    expect(
      (
        await request.post("/api/library", {
          headers,
          data: { path: original.root },
        })
      ).ok(),
    ).toBe(true);
  if (root) await rm(root, { recursive: true, force: true });
});
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator(".beat-card")).toHaveCount(3);
  await page.evaluate(() => document.fonts.ready);
});

test("un doublon réel ouvre la prod existante sans nouvel import ni interruption audio", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: `Écouter ${titles[1]}`, exact: true })
    .click();
  const audio = page.locator("audio");
  await expect(audio).toHaveJSProperty("paused", false);
  await audio.evaluate((el: HTMLAudioElement) => {
    el.pause();
    el.currentTime = 7;
    el.dataset.identity = "duplicate";
  });
  await page
    .getByRole("textbox", { name: "Lien YouTube de la prod", exact: true })
    .fill("https://youtu.be/REFONTE0000");
  await page
    .getByRole("button", { name: "Importer la prod", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: titles[0], exact: true }),
  ).toBeVisible();
  await expect(page.locator(".beat-card")).toHaveCount(3);
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await expect(audio).toHaveAttribute("data-identity", "duplicate");
  await expect(audio).toHaveJSProperty("currentTime", 7);
});

test("ACC01–08 : les deux volets réservent leur espace, sans sélection ni superposition", async ({
  page,
}, info) => {
  const center = page.locator(".library-center"),
    cards = page.locator(".beat-card"),
    right = page.getByRole("complementary", { name: "Volet de la prod" });
  expect((await center.boundingBox())!.x).toBe(256);
  expect((await cards.first().boundingBox())!.width).toBe(344);
  await page
    .getByRole("button", { name: "Ouvrir la fiche", exact: true })
    .click();
  await expect(
    page.getByText("Aucune prod sélectionnée", { exact: true }),
  ).toBeVisible();
  await expect(right.getByRole("button")).toHaveCount(1);
  await expect.poll(async () => (await right.boundingBox())!.x).toBe(1068);
  expect((await cards.first().boundingBox())!.width).toBe(368);
  expect((await cards.first().boundingBox())!.height).toBe(136);
  const panel = await detail(page);
  const title = (await panel.locator(".detail-title-input").boundingBox())!;
  expect([title.x, title.y, title.width, title.height]).toEqual([
    1088, 84, 272, 22,
  ]);
  expect((await panel.locator(".detail-cover").boundingBox())!.height).toBe(
    152,
  );
  expect((await cards.first().boundingBox())!.y).toBe(188);
  await page.screenshot({ path: info.outputPath("acc02.png") });
  await page
    .getByRole("button", { name: "Replier la navigation", exact: true })
    .click();
  await expect.poll(async () => (await center.boundingBox())!.x).toBe(64);
  await page
    .getByRole("button", { name: "Ajouter une prod", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Lien YouTube de la prod", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Ajouter une prod", exact: true }),
  ).toBeFocused();
  await expect(panel).toBeVisible();
  await page
    .getByRole("button", { name: "Replier la fiche", exact: true })
    .click();
  await expect.poll(async () => (await right.boundingBox())!.width).toBe(48);
  await expect(
    page.getByRole("button", { name: "Informations", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Informations", exact: true }).click();
  await expect(panel).toBeVisible();
  await expect(
    panel.getByLabel("Titre de la prod", { exact: true }),
  ).toHaveValue(titles[0]);
});

test("cartes : titre unique, tags défilants, favori et lecture indépendants des détails", async ({
  page,
}) => {
  const card = page.locator(".beat-card").filter({
    has: page.getByRole("button", {
      name: `Détails de ${titles[1]}`,
      exact: true,
    }),
  });
  const before = await boxes(
    card.locator(
      ".horizontal-title, .horizontal-maker, .card-tags, .beat-favorite, .horizontal-cover",
    ),
  );
  const title = card.locator(".horizontal-title");
  expect((await title.boundingBox())!.height).toBe(24);
  await card.getByRole("button", { name: /^Ajouter aux favoris/ }).click();
  await expect(
    card.getByRole("button", { name: /^Retirer des favoris/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("region", { name: titles[1], exact: true }),
  ).toHaveCount(0);
  await card.getByRole("button", { name: /^Écouter/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("audio")).toHaveJSProperty("paused", false);
  await expect(
    card.getByRole("button", { name: /^Mettre en pause/ }),
  ).toBeVisible();
  expect(
    await boxes(
      card.locator(
        ".horizontal-title, .horizontal-maker, .card-tags, .beat-favorite, .horizontal-cover",
      ),
    ),
  ).toEqual(before);
  await card.getByRole("button", { name: /^Mettre en pause/ }).click();
  await expect(page.locator("audio")).toHaveJSProperty("paused", true);
  await card.getByRole("button", { name: /^Détails/ }).click();
  await expect(
    page.getByRole("region", { name: titles[1], exact: true }),
  ).toBeVisible();
  await expect(page.locator("audio")).toHaveJSProperty("paused", true);
  expect(await card.locator(".card-tags").getByRole("button").count()).toBe(0);
});

test("grandes pochettes conservées ; changement de disposition sans remplacer le lecteur", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: `Écouter ${titles[0]}`, exact: true })
    .click();
  const audio = page.locator("audio");
  await audio.evaluate((el: HTMLAudioElement) => {
    el.pause();
    el.currentTime = 7;
    el.dataset.identity = "covers";
  });
  await page
    .getByRole("button", { name: "Grandes pochettes", exact: true })
    .click();
  await expect(page.locator(".covers-grid")).toBeVisible();
  await expect
    .poll(async () => {
      const r = (await page
        .locator(".covers-grid .beat-card")
        .first()
        .boundingBox())!;
      return [r.width, r.height];
    })
    .toEqual([344, 452]);
  await detail(page);
  await expect
    .poll(async () => {
      const r = (await page
        .locator(".covers-grid .beat-card")
        .first()
        .boundingBox())!;
      return [r.width, r.height];
    })
    .toEqual([368, 476]);
  await page
    .getByRole("button", { name: "Replier la fiche", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: `Détails de ${titles[0]}`, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Cartes horizontales", exact: true })
    .click();
  await expect(audio).toHaveAttribute("data-identity", "covers");
  await expect(audio).toHaveJSProperty("currentTime", 7);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Cartes horizontales", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

for (const width of [1440, 720]) {
  test(`FP01/02 : textes, champs et actions immobiles entre lecture, édition, attente, erreur et succès à ${width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const panel = await detail(page);
    await panel.scrollIntoViewIfNeeded();
    const before = await stableText(panel);
    const save = panel.getByRole("button", {
      name: "Modifier la prod",
      exact: true,
    });
    const actionBox = (await save.boundingBox())!;
    const heartBox = (await panel
      .getByRole("button", { name: /favoris/ })
      .boundingBox())!;
    expect(heartBox.x - actionBox.x).toBe(42);
    await save.click();
    expect(await stableText(panel)).toEqual(before);
    await panel.getByLabel("BPM", { exact: true }).fill("153");
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/beats/*/metadata", async (route) => {
      await gate;
      await route.fulfill({
        status: 503,
        json: { detail: "Stockage indisponible." },
      });
    });
    const edit = panel.getByRole("button", {
      name: "Enregistrer les modifications",
      exact: true,
    });
    await edit.click();
    await expect(edit).toHaveAttribute("aria-busy", "true");
    expect(await stableText(panel)).toEqual(before);
    release();
    await expect(panel.getByRole("alert")).toContainText(
      "Stockage indisponible.",
    );
    expect(await stableText(panel)).toEqual(before);
    await expect(panel.getByLabel("BPM", { exact: true })).toHaveValue("153");
    await page.unroute("**/api/beats/*/metadata");
    await panel.getByRole("button", { name: "Réessayer", exact: true }).click();
    await expect(panel.getByRole("status")).toHaveText(
      "Informations enregistrées.",
    );
    await expect(
      panel.getByRole("button", { name: "Modifier la prod", exact: true }),
    ).toBeFocused();
    expect(await stableText(panel)).toEqual(before);
    await page.screenshot({ path: info.outputPath("fp02-saved.png") });
    await panel
      .getByRole("button", { name: "Modifier la prod", exact: true })
      .click();
    await panel.getByLabel("BPM", { exact: true }).fill("170");
    await panel
      .getByRole("button", { name: "Annuler les modifications", exact: true })
      .click();
    await expect(panel.getByLabel("BPM", { exact: true })).toHaveValue("153");
    expect(await stableText(panel)).toEqual(before);
    await patch(page.request, 0, { bpm: 125 });
  });
}

test("FP03/04 : description fixe, défilement et focus conservés, annulation complète", async ({
  page,
}, info) => {
  const panel = await detail(page);
  await page.getByRole("button", { name: "Description", exact: true }).click();
  const description = panel.getByLabel("Description de la prod", {
    exact: true,
  });
  const before = await boxes(
    panel.locator(
      ".detail-header, .detail-title-input, .detail-cover, .detail-producers, .detail-description, .detail-links",
    ),
  );
  const background = await description.evaluate(
    (el) => getComputedStyle(el.parentElement!).backgroundColor,
  );
  const value = await description.inputValue();
  await description.evaluate((el) => {
    el.scrollTop = 120;
  });
  await panel
    .getByRole("button", { name: "Modifier la prod", exact: true })
    .click();
  await expect(
    panel.getByRole("button", {
      name: "Enregistrer les modifications",
      exact: true,
    }),
  ).toBeVisible();
  expect(await description.evaluate((el) => el.scrollTop)).toBe(120);
  await expect
    .poll(() =>
      description.evaluate(
        (el) => getComputedStyle(el.parentElement!).backgroundColor,
      ),
    )
    .not.toBe(background);
  expect(
    await boxes(
      panel.locator(
        ".detail-header, .detail-title-input, .detail-cover, .detail-producers, .detail-description, .detail-links",
      ),
    ),
  ).toEqual(before);
  await description.fill("Un brouillon <script>inactif</script>");
  await panel
    .getByRole("button", { name: "Annuler les modifications", exact: true })
    .click();
  await expect(description).toHaveValue(value);
  await page.screenshot({ path: info.outputPath("fp03.png") });
});

test("FP05 : sélecteur de tonalité anglais flottant et utilisable au clavier", async ({
  page,
}, info) => {
  const panel = await detail(page);
  await panel
    .getByRole("button", { name: "Modifier la prod", exact: true })
    .click();
  const key = panel.getByRole("button", { name: /^Tonalité :/ }),
    before = await stableText(panel);
  await key.click();
  const popup = page.getByRole("dialog", {
    name: "Modifier la tonalité",
    exact: true,
  });
  const r = (await popup.boundingBox())!;
  expect([r.width, r.height]).toEqual([224, 52]);
  expect(r.y).toBe(
    (await key.boundingBox())!.y + (await key.boundingBox())!.height + 8,
  );
  await popup
    .getByRole("button", { name: "Mode de la tonalité", exact: true })
    .click();
  await popup.getByRole("option", { name: "major", exact: true }).click();
  const note = popup.getByRole("button", {
    name: "Note de la tonalité",
    exact: true,
  });
  await note.focus();
  await page.keyboard.press("ArrowDown");
  await expect(
    popup.getByRole("option", { name: "C", exact: true }),
  ).toBeFocused();
  await popup
    .getByRole("option", { name: "Bb", exact: true })
    .scrollIntoViewIfNeeded();
  await popup.getByRole("option", { name: "Bb", exact: true }).click();
  await expect(note).toBeFocused();
  await page.screenshot({ path: info.outputPath("fp05.png") });
  await page.keyboard.press("Escape");
  await expect(popup).toHaveCount(0);
  await expect(key).toBeFocused();
  expect(await stableText(panel)).toEqual(before);
  await panel
    .getByRole("button", { name: "Enregistrer les modifications", exact: true })
    .click();
  await expect(panel.getByRole("status")).toHaveText(
    "Informations enregistrées.",
  );
  expect(
    (await (await page.request.get(`/api/beats/${ids[0]}`)).json()).musical_key,
  ).toBe("Bb major");
  await patch(page.request, 0, { musical_key: "G# minor" });
});

test("tags : sélection directe, fermeture garde le brouillon et seul Save persiste", async ({
  page,
}) => {
  const panel = await detail(page),
    saved = (await (await page.request.get(`/api/beats/${ids[0]}`)).json())
      .tags;
  await panel
    .getByRole("button", { name: "Choisir mes tags", exact: true })
    .click();
  let picker = page.getByRole("dialog", {
    name: "Choisir mes tags",
    exact: true,
  });
  await picker.getByRole("checkbox", { name: "Drill", exact: true }).check();
  await page.keyboard.press("Escape");
  await expect(
    panel.getByRole("button", {
      name: "Enregistrer les modifications",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    (await (await page.request.get(`/api/beats/${ids[0]}`)).json()).tags,
  ).toEqual(saved);
  await panel
    .getByRole("button", { name: "Choisir mes tags", exact: true })
    .click();
  picker = page.getByRole("dialog", { name: "Choisir mes tags", exact: true });
  await picker.getByRole("checkbox", { name: "Drill", exact: true }).check();
  await page.keyboard.press("Escape");
  await expect(
    panel.getByRole("button", {
      name: "Enregistrer les modifications",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    (await (await page.request.get(`/api/beats/${ids[0]}`)).json()).tags,
  ).toEqual(saved);
  await panel
    .getByRole("button", { name: "Enregistrer les modifications", exact: true })
    .click();
  await expect(panel.getByRole("status")).toHaveText(
    "Informations enregistrées.",
  );
  const tag = panel.locator(".tag").filter({ hasText: "Drill" }),
    tagBox = await tag.boundingBox();
  await tag.hover();
  expect(await tag.boundingBox()).toEqual(tagBox);
  await tag
    .getByRole("button", { name: "Retirer le tag Drill", exact: true })
    .click();
  expect(
    (await (await page.request.get(`/api/beats/${ids[0]}`)).json()).tags,
  ).toContain("Drill");
  await panel
    .getByRole("button", { name: "Annuler les modifications", exact: true })
    .click();
  await expect(
    panel.locator(".tag").filter({ hasText: "Drill" }),
  ).toBeVisible();
  await patch(page.request, 0, { tags: saved });
});

test("changer de prod ou replier la fiche protège le brouillon et restaure le focus", async ({
  page,
}) => {
  const panel = await detail(page);
  await panel
    .getByRole("button", { name: "Modifier la prod", exact: true })
    .click();
  await panel.getByLabel("BPM", { exact: true }).fill("160");
  await page
    .getByRole("button", { name: `Détails de ${titles[2]}`, exact: true })
    .click();
  let confirm = page.getByRole("dialog", {
    name: "Modifications non enregistrées",
    exact: true,
  });
  await expect(confirm).toBeVisible();
  await confirm
    .getByRole("button", { name: "Continuer l’édition", exact: true })
    .click();
  await expect(confirm).toHaveCount(0);
  await expect(panel.getByLabel("BPM", { exact: true })).toHaveValue("160");
  await page
    .getByRole("button", { name: `Détails de ${titles[2]}`, exact: true })
    .click();
  confirm = page.getByRole("dialog", {
    name: "Modifications non enregistrées",
    exact: true,
  });
  await expect(confirm).toBeVisible();
  await confirm
    .getByRole("button", { name: "Abandonner et continuer", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: titles[2], exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: `Détails de ${titles[2]}`, exact: true }),
  ).toBeFocused();
  expect(
    (await (await page.request.get(`/api/beats/${ids[0]}`)).json()).bpm,
  ).toBe(125);
});

test("REG01/04 : huit thèmes natifs, géométrie identique et préférences persistantes", async ({
  page,
}, info) => {
  await detail(page);
  const modal = await settings(page, "Thèmes");
  const geometry = () =>
    boxes(
      page.locator(
        ".navigation-sidebar, .catalog-heading, .catalog-filters, .beat-card, .local-player, .detail-sidebar, .settings-modal, .theme-options > button",
      ),
    );
  const before = await geometry(),
    colors = new Set<string>();
  for (const mode of ["Clair", "Sombre"]) {
    await modal.getByRole("button", { name: mode, exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-mode",
      mode === "Clair" ? "light" : "dark",
    );
    for (const palette of ["sobre", "lin", "sauge", "brume"]) {
      await modal
        .getByRole("button", { name: `Palette ${palette}`, exact: true })
        .click();
      await expect(page.locator("html")).toHaveAttribute(
        "data-palette",
        palette,
      );
      const native =
        mode === "Clair"
          ? {
              sobre: "rgb(245, 245, 245)",
              lin: "rgb(241, 237, 228)",
              sauge: "rgb(238, 241, 235)",
              brume: "rgb(237, 242, 245)",
            }
          : {
              sobre: "rgb(23, 23, 23)",
              lin: "rgb(29, 27, 23)",
              sauge: "rgb(20, 28, 24)",
              brume: "rgb(20, 29, 37)",
            };
      await expect(page.locator("body")).toHaveCSS(
        "background-color",
        native[palette as keyof typeof native],
      );
      colors.add(
        await page
          .locator("body")
          .evaluate((el) => getComputedStyle(el).backgroundColor),
      );
      expect(await geometry()).toEqual(before);
    }
    await page.screenshot({ path: info.outputPath(`reg-${mode}.png`) });
  }
  expect(colors.size).toBe(8);
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-palette", "brume");
  await expect(page.locator("html")).toHaveAttribute("data-mode", "dark");
});

test("lecteur : volume vertical, clavier, mute/rétablissement, seek et préférences", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: `Écouter ${titles[0]}`, exact: true })
    .click();
  const audio = page.locator("audio"),
    player = page.getByRole("complementary", {
      name: "Lecteur audio",
      exact: true,
    });
  await expect(audio).toHaveJSProperty("paused", false);
  await player.getByRole("button", { name: "Pause", exact: true }).click();
  await rangeValue(
    player.getByRole("slider", { name: "Position de lecture", exact: true }),
    "7",
  );
  await expect(audio).toHaveJSProperty("currentTime", 7);
  const before = await boxes(player),
    volume = player.getByRole("button", { name: "Volume", exact: true });
  await volume.click();
  const popup = page.getByRole("dialog", {
      name: "Volume du lecteur",
      exact: true,
    }),
    slider = popup.getByRole("slider", {
      name: "Volume du lecteur",
      exact: true,
    });
  const r = (await popup.boundingBox())!,
    trigger = (await volume.boundingBox())!;
  expect([r.width, r.height]).toEqual([72, 224]);
  expect(r.y + r.height).toBeLessThan(trigger.y);
  expect(r.y).toBeGreaterThan(0);
  await rangeValue(slider, "37");
  await expect(audio).toHaveJSProperty("volume", 0.37);
  await slider.focus();
  await page.keyboard.press("ArrowUp");
  await expect(audio).toHaveJSProperty("volume", 0.38);
  await popup
    .getByRole("button", { name: "Couper le son", exact: true })
    .click();
  await expect(audio).toHaveJSProperty("muted", true);
  await popup
    .getByRole("button", { name: "Rétablir le son", exact: true })
    .click();
  await expect(audio).toHaveJSProperty("volume", 0.38);
  await expect(audio).toHaveJSProperty("muted", false);
  await page.keyboard.press("Escape");
  await expect(volume).toBeFocused();
  expect(await boxes(player)).toEqual(before);
  await player
    .getByRole("button", { name: "Prod précédente", exact: true })
    .click();
  await expect(audio).toHaveJSProperty("volume", 0.38);
  await page.reload();
  await page
    .getByRole("button", { name: `Écouter ${titles[0]}`, exact: true })
    .click();
  await expect(audio).toHaveJSProperty("volume", 0.38);
});

test("lecture et position conservées pendant recherche, filtres, profils, thèmes et volets", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: `Écouter ${titles[0]}`, exact: true })
    .click();
  const audio = page.locator("audio");
  await expect(audio).toHaveJSProperty("paused", false);
  await audio.evaluate((el: HTMLAudioElement) => {
    el.currentTime = 3;
    el.dataset.identity = "continuous";
  });
  await page
    .getByRole("searchbox", { name: "Rechercher une prod", exact: true })
    .fill("Troisième");
  await expect(page.locator(".beat-card")).toHaveCount(1);
  await page
    .getByRole("button", {
      name: `Détails depuis le lecteur : ${titles[0]}`,
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("region", { name: titles[0], exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Replier la fiche", exact: true })
    .click();
  await page.getByRole("button", { name: "Beatmakers", exact: true }).click();
  const modal = await settings(page, "Thèmes");
  await modal
    .getByRole("button", { name: "Palette sauge", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Prods", exact: true }).click();
  await expect(audio).toHaveAttribute("data-identity", "continuous");
  await expect(audio).toHaveJSProperty("paused", false);
  expect(
    await audio.evaluate((el: HTMLAudioElement) => el.currentTime),
  ).toBeGreaterThan(3);
});

test("import : pourcentage réel, phases indéterminées, erreur/reprise et ouverture automatique sans décalage", async ({
  page,
}) => {
  let job: Record<string, unknown> | null = null;
  const base = {
    id: "paper-progress",
    source_url: "https://youtu.be/PROGRESS001",
    state: "running",
    stage: "extracting",
    progress: null,
    beat_id: null,
    error_message: null,
  };
  await page.route("**/api/imports", (route) => {
    if (route.request().method() === "POST") {
      job = { ...base };
      return route.fulfill({ json: { job, beat_id: null, duplicate: false } });
    }
    return route.fulfill({ json: { jobs: job ? [job] : [] } });
  });
  await page.reload();
  const stable = () =>
    boxes(
      page.locator(
        ".catalog-heading, .catalog-filters, .beat-card, .import-form input, .import-submit, .navigation-tools",
      ),
    );
  await expect(page.locator(".beat-card")).toHaveCount(3);
  const before = await stable();
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Lien YouTube de la prod", exact: true })
    .fill(base.source_url);
  await page
    .getByRole("button", { name: "Importer la prod", exact: true })
    .click();
  const progress = page.getByRole("progressbar", {
    name: "Progression de l’import",
    exact: true,
  });
  await expect(progress).not.toHaveAttribute("aria-valuenow");
  for (const percent of [8, 32, 64]) {
    job = { ...base, stage: "downloading", progress: percent };
    await expect(progress).toHaveAttribute("aria-valuenow", String(percent));
    await expect
      .poll(async () =>
        Math.round(
          (100 * (await progress.locator("span").boundingBox())!.width) /
            (await progress.boundingBox())!.width,
        ),
      )
      .toBe(percent);
    expect(await stable()).toEqual(before);
  }
  job = { ...base, stage: "converting", progress: 100 };
  await expect(progress).not.toHaveAttribute("aria-valuenow");
  job = {
    ...base,
    state: "failed",
    stage: "failed",
    error_message: "Connexion interrompue.",
  };
  await expect(page.getByRole("alert")).toContainText("Connexion interrompue.");
  expect(await stable()).toEqual(before);
  await page.getByRole("button", { name: "Réessayer", exact: true }).click();
  await expect(progress).toBeVisible();
  job = {
    ...base,
    state: "completed",
    stage: "completed",
    progress: 100,
    beat_id: ids[0],
  };
  await expect(
    page.getByRole("region", { name: titles[0], exact: true }),
  ).toBeVisible();
  await expect(progress).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Voir la prod", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(progress).toHaveCount(0);
});

test("menus de filtre directs, combinables, défilants ; tri et dispositions restent fixes", async ({
  page,
}) => {
  const panel = await detail(page);
  const fixed = await boxes(page.locator(".catalog-order"));
  for (const label of ["BPM", "Tonalité", "Beatmaker", "Tags", "Chaîne"]) {
    const menu = page
      .locator(".filter-menu")
      .filter({ has: page.locator("summary", { hasText: label }) });
    await menu.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(menu.locator(".filter-popover")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel).toBeVisible();
    await expect(menu.locator("summary")).toBeFocused();
    expect(await boxes(page.locator(".catalog-order"))).toEqual(fixed);
  }
  const styles = page
    .locator(".filter-menu")
    .filter({ has: page.locator("summary", { hasText: "Tags" }) });
  await styles.locator("summary").click();
  await styles.getByRole("checkbox", { name: "Drill", exact: true }).check();
  await page.keyboard.press("Escape");
  await expect(page.locator(".beat-card")).toHaveCount(2);
  const keys = page
    .locator(".filter-menu")
    .filter({ has: page.locator("summary", { hasText: "Tonalité" }) });
  await keys.locator("summary").click();
  await keys
    .getByRole("button", { name: "Note du filtre tonalité", exact: true })
    .click();
  await page.getByRole("option", { name: "Ab", exact: true }).click();
  await keys
    .getByRole("button", { name: "Ajouter cette tonalité", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".beat-card")).toHaveCount(2);
  await page
    .getByRole("searchbox", { name: "Rechercher une prod", exact: true })
    .fill("inexistant");
  await expect(
    page.getByRole("heading", {
      name: "Aucune prod ne correspond",
      exact: true,
    }),
  ).toBeVisible();
  expect(await boxes(page.locator(".catalog-order"))).toEqual(fixed);
});

test("REG02 : choisir prépare le chemin, annuler conserve la bibliothèque, erreurs sans déplacement", async ({
  page,
}) => {
  let chosen: string | null = root,
    fail = false;
  await page.route("**/api/library/pick-folder", (route) =>
    fail
      ? route.fulfill({
          status: 503,
          json: { detail: "Sélecteur indisponible." },
        })
      : route.fulfill({ json: { path: chosen } }),
  );
  const modal = await settings(page, "Bibliothèque"),
    input = modal.getByRole("textbox", {
      name: "Dossier de bibliothèque",
      exact: true,
    });
  const geometry = () =>
    boxes(
      modal.locator(
        ".modal-actions, nav, .settings-body, .mode-selector, .library-form > label, .library-form > button",
      ),
    );
  const before = await geometry();
  await modal
    .getByRole("button", { name: "Ouvrir un dossier", exact: true })
    .click();
  await expect(input).toHaveValue(root);
  expect(
    (await (await page.request.get("/api/library")).json()).library.name,
  ).toBe("Collection Paper");
  chosen = null;
  await modal
    .getByRole("button", { name: "Ouvrir un dossier", exact: true })
    .click();
  await expect(input).toHaveValue(root);
  expect(await geometry()).toEqual(before);
  fail = true;
  await modal
    .getByRole("button", { name: "Ouvrir un dossier", exact: true })
    .click();
  await expect(modal.getByRole("alert")).toContainText(
    "Sélecteur indisponible.",
  );
  expect(await geometry()).toEqual(before);
  await modal
    .getByRole("button", { name: "Créer une bibliothèque", exact: true })
    .click();
  expect(await geometry()).toEqual(before);
  await expect(
    modal.getByRole("textbox", { name: "Nom de la bibliothèque", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Réglages", exact: true }),
  ).toBeFocused();
});

for (const width of [1440, 390]) {
  test(`polices et médias locaux hors ligne ; commandes accessibles à ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 390 ? 650 : 900 });
    const external: string[] = [];
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.hostname !== "127.0.0.1") {
        external.push(url.hostname);
        return route.abort();
      }
      return route.continue();
    });
    await page.reload();
    await page
      .getByRole("button", { name: `Écouter ${titles[0]}`, exact: true })
      .click();
    await expect(page.locator("audio")).toHaveJSProperty("paused", false);
    const panel = await detail(page);
    await expect(
      panel.getByRole("button", { name: "Afficher le fichier", exact: true }),
    ).toBeEnabled();
    await panel
      .getByRole("button", { name: "Modifier la prod", exact: true })
      .click();
    await panel
      .getByRole("button", { name: "Annuler les modifications", exact: true })
      .click();
    const modal = await settings(page, "Thèmes");
    await modal
      .getByRole("button", { name: "Palette lin", exact: true })
      .click();
    await page.keyboard.press("Escape");
    await expect(page.locator("audio")).toHaveJSProperty("paused", false);
    expect(external).toEqual([]);
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(
        () =>
          document.fonts.check("400 14px Inter") &&
          document.fonts.check("600 20px Manrope"),
      ),
    ).toBe(true);
  });
}
