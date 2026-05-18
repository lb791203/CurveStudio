# Windows Reference Software UI Study

> Source: live Parallels screenshots plus extracted WPF resources from `CtvTools.Presentation.Wpf.exe`.
> Goal: learn the reference workflow for the macOS/Windows print compensation curve MVP, not copy the UI blindly.

## Confirmed Live Screens

### Live Recheck 2026-05-14

- Parallels/Desktop interaction was rechecked against the running Windows `CtvTools` app.
- Job list showed a card for `Job 20260514-161017`, with status `无测量数据`, timestamp, `重命名`, `删除`, and `新建作业`.
- Job detail was confirmed with:
  - `印刷标准: GRACoL2013_CRPC6`
  - `SCCA 校正`
  - `计算方式: TVI (ISO标准)`
  - tabs `校验`, `分析`, `曲线`, `G7`
- Calculation method dropdown was confirmed live:
  - `TVI (ISO标准)`
  - `CTV (线性)`
  - `G7 (TR015)`
  - `G7+ (NPDC+SCTV)`
- `分析` tab empty state asks to load a chart and complete measurement first. Its table is organized as measured sample vs target, with density/Lab/Delta E style columns and an `a* b* 色度图` panel.
- `曲线` tab is a working curve panel, not just a preview:
  - channel selector `All`
  - method label `TVI (Murray-Davies)`
  - display selector `测量值`
  - channel legend `% C M Y K`
  - actions `复制` and `导出`
  - empty state: curve data requires loaded measurement data including paper, solids, and tint patches.
- `G7` tab exposes two primary actions:
  - `运行 G7 校验`
  - `生成 G7 补偿曲线`
- `设备` page was confirmed live with available device list, `刷新`, density filter, illuminant, observer, measurement condition, white reference, `连接`, `断开`, and `白校正`.
- `标准` page was confirmed live:
  - `GRACoL2013_CRPC6` was imported from ICC and stores source/update metadata.
  - reference patch rows include paper, C/M/Y/K solids, CM/CY/MY/CMY overprints, Lab reference values, Delta E warning, and Delta E failure.
  - C/M/Y/K dot tolerance table has TVI 25/50/75, CTV 25/50/75, and per-channel TVI target curve selection.
  - Current visible TVI target curve for C/M/Y/K was `ISO 2004 Curve B`.
  - G7 tolerance is controlled by an `启用 G7 校验` checkbox below the dot tolerance table.
- `设置` page was confirmed live:
  - color analysis tolerance uses inner/outer Delta E radii, currently 3.5 and 4.2.
  - Delta E formula dropdown currently shows `ΔE CMC — CMC (l:c)`, while helper text still says default is `ΔE*ab (CIE 1976)`.
  - dot calculation method default is separate from job-level selection and currently shows `TVI — Murray-Davies 密度法`.
- `测量` window was confirmed live:
  - title `测量 — Job 20260514-161017`
  - device status `未连接设备`
  - action `加载 IT8...`
  - action `完成`
  - empty state `未加载色表`
  - no full manual tint-value entry grid is exposed in this workflow.

### Job Detail

- Left navigation: `作业`, `设备`, `标准`, `设置`, plus `主题`, language selector, and `帮助`.
- Job header: back button, job name, device status.
- Measurement panel: `测量数据` list with `添加`, `测量`, `删除`, `计算`.
- Calculation bar:
  - `印刷标准`
  - `SCCA 校正`
  - `计算方式`
- Calculation methods:
  - `TVI (ISO标准)`
  - `CTV (线性)`
  - `G7 (TR015)`
  - `G7+ (NPDC+SCTV)`
- Job tabs seen/confirmed from resources:
  - `校验`
  - `概览`
  - `分析`
  - `曲线`
  - `G7`
- Empty-state copy confirms workflow: load measurement data first, then select print standard, then verify/analyze/calculate.

### Standards

- Standard list on the left. Current sample standard: `GRACoL2013_CRPC6`.
- Buttons: `新建`, `导入`, `导入ICC`, `复制`, `删除`.
- Standard detail fields:
  - name
  - optional description
  - source
  - updated time
  - CTV/TVI middle-tone tolerance
- Reference patch table:
  - patch type
  - patch name
  - Lab reference
  - Delta E warning threshold
  - Delta E failure threshold
- Visible sample patches include paper, C/M/Y/K solids, and overprint patches.
- Bottom sections from extracted UI:
  - C/M/Y/K dot tolerances
  - TVI target curve selector
  - G7 verification tolerance
  - spot channel setup

## Extracted UI Structure

### Job List

- `作业列表`
- `新建作业`
- job cards with:
  - job name
  - created time
  - measurement count
  - optional verification status
- actions:
  - open
  - rename
  - delete
  - export measurement data

### Import/Export

- Measurement import file filter:
  - `*.it8`
  - `*.ttg`
  - `*.txt`
  - `*.cgats`
  - `*.rwxf`
  - `*.cxf`
- Chart load file filter:
  - `*.it8`
  - `*.ttg`
  - `*.txt`
  - `*.cgats`
  - `*.rwxf`
  - `*.cxf`
- Standard import:
  - CGATS/IT8 compatible files
- Measurement export:
  - CGATS text `*.txt;*.cgats`
- Curve export:
  - CGATS `*.cgats`
  - text `*.txt`
- Export implementation names also show:
  - CSV compensation curve exporter
  - CVP compensation curve exporter

### Analysis

- Shows measured sample vs target/reference.
- Columns/fields include:
  - density
  - measured Lab
  - reference Lab
  - Delta E
- Includes `a* b* 色度图`.
- SCCA message states reference Lab can be substrate-corrected from measured paper white.
- Warning state exists when SCCA is checked but paper white measurement is missing.

### Curve

- Dot method label and step controls:
  - `5%`
  - `10%`
  - `25%`
- Smoothing slider from 0 to 10.
- Display switch:
  - measured values
  - compensated values
- Channel filter:
  - all
  - C
  - M
  - Y
  - K
- Curve chart control plus curve table.
- Actions:
  - copy curve data
  - export curve data as CGATS

### G7

- Buttons:
  - `运行 G7 校验`
  - `生成 G7 补偿曲线`
- Sections:
  - `CMY NPDC`
  - `K NPDC`
  - `灰平衡`
  - `wΔL*`
  - `wΔCh`
- Metrics:
  - weighted average
  - weighted maximum
  - pass/fail
- Chart controls:
  - CMY NPDC chart
  - K NPDC chart
  - G7 gray balance chart
  - combined NPDC chart

### Device

- `设备连接`
- `可用设备`
- `刷新`
- Measurement parameters:
  - density filter
  - illuminant
  - observer
  - measurement condition
  - white reference
- Actions:
  - connect
  - disconnect
  - white calibration
- Techkon infrastructure exists in the package:
  - device discovery
  - USB support flag
  - TCP/IP connection methods
  - scan/calibrate/connect/disconnect async methods

### Measurement Window

- Title: `测量`
- Shows device readiness/status.
- Main control: color chart view.
- Actions:
  - load chart
  - measure
  - complete
- Shows current patch and CMYK values.
- A `手动输入 Lab 值` dialog exists with `L*`, `a*`, `b*`, but the reference software does not expose a full practical manual measurement table in the main job workflow.

### Settings

- Delta E display/analysis settings:
  - inner tolerance Delta E
  - outer tolerance Delta E
- Delta E formula:
  - `Delta E*ab - CIE 1976`
  - `Delta E94 - CIE 1994`
  - `Delta E2000 - CIEDE2000`
  - `Delta E CMC - CMC (l:c)`
- Dot calculation method:
  - `TVI - Murray-Davies 密度法`
  - `CTV - SCTV 色度法 (ISO 20654)`
  - `G7 - NPDC 灰平衡 (TR015)`
  - `G7+ - NPDC + SCTV 扩展`
- Density filter:
  - `None`
  - `DIN 16536`
  - `DIN 16536-NB`
  - `ISO_I`
  - `ISO_T`
  - `ISO_E`

### Standard Editing

- Reference patches are editable.
- Per-patch Delta E warning/failure thresholds are editable.
- CMYK tolerance table:
  - TVI 25%
  - TVI 50%
  - TVI 75%
  - CTV 25%
  - CTV 50%
  - CTV 75%
  - TVI target curve
- TVI target curves available:
  - ISO 2004 Curve A
  - ISO 2004 Curve B
  - ISO 2004 Curve C
  - ISO 2004 Curve D
  - ISO 2004 Curve E
  - ISO 2004 Curve F
  - ISO 2013 Curve A
  - ISO 2013 Curve B
  - ISO 2013 Curve C
  - ISO 2013 Curve D
  - ISO 2013 Curve E
- G7 tolerance section:
  - enable G7 verification
  - NPDC weighted Delta L average tolerance
  - NPDC weighted Delta L max tolerance
  - gray balance weighted Delta Ch average tolerance
  - gray balance weighted Delta Ch max tolerance
  - G7+ gray cusp point
- Spot channel section:
  - spot name
  - dot method: TVI density or CTV/SCTV
  - solid Lab reference

## Product Lessons For Our MVP

1. The reference software is built around job-based measurement runs. Our MVP should keep this model.
2. Print standards are first-class data, not just a dropdown. Our app needs a standard library with import/edit/export.
3. The measurement workflow must support three entry paths:
   - file import
   - instrument measurement
   - manual value entry
4. Manual value entry should be stronger than the reference software: a full CMYK tint grid, not only a hidden Lab dialog.
5. The calculation method should be explicit and visible:
   - TVI ISO
   - CTV/SCTV
   - G7
   - G7+
6. SCCA belongs in MVP because the reference workflow already treats paper-white correction as a first-class option.
7. The MVP curve screen should include:
   - measured curve
   - target curve
   - compensation curve
   - per-channel table
   - smoothing/under-compensation control
   - export button
8. G7 should start as verification in MVP, with curve generation added behind the same data model.
9. Export should not stop at CSV. Prinergy/Harmony/CTP workflows need CGATS-like and RIP-friendly curve formats.
10. We should copy the workflow concepts, not the reference layout. The macOS app should make manual input and automatic curve recommendation more direct.

## Immediate MVP Impact

- Add a `Standards` module early, not later.
- Store standards, measurements, calculations, and exports as separate domain objects.
- Build importers around IT8/CGATS text first, then add CXF/RWXF.
- Build manual measurement input as a production feature, not a debug feature.
- Make the curve engine return both raw correction and production-safe correction.
- Keep G7 data structures in the first version even if the first UI only verifies.
