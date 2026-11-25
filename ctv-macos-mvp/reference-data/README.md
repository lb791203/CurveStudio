# Reference Data

This folder is intentionally almost empty. Release builds ship only the files listed in
`release-resources.json`, and `npm run verify:bundle` fails if anything else ends up in the
built frontend or in the packaged app binary.

## Rules

- Do not add characterization data sets, vendor training kits, files copied from other software
  installations, ICC profiles, or customer measurement data.
- Built-in standards keep only small aim tables in `src/standards.js` (paper, solids,
  overprints). G7 tone aims are computed (TR015 formulas in `src/g7-targets.js`).
- Test and demo measurements must be self-made or synthetic; see `scripts/generate-demo-g7.mjs`.
