# Changelog

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
