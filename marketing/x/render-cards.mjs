// Renders the X (Twitter) image cards in marketing/x/images/ from inline HTML.
// Run from the repo root:  node marketing/x/render-cards.mjs
// Needs Playwright (global install is fine: NODE_PATH=$(npm root -g)).
import { createRequire } from "module";
import { mkdirSync, readFileSync } from "fs";

const { chromium } = createRequire(import.meta.url)("playwright");

const OUT = "marketing/x/images";
const T = { dark: "#060F08", forest: "#0D2B1A", green: "#1A4A2E", lime: "#C8F135",
  white: "#FFFFFF", chalk: "#E8F0E0", mist: "#7A9E82", teal: "#34D399", amber: "#FBBF24" };

const shot = (name) =>
  "data:image/png;base64," + readFileSync(`store/screenshots/iphone-6.7/${name}`).toString("base64");

// Gelasio (Georgia metrics) and Carlito (Calibri metrics), both OFL, embedded so
// rendering never depends on network access to Google Fonts.
const font = (family, weight, file) =>
  `@font-face{font-family:${family};font-weight:${weight};src:url(data:font/woff2;base64,${
    readFileSync(`marketing/x/fonts/${file}`).toString("base64")}) format("woff2")}`;
const FONTS = [font("Gelasio", 700, "Gelasio-700.woff2"), font("Carlito", 400, "Carlito-400.woff2"),
  font("Carlito", 700, "Carlito-700.woff2")].join("\n");

const base = (w, h, body) => `<!doctype html><html><head>
<style>
${FONTS}
  *{box-sizing:border-box;margin:0}
  body{width:${w}px;height:${h}px;background:${T.dark};color:${T.white};
    font-family:Carlito,Calibri,sans-serif;overflow:hidden;position:relative}
  .serif{font-family:Gelasio,Georgia,serif;font-weight:700;font-variant-numeric:lining-nums}
  .glow{position:absolute;border-radius:50%;pointer-events:none}
  .wm{font-family:Gelasio,Georgia,serif;font-weight:700;line-height:1}
  .wm b{color:${T.lime};font-weight:700}
  .eyebrow{font-size:22px;letter-spacing:4px;text-transform:uppercase;color:${T.lime};font-weight:700}
  .foot{position:absolute;left:96px;bottom:64px;font-size:26px;color:${T.mist};letter-spacing:.5px}
</style></head><body>
<div class="glow" style="top:-260px;right:-200px;width:760px;height:760px;background:radial-gradient(circle,${T.lime}1f,transparent 65%)"></div>
<div class="glow" style="bottom:-320px;left:-240px;width:760px;height:760px;background:radial-gradient(circle,${T.lime}14,transparent 65%)"></div>
${body}</body></html>`;

const card = (body) => base(1600, 900, body);
const footer = `<div class="foot"><span class="wm" style="font-size:30px;color:${T.white}">Half<b>Time</b></span>&nbsp;&nbsp;·&nbsp;&nbsp;halftime-app.com</div>`;

const cards = {
  "01-intro.png": card(`
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:0 96px">
      <div class="wm" style="font-size:150px">Half<b>Time</b></div>
      <div class="serif" style="font-size:54px;color:${T.chalk};margin-top:26px;font-weight:700">Split the season. Share the seats.</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:22px;margin-top:70px">
        ${[["Start a pod", "Invite your crew and set shares"],
           ["Fund escrow", "Stripe holds it until everyone's in"],
           ["Split games", "Draft, lottery, or fairness engine"],
           ["Trade or resell", "No empty seats"]].map(([t, s], i) => `
          <div style="background:${T.forest};border:1px solid ${T.green};border-radius:20px;padding:28px 26px">
            <div style="font-size:22px;color:${T.lime};font-weight:700;letter-spacing:2px">STEP ${i + 1}</div>
            <div class="serif" style="font-size:34px;margin-top:10px">${t}</div>
            <div style="font-size:24px;color:${T.mist};margin-top:8px;line-height:1.3">${s}</div>
          </div>`).join("")}
      </div>
    </div>`),

  "02-season-math.png": card(`
    <div style="position:absolute;inset:0;display:grid;grid-template-columns:1.1fr 1fr;align-items:center;padding:0 96px;gap:60px">
      <div>
        <div class="eyebrow">The season ticket math</div>
        <div style="margin-top:34px;display:flex;flex-direction:column;gap:6px">
          ${[["41", "home games"], ["2", "seats"], ["1", "of you"]].map(([n, l]) => `
            <div style="display:flex;align-items:baseline;gap:28px">
              <span class="serif" style="font-size:120px;line-height:1.05;min-width:250px;font-variant-numeric:lining-nums tabular-nums">${n}</span>
              <span style="font-size:44px;color:${T.chalk}">${l}</span>
            </div>`).join("")}
          <div style="display:flex;align-items:baseline;gap:28px">
            <span class="serif" style="font-size:120px;line-height:1.05;min-width:250px;font-variant-numeric:lining-nums;color:${T.amber}">~12</span>
            <span style="font-size:44px;color:${T.chalk}">nights you'll make it</span>
          </div>
        </div>
      </div>
      <div style="text-align:right">
        <div class="serif" style="font-size:118px;line-height:1;color:${T.lime}">Get a<br>pod.</div>
        <div style="font-size:30px;color:${T.mist};margin-top:28px;line-height:1.4">Split the cost. Share the games.<br>Resell the rest.</div>
      </div>
    </div>${footer}`),

  "03-snake-draft.png": card(`
    <div style="position:absolute;inset:0;padding:84px 96px">
      <div class="eyebrow">How a snake draft splits a season</div>
      <div class="serif" style="font-size:62px;margin-top:18px;max-width:1300px;line-height:1.1">Last pick this round is first pick next round.</div>
      <div style="margin-top:54px;display:flex;flex-direction:column;gap:18px">
        ${[0, 1, 2].map((r) => {
          const order = r % 2 === 0 ? ["A", "B", "C", "D"] : ["D", "C", "B", "A"];
          return `<div style="display:flex;align-items:center;gap:22px">
            <div style="width:190px;font-size:28px;color:${T.mist};font-weight:700;letter-spacing:2px">ROUND ${r + 1}</div>
            ${order.map((m, i) => `
              <div style="display:flex;align-items:center;gap:22px">
                <div class="serif" style="width:118px;height:88px;border-radius:18px;display:flex;align-items:center;justify-content:center;font-size:46px;
                  background:${i === 0 ? T.lime : T.forest};color:${i === 0 ? T.dark : T.white};border:1px solid ${i === 0 ? T.lime : T.green}">${m}</div>
                ${i < 3 ? `<div style="font-size:40px;color:${T.green}">→</div>` : ""}
              </div>`).join("")}
            <div style="font-size:26px;color:${T.mist};margin-left:20px">${r === 0 ? "Best games first" : r === 1 ? "Order flips" : "…until every game is picked"}</div>
          </div>`;
        }).join("")}
      </div>
    </div>${footer}`),

  "04-fairness.png": card(`
    <div style="position:absolute;inset:0;display:grid;grid-template-columns:auto 1fr;gap:110px;align-items:center;padding:0 96px">
      <div style="position:relative;width:440px;height:440px">
        <svg width="440" height="440" viewBox="0 0 440 440">
          <circle cx="220" cy="220" r="185" fill="none" stroke="${T.green}" stroke-width="34"/>
          <circle cx="220" cy="220" r="185" fill="none" stroke="${T.lime}" stroke-width="34" stroke-linecap="round"
            stroke-dasharray="${(2 * Math.PI * 185 * 0.96).toFixed(1)} 9999" transform="rotate(-90 220 220)"/>
        </svg>
        <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
          <div class="serif" style="font-size:150px;line-height:1">96</div>
          <div style="font-size:26px;color:${T.mist};letter-spacing:3px;font-weight:700">FAIRNESS SCORE</div>
        </div>
      </div>
      <div>
        <div class="eyebrow">Every pod gets one</div>
        <div class="serif" style="font-size:60px;margin-top:16px;line-height:1.1">Proof nobody got all the good games.</div>
        <div style="margin-top:44px;display:flex;flex-direction:column;gap:20px">
          ${[["Alex", 50, 49], ["Jordan", 25, 26], ["Sam", 25, 25]].map(([n, share, got]) => `
            <div>
              <div style="display:flex;justify-content:space-between;font-size:28px;margin-bottom:8px">
                <span style="font-weight:700">${n}</span><span style="color:${T.mist};font-variant-numeric:tabular-nums">${share}% share · ${got}% of game value</span>
              </div>
              <div style="height:18px;border-radius:9px;background:${T.green}">
                <div style="height:18px;border-radius:9px;width:${got * 1.8}%;background:${T.teal}"></div>
              </div>
            </div>`).join("")}
        </div>
        <div style="font-size:22px;color:${T.mist};margin-top:22px">Example pod</div>
      </div>
    </div>${footer}`),

  "05-escrow.png": card(`
    <div style="position:absolute;inset:0;padding:96px 96px">
      <div class="eyebrow">Built-in protection</div>
      <div class="serif" style="font-size:86px;margin-top:18px;line-height:1.05">“I’ll Venmo you Friday”<br>is not a payment plan.</div>
      <div style="margin-top:60px;background:${T.forest};border:1px solid ${T.green};border-radius:24px;padding:36px 40px;max-width:1150px">
        <div style="display:flex;justify-content:space-between;font-size:30px">
          <span style="color:${T.chalk}">Escrow funded</span><span style="color:${T.teal};font-weight:700">4 of 4 members · 100%</span>
        </div>
        <div style="height:22px;border-radius:11px;background:${T.teal};margin-top:18px"></div>
        <div style="font-size:28px;color:${T.teal};margin-top:20px">✓ All members funded. Season tickets secured.</div>
      </div>
      <div style="font-size:28px;color:${T.mist};margin-top:30px">Stripe holds every share until the whole pod is in.</div>
    </div>${footer}`),
};

const phoneCard = (file, eyebrow, head, sub, cropTop = 0) => card(`
  <div style="position:absolute;inset:0;display:grid;grid-template-columns:1fr 560px;gap:80px;padding:0 96px">
    <div style="align-self:center">
      <div class="eyebrow">${eyebrow}</div>
      <div class="serif" style="font-size:72px;margin-top:20px;line-height:1.08">${head}</div>
      <div style="font-size:32px;color:${T.mist};margin-top:26px;line-height:1.4">${sub}</div>
    </div>
    <div style="margin-top:90px;border-radius:56px 56px 0 0;border:10px solid #1E2A22;border-bottom:none;overflow:hidden;height:820px;
      box-shadow:0 30px 90px rgba(0,0,0,.6)">
      <img src="${shot(file)}" style="width:100%;display:block;margin-top:-${cropTop}px">
    </div>
  </div>${footer}`);

cards["06-app-schedule.png"] = phoneCard("03-games.png", "Your schedule",
  "Every game has a plan.", "Yours, a podmate's, traded, resold, or sent as a guest pass.");
cards["07-app-dashboard.png"] = phoneCard("02-pod-dashboard.png", "Your pod",
  "Your share, your games, one screen.", "See what you own, what it cost, and whether everyone has paid.", 300);
cards["08-app-resale.png"] = phoneCard("04-resale.png", "Can't make it?",
  "List it in seconds.", "Your pod's resale marketplace turns an empty seat into money back.");

cards["header-1500x500.png"] = base(1500, 500, `
  <div style="position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:flex-end;padding:0 90px;text-align:right">
    <div class="serif" style="font-size:72px;line-height:1.05">Split the season.<br><span style="color:${T.lime}">Share the seats.</span></div>
    <div style="font-size:28px;color:${T.mist};margin-top:20px;letter-spacing:1px">NBA · NFL · MLB · NHL · MLS · College</div>
  </div>`);

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
for (const [name, html] of Object.entries(cards)) {
  const [w, h] = name.startsWith("header") ? [1500, 500] : [1600, 900];
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${OUT}/${name}` });
  await page.close();
  console.log("rendered", name);
}
await browser.close();
