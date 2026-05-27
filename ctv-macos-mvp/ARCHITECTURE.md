# CTV Curve MVP Architecture

## Runtime Shape

The MVP is a static browser application. Core calculation code is pure JavaScript so the same modules can later run inside Tauri for macOS and Windows packaging.

## Desktop Packaging Shape

```text
shared static frontend
  -> npm run build:dist
  -> macOS Tauri config: src-tauri/tauri.conf.json
  -> Windows Tauri config: src-tauri/tauri.windows.conf.json
```

The macOS and Windows apps must share the same calculation modules. Platform differences should stay in the packaging config, native file dialogs, local storage location, and future `DeviceAdapter` implementations.

## Data Flow

```text
Manual table / file import
  -> parseImportText() / manual-table normalization
  -> measurements[]
  -> buildDiagnosticRows()
  -> diagnosePress()
  -> calculateCompensation()
  -> applyCurveOverrides()
  -> results[]
  -> buildLabVerificationRows()
  -> analyzeCurveSafety()
  -> g7Preview()
  -> render*() views
  -> exporter.js formats
```

## Main Modules

- `src/app.js`: current UI orchestrator, state, events, and page rendering glue.
- `src/curve-engine.js`: import parsing, TVI/CTV/G7 MVP compensation, interpolation, smoothing, tone protection, export rows.
- `src/curve-overrides.js`: production curve point locks and manual output overrides.
- `src/analysis-engine.js`: Lab/Delta E, press diagnosis, G7 data completeness and preview metrics.
- `src/manual-table.js`: field-record rows, Excel/WPS paste parsing, manual density/Lab enrichment.
- `src/chart-renderer.js`: SVG curve, TVI, NPDC, and gray-balance chart rendering.
- `src/exporter.js`: Harmony/Prinergy/simple RIP/CGATS/JSON export context and project archive shape.
- `src/import-inspector.js`: import quality checks, reference-only file detection, metric source audit.
- `src/standards.js`: built-in standard and target library.

## Important State Contracts

- `measurements[]` are normalized measurement points from file import or manual table application.
- `results[]` are the final production curve rows after smoothing, tone protection, monotonic enforcement, and manual overrides.
- `curveOverrides` stores locked output points by `channel:tone` key. JSON project archives persist these overrides.
- `manualDirty` blocks export/save when manual rows have changed but the curve has not been recalculated.
- `importInfo.warnings` carries user-facing calculation warnings such as CTV fallback and MVP spectral density.

## Export Contract

All production exports should carry:

- selected standard and target,
- calculation mode and formula,
- Delta E formula,
- compensation ratio,
- measurement condition,
- generated timestamp,
- metric and measurement method for each curve point.

JSON project archives additionally store job metadata, settings, measurements, curve rows, Lab/G7 results, and `curveOverrides` for restore.

## Release Gate

Before a packaged build, run:

```bash
npm run verify:release
npm run tauri:build:windows
npm run verify:windows-artifacts
```

This checks release metadata, duplicate translation keys, English UI translation values, the full test suite, fixture import validation, and the static frontend build.

Windows installer verification is prepared as the GitHub Actions template `ci/github-actions/windows-installer.yml`. Activate it as `.github/workflows/windows-installer.yml` with a GitHub token that has the `workflow` scope. The workflow uses a Windows runner, builds NSIS and MSI bundles through `src-tauri/tauri.windows.conf.json`, checks the generated installer files, and uploads them as the `CurveStudio-windows-installers` artifact.
