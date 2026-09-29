import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator } from "@playwright/test";

const sceneOpacity = (scene: Locator) =>
  scene.evaluate((element) => Number(getComputedStyle(element).opacity));

const playheads = (workflow: Locator) =>
  workflow.evaluate((element) =>
    element.getAnimations({ subtree: true }).map((animation) => Number(animation.currentTime)),
  );

async function seek(workflow: Locator, milliseconds: number) {
  await workflow.evaluate((element, time) => {
    for (const animation of element.getAnimations({ subtree: true })) {
      animation.pause();
      animation.currentTime = time;
    }
  }, milliseconds);
}

test.describe("hero filing workflow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/alternative");
  });

  test("places the workflow only in the hero with the existing blue and green palette", async ({ page }) => {
    const workflow = page.getByTestId("filing-workflow");
    await expect(workflow).toHaveCount(1);
    await expect(page.locator("#hero").getByTestId("filing-workflow")).toHaveCount(1);
    await expect(page.locator("#hero-animation-preview")).toHaveCount(0);
    await expect(page.locator("[data-workflow-stage]")).toHaveCount(0);

    const background = await page.getByTestId("filing-workflow-stage").evaluate(
      (element) => getComputedStyle(element).backgroundImage,
    );
    const existingBackground = await page.locator(".legacy-method-visual-three").evaluate(
      (element) => getComputedStyle(element).backgroundImage,
    );
    expect(background).not.toBe("none");
    expect(background).toBe(existingBackground);
  });

  test("waits one second after page load and begins with the account entrance", async ({ page }) => {
    await page.addInitScript(() => {
      window.addEventListener("load", () => {
        const documentRoot = document.documentElement;
        performance.mark("workflow-test-loaded");
        const observer = new MutationObserver(() => {
          const workflow = document.querySelector<HTMLElement>('[data-testid="filing-workflow"]');
          if (workflow?.dataset.playbackReady === "true" && !performance.getEntriesByName("workflow-test-ready").length) {
            performance.mark("workflow-test-ready");
          }
        });
        observer.observe(documentRoot, {
          subtree: true,
          attributes: true,
          attributeFilter: ["data-playback-ready"],
        });
      }, { once: true });
    });
    await page.reload();
    const workflow = page.getByTestId("filing-workflow");
    await workflow.scrollIntoViewIfNeeded();
    await expect(workflow).toHaveAttribute("data-playback-ready", "true");
    await expect(workflow).toHaveAttribute("data-playing", "true");
    const delay = await page.evaluate(() =>
      (performance.getEntriesByName("workflow-test-ready")[0]?.startTime ?? 0) -
      (performance.getEntriesByName("workflow-test-loaded")[0]?.startTime ?? 0),
    );
    expect(delay).toBeGreaterThanOrEqual(990);
    expect(await sceneOpacity(workflow.locator('[data-scene="accounts"]'))).toBe(1);
    expect(await sceneOpacity(workflow.locator('[data-scene="reports"]'))).toBe(0);
    expect((await playheads(workflow))[0]).toBeLessThan(2_000);
    expect(await sceneOpacity(workflow.locator('[data-account-synced="5"]'))).toBe(0);
  });

  test("plays the three steps, holds the reports, and loops into the next account sequence", async ({ page }) => {
    const workflow = page.getByTestId("filing-workflow");
    await workflow.scrollIntoViewIfNeeded();
    await expect(workflow).toHaveAttribute("data-playing", "true");

    const timings = await workflow.evaluate((element) =>
      element.getAnimations({ subtree: true }).map((animation) => animation.effect?.getTiming()),
    );
    expect(timings.length).toBeGreaterThan(0);
    expect(timings.every((timing) => timing?.duration === 12_400 && timing.iterations === Infinity)).toBe(true);

    // Watch the complete story play before inspecting paused frames of each step.
    const startedAt = Date.now();
    await expect.poll(() => sceneOpacity(workflow.locator('[data-account-mark="0"]'))).toBe(1);
    expect(await sceneOpacity(workflow.locator('[data-scene="reports"]'))).toBe(0);
    await expect.poll(() => sceneOpacity(workflow.locator('[data-scene="transactions"]')), {
      timeout: 4_000,
      intervals: [50],
    }).toBe(1);
    await expect.poll(() => sceneOpacity(workflow.locator('[data-scene="reports"]')), {
      timeout: 4_000,
      intervals: [50],
    }).toBe(1);
    await expect.poll(() => sceneOpacity(workflow.locator("[data-download]")), {
      timeout: 2_000,
      intervals: [50],
    }).toBe(1);
    expect(Date.now() - startedAt).toBeLessThan(9_000);

    await expect.poll(async () => (await playheads(workflow))[0], { timeout: 2_000 }).toBeGreaterThanOrEqual(9_000);
    await expect(workflow).toHaveAttribute("data-completed", "false");
    await expect(workflow).toHaveAttribute("data-playing", "true");
    await page.waitForTimeout(1_000);
    expect(await sceneOpacity(workflow.locator('[data-scene="accounts"]'))).toBe(0);
    expect(await sceneOpacity(workflow.locator('[data-scene="reports"]'))).toBe(1);
    expect(await sceneOpacity(workflow.locator("[data-download]"))).toBe(1);

    await expect.poll(() => sceneOpacity(workflow.locator('[data-scene="accounts"]')), {
      timeout: 4_000,
      intervals: [50],
    }).toBe(1);
    expect((await playheads(workflow))[0]).toBeGreaterThanOrEqual(12_400);
    expect(await sceneOpacity(workflow.locator('[data-scene="reports"]'))).toBe(0);
    expect(await sceneOpacity(workflow.locator('[data-account-synced="5"]'))).toBe(0);
    await expect(workflow).toHaveAttribute("data-playing", "true");

    // Paused native snapshots verify every account and output without restarting playback.
    await seek(workflow, 2_550);
    await expect(workflow.locator('[data-step-title="accounts"]')).toContainText("Add accounts");
    for (const name of ["Coinbase", "Hyperliquid", "Kraken", "Solana", "Ethereum", "Base"]) {
      await expect(workflow.locator('[data-scene="accounts"]')).toContainText(name);
    }
    const syncedPills = workflow.locator("[data-account-synced]");
    await expect(syncedPills).toHaveCount(6);
    for (const pill of await syncedPills.all()) expect(await sceneOpacity(pill)).toBe(1);

    await seek(workflow, 5_250);
    expect(await sceneOpacity(workflow.locator('[data-scene="accounts"]'))).toBe(0);
    expect(await sceneOpacity(workflow.locator('[data-scene="transactions"]'))).toBe(1);
    expect(await sceneOpacity(workflow.locator('[data-step-title="transactions"]'))).toBe(1);
    await expect(workflow.locator('[data-step-title="transactions"]')).toContainText("Sync transactions");
    for (const pill of await workflow.locator("[data-transaction-pill]").all()) {
      expect(await sceneOpacity(pill)).toBe(1);
    }
    await expect(workflow.locator('[data-scene="transactions"]')).toContainText("HYPE perpetual");

    await seek(workflow, 8_250);
    expect(await sceneOpacity(workflow.locator('[data-scene="transactions"]'))).toBe(0);
    expect(await sceneOpacity(workflow.locator('[data-scene="reports"]'))).toBe(1);
    expect(await sceneOpacity(workflow.locator('[data-step-title="reports"]'))).toBe(1);
    await expect(workflow.locator('[data-step-title="reports"]')).toContainText("Done! Download reports");
    for (const name of ["Form 8949", "Schedule D", "Income report"]) {
      await expect(workflow.locator('[data-scene="reports"]')).toContainText(name);
    }
    expect(await sceneOpacity(workflow.locator("[data-download]"))).toBe(1);

    for (const time of [9_000, 11_950]) {
      await seek(workflow, time);
      expect(await sceneOpacity(workflow.locator('[data-scene="reports"]'))).toBe(1);
      expect(await sceneOpacity(workflow.locator("[data-download]"))).toBe(1);
    }
    await seek(workflow, 12_200);
    for (const name of ["accounts", "reports"]) {
      const opacity = await sceneOpacity(workflow.locator(`[data-scene="${name}"]`));
      expect(opacity).toBeGreaterThan(0);
      expect(opacity).toBeLessThan(1);
    }

    await expect(workflow.getByRole("button")).toHaveCount(0);
  });

  test("pauses offscreen and resumes from the same point when visible", async ({ page }) => {
    const workflow = page.getByTestId("filing-workflow");
    await workflow.scrollIntoViewIfNeeded();
    await expect(workflow).toHaveAttribute("data-playing", "true");
    await expect.poll(async () => (await playheads(workflow))[0]).toBeGreaterThan(300);
    await page.locator("footer").scrollIntoViewIfNeeded();
    await expect(workflow).not.toBeInViewport();
    await expect(workflow).toHaveAttribute("data-playing", "false");
    const offscreen = await playheads(workflow);
    await page.waitForTimeout(500);
    expect(await playheads(workflow)).toEqual(offscreen);

    await workflow.scrollIntoViewIfNeeded();
    await expect(workflow).toHaveAttribute("data-playing", "true");
    await expect.poll(async () => (await playheads(workflow))[0]).toBeGreaterThan(offscreen[0] + 150);
  });

  test("shows a completed static report for reduced motion", async ({ page }) => {
    const hydrationErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" && message.text().includes("Hydration failed")) {
        hydrationErrors.push(message.text());
      }
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    const workflow = page.getByTestId("filing-workflow");
    await workflow.scrollIntoViewIfNeeded();
    await expect(workflow).toHaveAttribute("data-reduced-motion", "true");
    await expect(workflow).toHaveAttribute("data-playing", "false");
    expect(await sceneOpacity(workflow.locator('[data-scene="reports"]'))).toBe(1);
    expect(await sceneOpacity(workflow.locator('[data-scene="accounts"]'))).toBe(0);
    expect(await sceneOpacity(workflow.locator('[data-scene="transactions"]'))).toBe(0);
    for (const name of ["Form 8949", "Schedule D", "Income report"]) {
      const report = workflow.locator("[data-report-row]").filter({ hasText: name });
      expect(await sceneOpacity(report)).toBe(1);
    }
    expect(await sceneOpacity(workflow.locator("[data-download]"))).toBe(1);
    await expect(page.getByRole("button", { name: /workflow animation/ })).toHaveCount(0);
    const paused = await playheads(workflow);
    await page.waitForTimeout(300);
    expect(await playheads(workflow)).toEqual(paused);
    expect(hydrationErrors).toEqual([]);
  });

  test("keeps an accessible description without visible labels or playback controls", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const workflow = page.getByTestId("filing-workflow");
    await workflow.scrollIntoViewIfNeeded();
    await expect(workflow).toHaveAttribute("data-playing", "false");
    await expect(page.getByRole("figure", { name: "Illustrative Glide workflow: add accounts, sync transactions, and download reports" })).toHaveAccessibleDescription(
      "Add accounts, sync transactions, and download your tax reports. Sample data shown.",
    );
    await expect(workflow.getByRole("button")).toHaveCount(0);
    await expect(page.getByText("Illustrative workflow · Sample data", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /workflow animation/ })).toHaveCount(0);
    const results = await new AxeBuilder({ page }).include("#hero").analyze();
    expect(results.violations).toEqual([]);
  });

  test("fits the hero workflow within all supported viewport widths", async ({ page, isMobile }) => {
    test.skip(isMobile, "Desktop project exercises the complete viewport matrix");
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const workflow = page.getByTestId("filing-workflow");
      await workflow.scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `Page overflow at ${width}px`).toBe(true);
      const bounds = await workflow.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);

      const stage = page.getByTestId("filing-workflow-stage");
      const stageBounds = await stage.boundingBox();
      const paperBounds = await page.getByTestId("filing-workflow-paper").boundingBox();
      expect(stageBounds).not.toBeNull();
      expect(paperBounds).not.toBeNull();
      for (const name of ["accounts", "transactions", "reports"]) {
        const title = stage.locator(`[data-step-title="${name}"]`);
        await expect(title).toHaveCount(1);
        expect(await title.evaluate((element) => element.scrollWidth <= element.clientWidth), `${name} title overflow at ${width}px`).toBe(true);
        const titleBounds = await title.boundingBox();
        expect(titleBounds).not.toBeNull();
        expect(titleBounds!.x).toBeGreaterThanOrEqual(stageBounds!.x);
        expect(titleBounds!.x + titleBounds!.width).toBeLessThanOrEqual(stageBounds!.x + stageBounds!.width);
        expect(titleBounds!.y).toBeGreaterThanOrEqual(stageBounds!.y);
        expect(titleBounds!.y + titleBounds!.height, `${name} heading should sit above the white canvas at ${width}px`)
          .toBeLessThanOrEqual(paperBounds!.y);
      }

      const textSizes = await workflow.evaluate((element) => {
        const fontSize = (selector: string) => {
          const target = element.querySelector(selector);
          return target ? Number.parseFloat(getComputedStyle(target).fontSize) : 0;
        };
        return {
          title: fontSize('[data-step-title="reports"] strong'),
          connected: fontSize('[data-account-connected="0"]'),
          amount: fontSize('[data-transaction-amount="0"]'),
          pill: fontSize('[data-account-synced="0"]'),
        };
      });
      expect(textSizes.title).toBeGreaterThanOrEqual(width >= 1440 ? 32 : 20);
      expect(textSizes.connected).toBeGreaterThanOrEqual(width >= 1440 ? 18 : 12);
      expect(textSizes.amount).toBeGreaterThanOrEqual(width >= 1440 ? 21 : 13);
      expect(textSizes.pill).toBeGreaterThanOrEqual(width >= 1440 ? 18 : 12);
    }
  });
});
