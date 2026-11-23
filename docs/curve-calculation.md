# Curve Calculation Notes

This document describes the initial calculation model used by CurveStudio for print calibration curve work.

## Terminology

## Tone value

Tone value is the nominal input percentage from the file or RIP curve. Typical control points are:

- 0%
- 5%
- 10%
- 20%
- 25%
- 40%
- 50%
- 60%
- 70%
- 75%
- 80%
- 90%
- 95%
- 100%

## Measured tone value

Measured tone value is the actual printed tone value measured from a press sheet using a densitometer or spectrophotometer.

## TVI

Tone Value Increase is the difference between the measured printed tone value and the nominal input tone value.

TVI = measured tone value - nominal tone value

Example:

- Nominal tone value: 50%
- Measured tone value: 68%
- TVI: 18%

## Compensation principle

In production curve correction, the plate or RIP input is reduced when the press prints higher than the target. The correction should be calculated against the target response curve, not only by subtracting TVI difference directly.

Basic target-matching concept:

1. Define the target printed tone value for each control point.
2. Compare measured printed tone value with target printed tone value.
3. Find the adjusted input value that should print closest to the target.
4. Use interpolation between measured points when the exact adjusted input value is not available.

## Interpolation

CurveStudio should use interpolation to estimate the corrected input value between measured control points.

For two known points:

- Point 1: input x1, printed value y1
- Point 2: input x2, printed value y2
- Target printed value: yt

The estimated corrected input value x is:

x = x1 + (yt - y1) * (x2 - x1) / (y2 - y1)

This avoids overly aggressive correction and reduces the risk of tone discontinuity.

The correction itself is computed only at measured tones. The output grid between them
(0, 5, 10, 20, ... 100) is filled with a monotone cubic (Fritsch-Carlson) through the
corrected control points and the 0/100 anchors. The curve passes exactly through every
measured correction, bends smoothly instead of kinking at 25/50/75, never overshoots, and
stays monotone. Correction direction is enforced only at measured points; grid points
between them take their direction from the smooth curve.

The smoothing slider only acts on closely spaced measurements (no more than 30% apart).
With sparse 25/50/75 data, neighbour averaging would wash out the midtone correction.

## Re-measurement rounds

A verification sheet is printed through the curve from the previous round, so its measured
response already includes that curve. The curve calculated from it is an increment on top
of the previous curve. CurveStudio composes the two: plate value = previous(increment(tone)),
so the exported table is the complete curve and replaces the old one in the RIP.

The previous curve is taken from the newest saved run with the same customer and press and
a different measurement. Untick "stacked on the previous round's curve" if the RIP curve
was reset to linear before the verification sheet was printed.

## Example correction

If a 50% nominal tone prints as 73.2%, and the target printed tone for that control point is lower, the correction should not blindly reduce the input by the full TVI difference. Instead, CurveStudio should find the input value on the measured response curve that would produce the target printed value.

## Production caution

Large corrections should be reviewed carefully, especially in midtones. If the correction is too aggressive, the final curve may create tonal breaks, unstable gray balance, or visible transition problems.

Recommended production controls:

- Use smooth curve fitting or interpolation
- Avoid sudden correction jumps between neighboring control points
- Review CMYK channels independently
- Print a verification form after applying the compensation curve
- Adjust the second curve based on the verification result, not only on the first press run

## Future implementation notes

CurveStudio should eventually support:

- Manual control-point locking
- Maximum correction limits
- Channel-specific smoothing
- Export of corrected tone tables
- Validation against measured verification sheets
