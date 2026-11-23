import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { TRANSLATIONS } from "../src/translations.js";

const version = JSON.parse(fs.readFileSync("package.json", "utf8")).version;
const indexHtml = fs.readFileSync("index.html", "utf8");
const appJs = fs.readFileSync("src/app.js", "utf8");

test("product center shows the package.json version everywhere", () => {
  const settingsVersion = indexHtml.match(/<span>当前版本<\/span>\s*<strong>([^<]+)<\/strong>/);
  assert.equal(settingsVersion?.[1], version, "settings card version");
  assert.match(indexHtml, new RegExp(`<strong>CurveStudio ${version.replace(/\./g, "\\.")}</strong>`), "update panel heading");
  const aboutVersion = indexHtml.match(/data-translate="about_version">[^<]*<\/span><strong>([^<]+)<\/strong>/);
  assert.equal(aboutVersion?.[1], version, "about panel version");
  const firstRelease = indexHtml.match(/<div class="release-note-list">\s*<article>\s*<span>([^<]+)<\/span>/);
  assert.equal(firstRelease?.[1], version, "newest release note card");
});

test("product center build dates agree", () => {
  const settingsDate = indexHtml.match(/<span>构建日期<\/span>\s*<strong>([^<]+)<\/strong>/)?.[1];
  const aboutDate = indexHtml.match(/data-translate="about_build_date">[^<]*<\/span><strong>([^<]+)<\/strong>/)?.[1];
  assert.ok(settingsDate);
  assert.equal(aboutDate, settingsDate);
});

test("update status texts do not hardcode a version number", () => {
  for (const lang of ["zh", "en"]) {
    for (const key of ["update_status_initial_text", "update_status_checked_text"]) {
      assert.doesNotMatch(TRANSLATIONS[lang][key], /\d+\.\d+\.\d+/, `${lang}.${key}`);
      assert.doesNotMatch(TRANSLATIONS[lang][key], /预览|preview/i, `${lang}.${key}`);
    }
  }
  const fallback = appJs.match(/t\("update_status_checked_text",\s*"([^"]*)"\)/)?.[1];
  assert.ok(fallback);
  assert.doesNotMatch(fallback, /\d+\.\d+\.\d+/);
});

test("each release note card uses the translation keys of its own version", () => {
  const cards = [...indexHtml.matchAll(/<article>\s*<span>(\d+\.\d+\.\d+)<\/span>\s*<strong data-translate="([^"]+)">[^<]*<\/strong>\s*<p data-translate="([^"]+)">/g)];
  assert.ok(cards.length >= 5);
  for (const [, cardVersion, titleKey, textKey] of cards) {
    const slug = cardVersion.replace(/\./g, "_");
    assert.equal(titleKey, `release_${slug}_title`, `title key for ${cardVersion}`);
    assert.equal(textKey, `release_${slug}_text`, `text key for ${cardVersion}`);
    for (const lang of ["zh", "en"]) {
      assert.ok(TRANSLATIONS[lang][titleKey], `${lang}.${titleKey}`);
      assert.ok(TRANSLATIONS[lang][textKey], `${lang}.${textKey}`);
    }
  }
});
