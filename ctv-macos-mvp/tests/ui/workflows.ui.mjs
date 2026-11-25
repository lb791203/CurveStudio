// Browser workflow tests (Playwright + Chromium), run with `npm run test:ui`.
// They drive the real UI with a mocked desktop (Tauri) bridge, so cancelled saves and the
// rows that actually reach a saved Run are checked end to end, not via source strings.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const PORT = 4300 + Math.floor(Math.random() * 500);
const BASE = `http://localhost:${PORT}/index.html`;

let server;
let browser;

test.before(async () => {
  server = spawn(process.execPath, ["scripts/serve-static.mjs"], { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
  for (let i = 0; i < 50; i += 1) {
    try { if ((await fetch(BASE)).ok) break; } catch { /* not up yet */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch();
});

test.after(async () => {
  await browser?.close();
  server?.kill();
});

// Desktop bridge mock: window.__saveAnswer decides what the save dialog returns.
const desktopMock = () => {
  window.__writes = [];
  window.__saveAnswer = null;
  window.__TAURI__ = {
    core: { invoke: async (command, payload) => { if (command.startsWith("write_")) window.__writes.push(payload); return null; } },
    dialog: { save: async () => window.__saveAnswer, open: async () => null },
  };
};

async function openApp() {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => dialog.accept());
  await page.addInitScript(desktopMock);
  await page.goto(BASE);
  await page.waitForFunction(() => document.querySelector("#standardSelect")?.options.length > 0);
  return { page, errors, close: () => context.close() };
}

async function loadSample(page, value = "sample") {
  await page.evaluate((selected) => {
    document.querySelector("#jobCustomerInput").value = "客户";
    document.querySelector("#jobPressInput").value = "印机";
    document.querySelector("#sampleSelect").value = selected;
    document.querySelector("#loadSampleButton").click();
  }, value);
  await page.waitForTimeout(800);
}

const appliedCount = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("ctv-applied-curves") || "[]").length);

test("UI S2: a cancelled save registers no RIP baseline; a completed save registers one", async () => {
  const { page, errors, close } = await openApp();
  await loadSample(page);
  await page.evaluate(() => { window.__saveAnswer = null; document.querySelector("#exportSimpleRipButton").click(); });
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.__writes.length), 0);
  assert.equal(await appliedCount(page), 0);

  await page.evaluate(() => { window.__saveAnswer = "/tmp/rip.csv"; document.querySelector("#exportSimpleRipButton").click(); });
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.__writes.length), 1);
  assert.equal(await appliedCount(page), 1);
  assert.deepEqual(errors, []);
  await close();
});

test("UI M5: manual C 50→60 with blank density is accepted; a rejected C 50→200 never reaches the saved Run", async () => {
  const { page, errors, close } = await openApp();
  await page.evaluate(() => {
    document.querySelector("#jobCustomerInput").value = "客户";
    document.querySelector("#jobPressInput").value = "印机";
  });
  await page.click('[data-sub-view-button="manual"]');
  const setCell = async (index, field, value) => {
    const selector = `[data-manual-index="${index}"][data-manual-field="${field}"]`;
    await page.fill(selector, value);
    await page.dispatchEvent(selector, "change");
  };
  await page.click("#addManualRowButton");
  await setCell(0, "tone", "50");
  await setCell(0, "measuredTone", "60");
  await page.click("#addManualRowButton");
  await setCell(1, "tone", "50");
  // max="100" on the input is advisory only: a typed 200 still arrives.
  await setCell(1, "measuredTone", "200");
  await page.click("#applyManualButton");
  await page.waitForTimeout(500);
  await page.evaluate(() => document.querySelector("#saveRunButton").click());
  await page.waitForTimeout(500);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("ctv-run-state") || "null"));
  assert.ok(saved?.runs?.length, "a Run was saved");
  const archive = saved.runs[0].archive || saved.lastProject;
  const tones = (archive.measurements || []).map((row) => row.measuredTone);
  assert.deepEqual(tones, [60]);
  assert.deepEqual(errors, []);
  await close();
});

test("UI S5: importing a file named like the old audit standard keeps the selected standard and adds no demo data", async () => {
  const { page, errors, close } = await openApp();
  const standardBefore = await page.$eval("#standardSelect", (select) => select.value);
  await page.setInputFiles("#fileInput", {
    name: "ISO 12647-2-2007 audit.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("channel,tone,measured_tone\nC,25,38\nC,50,67\nC,75,88\n"),
  });
  await page.waitForTimeout(800);
  assert.equal(await page.$eval("#standardSelect", (select) => select.value), standardBefore);
  assert.equal(await page.evaluate(() => document.body.innerText.includes("审核演示")), false);
  // An invalid file afterwards leaves the imported data in place.
  await page.setInputFiles("#fileInput", { name: "broken.csv", mimeType: "text/csv", buffer: Buffer.from("nothing useful here") });
  await page.waitForTimeout(500);
  const runState = await page.evaluate(() => document.querySelector("#resultBody")?.children.length || 0);
  assert.ok(runState > 0, "results from the first import are still shown");
  assert.deepEqual(errors, []);
  await close();
});

test("UI round-3 S2: exporting, then re-importing the same file, does not stack the curve again", async () => {
  const { page, errors, close } = await openApp();
  const c50 = (csv) => Number(csv.split("\n").find((line) => /^C,50(\.00)?,/.test(line)).split(",")[2]);
  await loadSample(page);
  await page.evaluate(() => { window.__saveAnswer = "/tmp/rip1.csv"; document.querySelector("#exportSimpleRipButton").click(); });
  await page.waitForTimeout(300);
  const first = c50(await page.evaluate(() => window.__writes.at(-1).contents));
  await loadSample(page);
  await page.evaluate(() => { window.__saveAnswer = "/tmp/rip2.csv"; document.querySelector("#exportSimpleRipButton").click(); });
  await page.waitForTimeout(300);
  const second = c50(await page.evaluate(() => window.__writes.at(-1).contents));
  assert.equal(second, first);
  assert.equal(await page.$eval("#baselineSelect", (select) => select.value), "linear");
  assert.deepEqual(errors, []);
  await close();
});
