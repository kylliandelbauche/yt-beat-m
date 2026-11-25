import { expect, test } from "@playwright/test";

const first = "R&B Mélancolique";
const second = "Drill minuit";

for (const layout of ["horizontal", "covers"]) {
  for (const width of [1440, 1000]) {
    test(`Play sélectionne sans ouvrir le volet ni déplacer les cartes : ${layout}, ${width}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(
        (layout) => localStorage.setItem("beat-m-layout", layout),
        layout,
      );
      await page.goto("/");
      const a = page
        .locator(".beat-card")
        .filter({
          has: page.getByRole("button", {
            name: `Détails de ${first}`,
            exact: true,
          }),
        });
      const b = page
        .locator(".beat-card")
        .filter({
          has: page.getByRole("button", {
            name: `Détails de ${second}`,
            exact: true,
          }),
        });
      const playA = a.getByRole("button", {
        name: `Écouter ${first}`,
        exact: true,
      });
      await expect(playA).toBeVisible();
      const geometry = () =>
        page.locator(".beat-card").evaluateAll((elements) =>
          elements.map((element) => {
            const r = element.getBoundingClientRect();
            return [r.x, r.y, r.width, r.height];
          }),
        );
      const before = await geometry();
      await playA.focus();
      await page.keyboard.press("Enter");
      const audio = page.locator("audio");
      await expect(audio).toHaveJSProperty("paused", false);
      await expect(a).toHaveAttribute("aria-current", "true");
      await expect(page.locator(".beat-card.selected")).toHaveCount(1);
      await expect(page.locator(".workspace")).not.toHaveClass(/detail-open/);
      expect(await geometry()).toEqual(before);
      await audio.evaluate((el: HTMLAudioElement) => {
        el.pause();
        el.currentTime = 7;
        el.dataset.persistent = "same-track";
      });
      await expect(a).toHaveAttribute("aria-current", "true");
      await page.getByRole("button", { name: "Lire", exact: true }).click();
      await expect(audio).toHaveJSProperty("paused", false);
      await expect(audio).toHaveAttribute("data-persistent", "same-track");
      expect(
        await audio.evaluate((el: HTMLAudioElement) => el.currentTime),
      ).toBeGreaterThanOrEqual(7);
      await b
        .getByRole("button", { name: `Écouter ${second}`, exact: true })
        .click();
      await expect(b).toHaveAttribute("aria-current", "true");
      await expect(a).not.toHaveAttribute("aria-current");
      await expect(audio).toHaveAttribute("src", /000000000002\/audio$/);
      await expect(page.locator(".workspace")).not.toHaveClass(/detail-open/);
      expect(await geometry()).toEqual(before);
      const search = page.getByRole("searchbox", {
        name: "Rechercher une prod",
        exact: true,
      });
      await search.fill(first);
      await expect(b).toHaveCount(0);
      await page.getByRole("button", { name: "Pause", exact: true }).click();
      await page.getByRole("button", { name: "Lire", exact: true }).click();
      await expect(search).toHaveValue(first);
      await expect(audio).toHaveAttribute("src", /000000000002\/audio$/);
      await search.fill("");
      await expect(b).toHaveAttribute("aria-current", "true");
    });
  }
}

test("la fiche suit Play quand elle est disponible, sans perdre un brouillon", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: `Écouter ${first}`, exact: true })
    .click();
  await page
    .getByRole("button", { name: `Détails de ${first}`, exact: true })
    .click();
  const panelA = page.getByRole("region", { name: first, exact: true });
  await panelA
    .getByRole("button", { name: "Modifier la prod", exact: true })
    .click();
  await panelA.getByLabel("BPM", { exact: true }).fill("151");
  const playB = page.getByRole("button", {
    name: `Écouter ${second}`,
    exact: true,
  });
  await playB.click();
  await expect(panelA.getByLabel("BPM", { exact: true })).toHaveValue("151");
  await expect(
    panelA.getByRole("button", {
      name: "Enregistrer les modifications",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".beat-card.selected")).toHaveAttribute(
    "aria-current",
    "true",
  );
  await expect(page.locator(".beat-card.selected")).toContainText(second);
  await expect(page.locator("audio")).toHaveAttribute(
    "src",
    /000000000002\/audio$/,
  );
  await panelA
    .getByRole("button", { name: "Annuler les modifications", exact: true })
    .click();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: "Lire", exact: true }).click();
  await expect(
    page.getByRole("region", { name: second, exact: true }),
  ).toBeVisible();
  await expect(page.locator(".workspace")).toHaveClass(/detail-open/);
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeFocused();
});
