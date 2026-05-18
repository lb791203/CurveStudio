# CTV Curve MVP

macOS-first MVP for a print compensation curve tool. The first version is a local browser app so it can be used immediately on macOS and later wrapped with Tauri or SwiftUI.

## MVP scope

- Import CSV, CGATS, IT8, and P2P-style text measurement/target data.
- Reopen exported JSON project archives from the file picker.
- Enter field records manually when patches were measured one by one.
- Work through formal pages: Job, Standard, Measurement, Analyze, Curve, G7, Export, and Settings.
- Select built-in standards: GRACoL2013 CRPC1-7, FOGRA39, and ISO TVI A-F target curves.
- Build custom TVI targets from 25/50/75 input values.
- Calculate TVI, ISO 20654 CTV, and G7-style MVP compensation curves.
- Display measured TVI against target and final input-to-output curves with legends and hover values.
- Lock individual curve output points for technician overrides while preserving the original automatic output.
- Diagnose press state from TVI deviation and recommend a default under-compensation ratio.
- Compare measured Lab against standard Lab using selectable Delta E 76, Delta E 94, Delta E 2000, or CMC for available paper, solid, overprint, and gray patches.
- Run first-stage G7 data-completeness checks, K-only NPDC preview, and gray-balance a*b* preview before reporting status.
- Export compensation curve results as calculation CSV, Harmony/RIP manual-entry CSV, Prinergy CSV, simplified RIP CSV, CGATS text, or JSON project archive.

## Run

Open `index.html` in a browser, or start a local server:

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

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

The sample selector also includes a `CTV Lab 计算样例` plus P2P51 and TC1617 G7 measurement examples copied into `reference-data`. The CTV sample checks ISO 20654 Lab calculation. The G7 samples are useful for checking P2P patch detection, paper/solid classification, K-only NPDC behavior, and CMY gray candidates. Spectral-only files are intentionally marked `Data Incomplete` for Lab/G7 gray-balance until spectral-to-Lab conversion is implemented.

Structured import now supports files with `BEGIN_DATA_FORMAT` / `BEGIN_DATA`, including:

- CGATS / IT8 characterization files with `CMYK_*`, `XYZ_*`, `LAB_*`.
- P2P targets with CMYK patch definitions.
- Spectral measurement files with `SPECTRAL_NM*` columns. For MVP, single-channel tint TVI is estimated from paper / tint / solid spectral density using one channel wavelength.

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

When spectral-only measurement files are used, the current density estimate is visibly marked as `single-wavelength-mvp` / `光谱密度 MVP`. This is a production warning, not a Status-T or Status-E density replacement.

The result table shows a manual-entry reference for Harmony, Prinergy, and other RIP tools:

- `Harmony/RIP 调整`: reduce or increase percentage for the current input tone.
- `建议录入网点`: the output tone to enter in the curve.
- `锁定` / `人工输出` / `自动输出`: override a single curve point for production and still keep the algorithm-generated value visible.
- `理论输出` / `生产输出` / `建议录入网点`: separate full correction, under-corrected production value, and final protected curve value.
- `算法来源`: whether the row came from reported TVI/tone, Murray-Davies density, ISO 20654 Lab/XYZ, or interpolation.

## Current acceptance checks

- KBA105 sample: identifies `机械异常 / 抢救型生产补偿` and uses 45% as the suggested under-compensation ratio.
- KBA162 sample: identifies `生产可补偿型 TVI` and uses 55% as the suggested under-compensation ratio.
- GRACoL2013 CRPC6 standard file loads Lab reference patches into the standard library.
- Pure standard/target files remain reference-only and do not generate false compensation curves.
- Missing P2P/gray-balance/Lab data keeps G7 in `Data Incomplete` instead of generating a false pass.
- G7 preview reports P2P/CGATS completeness, paper, CMYK solids, K-only NPDC, CMY gray candidates, and Lab/Delta E readiness.
- Saved Job runs can compare latest vs previous TVI, Delta E, and G7 state and show a future Tauri-style archive path.
- Exported JSON project archives can be selected again in Measurement to restore job/settings/measurements.
- Exported JSON archives include `schemaVersion: 2` and `storagePlan` with `jobs/.../runs/...json` path metadata.
- Exported JSON archives include curve point overrides so locked manual output values can be restored.
- CTV Lab sample generates ISO 20654 CTV rows and exports `measurement_method` metadata.
- Lab verification supports ΔE76, ΔE94, ΔE2000, and CMC formula selection from Settings.
- CTV fallback and single-wavelength spectral-density MVP warnings are visible in Curve and Export.

## Next engineering steps

- Replace MVP single-wavelength spectral density with full Status-T / Status-E style density calculation.
- Validate ISO 20654 CTV results against vendor instrument exports from X-Rite / Techkon.
- Turn G7 preview into certification-level NPDC / gray-balance verification once the exact P2P target mapping is finalized.
- Wire the prepared `storagePlan` to real file-backed job archives once Tauri file APIs are available.
- Evaluate CxF and RWXF from real X-Rite / Techkon exports.
- Add TECHKON device integration on macOS if the vendor SDK or HID protocol is available.
- Package as Tauri app for signed macOS distribution.

## Validation

```bash
npm test
npm run validate:fixtures
```

See `ARCHITECTURE.md` for the current module map and data flow.

`npm test` covers core curve switching, interpolation, smoothing/protection/monotonic behavior, flexible import parsing, and Delta E formula smoke checks. `npm run validate:fixtures` parses the copied reference fixtures under `reference-data` and reports patch rows, single-channel tone rows, usable measurement rows, and generated curve points.
