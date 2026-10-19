import { chromium, expect } from "@playwright/test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { server } from "./serve.mjs";
const profile = await mkdtemp(join(tmpdir(), "next-click-clean-"));
let context;
const checks = [];
try {
  context = await chromium.launchPersistentContext(profile, {
    channel: process.env.CHROME_CHANNEL || "chrome",
    headless: process.env.HEADED !== "1",
    ignoreDefaultArgs: ["--disable-extensions"],
    args: ["--enable-unsafe-extension-debugging"],
    viewport: { width: 1280, height: 900 },
  });
  const browser = context.browser(),
    cdp = await browser.newBrowserCDPSession();
  console.log("Chrome", browser.version());
  const { id } = await cdp.send("Extensions.loadUnpacked", {
    path: resolve("extension"),
  });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4173");
  const { targetInfos } = await cdp.send("Target.getTargets", {
    filter: [{ type: "tab", exclude: false }],
  });
  const targetInfo = targetInfos.find(
    (t) => t.type === "tab" && t.url === page.url(),
  );
  if (!targetInfo)
    throw new Error(
      `Fixture tab target missing: ${JSON.stringify(targetInfos)}`,
    );
  async function popup() {
    await page.bringToFront();
    const result = context.waitForEvent("page", {
      predicate: (p) => p.url().includes("popup.html"),
      timeout: 10000,
    });
    result.catch(() => {}); // Observe cancellation if triggering fails.
    await cdp.send("Extensions.triggerAction", {
      id,
      targetId: targetInfo.targetId,
    });
    const panel = await result;
    await panel.waitForLoadState();
    return panel;
  }
  let panel = await popup();
  await expect(panel.locator("#status")).toHaveText("Off");
  await panel.getByRole("button", { name: "Turn on", exact: true }).click();
  await expect(panel.locator("#status")).toContainText("On");
  await page.bringToFront();
  await page.locator("#fern").hover();
  await expect(page.locator("[data-next-click-lab]")).toBeVisible();
  await page.screenshot({ path: "evidence/chrome-visible.png" });
  await page.mouse.down();
  await page.mouse.up();
  await expect(page.locator("#result")).toHaveText("Fixture action completed.");
  checks.push(
    "Installed unpacked MV3 extension in a new temporary Chrome profile; triggered the real toolbar action and enabled using its popup.",
    "One visible pointer-events:none overlay; underlying fixture action completed.",
  );
  panel = await popup();
  await expect(panel.locator(".card").first()).toContainText("n=1");
  await expect(
    panel.locator(".card").first().locator(".numbers strong"),
  ).toHaveText(["1", "1", "1"]);
  await panel.screenshot({ path: "evidence/chrome-popup.png" });
  await panel.locator("#mode").selectOption("hidden");
  await page.bringToFront();
  await page.locator("#moss").hover();
  await page.waitForTimeout(300);
  await expect(page.locator("[data-next-click-lab]")).toBeHidden();
  await page.mouse.down();
  await page.mouse.up();
  panel = await popup();
  await expect(
    panel.locator(".card").nth(1).locator(".numbers strong"),
  ).toHaveText(["1", "1", "1"]);
  await expect(panel.locator("#score")).toHaveText("Heuristic score: hidden");
  checks.push(
    "Visible and hidden modes each recorded one controlled predicted/correct click; separate n=1 counts verified in popup. These scripted clicks are functional checks, not accuracy evidence.",
  );
  await panel.locator("#toggle").click();
  await expect(panel.locator("#status")).toHaveText("Off");
  await page.bringToFront();
  await expect(page.locator("[data-next-click-lab]")).toHaveCount(0);
  await page.locator("#fern").click();
  panel = await popup();
  await expect(panel.locator(".card").first()).toContainText("n=1");
  await panel.locator("#mode").selectOption("visible");
  await panel.locator("#toggle").click();
  await page.bringToFront();
  await page.locator("#moss").hover();
  await expect(page.locator("[data-next-click-lab]")).toBeVisible();
  await page.mouse.wheel(0, 1000);
  await page.waitForTimeout(300);
  await page.locator("#lowerButton").hover();
  await expect(page.locator("[data-next-click-lab]")).toBeVisible();
  const rect = await page.locator("#lowerButton").boundingBox(),
    overlay = await page.locator("[data-next-click-lab]").boundingBox();
  expect(Math.abs(rect.y - overlay.y)).toBeLessThan(2);
  checks.push(
    "Off removes the overlay and ignores fixture clicks; re-enable works. Scroll updates to the lower visible target.",
  );
  await page.goto("http://127.0.0.1:4173/second.html");
  await expect(page.locator("[data-next-click-lab]")).toHaveCount(0);
  panel = await popup();
  await expect(panel.locator("#status")).toHaveText("Off");
  await expect(panel.locator(".card").first()).toContainText("n=1");
  await panel.locator("#clear").click();
  await expect(panel.locator(".card").first()).toContainText("n=0");
  await expect(panel.locator(".card").nth(1)).toContainText("n=0");
  await panel.locator("#toggle").click();
  await expect(panel.locator("#status")).toContainText("On");
  checks.push(
    "Full navigation stops prediction; same-tab aggregate survives navigation. Clear resets both modes. Extension can enable on the second document.",
  );
  const report = {
    at: new Date().toISOString(),
    browser: browser.version(),
    platform: process.platform,
    profile: "fresh temporary profile, removed after run",
    installation:
      "CDP Extensions.loadUnpacked; toolbar via Extensions.triggerAction; no host-permission grants or content-script substitution",
    checks,
    limitations: [
      "Headless automated controlled fixtures only; no human predictive-performance study.",
      "Not a Chrome Web Store installation review. No personal browsing data used.",
    ],
  };
  await writeFile(
    "evidence/chrome-verification.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(error);
  throw error;
} finally {
  await context?.close();
  server.close();
  await rm(profile, { recursive: true, force: true });
}
