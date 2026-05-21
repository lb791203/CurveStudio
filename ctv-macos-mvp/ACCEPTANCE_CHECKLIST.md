# CTV Curve MVP Acceptance Checklist

Use `http://127.0.0.1:4173/` for acceptance. Do not use `file://` when checking standard-library loading.

## 1. Manual Measurement

- Open `Measurement`.
- Click `纸白/实地`, `25/50/75`, `完整阶调`, and `灰平衡/叠印`.
- Use `现场录入模式` and confirm rows are added for plate/print dot, density TVI, CTV Lab, and G7 verification modes.
- Confirm rows show patch type, channel, tone, density, Lab, source, note, calculation path, and data status columns.
- Paste tab-delimited Excel/WPS data into the manual table.
- Click `应用测量表` and confirm the measurement summary updates.
- Confirm export, G7, save, and calculate buttons are disabled until the required data exists.

## 2. Standard Library

- Open `Standard`.
- Select `GRACoL2013 CRPC1` through `GRACoL2013 CRPC7`, `FOGRA39`, and ISO TVI curves.
- Confirm 25/50/75 target values are visible.
- Confirm paper, solids, overprints, and 25/50/75 Lab rows are listed when the standard file contains them.
- Enter custom 25/50/75 TVI values and click `应用自定义目标`.

## 3. Curve Calculation

- Load `KBA105 报告现场记录`.
- Confirm diagnosis is `机械异常 / 抢救型生产补偿`.
- Confirm curve table contains theory output, production output, Harmony/RIP adjustment, final output, and measured/interpolated source.
- Confirm curve table shows `算法来源` for reported TVI/tone, Murray-Davies density, ISO 20654 CTV, or interpolation.
- Load `KBA162 报告现场记录`.
- Confirm diagnosis is `生产可补偿型 TVI`.
- Load `CTV Lab 计算样例`.
- Confirm mode switches to CTV, curve rows are generated, and algorithm source contains `ISO 20654 Lab`.

## 4. Lab / G7

- Open `Analyze`.
- Confirm Delta E 76, Delta E 94, Delta E 2000, and CMC columns are visible.
- Open `Settings`, switch the Delta E formula, and confirm Lab/G7 KPI labels follow the selected formula.
- Toggle `SCCA 纸白校正`; if paper Lab is missing, the UI must warn that SCCA cannot run.
- Open `G7`.
- Confirm Data Incomplete is shown when gray-balance/P2P/Lab data is missing.
- Confirm G7 data completeness lists P2P/CGATS, paper, CMYK solids, K-only NPDC, CMY neutral gray, and comparable Lab/Delta E readiness.
- Confirm K-only NPDC and gray-balance charts render.
- Load `P2P51 G7 测量样例` and confirm P2P/gray candidate counts are detected while Lab/G7 gray balance remains incomplete.

## 5. Export / Run

- Open `Export`.
- Export curve CSV, Harmony CSV, Prinergy CSV, simplified RIP CSV, CGATS TXT, and JSON project archive.
- Confirm exported files include standard, algorithm, target, compensation ratio, measurement condition, customer, press, paper, device, and timestamp metadata.
- Confirm exported files include the suggested `jobs/.../runs/...json` archive path.
- Confirm curve CSV / CGATS include `measurement_method`, and Prinergy comments include the metric method.
- Select the exported JSON project archive in Measurement and confirm Job/settings/measurements restore.
- Open `Job`, click `保存当前 Run` twice after changing data, and confirm Run comparison appears.

## 6. ICC Workflow Future Acceptance

- Import `.icc` / `.icm` from the Standard page and confirm metadata is shown.
- Confirm ICC import is labeled as Lab/color reference, not a TVI/G7 measurement file.
- Confirm importing ICC does not silently change the selected TVI/CTV/G7 target curve.
- Confirm measured Lab can be compared against ICC-derived reference patches after ICC sampling is implemented.
- Confirm ICC generation is disabled for the first measurement run.
- Confirm ICC generation is disabled when no compensated re-measurement run exists.
- Confirm ICC generation is disabled when characterization patch coverage is insufficient.
- Confirm ICC generation becomes available only after a compensated re-measurement passes the selected validation gates.
- Confirm generated ICC records provenance: Job, Run, measurement condition, instrument, compensation curve, validation status, and generation time.
