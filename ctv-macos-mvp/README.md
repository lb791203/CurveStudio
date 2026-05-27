# CurveStudio

macOS-first MVP for a print compensation curve tool. The first version is a local browser app so it can be used immediately on macOS and later wrapped with Tauri or SwiftUI.

Current version: `0.1.12`. See [CHANGELOG.md](./CHANGELOG.md) for feature history.

## MVP scope

- Import CSV, CGATS, IT8, and P2P-style text measurement/target data.
- Reopen exported JSON project archives from the file picker.
- Enter field records manually when patches were measured one by one.
- Work through formal pages: Job, Standard, Measurement, Analyze, Curve, G7, Export, and Settings.
- Select built-in standards: GRACoL2013 CRPC1-7, FOGRA39, and ISO TVI A-F target curves.
- Import ICC/ICM profile metadata in Standard as a Lab/color reference source.
- Preview ICC characterization patches when a CMYK output profile exposes a supported `mft1` / `mft2` CMYK-to-Lab A2B table.
- Pair imported ICC Lab references with explicit TVI/CTV/G7 tone targets without silently changing the compensation algorithm.
- Gate ICC generation behind saved pre/post compensation Runs, characterization patch coverage, Lab/Delta E, G7, and curve-quality checks.
- Build custom TVI targets from 25/50/75 input values.
- Calculate TVI, ISO 20654 CTV, and G7-style MVP compensation curves.
- Display measured TVI against target and final input-to-output curves with legends and hover values.
- Lock individual curve output points for technician overrides while preserving the original automatic output.
- Diagnose press state from TVI deviation and recommend a default under-compensation ratio.
- Compare measured Lab against standard Lab using selectable Delta E 76, Delta E 94, Delta E 2000, or CMC for available paper, solid, overprint, and gray patches.
- Run first-stage G7 data-completeness checks, K-only NPDC preview, and gray-balance a*b* preview before reporting status.
- Export compensation curve results as calculation CSV, Kodak Prinergy Harmony manual-entry CSV, Kodak Prinergy CSV, generic RIP CSV, CGATS text, or JSON project archive.

## Run

Open `index.html` in a browser, or start a local server:

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

For a Node-only local server that also works on Windows:

```bash
npm run dev:node
```

## Input format

Recommended CSV:

```csv
channel,tone,measured_tvi
C,50,20.4
M,50,18.8
Y,50,16.5
K,50,21.6
```

Alternative measured tone format:

```csv
channel,tone,measured_tone
C,50,70.4
```

Manual field records use the same structure and can include optional paper/solid/tint density:

```csv
patch_type,channel,tone,measured_tone,density,source
solid,C,100,,1.45,Manual
tone,C,50,,0.55,Manual
```

The in-app manual table also supports paper, solid, overprint, gray, density, Lab, source, and note fields. Buttons create field templates for paper/solid, 25/50/75, full tone ramps, and G7 gray/overprint records. A field-mode selector can insert plate/print dot records, density TVI records, CTV Lab records, or G7 verification records. Each manual row shows its current calculation path and data status. If a channel has paper/solid/tint density, the app converts tint density to apparent tone with the Murray-Davies equation before calculating TVI. If paper/solid/tint Lab or XYZ are available, CTV mode calculates ISO 20654 colorimetric tone value.

Field-record examples from `KBA105_KBA162_完整TVI分析报告.docx` are saved in:

- `samples/kba105-field-record.csv`
- `samples/kba162-field-record.csv`
- `samples/kba-presets.json`

The two CSV files are retained as raw field-record references. The in-app `KBA105` / `KBA162` sample buttons load the normalized preset data from `samples/kba-presets.json`.

The sample selector also includes a `CTV Lab 计算样例` plus P2P51 and TC1617 G7 measurement examples copied into `reference-data`. The CTV sample checks ISO 20654 Lab calculation. The G7 samples are useful for checking P2P patch detection, paper/solid classification, K-only NPDC behavior, and CMY gray candidates. Spectral files are converted to D50 XYZ/Lab for CTV and G7 checks when `SPECTRAL_NM*` columns are present.

Structured import now supports files with `BEGIN_DATA_FORMAT` / `BEGIN_DATA`, including:

- CGATS / IT8 characterization files with `CMYK_*`, `XYZ_*`, `LAB_*`.
- P2P targets with CMYK patch definitions.
- Spectral measurement files with `SPECTRAL_NM*` columns. Spectral TVI uses ISO 5-3 Status-T weighted density when paper / tint / solid patches are available. Status-E is not enabled yet and should not be reported until verified against official/vendor reference data.

Pure standard or target files are parsed as reference patch data, but they do not generate compensation curves unless they include TVI, measured tone, density, or usable spectral measurement data.

For TVI production calculations:

```text
theoretical_adjustment = target_tvi - measured_tvi
rip_adjustment = theoretical_adjustment * under_compensation_ratio
production_output = input_tone + rip_adjustment
final_output = production_output with smoothing, highlight/shadow protection, and monotonic correction
```

The RIP adjustment is clamped by the configured single-point limit and then smoothed per channel. Final output is generated on a fixed production grid: 0/5/10/20/25/30/40/50/60/70/75/80/90/95/100. The default under-compensation ratio is 50%, because production TVI compensation usually should reduce only part of the theoretical deviation.

For CTV mode, the same compensation pipeline uses `measured_ctv - target_ctv` as the deviation. CTV is calculated with ISO 20654 Vx/Vy/Vz normalization from Lab when Lab is present, or XYZ/D50 when XYZ is present. If CTV data is missing, the result is marked as a TVI fallback instead of silently pretending it is CTV.

When spectral-only measurement files are used, the current density estimate is visibly marked as `status_t_spectral` / `ISO Status-T 密度`. The Settings page can disable spectral density conversion with `None`; DIN / ISO-I / Status-E remain planned, disabled options until their weighting data is validated against official/vendor references.

The `数据接入` page compares software-calculated ISO 20654 CTV against vendor/instrument CTV fields when present. X-Rite i1Pro workflows should first export CGATS/IT8/CSV from X-Rite/i1Profiler/ColorPort with Lab, XYZ, or spectral data. If the file also contains `CTV`, `SCTV`, `instrument_ctv`, `measured_ctv`, or similar columns, the page reports software CTV, instrument CTV, ΔCTV, and Pass/Warning/Fail. This is a data/vendor cross-check only; it does not validate the compensation curve.

Curve validation starts from the generated compensation result. The Curve page now includes a compensation simulation table: it uses the first measured press response curve to estimate the printed tone after applying the current recommended output tone. This helps check whether the proposed TVI/CTV correction moves each point toward the target before making a second proof/press run. Formal validation still requires applying the curve, printing again, and remeasuring.

The result table shows a manual-entry reference for Kodak Prinergy Harmony, Kodak Prinergy, and other RIP tools:

- `Prinergy/RIP 调整`: reduce or increase percentage for the current input tone.
- `建议录入网点`: the output tone to enter in the curve.
- `锁定` / `人工输出` / `自动输出`: override a single curve point for production and still keep the algorithm-generated value visible.
- `理论输出` / `生产输出` / `建议录入网点`: separate full correction, under-corrected production value, and final protected curve value.
- `算法来源`: whether the row came from reported TVI/tone, Murray-Davies density, ISO 20654 Lab/XYZ, or interpolation.

## Current acceptance checks

- KBA105 sample: identifies `机械异常 / 抢救型生产补偿` and uses 45% as the suggested under-compensation ratio.
- KBA162 sample: identifies `生产可补偿型 TVI` and uses 55% as the suggested under-compensation ratio.
- GRACoL2013 CRPC6 standard file loads Lab reference patches into the standard library.
- ICC/ICM files can be imported in Standard for metadata inspection and supported CMYK-to-Lab sampling preview; they are labeled as color reference, not measurement data.
- Pure standard/target files remain reference-only and do not generate false compensation curves.
- Missing P2P/gray-balance/Lab data keeps G7 in `Data Incomplete` instead of generating a false pass.
- G7 preview reports P2P/CGATS completeness, paper, CMYK solids, K-only NPDC, CMY gray candidates, and Lab/Delta E readiness.
- Saved Job runs can compare latest vs previous TVI, Delta E, and G7 state and show a future Tauri-style archive path.
- Exported JSON project archives can be selected again in Measurement to restore job/settings/measurements.
- Exported JSON archives include `schemaVersion: 2` and `storagePlan` with `jobs/.../runs/...json` path metadata.
- Exported JSON archives include curve point overrides so locked manual output values can be restored.
- CTV Lab sample generates ISO 20654 CTV rows and exports `measurement_method` metadata.
- Lab verification supports ΔE76, ΔE94, ΔE2000, and CMC formula selection from Settings.
- CTV fallback and Status-T spectral-density warnings are visible in Curve and Export.
- Data/vendor cross-check reports ISO 20654 software CTV, instrument CTV, ΔCTV, and missing-field status.
- Curve simulation reports estimated post-compensation tone, residual deviation, and improvement/worsening before the second measurement run.

## Next engineering steps

- Add Status-E spectral-density weights only after official/vendor reference values are available.
- Validate ISO 20654 CTV results against real X-Rite i1Pro and Techkon exports from measured test charts.
- Turn G7 preview into certification-level NPDC / gray-balance verification once the exact P2P target mapping is finalized.
- Wire the prepared `storagePlan` to real file-backed job archives once Tauri file APIs are available.
- Evaluate CxF and RWXF from real X-Rite / Techkon exports.
- Add TECHKON device integration on macOS if the vendor SDK or HID protocol is available.
- Package as Tauri app for signed macOS distribution.

## Validation

```bash
npm test
npm run audit:release
npm run validate:fixtures
npm run verify:windows-artifacts
```

See `ARCHITECTURE.md` for the current module map and data flow.

`npm test` covers core curve switching, interpolation, smoothing/protection/monotonic behavior, flexible import parsing, and Delta E formula smoke checks. `npm run validate:fixtures` parses the copied reference fixtures under `reference-data` and reports patch rows, single-channel tone rows, usable measurement rows, and generated curve points.

Before packaging a desktop build, run the combined release gate:

```bash
npm run verify:release
```

## Desktop packaging

macOS uses the base Tauri config:

```bash
npm run tauri:build
```

Windows uses the installer overlay config and should be run on a Windows machine or CI runner:

```bash
npm run tauri:build:windows
npm run verify:windows-artifacts
```

The GitHub workflow `.github/workflows/windows-installer.yml` runs the same release gate on `windows-latest`, builds NSIS and MSI installers, verifies the installer files, and uploads them as the `CurveStudio-windows-installers` artifact. Expected output locations are:

- `src-tauri/target/release/bundle/nsis/*.exe`
- `src-tauri/target/release/bundle/msi/*.msi`
