import puppeteer from "puppeteer-core";
import { expect } from "@playwright/test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { server } from "./serve.mjs";
const profile = await mkdtemp(join(tmpdir(), "next-click-clean-"));
let browser;
const checks = [];
try {
  browser = await puppeteer.launch({
    channel: "chrome",
    headless: process.env.HEADED !== "1",
    pipe: true,
    enableExtensions: true,
    userDataDir: profile,
    args: ["--no-sandbox", "--enable-unsafe-extension-debugging"],
    defaultViewport: { width: 1280, height: 900 },
  });
  console.log("Chrome", await browser.version());
  const id = await browser.installExtension(resolve("extension"));
  const extension = (await browser.extensions()).get(id);
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:4173");
  const text = (p, selector) => p.$eval(selector, (el) => el.textContent);
  const contains = async (p, selector, value) =>
    expect.poll(() => text(p, selector)).toContain(value);
  const equal = async (p, selector, value) =>
    expect.poll(() => text(p, selector)).toBe(value);
  const visible = async (expected) =>
    expect
      .poll(() =>
        page
          .$eval(
            "[data-next-click-lab]",
            (el) => getComputedStyle(el).display !== "none",
          )
          .catch(() => false),
      )
      .toBe(expected);
  const numbers = (p, index) =>
    p.$$eval(
      ".card",
      (cards, index) =>
        Array.from(
          cards[index].querySelectorAll(".numbers strong"),
          (el) => el.textContent,
        ),
      index,
    );
  async function popup() {
    await page.bringToFront();
    await extension.triggerAction(page);
    const target = await browser.waitForTarget(
      (t) => t.url() === `chrome-extension://${id}/popup.html`,
      { timeout: 10000 },
    );
    // Toolbar popups may be CDP 'other' targets; asPage is Puppeteer's public API for this.
    const panel = await target.asPage();
    await panel.waitForSelector("#toggle");
    return panel;
  }
  let panel = await popup();
  await equal(panel, "#status", "Off");
  await panel.click("#toggle");
  await contains(panel, "#status", "On");
  await page.bringToFront();
  await page.hover("#fern");
  await visible(true);
  await page.screenshot({ path: "evidence/chrome-visible.png" });
  await page.mouse.down();
  await page.mouse.up();
  await equal(page, "#result", "Fixture action completed.");
  checks.push(
    "Installed unpacked MV3 extension in a fresh temporary Chrome profile; triggered the real toolbar action and enabled using its popup.",
    "One visible pointer-events:none overlay; underlying fixture action completed.",
  );
  panel = await popup();
  await expect.poll(() => numbers(panel, 0)).toEqual(["1", "1", "1"]);
  await panel.screenshot({ path: "evidence/chrome-popup.png" });
  await panel.select("#mode", "hidden");
  await page.bringToFront();
  await page.hover("#moss");
  await new Promise((r) => setTimeout(r, 300));
  await visible(false);
  await page.mouse.down();
  await page.mouse.up();
  panel = await popup();
  await expect.poll(() => numbers(panel, 1)).toEqual(["1", "1", "1"]);
  await equal(panel, "#score", "Heuristic score: hidden");
  checks.push(
    "Visible and hidden modes each recorded one controlled predicted/correct click; separate n=1 counts verified in popup. These scripted clicks are functional checks, not accuracy evidence.",
  );
  await panel.click("#toggle");
  await equal(panel, "#status", "Off");
  await page.bringToFront();
  expect(await page.$$("[data-next-click-lab]")).toHaveLength(0);
  await page.click("#fern");
  panel = await popup();
  await expect.poll(() => numbers(panel, 0)).toEqual(["1", "1", "1"]);
  await panel.select("#mode", "visible");
  await panel.click("#toggle");
  await contains(panel, "#status", "On");
  await page.bringToFront();
  await page.hover("#moss");
  await visible(true);
  await page.mouse.wheel({ deltaY: 1000 });
  await new Promise((r) => setTimeout(r, 300));
  await page.hover("#lowerButton");
  await visible(true);
  await expect
    .poll(() =>
      page.evaluate(() =>
        Math.abs(
          document.querySelector("#lowerButton").getBoundingClientRect().y -
            document
              .querySelector("[data-next-click-lab]")
              .getBoundingClientRect().y,
        ),
      ),
    )
    .toBeLessThan(2);
  checks.push(
    "Off removes the overlay and ignores fixture clicks; re-enable works. Scroll updates to the lower visible target.",
  );
  await page.hover("#lower a");
  await new Promise((r) => setTimeout(r, 300));
  await Promise.all([page.waitForNavigation(), page.click("#lower a")]);
  expect(page.url()).toContain("/second.html");
  expect(await page.$$("[data-next-click-lab]")).toHaveLength(0);
  panel = await popup();
  await equal(panel, "#status", "Off");
  await expect.poll(() => numbers(panel, 0)).toEqual(["2", "2", "2"]);
  await panel.click("#clear");
  await expect.poll(() => numbers(panel, 0)).toEqual(["0", "0", "0"]);
  await expect.poll(() => numbers(panel, 1)).toEqual(["0", "0", "0"]);
  await panel.click("#toggle");
  await contains(panel, "#status", "On");
  checks.push(
    "A predicted real link click navigates and increments visible counts to predictions=2, actual=2, correct=2. Full navigation stops prediction; same-tab aggregate survives. Clear resets both modes. Can enable on the second document.",
  );
  const report = {
    at: new Date().toISOString(),
    browser: await browser.version(),
    platform: process.platform,
    display:
      process.env.HEADED === "1" ? "headed Chrome under Xvfb" : "headless",
    profile: "fresh temporary profile, removed after run",
    installation:
      "Puppeteer public installExtension and extension.triggerAction APIs (CDP Extensions domain); real toolbar popup; no host-permission grants or content-script substitution",
    checks,
    limitations: [
      "Automated controlled fixtures only; no human predictive-performance study.",
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
  await browser?.close();
  server.close();
  await rm(profile, { recursive: true, force: true });
}
