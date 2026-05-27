import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const bundleRoot = process.argv[2] || "src-tauri/target/release/bundle";
const absoluteBundleRoot = path.isAbsolute(bundleRoot)
  ? bundleRoot
  : path.join(root, bundleRoot);
const minBytes = Number(process.env.CURVESTUDIO_MIN_WINDOWS_INSTALLER_BYTES || 1024 * 1024);
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const tauri = JSON.parse(fs.readFileSync(path.join(root, "src-tauri/tauri.windows.conf.json"), "utf8"));
const productName = tauri.productName || "CurveStudio";
const version = pkg.version;

const expected = [
  { label: "NSIS installer", dir: "nsis", extension: ".exe" },
  { label: "MSI installer", dir: "msi", extension: ".msi" },
];

const failures = [];
const found = [];

function fail(message) {
  failures.push(message);
}

function findFiles(dir, extension) {
  const absoluteDir = path.join(absoluteBundleRoot, dir);
  if (!fs.existsSync(absoluteDir)) return [];
  return fs
    .readdirSync(absoluteDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(extension))
    .map((entry) => path.join(absoluteDir, entry.name));
}

for (const artifact of expected) {
  const files = findFiles(artifact.dir, artifact.extension);
  if (!files.length) {
    fail(`${artifact.label} missing in ${path.join(bundleRoot, artifact.dir)}`);
    continue;
  }

  for (const file of files) {
    const stat = fs.statSync(file);
    const basename = path.basename(file);
    const relative = path.relative(root, file);
    found.push(`${relative} (${stat.size} bytes)`);

    if (stat.size < minBytes) {
      fail(`${artifact.label} is too small to trust: ${relative} (${stat.size} bytes)`);
    }

    if (!basename.toLowerCase().includes(productName.toLowerCase())) {
      fail(`${artifact.label} filename should include ${productName}: ${basename}`);
    }

    if (!basename.includes(version)) {
      fail(`${artifact.label} filename should include version ${version}: ${basename}`);
    }
  }
}

if (failures.length) {
  console.error(failures.map((message) => `- ${message}`).join("\n"));
  if (found.length) console.error(`Found artifacts:\n${found.map((item) => `  ${item}`).join("\n")}`);
  process.exit(1);
}

console.log("Windows installer artifact verification passed.");
console.log(found.map((item) => `- ${item}`).join("\n"));
