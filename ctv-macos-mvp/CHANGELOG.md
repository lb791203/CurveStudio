# Changelog

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
