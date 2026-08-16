# Packaging

This project ships with two first-class desktop artifacts:

- Windows: portable executable / zip
- Linux: AppImage

## Commands

```bash
npm run dist:win
npm run dist:linux
npm run dist:all
```

Artifacts are written to the `release/` directory.

## Build flow

Each distribution command runs `npm run build:all` first, prepares the required native runtime pieces, then invokes `electron-builder` with `electron-builder.yml`.

## Current targets

- Windows `portable`
- Windows `zip`
- Linux `AppImage`

## Included runtime content

Packaging has two layers:

- `app.asar` keeps the runtime-focused bundle used by Electron boot paths.
- The release root also mirrors the tracked workspace surface that packaged tools resolve against.

## Release root mirror

The release root for Windows and Linux includes the tracked workspace surface below in addition to Electron's platform binaries:

- `.rovo/**/*`
- `AGENTS.md`
- `LICENSE`
- `PACKAGING.md`
- `README.md`
- `THIRD_PARTY_NOTICES.md`
- `third-party-licenses/**/*`
- `android-companion/**/*`
- `config/backup-scopes.json`
- `data/protocols.json`
- `dist/**/*`
- `electron/**/*`
- `ghost-agent/**/*`
- `mcp-server/**/*`
- `rooms/**/*`
- `scripts/**/*`
- `shared/**/*`
- `src/**/*`
- `package.json`
- `electron-builder.yml`
- `eslint.config.cjs`
- `knip.config.ts`
- `electron/tsconfig.electron.json`
- `src/tsconfig.json`
- `mcp-server/tsconfig.mcp.json`
- `rooms/tsconfig.rooms.json`
- `vite.config.js`
- `.dependency-cruiser.cjs`
- `.gitignore`
- `.nvmrc`
- `.prettierignore`
- `.prettierrc`

`LICENSE`, `THIRD_PARTY_NOTICES.md`, and `third-party-licenses/` are intentionally mirrored into distributed desktop artifacts so the project license and bundled third-party attribution travel with the application.

Local/user-generated workspace metadata is not part of the release seed.

## Native and external dependencies

- `better-sqlite3` is unpacked from ASAR because it is a native module.
- Linux-only automation helpers may still require system packages such as `xdotool` and `xclip`.
- Video analysis features currently rely on `ffmpeg` and `ffprobe` being available on the host system.
- Laboratory YouTube source preparation relies on `yt-dlp` `2025.11.12+`; a user-local install such as `~/.local/bin/yt-dlp` is preferred over stale system packages when both exist.
- For current YouTube extraction behavior, the selected `yt-dlp` build should include `yt-dlp-ejs` support and a supported JS runtime such as `node` 20+ or `deno`.

## Validation checklist

1. Run `npm run check:all` on the source tree.
2. Build the target artifact.
3. Launch the packaged app.
4. Verify the main window opens.
5. Verify settings can be created and persisted.
6. Verify SQLite-backed flows open without runtime module errors.
7. Verify `LICENSE`, `THIRD_PARTY_NOTICES.md`, and `third-party-licenses/` exist in the release root.

## Known follow-up items

- Add platform-specific icons (`.ico` for Windows, optional larger Linux icon set).
- Validate packaged provider config loading in a real artifact.
- Confirm Linux AppImage writable-path behavior for `config/`, `data/`, and `logs/`.
