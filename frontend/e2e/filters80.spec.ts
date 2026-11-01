import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const id = "00000000-0000-0000-0000-000000000001";
const second = "00000000-0000-0000-0000-000000000002";
async function open(page: Page, label: string) {
  const m = page
    .locator(".filter-menu")
    .filter({ has: page.locator("summary", { hasText: label }) });
  await m.locator("summary").click();
  await expect(m.locator(".filter-popover")).toBeVisible();
  return m;
}
async function geometry(page: Page) {
  return page
    .locator(
      ".bpm-popover,.bpm-popover .edit-columns,.bpm-popover input,.range-help,.range-apply,.bpm-popover .filter-none",
    )
    .evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return [r.x, r.y, r.width, r.height];
      }),
    );
}

for (const width of [1440, 390]) {
  test(`BPM Paper : erreur sous Maximum seulement, bornes exactes et géométrie stable à ${width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Écouter R&B Mélancolique", exact: true })
      .click();
    const audio = page.locator("audio");
    await expect(audio).toHaveJSProperty("paused", false);
    await audio.evaluate((el: HTMLAudioElement) => {
      el.pause();
      el.currentTime = 7;
      el.dataset.identity = "filters80";
    });
    const menu = await open(page, "BPM"),
      popup = menu.locator(".filter-popover");
    await expect(popup).toHaveCSS("width", "288px");
    await expect(popup).toHaveCSS("height", "224px");
    const before = await geometry(page),
      min = menu.getByRole("spinbutton", { name: "BPM minimum", exact: true }),
      max = menu.getByRole("spinbutton", { name: "BPM maximum", exact: true });
    await min.fill("160");
    await max.fill("120");
    await menu
      .getByRole("button", { name: "Appliquer les BPM", exact: true })
      .click();
    await expect(menu.getByRole("alert")).toHaveText("Min. > max.");
    await expect(max).toHaveAttribute("aria-invalid", "true");
    await expect(min).not.toHaveAttribute("aria-invalid", "true");
    const e = (await menu.getByRole("alert").boundingBox())!,
      r = (await max.boundingBox())!;
    expect(e.x).toBe(r.x);
    expect(e.y).toBeGreaterThan(r.y + r.height);
    expect(await geometry(page)).toEqual(before);
    await popup.screenshot({ path: info.outputPath("bpm-error.png") });
    await min.fill("130");
    await max.fill("130");
    await menu
      .getByRole("button", { name: "Appliquer les BPM", exact: true })
      .click();
    await expect(menu.getByRole("alert")).toBeEmpty();
    expect(await geometry(page)).toEqual(before);
    await page.keyboard.press("Escape");
    await expect(menu.locator("summary")).toBeFocused();
    await expect(audio).toHaveAttribute("data-identity", "filters80");
    await expect(audio).toHaveJSProperty("currentTime", 7);
  });
}

test("tonalités composées : cinq tags sans compression, retrait et clavier sans déplacement", async ({
  page,
}, info) => {
  await page.goto("/");
  const menu = await open(page, "Tonalité"),
    popup = menu.locator(".filter-popover");
  await expect(popup).toHaveCSS("height", "272px");
  await expect(menu.getByRole("searchbox")).toHaveCount(0);
  const frame = await popup.boundingBox(),
    add = menu.getByRole("button", {
      name: "Ajouter cette tonalité",
      exact: true,
    });
  for (const note of ["C", "D", "E", "F#", "Ab"]) {
    await menu
      .getByRole("button", { name: "Note du filtre tonalité", exact: true })
      .click();
    const options = page.getByRole("dialog", {
      name: "Notes du filtre",
      exact: true,
    });
    await expect(
      options.getByRole("option", { name: "C", exact: true }),
    ).toBeFocused();
    await options.getByRole("option", { name: note, exact: true }).click();
    await add.click();
  }
  await expect(menu.locator(".key-combination")).toHaveCount(5);
  expect(await popup.boundingBox()).toEqual(frame);
  expect(
    await menu
      .locator(".key-combinations")
      .evaluate((el) => el.scrollWidth > el.clientWidth),
  ).toBe(true);
  const widths = await menu
    .locator(".key-combination")
    .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width));
  const row = menu.locator(".key-combinations");
  const first = menu.locator(".key-combination").first();
  await first.scrollIntoViewIfNeeded();
  const b = (await first.boundingBox())!;
  await page.mouse.move(b.x + 8, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x - 80, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
  expect(await row.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  await expect(add).toBeDisabled();
  await expect(menu.locator(".key-combination")).toHaveCount(5);
  expect(
    await menu
      .locator(".key-combination")
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width)),
  ).toEqual(widths);
  await menu
    .getByRole("button", { name: "Retirer la tonalité C minor", exact: true })
    .click();
  await expect(
    menu.getByRole("button", { name: "Mode du filtre tonalité", exact: true }),
  ).toBeFocused();
  await expect(menu.locator(".key-combination")).toHaveCount(4);
  expect(await popup.boundingBox()).toEqual(frame);
  await menu
    .getByRole("checkbox", { name: "Non renseigné", exact: true })
    .check();
  await menu
    .getByRole("button", { name: "Mode du filtre tonalité", exact: true })
    .click();
  await expect(
    page.getByRole("option", { name: "minor", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(
    menu.getByRole("button", { name: "Mode du filtre tonalité", exact: true }),
  ).toHaveText("major");
  await popup.screenshot({ path: info.outputPath("keys.png") });
  await menu.getByRole("button", { name: "Effacer", exact: true }).click();
  await expect(menu.locator(".key-combination")).toHaveCount(0);
  await expect(
    menu.getByRole("checkbox", { name: "Non renseigné", exact: true }),
  ).not.toBeChecked();
  expect(await popup.boundingBox()).toEqual(frame);
});

test("tags communs : filtre exact partagé, cases espacées et sélection de fiche sans anciennes catégories", async ({
  page,
}, info) => {
  const token = (await (await page.request.get("/api/session")).json()).token,
    headers = { Origin: "http://127.0.0.1:8767", "X-Session-Token": token };
  const old = await Promise.all(
    [id, second].map(
      async (id) =>
        (await (await page.request.get(`/api/beats/${id}`)).json()).tags,
    ),
  );
  try {
    for (const [identity, tags] of [
      [id, ["Chill", "Dream"]],
      [second, ["chill"]],
    ] as const) {
      expect(
        (
          await page.request.patch(`/api/beats/${identity}/metadata`, {
            headers,
            data: { tags },
          })
        ).ok(),
      ).toBe(true);
    }
    await page.goto("/");
    const menu = await open(page, "Tags"),
      popup = menu.locator(".filter-popover");
    await expect(popup).toHaveCSS("height", "352px");
    const frame = await popup.boundingBox();
    const choices = menu.locator(".filter-choices .filter-option"),
      boxes = await choices.evaluateAll((els) =>
        els.map((el) => el.getBoundingClientRect().y),
      );
    for (let i = 1; i < boxes.length; i++)
      expect(boxes[i] - boxes[i - 1]).toBe(36);
    await menu.getByRole("checkbox", { name: "Chill", exact: true }).check();
    await expect(page.locator(".beat-card")).toHaveCount(1);
    await menu.getByRole("checkbox", { name: "chill", exact: true }).check();
    await expect(page.locator(".beat-card")).toHaveCount(2);
    expect(await popup.boundingBox()).toEqual(frame);
    await popup.screenshot({ path: info.outputPath("tags.png") });
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Détails de R&B Mélancolique", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Choisir mes tags", exact: true })
      .click();
    const picker = page.getByRole("dialog", {
      name: "Choisir mes tags",
      exact: true,
    });
    await expect(
      picker.getByRole("group", { name: "Catégorie de tag" }),
    ).toHaveCount(0);
    await expect(
      picker.getByRole("checkbox", { name: "chill", exact: true }),
    ).toBeVisible();
    await picker.getByRole("checkbox", { name: "chill", exact: true }).check();
    await page.keyboard.press("Escape");
    expect(
      (await (await page.request.get(`/api/beats/${id}`)).json()).tags,
    ).toEqual(["Chill", "Dream"]);
    await page
      .getByRole("button", { name: "Choisir mes tags", exact: true })
      .click();
    const create = page.getByRole("dialog", {
      name: "Choisir mes tags",
      exact: true,
    });
    await expect(
      create.getByRole("checkbox", { name: "chill", exact: true }),
    ).toBeChecked();
    await create
      .getByRole("checkbox", { name: "chill", exact: true })
      .uncheck();
    await create
      .getByRole("searchbox", { name: "Rechercher un tag", exact: true })
      .fill("Nouveau80");
    await create
      .getByRole("button", { name: "Créer « Nouveau80 »", exact: true })
      .click();
    await expect(
      create.getByRole("checkbox", { name: "Nouveau80", exact: true }),
    ).toBeChecked();
    expect(
      (await (await page.request.get("/api/catalog/filters")).json()).tags,
    ).not.toContain("Nouveau80");
    await page.keyboard.press("Escape");
    const detail = page.getByRole("region", {
      name: "R&B Mélancolique",
      exact: true,
    });
    await detail
      .getByRole("button", {
        name: "Enregistrer les modifications",
        exact: true,
      })
      .click();
    await expect(detail.getByRole("status")).toHaveText(
      "Informations enregistrées.",
    );
    expect(
      (await (await page.request.get(`/api/beats/${id}`)).json()).tags,
    ).toEqual(["Chill", "Dream", "Nouveau80"]);
  } finally {
    for (let i = 0; i < 2; i++)
      await page.request.patch(`/api/beats/${[id, second][i]}/metadata`, {
        headers,
        data: { tags: old[i] },
      });
  }
});
