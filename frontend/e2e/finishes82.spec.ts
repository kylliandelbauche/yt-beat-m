import { expect, test } from "@playwright/test";
import type { Page, Locator } from "@playwright/test";
async function detail(page: Page) {
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
  test(`finitions fixes : cartes, rail64, Save, durée et tonalité à ${width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const card = page.locator(".beat-card").first(),
      box = await card.boundingBox();
    await expect(card).toHaveCSS("border-radius", "28px");
    await page
      .getByRole("button", { name: "Grandes pochettes", exact: true })
      .click();
    await expect(card).toHaveCSS("border-radius", "28px");
    await page
      .getByRole("button", { name: "Cartes horizontales", exact: true })
      .click();
    await expect(card).toHaveCSS("height", "136px");
    expect((await card.boundingBox())!.width).toBe(box!.width);
    await page
      .getByRole("button", { name: "Replier la navigation", exact: true })
      .click();
    await expect(page.locator(".navigation-sidebar")).toHaveCSS(
      "width",
      "64px",
    );
    const nav = page.locator(".primary-nav button").first();
    await expect(nav).toHaveCSS("width", "44px");
    await expect(nav).toHaveCSS("height", "44px");
    await expect(nav).toHaveCSS("border-radius", "12px");
    expect(
      await nav.evaluate((e) => getComputedStyle(e).boxShadow),
    ).not.toContain("inset");
    const p = await detail(page),
      selector =
        ".detail-title-input input,.detail-cover,.detail-music,#detail-bpm,.detail-tags,.detail-header > button";
    const before = await rects(p, selector);
    await p
      .getByRole("button", { name: "Modifier la prod", exact: true })
      .click();
    const save = p.getByRole("button", {
      name: "Enregistrer les modifications",
      exact: true,
    });
    await expect(save).toHaveCSS("background-color", "rgb(51, 51, 51)");
    await expect(p.locator(".music-cell").first()).toHaveCSS(
      "box-shadow",
      "none",
    );
    await expect(p.locator("#detail-bpm")).not.toHaveAttribute("readonly");
    expect(await rects(p, selector)).toEqual(before);
    await p.screenshot({ path: info.outputPath("detail.png") });
    await p
      .getByRole("button", { name: "Annuler les modifications", exact: true })
      .click();
    await expect(p.locator("#detail-bpm")).toHaveCSS("appearance", "textfield");
    expect(await rects(p, selector)).toEqual(before);
  });
  test(`sliders contenus : clic/glisser/clavier, volume sans scroll à ${width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Écouter R&B Mélancolique", exact: true })
      .click();
    const audio = page.locator("audio"),
      player = page.getByRole("complementary", {
        name: "Lecteur audio",
        exact: true,
      });
    await expect(audio).toHaveJSProperty("paused", false);
    await player.getByRole("button", { name: "Pause", exact: true }).click();
    await audio.evaluate(
      (a: HTMLAudioElement) => (a.dataset.identity = "fin82"),
    );
    const seek = player.getByRole("slider", {
      name: "Position de lecture",
      exact: true,
    });
    await seek.scrollIntoViewIfNeeded();
    const s = (await seek.boundingBox())!,
      length = Number(await seek.getAttribute("max"));
    // At narrow widths, a quarter-click can hit the existing native thumb instead of its rail.
    await seek.click({
      position: { x: 8 + (s.width - 16) * 0.75, y: s.height / 2 },
    });
    await expect
      .poll(async () => Number(await seek.inputValue()))
      .toBeCloseTo(length * 0.75, 0);
    const thumb = (await player.locator(".range-thumb").first().boundingBox())!;
    await page.mouse.move(
      thumb.x + thumb.width / 2,
      thumb.y + thumb.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(s.x + 8 + (s.width - 16) * 0.25, s.y + s.height / 2, {
      steps: 8,
    });
    await page.mouse.up();
    await expect
      .poll(async () => Number(await seek.inputValue()))
      .toBeCloseTo(length * 0.25, 0);
    await expect(player.locator(".range-rail").first()).toHaveCSS(
      "height",
      "4px",
    );
    await expect(player.locator(".range-thumb").first()).toHaveCSS(
      "width",
      "14px",
    );
    await player.getByRole("button", { name: "Volume", exact: true }).click();
    const popup = page.getByRole("dialog", {
        name: "Volume du lecteur",
        exact: true,
      }),
      slider = popup.getByRole("slider"),
      r = (await slider.boundingBox())!;
    expect([r.width, r.height]).toEqual([44, 128]);
    for (const [y, value] of [
      [8, 1],
      [120, 0],
    ] as const) {
      await slider.click({ position: { x: r.width / 2, y } });
      await expect(audio).toHaveJSProperty("volume", value);
      const dimensions = await popup.evaluate((e) => [
        e.scrollWidth,
        e.clientWidth,
        e.scrollHeight,
        e.clientHeight,
      ]);
      expect(dimensions[0]).toBe(dimensions[1]);
      expect(dimensions[2]).toBe(dimensions[3]);
      const bounds = (await popup.boundingBox())!,
        thumb = (await popup.locator(".range-thumb").boundingBox())!;
      expect(thumb.y).toBeGreaterThanOrEqual(bounds.y);
      expect(thumb.y + thumb.height).toBeLessThanOrEqual(
        bounds.y + bounds.height,
      );
    }
    await slider.focus();
    await page.keyboard.press("End");
    await expect(audio).toHaveJSProperty("volume", 1);
    await page.keyboard.press("Home");
    await expect(audio).toHaveJSProperty("volume", 0);
    await page.mouse.move(r.x + r.width / 2, r.y + 8);
    await page.mouse.down();
    await page.mouse.move(r.x + r.width / 2, r.y + 120, { steps: 10 });
    await page.mouse.up();
    await expect(audio).toHaveJSProperty("volume", 0);
    await popup.screenshot({ path: info.outputPath("volume.png") });
    await page.keyboard.press("Escape");
    await expect(
      player.getByRole("button", { name: "Volume", exact: true }),
    ).toBeFocused();
    await expect(audio).toHaveAttribute("data-identity", "fin82");
  });
}
test("transitions interrompues : colonnes progressives, icônes fixes et audio conservé", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Écouter R&B Mélancolique", exact: true })
    .click();
  const audio = page.locator("audio");
  await expect(audio).toHaveJSProperty("paused", false);
  await audio.evaluate((a: HTMLAudioElement) => {
    a.pause();
    a.currentTime = 7;
    a.dataset.identity = "animated82";
  });
  const toggle = page.getByRole("button", {
    name: "Replier la navigation",
    exact: true,
  });
  await toggle.focus();
  const samples = await toggle.evaluate(async (el) => {
    const read = () => ({
      width: parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          "--nav-width",
        ),
      ),
      x: document.querySelector(".library-center")!.getBoundingClientRect().x,
      player: document.querySelector(".local-player")!.getBoundingClientRect()
        .x,
    });
    const frames = [];
    el.click();
    for (let i = 0; i < 5; i++) {
      await new Promise(requestAnimationFrame);
      frames.push(read());
    }
    const interrupted = read();
    el.click();
    const restart = read();
    for (let i = 0; i < 18; i++) {
      await new Promise(requestAnimationFrame);
      frames.push(read());
    }
    return { frames, interrupted, restart };
  });
  expect(samples.frames.some((f) => f.width > 64 && f.width < 256)).toBe(true);
  for (const f of samples.frames) {
    expect(f.x).toBeCloseTo(f.width, 1);
    expect(f.player - f.x).toBeCloseTo(24, 1);
  }
  expect(
    Math.abs(samples.restart.width - samples.interrupted.width),
  ).toBeLessThan(1);
  await expect(toggle).toBeFocused();
  await expect(page.locator(".navigation-sidebar")).toHaveCSS("width", "256px");
  const right = page.getByRole("button", {
    name: "Ouvrir la fiche",
    exact: true,
  });
  await right.focus();
  const rightSamples = await right.evaluate(async (el) => {
    const read = () => ({
      width: parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          "--detail-width",
        ),
      ),
      pane: document.querySelector(".detail-sidebar")!.getBoundingClientRect()
        .width,
    });
    const frames = [];
    el.click();
    for (let i = 0; i < 5; i++) {
      await new Promise(requestAnimationFrame);
      frames.push(read());
    }
    const mid = read();
    el.click();
    const restart = read();
    for (let i = 0; i < 18; i++) {
      await new Promise(requestAnimationFrame);
      frames.push(read());
    }
    return { frames, mid, restart };
  });
  expect(rightSamples.frames.some((f) => f.width > 72 && f.width < 384)).toBe(
    true,
  );
  for (const f of rightSamples.frames)
    expect(f.pane).toBeCloseTo(f.width - 24, 1);
  expect(
    Math.abs(rightSamples.mid.width - rightSamples.restart.width),
  ).toBeLessThan(1);
  await expect(right).toBeFocused();
  const layout = page.getByRole("group", {
      name: "Disposition de la bibliothèque",
    }),
    positions = await rects(layout, "button");
  await layout
    .getByRole("button", { name: "Grandes pochettes", exact: true })
    .click();
  await expect
    .poll(() =>
      layout.evaluate((e) => getComputedStyle(e, ":before").transform),
    )
    .toBe("none");
  await layout
    .getByRole("button", { name: "Cartes horizontales", exact: true })
    .click();
  await expect
    .poll(() =>
      layout.evaluate((e) => getComputedStyle(e, ":before").transform),
    )
    .toBe("matrix(1, 0, 0, 1, 32, 0)");
  expect(await rects(layout, "button")).toEqual(positions);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await toggle.click();
  await expect(page.locator(".navigation-sidebar")).toHaveCSS("width", "64px");
  await expect(audio).toHaveAttribute("data-identity", "animated82");
  await expect(audio).toHaveJSProperty("currentTime", 7);
});
test("liste de notes : 184px maximum, défilement et petite hauteur accessibles", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 900, height: 520 });
  await page.goto("/");
  const p = await detail(page);
  await p
    .getByRole("button", { name: "Modifier la prod", exact: true })
    .click();
  await p.getByRole("button", { name: /^Tonalité :/ }).click();
  const picker = page.getByRole("dialog", {
    name: "Modifier la tonalité",
    exact: true,
  });
  await picker
    .getByRole("button", { name: "Note de la tonalité", exact: true })
    .click();
  const notes = picker.getByRole("listbox", { name: "Notes", exact: true }),
    box = (await notes.boundingBox())!;
  expect(box.height).toBeLessThanOrEqual(184);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(520);
  await notes
    .getByRole("option", { name: "Non renseignée", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    notes.getByRole("option", { name: "Non renseignée", exact: true }),
  ).toBeInViewport();
  await expect(
    notes.getByRole("option", { name: "Non renseignée", exact: true }),
  ).toHaveCSS("white-space", "nowrap");
  await expect(
    notes.getByRole("option", { name: "Non renseignée", exact: true }),
  ).toHaveAttribute("title", "Non renseignée");
  await notes.screenshot({ path: info.outputPath("notes.png") });
  await notes
    .getByRole("option", { name: "Non renseignée", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(p.getByRole("button", { name: /^Tonalité :/ })).toBeFocused();
  await p
    .getByRole("button", { name: "Annuler les modifications", exact: true })
    .click();
});
