import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const version = pkg.version;
const appPath = path.join(root, "src-tauri/target/release/bundle/macos/CurveStudio.app");
const dmgPath = path.join(root, `src-tauri/target/release/bundle/dmg/CurveStudio_${version}_aarch64.dmg`);
const sumsPath = path.join(root, "src-tauri/target/release/bundle/dmg/SHA256SUMS.txt");
const entitlementsPath = path.join(root, "src-tauri/entitlements.plist");
const notaryProfile = process.env.APPLE_NOTARY_PROFILE || "curvestudio-notary";

function run(command, args, options = {}) {
  console.log(`$ ${[command, ...args].join(" ")}`);
  execFileSync(command, args, {
    cwd: root,
    stdio: "inherit",
    ...options,
  });
}

function output(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
}

function fail(message) {
  console.error(`\n${message}`);
  process.exit(1);
}

function findDeveloperIdIdentity() {
  if (process.env.APPLE_SIGNING_IDENTITY) return process.env.APPLE_SIGNING_IDENTITY;
  const identities = output("security", ["find-identity", "-v", "-p", "codesigning"]);
  const match = identities.match(/"([^"]*Developer ID Application[^"]*)"/);
  return match?.[1] || "";
}

function verifyNotaryProfile(profileName) {
  const result = spawnSync("xcrun", ["notarytool", "history", "--keychain-profile", profileName], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    fail(
      [
        `Missing or invalid notarytool profile: ${profileName}`,
        "Create it once with:",
        `xcrun notarytool store-credentials ${profileName} --apple-id YOUR_APPLE_ID --team-id YOUR_TEAM_ID`,
        "Use an app-specific password when prompted.",
      ].join("\n")
    );
  }
}

function removeIfExists(targetPath) {
  if (fs.existsSync(targetPath)) fs.rmSync(targetPath, { force: true, recursive: true });
}

function createCleanDmg(signedAppPath, targetDmgPath) {
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), "curvestudio-notary-stage."));
  const stagedApp = path.join(stage, "CurveStudio.app");
  try {
    run("cp", ["-R", signedAppPath, stagedApp]);
    run("xattr", ["-cr", stagedApp]);
    run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", stagedApp]);
    removeIfExists(targetDmgPath);
    run("hdiutil", ["create", "-volname", "CurveStudio", "-srcfolder", stage, "-ov", "-format", "UDZO", targetDmgPath]);
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

const identity = findDeveloperIdIdentity();
if (!identity) {
  fail(
    [
      "No Developer ID Application signing identity was found in the login keychain.",
      "Install/create it from Xcode Settings > Accounts > Manage Certificates, or set APPLE_SIGNING_IDENTITY explicitly.",
      "Current Apple Development certificates are not valid for external notarized distribution.",
    ].join("\n")
  );
}

verifyNotaryProfile(notaryProfile);

run("npm", ["run", "verify:release"]);
run("npm", ["run", "tauri:build"]);

run("xattr", ["-cr", appPath]);
run("codesign", [
  "--force",
  "--deep",
  "--sign",
  identity,
  "--options",
  "runtime",
  "--timestamp",
  "--entitlements",
  entitlementsPath,
  appPath,
]);
run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]);

createCleanDmg(appPath, dmgPath);
run("codesign", ["--force", "--sign", identity, "--timestamp", dmgPath]);
run("xcrun", ["notarytool", "submit", dmgPath, "--keychain-profile", notaryProfile, "--wait"]);
run("xcrun", ["stapler", "staple", dmgPath]);
run("xcrun", ["stapler", "validate", dmgPath]);
run("hdiutil", ["verify", dmgPath]);
run("spctl", ["--assess", "--type", "open", "--verbose=4", dmgPath]);

const checksum = output("shasum", ["-a", "256", dmgPath]).trim();
fs.writeFileSync(sumsPath, `${checksum}\n`);
console.log(`\nNotarized DMG ready:\n${dmgPath}\n${checksum}`);
