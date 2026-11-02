import { expect, test } from "@playwright/test";

const title = "R&B Mélancolique";
const identity = "00000000-0000-0000-0000-000000000001";

test("reprendre un import au rechargement conserve son lien et sa relance", async ({
  page,
}) => {
  const url = "https://youtu.be/PROGRESS001";
  const base = {
    id: "resume-paper78",
    source_url: url,
    state: "running",
    stage: "downloading",
    progress: 24,
    error_message: null,
    beat_id: null,
  };
  let job = { ...base },
    submitted = "";
  await page.route("**/api/imports", (route) => {
    if (route.request().method() === "POST") {
      submitted = route.request().postDataJSON().url;
      job = { ...base };
      return route.fulfill({ json: { job, beat_id: null, duplicate: false } });
    }
    return route.fulfill({ json: { jobs: [job] } });
  });
  await page.goto("/");
  await expect(page.locator("#youtube-url")).toHaveValue(url);
  await page.reload();
  await expect(page.locator("#youtube-url")).toHaveValue(url);
  job = { ...base, state: "failed", stage: "failed" };
  await expect(
    page.getByRole("button", { name: "Réessayer", exact: true }),
  ).toBeEnabled();
  await page.locator("#youtube-url").fill("");
  await page.getByRole("button", { name: "Réessayer", exact: true }).click();
  await expect.poll(() => submitted).toBe(url);
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "24",
  );
});

test("fermer les réglages pendant leur entrée conserve focus et audio en mouvement normal", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await page
    .getByRole("button", { name: `Écouter ${title}`, exact: true })
    .click();
  const audio = page.locator("audio");
  await expect(audio).toHaveJSProperty("paused", false);
  const trigger = page.getByRole("button", { name: "Réglages", exact: true });
  await trigger.click();
  const modal = page.getByRole("dialog", { name: "Réglages", exact: true });
  const close = (await modal
    .getByRole("button", { name: "Fermer les réglages", exact: true })
    .boundingBox())!;
  await page.mouse.click(close.x + close.width / 2, close.y + close.height / 2);
  await expect(modal).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(audio).toHaveJSProperty("paused", false);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
});

test("diagnostic réel et relance après erreur, sans interrompre la lecture", async ({
  page,
}) => {
  let fail = true;
  await page.route("**/api/diagnostics", (route) =>
    fail
      ? route.fulfill({
          status: 503,
          json: { detail: "Diagnostic momentanément indisponible." },
        })
      : route.continue(),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: `Écouter ${title}`, exact: true })
    .click();
  const audio = page.locator("audio");
  await expect(audio).toHaveJSProperty("paused", false);
  await audio.evaluate((el: HTMLAudioElement) => {
    el.currentTime = 2;
    el.dataset.identity = "diagnostic";
  });
  await page.getByRole("button", { name: "Réglages", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Réglages", exact: true });
  await expect(modal.getByRole("status")).toContainText(
    "Diagnostic momentanément indisponible.",
  );
  const before = await modal.boundingBox();
  fail = false;
  await modal
    .getByRole("button", { name: "Vérifier à nouveau", exact: true })
    .click();
  const actual = await (await page.request.get("/api/diagnostics")).json();
  await expect(modal.locator(".dependency-list li")).toHaveCount(
    actual.dependencies.length,
  );
  for (const dependency of actual.dependencies)
    await expect(modal.locator(".dependency-list")).toContainText(
      dependency.name,
    );
  expect(await modal.boundingBox()).toEqual(before);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Réglages", exact: true }),
  ).toBeFocused();
  await expect(audio).toHaveAttribute("data-identity", "diagnostic");
  await expect(audio).toHaveJSProperty("paused", false);
});

test("chargement du catalogue : erreur récupérable et données réelles après relance", async ({
  page,
}) => {
  let fail = true;
  await page.route("**/api/beats?*", (route) =>
    fail
      ? route.fulfill({
          status: 503,
          json: { detail: "Catalogue indisponible." },
        })
      : route.continue(),
  );
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText(
    "Catalogue indisponible.",
  );
  const heading = await page.locator(".library-center:not([hidden]) .catalog-heading").boundingBox();
  fail = false;
  await page.getByRole("button", { name: "Réessayer", exact: true }).click();
  await expect(
    page.getByRole("button", { name: `Écouter ${title}`, exact: true }),
  ).toBeVisible();
  expect(await page.locator(".library-center:not([hidden]) .catalog-heading").boundingBox()).toEqual(heading);
});

for (const entry of ["carte", "fiche", "lecteur"]) {
  test(`erreur audio réelle puis reprise depuis ${entry}, avec préférences conservées`, async ({
    page,
  }) => {
    let unavailable = true;
    await page.route(`**/api/beats/${identity}/audio`, (route) =>
      unavailable
        ? route.fulfill({ status: 503, body: "Media indisponible" })
        : route.continue(),
    );
    await page.goto("/");
    const card = page.locator(".beat-card").filter({
      has: page.getByRole("button", {
        name: `Détails de ${title}`,
        exact: true,
      }),
    });
    let control = card.getByRole("button", {
      name: `Écouter ${title}`,
      exact: true,
    });
    if (entry === "fiche") {
      await card
        .getByRole("button", { name: `Détails de ${title}`, exact: true })
        .click();
      control = page
        .getByRole("region", { name: title, exact: true })
        .getByRole("button", { name: `Écouter ${title}`, exact: true });
    }
    await control.click();
    const audio = page.locator("audio");
    await expect
      .poll(() => audio.evaluate((el: HTMLAudioElement) => el.error?.code || 0))
      .toBeGreaterThan(0);
    const player = page.getByRole("complementary", {
      name: "Lecteur audio",
      exact: true,
    });
    await expect(
      player.getByRole("button", { name: "Réessayer la lecture", exact: true }),
    ).toBeVisible();
    const before = await player.boundingBox();
    unavailable = false;
    if (entry === "lecteur")
      await player
        .getByRole("button", { name: "Réessayer la lecture", exact: true })
        .click();
    else await control.click();
    await expect(audio).toHaveJSProperty("paused", false);
    await expect
      .poll(() => audio.evaluate((el: HTMLAudioElement) => el.error?.code || 0))
      .toBe(0);
    expect(await player.boundingBox()).toEqual(before);
    await expect(
      player.getByRole("button", { name: "Pause", exact: true }),
    ).toBeVisible();
  });
}

test("afficher le fichier : appel protégé, erreur visible et nouvel essai sans déplacer les actions", async ({
  page,
}) => {
  let fail = true,
    calls = 0;
  await page.route(`**/api/beats/${identity}/reveal`, async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(await route.request().headerValue("x-session-token")).toBeTruthy();
    calls++;
    await route.fulfill(
      fail
        ? {
            status: 503,
            json: { detail: "Dossier momentanément inaccessible." },
          }
        : { json: { opened: true } },
    );
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: `Détails de ${title}`, exact: true })
    .click();
  const panel = page.getByRole("region", { name: title, exact: true }),
    button = panel.getByRole("button", {
      name: "Afficher le fichier",
      exact: true,
    });
  const before = await button.boundingBox();
  await button.click();
  await expect(panel.getByRole("alert")).toContainText(
    "Dossier momentanément inaccessible.",
  );
  expect(await button.boundingBox()).toEqual(before);
  fail = false;
  await button.click();
  await expect(button).toHaveAttribute("aria-busy", "false");
  expect(calls).toBe(2);
  expect(await button.boundingBox()).toEqual(before);
});

test("pagination et recherche lente conservent le catalogue et son défilement jusqu’à la réponse", async ({
  page,
}) => {
  const actual = await (await page.request.get("/api/beats?limit=48")).json();
  const beats = Array.from({ length: 49 }, (_, index) => ({
    ...actual.beats[index % actual.beats.length],
    id: `10000000-0000-0000-0000-${String(index + 1).padStart(12, "0")}`,
    title: `Prod de pagination ${index + 1}`,
  }));
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/beats?*", async (route) => {
    const url = new URL(route.request().url()),
      q = url.searchParams.get("q"),
      offset = Number(url.searchParams.get("offset") || 0);
    if (q) await gate;
    await route.fulfill({
      json: {
        total: q ? 1 : 49,
        beats: q ? [beats[0]] : beats.slice(offset, offset + 48),
      },
    });
  });
  await page.goto("/");
  await expect(page.locator(".beat-card")).toHaveCount(48);
  await page
    .getByRole("button", { name: "Afficher plus de prods", exact: true })
    .click();
  await expect(page.locator(".beat-card")).toHaveCount(49);
  const center = page.locator(".library-center:not([hidden])");
  await center.evaluate((el) => {
    el.scrollTop = 600;
  });
  await page
    .getByRole("searchbox", { name: "Rechercher une prod", exact: true })
    .fill("pagination");
  // Capture after focusing search; the focus scroll itself is intentional.
  const before = await page.locator(".catalog-stage").boundingBox();
  await expect(page.locator(".beat-grid")).toHaveAttribute("aria-busy", "true");
  await expect(page.locator(".beat-card")).toHaveCount(49);
  expect(await page.locator(".catalog-stage").boundingBox()).toEqual(before);
  release();
  await expect(page.locator(".beat-card")).toHaveCount(1);
});
