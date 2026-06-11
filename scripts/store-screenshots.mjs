// Store screenshot generator — signs into the running dev server as the
// reviewer demo account and captures the main screens at exact store sizes.
//
// Usage:  node scripts/store-screenshots.mjs
// Needs:  dev server on http://localhost:5173, Microsoft Edge, and the
//         reviewer@halftime-app.com demo account (see keys/ folder).
//
// Output: store/screenshots/iphone-6.7/  (1290x2796 — App Store requirement)
//         store/screenshots/android/     (1290x2580 — 2:1, Play-compliant)
import puppeteer from "puppeteer-core";
import { mkdirSync } from "fs";
import path from "path";

const BASE = "http://localhost:5173";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const EMAIL = "reviewer@halftime-app.com";
const PASSWORD = process.env.DEMO_PASSWORD ?? "ReviewHalfTime26!";

// CSS viewport x deviceScaleFactor = output pixels
const SIZES = [
  { dir: "store/screenshots/iphone-6.7", width: 430, height: 932, dpr: 3 }, // 1290x2796
  { dir: "store/screenshots/android",    width: 430, height: 860, dpr: 3 }, // 1290x2580
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function clickText(page, text) {
  const el = await page.waitForSelector(`::-p-text(${text})`, { timeout: 10000 });
  await el.click();
  await sleep(1800);
}

// Click the bottom-nav tab whose label matches exactly (other page text can
// contain the same word, e.g. "0 Games this season").
async function clickNav(page, label) {
  await page.evaluate((label) => {
    const candidates = [...document.querySelectorAll("button, div, span")]
      .filter((el) => el.textContent.trim().toLowerCase() === label.toLowerCase() &&
                      el.children.length === 0);
    if (!candidates.length) throw new Error(`nav label not found: ${label}`);
    // bottom-most match = the nav bar
    candidates.sort((a, b) =>
      b.getBoundingClientRect().top - a.getBoundingClientRect().top);
    candidates[0].closest("button, [role=button], div")?.click();
    candidates[0].click();
  }, label);
  await sleep(1800);
}

async function run() {
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: "new",
    args: ["--no-first-run", "--disable-extensions"],
  });

  for (const size of SIZES) {
    mkdirSync(size.dir, { recursive: true });
    // Fresh incognito context per size — keeps sessions/localStorage isolated
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({
      width: size.width, height: size.height,
      deviceScaleFactor: size.dpr, isMobile: true, hasTouch: true,
    });
    // Skip the one-time onboarding carousel
    await page.evaluateOnNewDocument(() => localStorage.setItem("ht_onboarded", "1"));

    const shot = async (name) =>
      page.screenshot({ path: path.join(size.dir, `${name}.png`) });

    // ── Sign in ──────────────────────────────────────────────────────────
    await page.goto(`${BASE}/auth/signin`, { waitUntil: "networkidle2" });
    await page.type('input[type="email"]', EMAIL, { delay: 10 });
    await page.type('input[type="password"]', PASSWORD, { delay: 10 });
    await shot("00-signin");
    await clickText(page, "Sign in →");
    await page.waitForSelector("::-p-text(Chase Field Crew)", { timeout: 20000 });
    await sleep(1500);

    // ── Home hub ─────────────────────────────────────────────────────────
    await shot("01-home");

    // ── Pod dashboard ────────────────────────────────────────────────────
    await clickText(page, "Chase Field Crew");
    await sleep(1500);
    await shot("02-pod-dashboard");

    // ── Bottom-nav screens ───────────────────────────────────────────────
    await clickNav(page, "Games");
    await shot("03-games");
    await clickNav(page, "Resale");
    await shot("04-resale");
    await clickNav(page, "Pod");
    await shot("05-pod");

    await context.close();
    console.log(`done: ${size.dir} (${size.width * size.dpr}x${size.height * size.dpr})`);
  }

  await browser.close();
}

run().catch((e) => { console.error(e); process.exit(1); });
