# ICC Workflow Implementation Plan

This plan defines the ICC path for the CTV Curve app:

`Standard / ICC Import -> Measurement -> Compensation Curve -> Re-measure Verification -> ICC Generation`

The core rule is strict: an ICC profile describes a measured, stable printing condition. The app must not generate a formal ICC directly from a theoretical TVI/CTV/G7 compensation curve.

## Product Roles

### ICC Import

ICC import is a reference and inspection feature. It helps the operator understand the target print condition and compare measured Lab values against a profile-derived reference.

Supported uses:

- Import a CMYK output ICC as a standard/reference source.
- Show profile metadata and media white.
- Sample CMYK values through the profile and preview reference Lab values.
- Compare measured paper, solids, overprints, gray balance, and sampled patches against ICC-derived Lab.
- Pair an ICC reference with an explicit TVI/CTV/G7 target preset.

Not supported in the first pass:

- Treating ICC as a direct TVI target curve.
- Claiming G7 pass/fail from ICC alone.
- Building compensation curves from ICC without measured print data.

### ICC Generation

ICC generation is a post-verification export feature. It should unlock only after the operator has applied the compensation curve, printed a second characterization target, and measured enough patches to describe the corrected press state.

Supported uses:

- Generate an ICC profile from a validated re-measurement run.
- Store generation metadata with the job/run archive.
- Export the ICC beside the project archive and link it to the curve and measurement data used.

Blocked conditions:

- No re-measurement run.
- Missing characterization patches.
- Failed TVI/CTV/G7/Lab validation according to the selected rules.
- Measurement data is only manual 25/50/75 and does not contain enough color patches.

## Data Model Additions

### IccProfileInfo

```ts
type IccProfileInfo = {
  id: string;
  fileName: string;
  profileName: string;
  version: string;
  deviceClass: "display" | "input" | "output" | "devicelink" | "abstract" | "unknown";
  colorSpace: "CMYK" | "RGB" | "Gray" | "Lab" | "unknown";
  pcs: "Lab" | "XYZ" | "unknown";
  mediaWhitePoint?: Lab;
  description?: string;
  copyright?: string;
  renderingIntents: string[];
  importedAt: string;
};
```

### IccSamplePatch

```ts
type IccSamplePatch = {
  sampleId: string;
  cmyk: { c: number; m: number; y: number; k: number };
  lab: Lab;
  source: "icc-sampled";
  intent: "relative" | "absolute" | "perceptual" | "saturation";
};
```

### IccReferenceStandard

```ts
type IccReferenceStandard = {
  profile: IccProfileInfo;
  patches: IccSamplePatch[];
  pairedToneTarget: string;
  pairedG7Preset?: string;
  deltaE: { warning: number; fail: number };
  note: string;
};
```

### IccGenerationGate

```ts
type IccGenerationGate = {
  runId: string;
  canGenerate: boolean;
  status: "Ready" | "Warning" | "Blocked";
  missing: string[];
  requirements: {
    hasReMeasurement: boolean;
    hasCharacterizationPatches: boolean;
    hasPaperAndSolids: boolean;
    passesToneValidation: boolean;
    passesLabValidation: boolean;
    passesG7Validation?: boolean;
  };
};
```

### IccGenerationResult

```ts
type IccGenerationResult = {
  runId: string;
  sourceMeasurementId: string;
  compensationCurveId: string;
  engine: "littlecms" | "argyllcms" | "external";
  outputPath: string;
  profileName: string;
  createdAt: string;
  validationSnapshot: VerificationResult;
};
```

## Implementation Phases

### P1: ICC Import Metadata

Goal: import `.icc` / `.icm` and show what it is.

Status: implemented for browser/Tauri file input metadata parsing. Color conversion and sampled Lab preview remain P2.

Tasks:

- Add file picker support for `.icc` and `.icm` in the Standard page.
- Add `src/icc-profile.js` as the ICC parsing boundary.
- Read header metadata: profile size, preferred CMM, version, device class, color space, PCS, date, signature.
- Read basic tags where available: `desc`, `mluc`, `wtpt`, `cprt`.
- Show metadata in Standard page.
- Store imported profile info in Job archive.

Acceptance:

- GRACoL/FOGRA ICC files show name, class, color space, PCS, and white point.
- Unsupported or corrupt ICC files fail with a clear message.
- ICC import does not overwrite TVI/G7 target settings.

### P2: ICC Sampling Preview

Goal: use a CMYK output ICC as a Lab reference source.

Status: MVP implemented for browser/Tauri with direct sampling of ICC v2 `mft1` / `mft2` CMYK -> Lab A2B tables. Complex ICC v4 `mAB` / full CMM behavior remains planned for the LittleCMS bridge.

Tasks:

- Choose color engine path:
  - Preferred: LittleCMS bridge for CMYK -> Lab sampling.
  - Fallback: ArgyllCMS command-line sampling if packaging is acceptable.
- Sample a fixed CMYK patch set:
  - Paper: 0/0/0/0
  - CMYK solids
  - CM/CY/MY/CMY overprints
  - 25/50/75 single-channel ramps
  - neutral gray candidates
  - optional IT8/P2P-like grid subset
- Add Standard page patch preview for ICC-derived Lab values.
- Label all rows as `ICC sampled reference`.
- Allow measured Lab comparison against ICC-derived patches.

Acceptance:

- ICC preview shows paper, solids, overprints, and ramps.
- Analyze page can compute Delta E against ICC-derived Lab.
- G7 remains incomplete unless real measured G7 patches exist.

### P3: ICC + Existing Standard Pairing

Goal: pair an imported ICC with an explicit tone/G7 standard.

Status: implemented in `0.1.1` for Standard page pairing, mismatch warnings, project archive metadata, and export headers.

Tasks:

- Add UI: `ICC Lab reference + TVI/CTV/G7 target preset`.
- Store selected pair in the project archive.
- Display warnings when ICC color aim and selected print standard appear mismatched.
- Keep TVI/CTV target curve selection explicit.

Acceptance:

- User can select imported ICC for Lab reference and ISO TVI A/B/C or G7 for tone target.
- Export metadata records both ICC reference and tone target.
- The app never silently changes compensation algorithm because an ICC was imported.

### P4: Re-measure Verification Gate

Goal: decide whether ICC generation is allowed.

Status: implemented in `0.1.2` as a conservative gate. It reports readiness only after saved pre/post Runs plus enough characterization patches, Lab data, TVI/CTV residuals, G7 pass when enabled, and curve quality checks.

Tasks:

- Add `src/icc-generation-gate.js`.
- Evaluate latest Run against previous curve Run.
- Require enough characterization data:
  - Paper and CMYK solids.
  - Overprints.
  - Sufficient CMYK grid or standard target file measurement.
  - Lab values for the characterization target.
- Require selected validation results:
  - TVI/CTV residuals within tolerance or operator override.
  - Lab/Delta E pass/warning thresholds.
  - G7 pass if G7 mode is enabled.
- Show gate status in Report and Export pages.

Acceptance:

- A first measurement run cannot generate ICC.
- A curve-only run cannot generate ICC.
- A second measured run with insufficient patches is blocked.
- A valid second measured run shows `Ready for ICC generation`.

### P5: ICC Generation MVP

Goal: generate an ICC from validated characterization measurement.

Tasks:

- Select engine:
  - LittleCMS integration if API binding is stable for Tauri/macOS/Windows.
  - ArgyllCMS external command if bundling and licensing are acceptable.
- Add `IccGenerationResult` to project archive.
- Export generated ICC to a user-selected path.
- Add provenance tags/metadata where possible:
  - customer
  - press
  - paper
  - measurement instrument
  - compensation curve id
  - validation date
- Add a generation report section.

Acceptance:

- ICC generation is blocked until gate is ready.
- Generated profile path is stored in the Run archive.
- Exported report states which measurement run generated the ICC.
- The operator can trace ICC -> Run -> measurement data -> compensation curve.

## UI Flow

### Standard Page

- Add `Import ICC` button.
- Show ICC metadata card.
- Show ICC sampled reference patches.
- Show pairing controls:
  - Lab reference: built-in standard / imported ICC.
  - Tone target: ISO TVI / Linear CTV / G7 NPDC.

### Measurement Page

- No major change for ICC import.
- Keep measurement data as the source of compensation calculation.
- If user imports an ICC as measurement data by mistake, show: `ICC is a reference profile, not measurement data`.

### Curve Page

- Continue showing TVI/CTV compensation and simulation validation.
- Show whether Lab reference came from built-in CGATS standard or imported ICC.

### Report Page

- Add ICC readiness card:
  - Reference ICC loaded.
  - Re-measurement complete.
  - Characterization patch coverage.
  - Validation status.

### Export Page

- Add `Generate ICC` action only when gate is ready.
- Add disabled state with exact missing requirements.

## Technical Decisions To Verify

- LittleCMS binding path for Tauri:
  - Rust crate calling LittleCMS.
  - Native library bundling on macOS and Windows.
  - License and binary distribution implications.
- ArgyllCMS path:
  - Whether command-line tools can be bundled.
  - Whether generated profile quality is acceptable.
  - How to capture logs/errors in the UI.
- ICC sampling accuracy:
  - Rendering intent choice.
  - Relative vs absolute colorimetric behavior.
  - D50 PCS conversion consistency.

## First Coding Slice

The first implementation slice should be deliberately small:

1. Add `.icc/.icm` file selection in Standard page.
2. Parse ICC header and simple tags without color conversion.
3. Show ICC metadata in Standard page.
4. Store ICC metadata in exported project archive.
5. Add tests with a tiny fixture or generated mock ICC header.

This gives users confidence that ICC files are recognized before we take on the harder color-engine work.
