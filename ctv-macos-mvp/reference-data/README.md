# Reference Data

This folder contains a small working set copied from local PatchTool and G7 Expert training resources for importer development, standard-library testing, G7/SCCA data modeling, and export validation.

Use these files as local development fixtures. Do not redistribute them with a commercial build until the data rights and licenses are confirmed.

## Source Roots

- `/Applications/BabelColor PatchTool/characterization_data`
- `/Users/liangbo/Documents/工作资料库/03_通用资料/01_印刷专业技术知识库/G7 Expert/G7 2021/G7 Expert Training Kit Jan 2021`
- `/Users/liangbo/Downloads/02_压缩包/昇辉KB162`

## Folder Map

- `standards/cgats21-iso15339/`
  - CGATS21 / ISO 15339 CRPC1-CRPC7 reference data.
  - Primary fixture group for CRPC standard import.
- `standards/characterization-csv/`
  - TR002, TR003, TR005, TR006 characterization CSV samples.
  - Primary fixture group for CSV standard import.
- `standards/patchtool/`
  - GRACoL2013 CRPC6 IT8.7-4, GRACoL2013 CRPC6 IT8.7-5, and FOGRA39.
  - Primary fixture group for IT8/CGATS parser coverage.
- `profiles/cgats21/`
  - CRPC1-CRPC7 ICC profiles.
  - Useful for future ICC-based standard import and profile metadata display.
- `targets/p2p/`
  - P2P25 and P2P51 target definitions.
  - Useful for G7 calibration workflow and manual measurement grid design.
- `targets/rwxf/`
  - P2P51 i1Profiler workflow file.
  - Useful for future X-Rite workflow import support.
- `measurements/g7-training/`
  - G7 training measurement files, including M0/M1/M2 variants.
  - Useful for testing measurement-condition handling and G7 validation.
- `measurements/kba162-shenghui/`
  - Curve5 P2P51 field scans from the KBA162 print run.
  - Useful for real i1Pro/Curve workflow validation, CTV calculation, and G7 preview checks.
- `harmony/kba162-shenghui/`
  - Harmony `.hmy` curve exported from the same KBA162 field workflow.
  - Useful for later comparison between generated compensation curves and operator-applied Harmony curves.
- `measurements/it8-random/`
  - IT8.7-4 random sample measurement files in M0/M1/M2.
  - Useful for measurement importer stress tests.
- `control-wedges/`
  - GRACoL and CRPC6 control wedge reference data.
  - Useful for verification-page and report fixture design.

## Importer Requirements Confirmed By These Files

- Normalize line endings before parsing. The source set includes LF, CRLF, and CR-only text files.
- Parse both tab-separated and space-separated CGATS-like data.
- Preserve metadata fields such as descriptor, print condition, measurement condition, illuminant, observer, filter, and source.
- Support `BEGIN_DATA_FORMAT` / `BEGIN_DATA` tables with CMYK, XYZ, and Lab columns.
- Support target definitions that contain CMYK only and no Lab values.
- Keep measurement condition (`M0`, `M1`, `M2`) attached to imported measurement runs.
- Treat ICC profiles as reference assets, not measurement data.
