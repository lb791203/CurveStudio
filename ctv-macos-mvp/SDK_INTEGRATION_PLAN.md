# CurveStudio Instrument SDK Integration Plan

CurveStudio's product target is a field-facing TVI / CTV / G7 curve generation and remeasurement tool. Instrument SDK work should support that workflow without changing the calculation engine.

## Principles

- File import remains the stable baseline for CGATS, IT8, CSV, P2P, CxF, and RWXF workflows.
- Real instruments are accessed only through a `DeviceAdapter` boundary.
- SDK/HID responses must not create measurement rows until Lab, density, or spectral values are parsed and validated.
- Every SDK measurement row must record instrument name, adapter type, measurement condition, timestamp, and raw/source method where available.
- Curve calculation, G7 verification, and exports must consume the same normalized measurement rows whether they came from file import, manual entry, or SDK capture.

## Current State

- Browser/web workflow: file import, manual entry, mock device queue, vendor CTV cross-check.
- Desktop shell: Tauri command bridge exists for file IO and HID device scanning.
- HID discovery: scans Techkon vendor id `0x197B` and X-Rite vendor id `0x0981`.
- Safety gate: raw SDK/HID responses are now blocked from writing rows until parsed Lab data exists.

## Phase 1: SDK Contract And Safe Bridge

- Define normalized SDK response shape:
  - `parsed: boolean`
  - `lab: { l, a, b }` when available
  - `density` when available
  - `spectral` when available
  - `measurementCondition`
  - `instrument`
  - `rawResponse` or source trace for diagnostics
- Keep SDK adapter state separate from calculation state until the response is parsed.
- Add adapter tests for parsed, raw-only, error, disconnected, and queue-complete states.
- Show device identity, VID/PID, and parser status in the instrument panel.

## Phase 2: Vendor SDK Prototype

- Techkon path:
  - Confirm supported model and SDK/API availability.
  - Replace speculative HID command parsing with documented SDK calls or verified protocol.
  - Capture paper white, solids, tones, gray patches, and overprints into the same queue.
- X-Rite path:
  - Start with vendor-export workflow as the production path.
  - Add direct SDK only after licensing/API access is confirmed.
  - Verify measurement condition reporting for M0/M1/M2.

## Phase 3: Field Workflow Validation

- Connect device.
- White calibrate.
- Read queue point-by-point.
- Save Run.
- Generate TVI / CTV / G7 curve.
- Remeasure after applying curve.
- Compare Run changes and export Chinese field report.

## Acceptance Gates

- SDK cannot write fake or unparsed measurements.
- Imported and SDK-captured rows produce equivalent curve/G7 results for the same sample data.
- Failed SDK reads leave the current job and saved Runs intact.
- Clear user-facing messages explain whether the block is connection, license, parser, calibration, or measurement condition.
- Windows and macOS builds keep passing release verification.
