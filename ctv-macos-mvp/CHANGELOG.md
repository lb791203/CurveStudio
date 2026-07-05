# Changelog

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
