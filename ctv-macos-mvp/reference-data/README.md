# Reference Data

Only data that CurveStudio may redistribute lives here, because `scripts/build-dist.mjs` bundles this folder into the desktop app.

## Contents

- `standards/cgats21-iso15339/` — CGATS21-2 / ISO 15339-2 CRPC1–CRPC7 characterization data (publicly published reference print conditions). Used by the built-in GRACoL2013 CRPC standards.
- `standards/audit-demo/` — target Lab for the ISO 12647-2:2007 offset audit demo standard.
- `targets/p2p/` — P2P25 / P2P51 target definitions (CMYK values only), used for patch-layout detection and to generate the simulated demo sheet.

## Rules

- Do not add vendor training kits, files copied from other software installations, ICC profiles or workflow files without a licence that allows redistribution, or customer measurement data.
- Test and demo measurements must be self-made or synthetic. `scripts/generate-demo-p2p.mjs` shows how to build a synthetic press sheet from the CRPC data.
- Importer requirements (line endings, tab/space separated CGATS, M0/M1/M2 conditions, CMYK-only targets) are covered by unit tests with inline fixtures.
