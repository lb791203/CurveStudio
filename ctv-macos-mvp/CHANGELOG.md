# Changelog

## 1.0.7 - 2026-11-23

- Workflow: the app is organized in four numbered steps — 1 Measurements (file import, manual entry), 2 Reference Standard, 3 Analyze & Correct (diagnosis, compensation curve, G7, curve export), 4 Re-measure & Verify (run comparison, verification report) — with a next-step button in each step header. Section subtitles, import notes, export descriptions and developer notes were removed or folded away, cutting the visible helper text on the import and export pages by about 80–97%. Smoothing and per-point limit moved under Advanced, and the unfinished instrument tab is hidden.
- CTV now follows ISO 20654:2017 formula (1): the distance is taken in Vx/Vy/Vz (from Lab: Vx = L* + 116a*/500, Vy = L*, Vz = L* − 116b*/200) instead of the plain L*a*b* distance. Magenta is affected most; on the demo P2P sheet M 50% reads 58.1 instead of 55.1.
- Re-measurement rounds now stack on the previous round's curve (newest saved run for the same customer and press). The exported curve is the complete curve and can replace the old one in the RIP. A checkbox on the compensation curve page turns stacking off for plates that were reset to linear.
- Curves between measured points use a monotone cubic instead of straight segments, so the exported table and the chart bend smoothly through 25/50/75 without overshoot. Correction direction is forced only at measured points, which removes flat spots and kinks (e.g. Y 5–20% stuck at 0).
- Smoothing no longer averages sparse control points (more than 30% apart); with 25/50/75 data it washed out the midtone correction.
- The press diagnosis now checks the standard's 25/50/75 tolerances: a press with good midtone averages but control points out of tolerance gets "Out of tolerance / compensation recommended" instead of "Close to the standard".
- CTV mode diagnoses speak CTV instead of TVI. Lab-only files (typical G7 P2P sheets) switch to CTV automatically so step 3 can build a curve; the G7 gray balance check is unchanged.
- Workflow: applying a manual table goes to step 2 (reference standard); "Measure again" returns to manual entry when the data was typed in.
- Run comparison and job cards hide G7 and ΔE rows when the job has no G7 or Lab data.
- Product Center: Check for Updates no longer shows a stale "1.0.3" version, the update text no longer calls the app a preview build, the 1.0.5 release card shows the 1.0.5 notes again (1.0.4 is back too), and the About build date matches the release.

## 1.0.6 - 2026-11-22

- Spectral data is now converted to XYZ/Lab with ASTM E308 D50/2° 10 nm weighting factors. Against the i1iO2 M0/M2 fixtures the mean error versus the instrument's own Lab drops from about 1.1 ΔE00 to 0.005 ΔE00.
- Fixed dark patches (Y < 1.5, roughly L* < 13) computed from spectral data being reported as L* > 100.
- Fixed the visual (K) spectral density response, which peaked at 460 nm instead of following the photopic ȳ curve.
- Compensation curves now invert the measured press response (as described in docs/curve-calculation.md) instead of subtracting the TVI difference at the same input tone, which over-corrected highlights.
- G7 Grayscale is now substrate-relative: NPDC ΔL* compares paper-relative L* (sample Y / paper Y) for both the press sheet and the reference, and the CMY gray a*b* aim follows the paper tint (paper a*b* × (1 − C/100)). The previous absolute check is available with `g7Evaluation: "absolute"`.
- G7 weighting now follows the Idealliance formula (1.0 up to 50%, 0.25 at 100%, no extra highlight reduction) and G7 Grayscale/Targeted results are Pass/Fail only. Targeted uses ΔE00 with per-patch limits (substrate 3.0, CMY solids 3.5, K 5.0, overprints 4.2).
- Only patches on the G7 gray ratio (M = Y = f(C)) are evaluated as CMY gray; equal-CMY ramps and P2P offset grays such as 30/30/30 or 20/12/12 no longer distort the gray-balance result.
- G7 gray-balance split corrections now aim at the gray target (paper/standard tint) instead of a*=b*=0, and the gray diagnostics read the weighted ΔCh field that verification actually produces.
- Removed third-party and customer data from the repository and the desktop bundle: G7 training-kit measurements, files copied from PatchTool and i1Profiler, CRPC ICC profiles, control-wedge references, Harmony curves, and customer field/audit files. Removed the reference-software study document.
- Added `scripts/generate-demo-p2p.mjs` and a synthetic P2P51 press sheet (`samples/g7-p2p51-simulated.txt`) built from CGATS21-2 CRPC6 data for demos and tests.
- Replaced the customer audit sample with an anonymized ISO 12647-2 audit demo; the standard now declares its per-channel TVI targets (`channelTargets: { K: "isoB" }`) instead of the curve engine checking a customer standard id.
- Removed the built-in FOGRA39 preset (import the FOGRA characterization data as a custom standard instead).
- Projects saved with a preset that is no longer built in now reopen with their archived settings as a custom standard (with a warning to re-import the Lab reference) instead of silently switching to GRACoL CRPC1. Projects saved with the old audit preset id open with the renamed audit demo preset.
- Per-channel TVI targets now also drive the press diagnosis and automatic compensation ratio, and are ignored in CTV and G7 modes.
- The overall G7 result now uses the same Pass/Fail limits as the grayscale summaries (no Warning band for NPDC or gray balance).
- UI: the compensation chart opens in an adjustment view (output − input, 0 = no change) with a toggle back to the input → output curve; points stay draggable in both views. Chart Y ticks use round steps and the plot moves down when the legend wraps.
- UI: the curve table shows the calculation method once in its caption instead of on every row, and notes only rows that use a different method (for example a CTV fallback).
- UI: "欠补偿比例 / Under-Comp Ratio" is renamed "补偿强度 / Compensation Strength", with a hint explaining 100% and the 40–60% first-run range.
- UI: the diagnosis page opens with a verdict banner (can the press go to production, the next step, and a link to it); the G7 overview opens with its conclusion, marked as a G7-method reference check rather than an Idealliance certification, and NPDC/gray KPI cards take their colour from Pass/Fail.
- UI: the key patch table no longer shows a "D -" placeholder when density is missing, and Lab values show one decimal (full value in the tooltip) without overlapping.
- A Lab-only P2P file in TVI/G7 mode now explains that the mode cannot compute tone values and suggests CTV, instead of reporting "未加载测量数据".
- Press-diagnosis titles and messages are now translated in English mode.
- Old release installers that bundled the removed reference data have been withdrawn; use 1.0.6 or later.

## 1.0.5 - 2026-07-05

- Hardened desktop release packaging by pinning the Tauri CLI, adding a package lock, and disabling the global Tauri bridge.
- Added stricter desktop file-command validation and updated the JavaScript bridge for Tauri's internal invoke API.
- Blocked unfinished real-device SDK actions until vendor SDK/protocol integration is available.
- Improved customer audit report layout, print behavior, and straight tolerance-band rendering for tone-gain charts.
- Added release, bridge, SDK, and audit-report regression tests.

## 1.0.4 - 2026-06-09

- Translated all text nodes and buttons inside the Product Center dialog (Help, Updates, About) into English when switching languages.
- Wrapped the software update status text inside the card and fixed the height of the Product Center modal to 560px to prevent size jumping when switching tabs.

## 1.0.3 - 2026-06-09

- Renamed the fourth sidebar navigation tab and help description from "报告与导出" to "验证报告" to ensure visual consistency with other 4-character tabs.

## 1.0.2 - 2026-06-09

- Refactored styles.css with CSS Design Tokens system and merged overrides back into core styles, reducing `!important` occurrences.
- Unified button heights and control sizing across all features.
- Aligned G7 gray balance candidate heuristics across import-inspector and analysis-engine, extracting duplicate logic to shared.
- Adjusted Yellow channel fallback solid density and implemented progressive smooth limits for compensation curves.
- Expanded Status-T, spectral, and Delta E test coverage.

## 1.0.1 - 2026-06-08

- Optimize field audit report layout, scoring logic, standard curves, and unify UI button styles.
- Support importing ICC profiles directly within standard library.
- Fix manual measurement tab auto-jumping issues.
- Rename step 4 to '报告与导出' (Reports & Exports).
- Added a release audit script for version alignment, duplicate translation keys, English UI text, and generic RIP wording.
- Added `npm run verify:release` as the pre-package release gate.
- Added a Node-only local static server for Windows-friendly preview.
- Added a Windows Tauri overlay config for NSIS/MSI installer architecture.
- Added Windows installer artifact verification and a GitHub Actions workflow for `windows-latest` installer builds.
- Documented the shared macOS/Windows desktop packaging path.

## 0.1.12 - 2026-05-22

- Aligned CMY gray candidate detection with P2P / Curve+ style gray patches where C can be slightly higher than M/Y.
- Changed G7 gray-balance wDeltaCh to compare measured gray a*/b* against the selected standard gray Lab target before falling back to neutral zero.
- Corrected G7 chart/detail summaries so K NPDC, CMY NPDC, and gray-balance wDeltaCh are reported separately.
- Simplified the curve table by consolidating duplicate output columns into one editable `建议录入网点` column.
- Replaced the on-page Kodak Prinergy / RIP manual-entry acceptance table with a compensation simulation curve chart.
- Kept chart hover tooltips inside the visible window near chart edges.
- Reworked the Lab a*b* chromaticity chart toward the reference software style with quadrant background, target/sample vectors, C/M/Y/R/G/B gamut polygons, hue traces, and Chinese legend labels.
- Prevented incomplete Lab a*b* data from drawing a misleading C/M/Y-only gamut triangle.
- Fed full imported raw Lab/CMYK patches into the Lab a*b* chart so P2P/TC1617 data can draw the same C/M/Y/R/G/B gamut shape as reference software.

## 0.1.11 - 2026-05-22

- Reworked G7 charts toward a report-style layout with fixed, readable NPDC, gray balance, and wDeltaL scales.
- Bound G7 NPDC and gray target L* values to the selected standard patch Lab data before falling back to the built-in CRPC6 target table.
- Added G7 tolerance background bands and removed extra target dots so the charts focus on measured-vs-target trends.
- Added chart tests for the G7 report scales.

## 0.1.10 - 2026-05-22

- Unified primary workflow button colors so loading, opening, parsing, adding, applying, saving, and calculating use the same brand action color.
- Kept blue for selection, tabs, and visual emphasis instead of mixing it into primary action buttons.

## 0.1.9 - 2026-05-22

- Fixed the left calculation settings panel so longer production labels no longer overflow outside the card.
- Increased the sidebar width slightly and constrained sidebar form controls to the available column.
- Kept the disabled calculation button behavior when no measurement data is loaded, but made its layout consistent with the rest of the panel.
- Replaced the desktop/app icon with the new CurveStudio tone-gain curve artwork.

## 0.1.8 - 2026-05-22

- Made System Settings closer to the reference software: color analysis tolerance, Delta E formula labels, dot calculation mode labels, and density filter labels now use production-oriented wording.
- Wired Delta E inner/outer tolerances into the actual Lab, G7, report, export, archive, and ICC gate calculations instead of leaving them as display-only text.
- Added a real density-filter behavior: `None` disables spectral-density TVI conversion, while `ISO_T` remains the only enabled Status density algorithm; unverified DIN / ISO-I / ISO-E options stay disabled.

## 0.1.7 - 2026-05-22

- Expanded System Settings with actionable defaults for calculation, SCCA, measurement condition, illuminant/observer metadata, device entry mode, queue profile, density filter, and ICC/G7 gate behavior.
- Persisted the new settings into project archives and export metadata.
- Shortened the sidebar product subtitle to `TVI / CTV / G7`.

## 0.1.6 - 2026-05-22

- Renamed the desktop app and browser shell to `CurveStudio`.
- Updated bundle identifier, package names, desktop window title, app metadata, and export originator strings.
- Replaced desktop app icons and added generated platform icon assets for future macOS/Windows packaging.
- Replaced Unicode sidebar symbols with inline SVG navigation icons for more reliable rendering.

## 0.1.5 - 2026-05-22

- Clarified that Harmony belongs to the Kodak Prinergy workflow rather than a separate RIP family.
- Renamed export labels and filenames to `Kodak Prinergy Harmony` and `Kodak Prinergy CSV`.
- Updated RIP compatibility metadata and documentation wording.

## 0.1.4 - 2026-05-22

- Reworked Export into grouped sections for RIP/curve delivery, verification reports, project archives, and ICC/characterization handoff.
- Renamed the simple RIP output as a generic RIP CSV and documented compatibility intent for Kodak Prinergy, SCREEN Trueflow, Heidelberg Prinect, Agfa Apogee, Harlequin, Founder Flow, Esko, and similar RIPs.
- Added RIP compatibility metadata to export headers.
- Changed the ICC generation gate report from a large fail-card wall into a compact summary with expandable details.

## 0.1.3 - 2026-05-22

- Added gate-controlled experimental ICC draft export with a metadata sidecar.
- ICC export now uses the latest saved re-measurement Run and blocks when the ICC generation gate is not ready.
- Added latest-Run CGATS measurement export for ICC characterization handoff.
- Added ICC generator tests for gate blocking, latest Run provenance, metadata, profile parsing, and CGATS output.
- Tightened the English UI pass for the main workflow chrome, status bar, export/report text, Standard page, and dynamic empty states.

## 0.1.2 - 2026-05-21

- Added a conservative ICC generation gate for the re-measure verification workflow.
- The gate checks saved pre/post Runs, characterization patch coverage, Lab data, paper/solid/overprint coverage, TVI/CTV residuals, G7 status, and curve quality.
- Report and Export now show whether ICC generation is blocked, requires review, or is ready.
- Project archives and export headers now record the ICC generation gate result.
- Added tests for ICC gate blocking, ready state, G7 failure, and P2P coverage detection.

## 0.1.1 - 2026-05-21

- Added ICC Lab reference plus explicit TVI/CTV/G7 tone target pairing in the Standard page.
- Added warnings for obvious ICC and standard aim mismatches, including CRPC number conflicts.
- Added ICC pairing metadata to export headers and JSON project archives.
- Added tests for ICC/standard pairing behavior.
- Documented the new release rule: feature updates should bump the app version and record the change here.

## 0.1.0 - 2026-05-21

- Initial working MVP for TVI/CTV/G7 compensation, standards, measurement import/manual entry, analysis, curves, export, reporting, and Tauri desktop packaging.
