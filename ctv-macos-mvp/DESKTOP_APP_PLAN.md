# Desktop App Packaging

This project keeps the calculation engine in plain JavaScript so the same code can run in the browser MVP, macOS Tauri app, and later Windows Tauri build.

## Current state

- Web MVP runs from `index.html` or `npm run dev`.
- Tauri scaffold exists in `src-tauri/`.
- Project archives already use `jobs/<customer-press-date>/runs/<timestamp>.json` metadata.
- Real file save/open APIs are not wired yet; browser downloads are still used in the MVP.

## macOS build path

1. Install Rust stable and Tauri prerequisites.
2. Run `npm run tauri:dev` for a local desktop shell.
3. Run `npm run tauri:build` to create `.app` / `.dmg`.
4. Add signing and notarization after the MVP workflow is accepted.

## Windows path

Use the same `src-tauri` project and JavaScript core. Build on Windows after the macOS workflow is stable.

## Next desktop tasks

- Replace browser download links with Tauri save-file dialogs.
- Add open-project dialog for JSON archives.
- Store recent jobs in a local application data directory.
- Keep SDK/device integration behind `DeviceAdapter` so Techkon/X-Rite support can be added without changing curve logic.
