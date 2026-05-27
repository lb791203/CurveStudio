# Desktop App Packaging

This project keeps the calculation engine in plain JavaScript so the same code can run in the browser MVP, macOS Tauri app, and later Windows Tauri build.

## Current state

- Web MVP runs from `index.html` or `npm run dev`.
- Tauri scaffold exists in `src-tauri/`.
- Project archives already use `jobs/<customer-press-date>/runs/<timestamp>.json` metadata.
- Real file save/open APIs are not wired yet; browser downloads are still used in the MVP.

## macOS build path

1. Install Rust stable and Tauri prerequisites.
2. Run `npm run tauri:dev` for a local desktop shell.
3. Run `npm run tauri:build` to create `.app` / `.dmg`.
4. Add signing and notarization after the MVP workflow is accepted.

## Windows path

Use the same `src-tauri` project and JavaScript core. Windows has its own overlay config so the macOS `.app/.dmg` targets do not get mixed with Windows installers:

- Base macOS config: `src-tauri/tauri.conf.json`
- Windows overlay config: `src-tauri/tauri.windows.conf.json`
- Windows build script: `npm run tauri:build:windows`
- Windows dev server: `npm run dev:node` so the workflow does not depend on `python3`.

The first Windows milestone is installer architecture, not device SDK integration. Build on a Windows machine or Windows CI runner after the macOS workflow is stable; expected installer targets are NSIS and MSI.

### Windows architecture checkpoints

1. Keep calculation, import, standards, G7, ICC gate, and export logic in shared JavaScript modules.
2. Keep desktop-only filesystem dialogs behind the existing Tauri bridge.
3. Keep future Techkon/X-Rite SDK work behind `DeviceAdapter` so Windows SDK support does not change curve logic.
4. Validate `npm run verify:release` before each Windows installer build.
5. Build Windows installers with `npm run tauri:build:windows` on Windows hardware/CI.
6. Verify installer artifacts with `npm run verify:windows-artifacts`; the check requires NSIS `.exe` and MSI `.msi` files with the product name, package version, and a trustworthy file size.

GitHub Actions template: `ci/github-actions/windows-installer.yml`. Activate it as `.github/workflows/windows-installer.yml` with a GitHub token that has the `workflow` scope. It runs on `windows-latest`, executes the release gate, builds the Windows installers, verifies the artifacts, and uploads the installer files for download.

## Next desktop tasks

- Replace browser download links with Tauri save-file dialogs.
- Add open-project dialog for JSON archives.
- Store recent jobs in a local application data directory.
- Keep SDK/device integration behind `DeviceAdapter` so Techkon/X-Rite support can be added without changing curve logic.
- Add Windows signing, installer naming, update-channel decisions, and a real install/uninstall smoke test after the first NSIS/MSI CI artifact succeeds.

## ICC workflow roadmap

Detailed implementation plan: [ICC_WORKFLOW_PLAN.md](./ICC_WORKFLOW_PLAN.md)

The production workflow should become:

`Standard / ICC Import -> Measurement -> Compensation Curve -> Re-measure Verification -> ICC Generation`

### Phase 1: ICC import as a reference source

- Add `ICC` as a standard-library import type.
- Read ICC profile metadata: profile name, version, device class, PCS, color space, rendering intents, media white point, copyright/description tags.
- For CMYK output profiles, sample a fixed CMYK grid through the profile to get reference Lab values.
- Show ICC-derived paper white, CMYK solids, overprints, and sampled gray/neutral patches in the Standard page.
- Clearly label ICC data as color-reference data. Do not infer ISO TVI A/B/C or G7 target curves from ICC alone.
- Allow the user to pair an imported ICC with a TVI/CTV/G7 target preset.

### Phase 2: measurement and curve correction

- Keep current CGATS/IT8/P2P/CSV/manual measurement routes as the main calculation input.
- Use ICC only as a Lab/Delta E reference unless the file is paired with measured characterization data.
- Generate TVI/CTV/G7 compensation curves from actual measured tone, density, Lab, XYZ, or spectral data.
- Continue to export Harmony/Prinergy/RIP manual-entry curves before ICC generation.

### Phase 3: compensation simulation and re-measure verification

- Use the first measurement run to simulate whether the calculated compensation curve moves tone values toward target.
- Mark simulation as a preflight estimate, not a final validation.
- Require a second printed/measured run after applying the compensation curve for production validation.
- Compare Run 1 vs Run 2: TVI/CTV residuals, Lab/Delta E, G7 wDeltaL/wDeltaCh, gray balance, and curve safety.
- Only unlock ICC generation when the re-measured run has enough characterization patches and passes the selected validation rules.

### Phase 4: ICC generation

- Generate ICC from the compensated, re-measured, stable press condition.
- Do not generate a formal ICC directly from a theoretical compensation curve.
- First implementation should call a proven color engine instead of hand-writing ICC internals:
  - LittleCMS for profile creation/conversion APIs.
  - ArgyllCMS as a possible command-line workflow if licensing and packaging are acceptable.
- Store ICC generation metadata in the Job/Run archive: standard, measurement condition, instrument, compensation curve id, validation status, profile engine, and generation timestamp.
- Export generated ICC beside the Run archive and link it back to the measurement data used to build it.

### Phase 5: acceptance criteria

- Imported ICC must show readable profile metadata and sampled Lab preview.
- ICC-derived references must be usable in Lab/Delta E comparison.
- ICC import must not create fake TVI/CTV/G7 pass states without measurement data.
- ICC generation must be blocked when no compensated re-measurement exists.
- ICC generation must be blocked when required characterization patches are missing.
- Generated ICC must be traceable to one validated Run and its compensation curve.
