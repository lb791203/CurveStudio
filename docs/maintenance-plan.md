# Maintenance Plan

This document describes the planned maintenance direction for CurveStudio.

CurveStudio is an MVP-stage macOS project for offset printing calibration workflows. The goal is to build a practical, transparent, and maintainable open-source tool for TVI / CTV / G7 compensation curve calculation and RIP curve preparation.

## Maintenance goals

The project will be maintained with the following priorities:

- Keep the calibration workflow understandable for printing technicians.
- Improve calculation correctness and curve stability.
- Add reliable CSV import and export workflows.
- Document print-calibration assumptions clearly.
- Provide realistic example datasets for testing and review.
- Avoid adding unnecessary features that do not support print calibration.

## Short-term plan

The next maintenance stage will focus on project structure and core calculation reliability.

Planned work:

- Review and clean the Swift / macOS project structure.
- Define the CMYK measurement data model.
- Implement TVI calculation for each color channel.
- Add target curve comparison.
- Add interpolation-based compensation calculation.
- Add basic curve chart rendering.
- Add CSV import for measurement data.
- Add CSV export for calculated correction values.
- Add validation for missing, duplicated, or invalid tone points.

## Medium-term plan

After the basic calculation workflow is stable, the project will focus on production usability.

Planned work:

- Add project save and load support.
- Add press, paper, ink, plate, and measurement-condition metadata.
- Add support for multiple calibration jobs.
- Add verification-sheet comparison.
- Add curve smoothing controls.
- Add channel-specific correction limits.
- Add manual point adjustment and point locking.
- Improve chart readability for CMYK curve review.
- Add more example datasets from common offset printing scenarios.

## Long-term plan

The long-term maintenance goal is to make CurveStudio useful for real print-production curve preparation.

Planned work:

- Add RIP-oriented export presets.
- Add support for different tone-control point sets.
- Add documentation for common TVI / CTV / G7 workflows.
- Add automated tests for curve calculation logic.
- Add release notes for each stable version.
- Prepare signed macOS releases when the project is mature enough.
- Improve contributor documentation for print and software developers.

## Quality policy

CurveStudio should prioritize calculation clarity over feature quantity.

Every calculation-related change should be reviewed against example data. Large curve corrections should be handled carefully because aggressive compensation may cause tonal breaks, unstable gray balance, or poor print verification results.

Before a calculation change is considered stable, it should be tested with:

- Basic CMYK sample data
- High TVI midtone data
- Low TVI data
- Missing-point data
- Verification-after-correction data

## Documentation policy

Documentation will be updated when the project changes in any of these areas:

- Measurement input format
- Calculation method
- CSV import or export format
- Curve visualization behavior
- RIP preparation workflow
- Example data structure

## Issue management

Issues should be used to track:

- Calculation bugs
- UI bugs
- Import and export problems
- Documentation gaps
- Example data improvements
- Feature requests related to print calibration workflows

Feature requests outside the print-calibration scope should be kept low priority.

## Release approach

During the MVP stage, releases will be small and focused. A release should preferably contain one clear improvement area, such as calculation, import/export, UI, documentation, or examples.

Recommended early release sequence:

1. Measurement data model and TVI calculation
2. Target curve comparison
3. Compensation calculation
4. CSV import and export
5. Curve visualization
6. Verification comparison
7. RIP-oriented output preparation

## Maintainer role

The primary maintainer is responsible for:

- Reviewing calculation logic
- Keeping the project focused on offset print calibration
- Maintaining documentation and examples
- Reviewing issues and feature requests
- Preparing releases when stable milestones are reached

## Use of AI coding tools

AI coding tools may be used to accelerate implementation, refactoring, testing, documentation, and release preparation. Calculation logic should still be reviewed against known measurement examples and practical printing constraints before being treated as production-ready.
