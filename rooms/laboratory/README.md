# Laboratory Room

Laboratory source of truth lives under `rooms/laboratory`.

This README documents the room boundary and contributor-facing structure. For the user-facing capability map and workflow, see [../../LABORATORY.md](../../LABORATORY.md).

## Current Capabilities

The current room manifest exposes one guided workbench with two feature surfaces:

- `media-analysis` — project/source intake, readiness, media processing, visual inspection, comparison, annotation/export and reporting
- `audio-analysis` — audio-first preparation, signal/speech/forensic/model analysis and reporting

Important implemented workbench behaviors include:

- local and supported remote/YouTube source intake paths,
- project persistence and derived asset tracking,
- room-local tool/model readiness management,
- single-image and two-image inspection,
- zoom/pan and selection/ROI-oriented inspection helpers,
- comparison capture/export,
- pen and circle/ellipse drawing annotations with configurable color/width and clear controls,
- annotation-aware PNG comparison export,
- audio analysis runners including advanced forensic, music/rhythm, sound-event and source-separation paths,
- report/result surfaces that can feed later AI-assisted interpretation.

Availability of individual analysis runners can depend on local tools, models or platform capabilities. The readiness layer should remain the source of truth for whether a specific run can execute on the current machine.

## Source Ownership

Do not edit `data/rooms/laboratory` as a peer source tree. Installed/runtime copies are generated from the workspace room source by the room build, install, or startup sync flow.

Mutable Laboratory project/runtime data belongs under `data/room-storage/laboratory`, not in the editable room source tree.

## Runtime Boundaries

- `host/` wires the room host runtime together.
- `shared/host/` owns reusable host primitives, project paths, IO, process orchestration, reporting, and utility helpers.
- `features/*/host/` owns feature-specific source intake, edit/profile/process behavior, export behavior, analysis runners, and tool adapters.
- `runtime/` owns browser-side state, selectors, event coordination, execution planning, and media/timeline controllers.
- `ui/` owns renderers, binders, overlays, drawing behavior, and room-local CSS entry points.
- `tools/` contains path-loaded room tool metadata and payloads. Treat JSON, Python, conf, and inc files here as dynamic runtime inputs, not dead-code candidates.

Dependency Cruiser enforces the Laboratory layer boundaries. New runtime-to-UI imports are blocked; the small legacy coordinator allow-list exists only until those coordinators are split.

## Media and Annotation Ownership

Visual inspection state belongs to the Laboratory workbench, not to the original source file.

In particular:

- zoom/pan state is viewport state,
- comparison state is project/workbench state,
- drawing marks are annotation state,
- capture/export may composite annotation into a new artifact,
- the source image should not be silently rewritten by inspection tools.

Keep new visual tools consistent with this non-destructive boundary.

## Cleanup Rules

- Prove reachability before deleting files. Use `npm run laboratory:cleanup:inventory` and focused `rg` checks before removal.
- Keep path-loaded roots in the cleanup keep-list: manifest asset paths, `i18n.baseDir`, `ui/index.html`, `ui/style.css`, `tools/**`, and feature asset folders.
- Remove generated or installed output only through the room build/sync lifecycle.
- Prefer compatibility wrapper exports for first-pass god-file splits. Rewrite import paths only after the new domain module has passed targeted tests.
- Transcript/runtime ownership stays outside Laboratory unless a room-specific adapter explicitly bridges it.

## Validation

Run the complete local Laboratory gate before feature work or after structural changes:

```bash
node rooms/laboratory/scripts/laboratory-check.mjs
```

The gate runs room typechecking, strict room lint, dependency boundaries, the Laboratory dead-code gate, every `scripts/tests/laboratory-*.test.ts` regression, and the workspace room build. Test discovery is dynamic so new Laboratory regression files automatically join the gate.

Useful variants:

```bash
node rooms/laboratory/scripts/laboratory-check.mjs --list
node rooms/laboratory/scripts/laboratory-check.mjs --ci
```

`--list` prints the resolved steps and test files without executing them. `--ci` skips checks that the repository CI already runs globally and keeps Laboratory dependency, cleanup, and regression gates.

For a shorter targeted investigation, use:

```bash
npm run rooms:test:file -- <test files>
npm run rooms:typecheck
```

For public-facing feature descriptions, update [../../LABORATORY.md](../../LABORATORY.md) when a capability becomes part of the actual workbench rather than leaving the root documentation behind the implementation.
