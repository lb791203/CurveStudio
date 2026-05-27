import fs from "node:fs";
import path from "node:path";
import { TRANSLATIONS } from "../src/translations.js";

const root = process.cwd();
const failures = [];

function fail(message) {
  failures.push(message);
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function hasCjk(value) {
  return /[\u3400-\u9fff]/.test(String(value));
}

const pkg = readJson("package.json");
const tauri = readJson("src-tauri/tauri.conf.json");
const windowsTauriPath = "src-tauri/tauri.windows.conf.json";
const windowsTauri = fs.existsSync(path.join(root, windowsTauriPath))
  ? readJson(windowsTauriPath)
  : null;

if (pkg.version !== tauri.version) {
  fail(`package.json version ${pkg.version} does not match src-tauri/tauri.conf.json version ${tauri.version}`);
}

if (windowsTauri && pkg.version !== windowsTauri.version) {
  fail(`package.json version ${pkg.version} does not match ${windowsTauriPath} version ${windowsTauri.version}`);
}

for (const [key, value] of Object.entries(TRANSLATIONS.en || {})) {
  if (hasCjk(value)) fail(`English translation contains CJK text: ${key} = ${value}`);
}

const translationSource = fs.readFileSync(path.join(root, "src/translations.js"), "utf8");
for (const locale of ["zh", "en"]) {
  const localeMatch = translationSource.match(new RegExp(`${locale}:\\s*\\{([\\s\\S]*?)\\n\\s*\\},\\n\\n\\s*//`, "m"))
    || translationSource.match(new RegExp(`${locale}:\\s*\\{([\\s\\S]*?)\\n\\s*\\}`, "m"));
  if (!localeMatch) continue;
  const seen = new Set();
  const duplicates = new Set();
  for (const match of localeMatch[1].matchAll(/"([^"]+)"\s*:/g)) {
    const key = match[1];
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  for (const key of duplicates) fail(`Duplicate ${locale} translation key: ${key}`);
}

const uiLabelValues = Object.values(TRANSLATIONS.en || {}).join("\n");
if (/Prinergy/.test(uiLabelValues)) {
  fail("English UI translations still include Prinergy; use generic RIP wording instead.");
}

if (failures.length) {
  console.error(failures.map((message) => `- ${message}`).join("\n"));
  process.exit(1);
}

console.log("Release audit passed.");

