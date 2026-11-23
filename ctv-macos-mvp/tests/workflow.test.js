import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { TRANSLATIONS } from "../src/translations.js";

const indexHtml = fs.readFileSync("index.html", "utf8");
const appJs = fs.readFileSync("src/app.js", "utf8");

test("sidebar lists the four workflow steps in order, then system settings", () => {
  const steps = [...indexHtml.matchAll(/data-step-button="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(steps, ["acquisition", "setup", "diagnose", "delivery", "settings"]);
  const numbers = [...indexHtml.matchAll(/<span class="nav-icon nav-step-num">(\d)<\/span>/g)].map((match) => match[1]);
  assert.deepEqual(numbers, ["1", "2", "3", "4"]);
});

test("every sub-tab belongs to a step the app maps it to", () => {
  const tabs = [...indexHtml.matchAll(/data-sub-view-button="([^"]+)" data-parent-step="([^"]+)"/g)];
  assert.ok(tabs.length >= 8);
  const mapBlock = appJs.slice(appJs.indexOf("const viewToStepMap = {"), appJs.indexOf("const stepDefaultViewMap"));
  for (const [, view, step] of tabs) {
    assert.match(mapBlock, new RegExp(`\\b${view}: "${step}"`), `${view} -> ${step}`);
  }
});

test("correction export sits in the analyze step and re-measure comparison in step 4", () => {
  assert.match(indexHtml, /data-sub-view-button="export" data-parent-step="diagnose"/);
  assert.match(indexHtml, /data-sub-view-button="job" data-parent-step="delivery"/);
});

test("workflow labels exist in Chinese and English", () => {
  for (const key of ["nav_acquisition", "nav_setup", "nav_diagnose", "nav_delivery", "step_acquisition", "step_setup", "step_diagnose", "step_delivery", "next_step_prefix", "next_remeasure"]) {
    assert.ok(TRANSLATIONS.zh[key], `zh ${key}`);
    assert.ok(TRANSLATIONS.en[key], `en ${key}`);
  }
});
