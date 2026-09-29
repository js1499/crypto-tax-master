import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator } from "@playwright/test";

async function expectPaidPlanGuarantee(table: Locator) {
  await table.scrollIntoViewIfNeeded();
  const headerBounds = await table.locator("thead").boundingBox();
  const priceRowBounds = await table.getByRole("rowheader", { name: "Price", exact: true }).locator("..").boundingBox();
  expect(headerBounds).not.toBeNull();
  expect(priceRowBounds).not.toBeNull();
  if (headerBounds && priceRowBounds) {
    expect(headerBounds.y + headerBounds.height, "Comparison header should not cover the Price row")
      .toBeLessThanOrEqual(priceRowBounds.y);
  }
  const row = table.getByRole("row", { name: /^Money-back guarantee / });
  await expect(row.getByRole("rowheader")).toHaveText("Money-back guarantee");
  await expect(row.getByRole("rowheader")).toHaveCSS("font-weight", "700");
  const guaranteeBackground = await row.getByRole("rowheader").evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  const priceBackground = await table.getByRole("rowheader", { name: "Price", exact: true }).evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  expect(guaranteeBackground).not.toBe(priceBackground);
  expect(await row.evaluate((element) =>
    element.previousElementSibling?.querySelector('th[scope="row"]')?.textContent?.trim(),
  )).toBe("Price");
  await expect(row.getByRole("cell")).toHaveCount(5);
  await expect(row.getByRole("cell").first()).toHaveText("Not applicable");
  await expect(row.getByRole("cell", { name: "Included", exact: true })).toHaveCount(4);
}

test.describe("homepage conversion path", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("uses real destinations and semantic controls", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Every transaction identified",
    );
    await expect(page.getByRole("link", { name: "Get started free" }).first()).toHaveAttribute(
      "href",
      "/register",
    );
    await expect(page.getByRole("link", { name: "See how it works" })).toHaveAttribute(
      "href",
      "#how",
    );
    await expect(page.locator('a[href="#"]')).toHaveCount(0);
    await expect(page.locator("a button, button a")).toHaveCount(0);
  });

  test("FAQ controls open with native keyboard behavior", async ({ page }) => {
    const question = page.locator("summary").filter({ hasText: "What does Glide generate?" });
    await question.focus();
    await page.keyboard.press("Enter");
    await expect(question.locator("xpath=..")).toHaveAttribute("open", "");
    await expect(page.getByText(/Paid plans give you Form 8949/)).toBeVisible();
  });

  test("publishes matching structured data and canonical metadata", async ({ page }) => {
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      "https://glidetaxes.com",
    );
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      "content",
      "Every transaction identified, effortlessly",
    );
    const jsonLd = page.locator('script[type="application/ld+json"]');
    await expect(jsonLd).toHaveCount(1);
    expect(await jsonLd.textContent()).toContain("FAQPage");
  });

  test("has no automated accessibility violations", async ({ page }) => {
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});

test.describe("mobile navigation", () => {
  test.skip(({ isMobile }) => !isMobile, "Mobile project only");

  test("opens, moves focus, and closes with Escape", async ({ page }) => {
    await page.goto("/");
    const menuButton = page.getByRole("button", { name: "Open navigation" });
    await menuButton.focus();
    await page.keyboard.press("Enter");

    const mobileNav = page.getByRole("navigation", { name: "Mobile navigation" });
    await expect(mobileNav).toBeVisible();
    await expect(page.locator(":focus")).toHaveText("How it works");
    await expect(mobileNav.getByRole("link", { name: "Pricing" })).toHaveAttribute(
      "href",
      "/pricing",
    );

    await page.keyboard.press("Escape");
    await expect(mobileNav).toBeHidden();
    await expect(page.getByRole("button", { name: "Open navigation" })).toBeFocused();
  });
});

test.describe("pricing route", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/pricing");
  });

  test("renders the complete semantic comparison", async ({ page }) => {
    const table = page.getByRole("table", { name: "Glide plan feature comparison" });
    await expect(table).toBeVisible();
    await expect(table.locator("thead").getByRole("columnheader")).toHaveCount(6);
    await expect(table.getByRole("rowheader", { name: "Form 8949 / Schedule D" })).toBeVisible();
    await expectPaidPlanGuarantee(table);
    await expect(page.getByRole("link", { name: "Cost basis & tax optimization" })).toHaveAttribute(
      "href",
      "#cost-basis",
    );
  });

  test("supports horizontal scrolling on narrow screens", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Mobile project only");
    const region = page.getByTestId("pricing-table-scroll");
    await expect(region).toBeVisible();
    expect(await region.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    await region.evaluate((element) => {
      element.scrollLeft = 320;
    });
    expect(await region.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  });

  test("has no automated accessibility violations", async ({ page }) => {
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});

test.describe("competitor-benchmarked alternative", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/alternative");
  });

  test("presents a complete product-first conversion path", async ({ page, isMobile }) => {
    const hero = page.locator("#hero");
    const headline = page.getByRole("heading", { level: 1 });
    await expect(headline).toContainText("Crypto taxes, made");
    await expect(headline).toHaveAccessibleName("Crypto taxes, made simple.");
    const rotatingWord = page.getByTestId("hero-rotating-word");
    await expect(rotatingWord).toHaveAttribute("data-word", "simple");
    await expect(rotatingWord, "The headline word should rotate").toHaveAttribute("data-word", "fast", { timeout: 6_000 });
    await expect(hero.getByRole("link")).toHaveCount(1);
    await expect(hero.getByRole("link", { name: "Get started free" })).toHaveAttribute(
      "href",
      "/register",
    );
    await expect(page.getByRole("link", { name: "See how Glide works" })).toHaveCount(0);
    await expect(page.getByTestId("hero-supporting-copy")).toHaveText(
      "Spend up to 95% less time on crypto taxes, accurately.",
    );
    const heroGuarantee = page.getByTestId("hero-guarantee");
    await expect(heroGuarantee).toBeVisible();
    await expect(heroGuarantee).toHaveText("Accurate taxes or your money back.");
    await expect(heroGuarantee).not.toContainText(/paid plans?/i);
    expect(await heroGuarantee.evaluate((element) => {
      const headline = element.closest("#hero")?.querySelector("h1");
      return headline ? Boolean(element.compareDocumentPosition(headline) & Node.DOCUMENT_POSITION_FOLLOWING) : false;
    })).toBe(true);
    const guaranteeBounds = await heroGuarantee.boundingBox();
    const headlineBounds = await hero.getByRole("heading", { level: 1 }).boundingBox();
    expect(guaranteeBounds).not.toBeNull();
    expect(headlineBounds).not.toBeNull();
    if (guaranteeBounds && headlineBounds) {
      expect(guaranteeBounds.y + guaranteeBounds.height, "The guarantee should sit above the hero headline")
        .toBeLessThanOrEqual(headlineBounds.y);
    }
    await expect(page.getByText("Active", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Compare the complete feature matrix/ })).toHaveAttribute(
      "href",
      "/pricing",
    );
    await expect(page.getByText("Easy to use", { exact: true })).toHaveCount(0);
    await expect(page.getByText("One guided workflow from accounts to reports", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Read-only connections keep your crypto in your control", { exact: true })).toHaveCount(0);
    await expect(page.getByText("All major blockchains and exchanges supported", { exact: true })).toHaveCount(0);
    for (const removedLabel of [
      "Illustrative workflow · Sample data",
      "Start free. Pay only when you are ready to export.",
      "Accuracy you can trust",
      "Easy to review",
      "Confidence to file",
      "All your accounts",
    ]) {
      await expect(page.getByText(removedLabel, { exact: true })).toHaveCount(0);
    }
    await expect(page.getByRole("heading", { name: "Less time on taxes. More peace of mind." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "One clear result for your whole portfolio." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "See your result free. Pay when you are ready to file." })).toBeVisible();
    await expect(page.locator("#pricing").getByRole("heading", { name: "Pricing", exact: true })).toBeVisible();
    const guarantee = page.getByTestId("pricing-guarantee");
    await expect(guarantee.getByRole("heading", { name: "Money-back guarantee", exact: true })).toBeVisible();
    await expect(guarantee).toContainText(/paid plans?/i);
    await expect(page.getByRole("heading", { name: "Get your time back." })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Spend your time on the exceptions");
    await expect(page.locator("body")).not.toContainText(String.fromCharCode(8212));
    const table = page.getByRole("table", { name: "Glide plan feature comparison" });
    await expect(table).toBeVisible();
    await expectPaidPlanGuarantee(table);
    if (isMobile) {
      const scrollRegion = page.getByTestId("legacy-pricing-table-scroll");
      expect(await scrollRegion.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
      await scrollRegion.evaluate((element) => { element.scrollLeft = 320; });
      expect(await scrollRegion.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    }
    await expect(page.locator('a[href="#"]')).toHaveCount(0);
    await expect(page.locator("a button, button a")).toHaveCount(0);

    const heroTypography = await page.evaluate(() => {
      const copy = document.querySelector<HTMLElement>("[data-testid=hero-supporting-copy]");
      const workflow = document.querySelector<HTMLElement>("[data-testid=filing-workflow]");
      const primaryCta = document.querySelector<HTMLAnchorElement>('#hero a[href="/register"]');
      if (!copy || !workflow || !primaryCta) return null;
      return {
        copyFamily: getComputedStyle(copy).fontFamily,
        workflowFamily: getComputedStyle(workflow).fontFamily,
        primarySize: Number.parseFloat(getComputedStyle(primaryCta).fontSize),
      };
    });
    expect(heroTypography).not.toBeNull();
    expect(heroTypography?.workflowFamily).toBe(heroTypography?.copyFamily);
    expect(heroTypography?.primarySize).toBeGreaterThanOrEqual(15);
  });

  test("is a noindex comparison route with no accessibility violations", async ({ page }) => {
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex, nofollow/,
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.getByTestId("filing-workflow")).toHaveAttribute("data-reduced-motion", "true");
    await expect(page.getByTestId("hero-rotating-word")).toHaveAttribute("data-word", "simple");
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test("uses a light hero surface with layered depth and readable dark copy", async ({ page }) => {
    const hero = page.locator("#hero");
    await expect(hero).toHaveCSS("background-color", "rgb(244, 247, 251)");
    // Depth is drawn by pseudo-elements only, so the DOM stays clean and the base colour remains the contrast reference.
    await expect(hero.locator(":scope > [aria-hidden=true]")).toHaveCount(0);
    expect(
      await hero.evaluate((element) => [
        getComputedStyle(element, "::before").backgroundImage !== "none",
        getComputedStyle(element, "::after").backgroundImage !== "none",
      ]),
    ).toEqual([true, true]);
    await expect(hero.getByRole("heading", { level: 1 })).toHaveCSS("color", "rgb(11, 36, 71)");
    await expect(page.getByTestId("hero-supporting-copy")).toHaveCSS("color", "rgb(11, 36, 71)");
  });

  test("alternates light and dark section surfaces throughout the page", async ({ page }) => {
    const surfaces = [
      ["#hero", "rgb(244, 247, 251)"],
      ["#product-alt", "rgb(7, 27, 57)"],
      ["#methodology-pricing", "rgb(244, 247, 251)"],
      ["#methodology-audit", "rgb(7, 27, 57)"],
      ["#methodology-accuracy", "rgb(244, 247, 251)"],
      ["#how", "rgb(7, 27, 57)"],
      ["#integrations", "rgb(244, 247, 251)"],
      ["#trial", "rgb(7, 27, 57)"],
      ["#pricing", "rgb(244, 247, 251)"],
      ['section[aria-labelledby="legacy-comparison-heading"]', "rgb(7, 27, 57)"],
      ["#faq", "rgb(244, 247, 251)"],
      ["#faq + section", "rgb(7, 27, 57)"],
      ["footer", "rgb(244, 247, 251)"],
    ] as const;
    for (const [selector, color] of surfaces) {
      await expect(page.locator(selector)).toHaveCSS("background-color", color);
    }
    const selectors = surfaces.map(([selector]) => selector);
    const documentOrder = await page.locator(selectors.join(",")).evaluateAll(
      (elements, expectedSelectors) => elements.map((element) =>
        expectedSelectors.findIndex((selector) => element.matches(selector)),
      ),
      selectors,
    );
    expect(documentOrder).toEqual(selectors.map((_, index) => index));

    const intro = page.locator("#product-alt");
    await expect(intro.getByRole("heading", { name: "Less time on taxes. More peace of mind." })).toBeVisible();
    await expect(intro.locator("article, figure")).toHaveCount(0);
    const tabs = intro.getByRole("navigation", { name: "Methodology sections" });
    for (const [label, destination] of [
      ["Finish faster", "#methodology-pricing"],
      ["Review easily", "#methodology-audit"],
      ["File accurately", "#methodology-accuracy"],
    ]) {
      await expect(tabs.getByRole("link", { name: label })).toHaveAttribute("href", destination);
      await expect(intro.locator(destination)).toHaveCount(0);
      expect(await page.locator(destination).evaluate((element) => element.tagName)).toBe("SECTION");
    }
  });

  test("shows a clear portfolio review with three accounts and a matching total", async ({ page }) => {
    const graphic = page.getByTestId("portfolio-review-graphic");
    await expect(graphic).toHaveAccessibleName("Illustrative portfolio summary ready for a quick review");
    await expect(graphic.getByText("Sample data", { exact: true })).toBeVisible();
    const accounts = graphic.locator("[data-portfolio-account]");
    await expect(accounts).toHaveCount(3);
    for (const [name, amount] of [
      ["Coinbase", "+$5,420.00"],
      ["Hyperliquid", "+$4,680.60"],
      ["Solana", "+$2,740.00"],
    ]) {
      const account = accounts.filter({ hasText: name });
      await expect(account).toHaveCount(1);
      await expect(account).toContainText(amount);
    }
    const amounts = await graphic.locator("[data-portfolio-amount]").allTextContents();
    expect(amounts).toHaveLength(3);
    const toCents = (amount: string) => Math.round(Number(amount.replace(/[^0-9.]/g, "")) * 100);
    const total = graphic.getByTestId("portfolio-review-total");
    await expect(total).toHaveText("+$12,840.60");
    expect(amounts.reduce((sum, amount) => sum + toCents(amount), 0))
      .toBe(toCents(await total.innerText()));
  });

  test("mobile menu supports focus and Escape", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Mobile project only");
    const menuButton = page.getByRole("button", { name: "Open alternative navigation" });
    await expect(menuButton).toHaveAttribute("data-hydrated", "true");
    await menuButton.focus();
    await page.keyboard.press("Enter");

    const mobileNav = page.getByRole("navigation", { name: "Alternative mobile navigation" });
    await expect(mobileNav).toBeVisible();
    await expect(page.locator(":focus")).toHaveText("Integrations");

    await page.keyboard.press("Escape");
    await expect(mobileNav).toBeHidden();
    await expect(menuButton).toBeFocused();
  });

  test("keeps every major section usable across supported viewport widths", async ({ page, isMobile }) => {
    test.skip(isMobile, "The desktop project covers the complete responsive viewport matrix");
    await page.emulateMedia({ reducedMotion: "reduce" });

    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/alternative");

      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
        `Page should not overflow horizontally at ${width}px`,
      ).toBe(true);

      for (const section of ["#methodology-pricing", "#methodology-audit", "#methodology-accuracy"]) {
        const sectionBounds = await page.locator(section).boundingBox();
        expect(sectionBounds).not.toBeNull();
        if (sectionBounds) {
          expect(sectionBounds.x, `${section} left edge at ${width}px`).toBe(0);
          expect(sectionBounds.width, `${section} should fill the viewport at ${width}px`).toBe(width);
        }
      }

      const reviewGraphic = page.getByTestId("portfolio-review-graphic");
      const reviewBounds = await reviewGraphic.boundingBox();
      expect(reviewBounds).not.toBeNull();
      expect(await reviewGraphic.evaluate((element) => element.scrollWidth <= element.clientWidth), `Portfolio review overflow at ${width}px`)
        .toBe(true);
      for (const item of await reviewGraphic.locator('[data-portfolio-account], [data-testid="portfolio-review-total"]').all()) {
        const itemBounds = await item.boundingBox();
        expect(itemBounds).not.toBeNull();
        if (reviewBounds && itemBounds) {
          expect(itemBounds.x, `Portfolio review left edge at ${width}px`).toBeGreaterThanOrEqual(reviewBounds.x);
          expect(itemBounds.x + itemBounds.width, `Portfolio review right edge at ${width}px`)
            .toBeLessThanOrEqual(reviewBounds.x + reviewBounds.width);
          expect(itemBounds.y, `Portfolio review top edge at ${width}px`).toBeGreaterThanOrEqual(reviewBounds.y);
          expect(itemBounds.y + itemBounds.height, `Portfolio review bottom edge at ${width}px`)
            .toBeLessThanOrEqual(reviewBounds.y + reviewBounds.height);
        }
      }

      const trialBounds = await page.locator(".legacy-trial-gradient").boundingBox();
      expect(trialBounds).not.toBeNull();
      const trialCopy = page.locator("#trial h2").locator("..");
      for (const element of await trialCopy.locator(":scope > h2, :scope > p, :scope > a").all()) {
        const bounds = await element.boundingBox();
        expect(bounds).not.toBeNull();
        if (bounds && trialBounds) {
          expect(bounds.x, `Trial copy left edge at ${width}px`).toBeGreaterThanOrEqual(trialBounds.x);
          expect(bounds.y, `Trial copy top edge at ${width}px`).toBeGreaterThanOrEqual(trialBounds.y);
          expect(bounds.x + bounds.width, `Trial copy right edge at ${width}px`)
            .toBeLessThanOrEqual(trialBounds.x + trialBounds.width);
          expect(bounds.y + bounds.height, `Trial copy bottom edge at ${width}px`)
            .toBeLessThanOrEqual(trialBounds.y + trialBounds.height);
        }
      }

      if (width < 640) {
        const buttonBox = await page.locator("#hero").getByRole("link", { name: "Get started free" }).boundingBox();
        expect(buttonBox).not.toBeNull();
        if (buttonBox) {
          expect(buttonBox.x, `Hero CTA should respect the left margin at ${width}px`)
            .toBeGreaterThanOrEqual(16);
          expect(buttonBox.x + buttonBox.width, `Hero CTA should respect the right margin at ${width}px`)
            .toBeLessThanOrEqual(width - 16);
        }
      }

      const chartBox = await page.getByTestId("sol-hourly-chart").boundingBox();
      const exactBox = await page.getByTestId("exact-second-card").boundingBox();
      expect(chartBox).not.toBeNull();
      expect(exactBox).not.toBeNull();
      if (chartBox && exactBox) {
        const overlap = Math.max(0, chartBox.y + chartBox.height - exactBox.y);
        expect(overlap, `Exact-second card overlap at ${width}px`).toBeLessThanOrEqual(34);
        expect(exactBox.width).toBeLessThan(chartBox.width);
      }

      if (width < 1024) {
        const platformGrid = page.locator('[aria-label="Supported platform examples"]');
        const gridBox = await platformGrid.boundingBox();
        expect(gridBox).not.toBeNull();
        if (!gridBox) continue;
        const platformBoxes = await platformGrid.locator(":scope > *").evaluateAll((elements) =>
          elements.map((element) => {
            const rect = element.getBoundingClientRect();
            return { left: rect.left, right: rect.right };
          }),
        );
        for (const box of platformBoxes) {
          expect(box.left).toBeGreaterThanOrEqual(gridBox.x - 1);
          expect(box.right).toBeLessThanOrEqual(gridBox.x + gridBox.width + 1);
        }
      }

      if (width >= 1024) {
        const supportingCopyBox = await page.getByTestId("hero-supporting-copy").boundingBox();
        const workflowWindowBox = await page.getByTestId("filing-workflow-stage").boundingBox();
        const buttonBox = await page.locator("#hero").getByRole("link", { name: "Get started free" }).boundingBox();
        expect(supportingCopyBox).not.toBeNull();
        expect(workflowWindowBox).not.toBeNull();
        expect(buttonBox).not.toBeNull();
        if (supportingCopyBox && workflowWindowBox && buttonBox) {
          // The hero is a centered stack: copy, then CTA, then the full-width workflow below it.
          const gap = workflowWindowBox.y - (buttonBox.y + buttonBox.height);
          expect(gap, `Hero CTA-to-product gap at ${width}px`).toBeGreaterThanOrEqual(20);

          const copyCenter = supportingCopyBox.x + supportingCopyBox.width / 2;
          const workflowCenter = workflowWindowBox.x + workflowWindowBox.width / 2;
          expect(Math.abs(copyCenter - width / 2), `Hero copy should be centered at ${width}px`).toBeLessThanOrEqual(2);
          expect(Math.abs(workflowCenter - width / 2), `Hero workflow should be centered at ${width}px`).toBeLessThanOrEqual(2);
          expect(workflowWindowBox.width, `Hero workflow should span most of the viewport at ${width}px`)
            .toBeGreaterThanOrEqual(width * 0.7);
        }
      }
    }
  });
});

test("owned routes, robots, and sitemap render successfully", async ({ request }) => {
  for (const route of ["/", "/pricing", "/alternative"]) {
    const response = await request.get(route);
    expect(response.ok()).toBe(true);
  }

  const robots = await request.get("/robots.txt");
  expect(robots.ok()).toBe(true);
  expect(await robots.text()).toContain("Disallow: /register");

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.ok()).toBe(true);
  expect(await sitemap.text()).toContain("https://glidetaxes.com/pricing");
});
