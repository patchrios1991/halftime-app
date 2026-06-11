// Renders the Google Play feature graphic (1024x500) from inline HTML.
import puppeteer from "puppeteer-core";
import { mkdirSync } from "fs";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

const html = `<!doctype html><html><body style="margin:0">
<div style="width:1024px;height:500px;background:#060F08;display:flex;
  flex-direction:column;align-items:center;justify-content:center;
  font-family:Georgia,serif;position:relative;overflow:hidden">
  <div style="position:absolute;top:-120px;right:-120px;width:380px;height:380px;
    border-radius:50%;background:radial-gradient(circle,#C8F13522,transparent 70%)"></div>
  <div style="position:absolute;bottom:-140px;left:-100px;width:420px;height:420px;
    border-radius:50%;background:radial-gradient(circle,#C8F13518,transparent 70%)"></div>
  <div style="font-size:96px;font-weight:900;line-height:1">
    <span style="color:#FFFFFF">Half</span><span style="color:#C8F135">Time</span>
  </div>
  <div style="color:#E8F5E9;font-size:30px;margin-top:18px;letter-spacing:.5px">
    Split the season. Share the seats.
  </div>
  <div style="margin-top:30px;display:flex;gap:18px;font-size:34px">
    <span>🏀</span><span>⚾</span><span>🏈</span><span>🏒</span><span>⚽</span>
  </div>
</div></body></html>`;

const browser = await puppeteer.launch({ executablePath: EDGE, headless: "new" });
const page = await browser.newPage();
await page.setViewport({ width: 1024, height: 500, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: "networkidle0" });
mkdirSync("store", { recursive: true });
await page.screenshot({ path: "store/feature-graphic-1024x500.png" });
await browser.close();
console.log("done: store/feature-graphic-1024x500.png");
