# G7 / CTV Workflow Notes

CurveStudio is intended to support practical print-calibration workflows for offset printing. The first development focus is curve calculation and visualization, not certification management.

## Workflow overview

A typical calibration workflow includes:

1. Print a calibration test chart or control strip.
2. Measure CMYK tone values using a suitable measurement device.
3. Import or enter the measured data into CurveStudio.
4. Compare the measured press response with a selected target curve.
5. Calculate compensation values.
6. Apply the corrected curve in the RIP.
7. Print a verification sheet.
8. Measure again and refine the curve if needed.

## Data required

Recommended data columns:

- press name
- paper type
- ink set
- channel
- nominal tone value
- measured tone value
- target printed tone value
- calculated correction input
- notes

## CTV use case

CTV-based workflows focus on tone reproduction and channel response. CurveStudio should help visualize measured tone behavior and calculate correction points in a way that is understandable to production technicians.

## G7-related use case

G7-related calibration requires attention to neutral print density curve behavior and gray balance. CurveStudio can support the curve-preparation stage by helping users organize measurement data, analyze tone response, and prepare correction values.

CurveStudio is not intended to replace formal certification tools. It is intended to make the calibration calculation process more transparent and easier to maintain.

## Practical production notes

- Always record press, paper, ink, blanket, plate, fountain solution, and measurement conditions.
- Do not apply a large correction without verification.
- Midtone corrections should be smoothed to avoid visible tonal breaks.
- C, M, Y, and K channels should be reviewed separately.
- After applying a new RIP curve, print and measure a verification form.
- Use the verification result to refine the production curve.

## Example press scenarios

CurveStudio example datasets may include realistic offset press scenarios such as:

- KBA105 CMYK measurement
- KBA162 CMYK measurement
- High midtone TVI correction
- Channel-specific compensation review
- Verification after compensation

## Future workflow support

Planned workflow improvements:

- Measurement-data templates
- Multiple press profiles
- Paper and ink condition metadata
- Compensation history
- Verification comparison
- Export presets for RIP workflows
