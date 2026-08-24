# Windows Runtime Qualification — Agent Handoff

Work in `thomaslittle/gpuix` on branch `feature/windows-runtime-qualification`.

Read `docs/windows-runtime-qualification-plan.md` first and keep it current as evidence lands.

## Mission

Strengthen GPUIX itself by making Windows x64 a real exercised runtime target, then contribute generally useful fixes/tests/docs back to `remorses/gpuix`.

This is **not** a downstream application spike. Do not add Crntly-specific APIs, media-engine integration, DirectComposition preview behavior, broadcasting code, or private product assumptions to GPUIX.

## Baseline

Plan-created upstream baseline:

`9f0fb6d082d17acf6a570e93b0c987c1f3ffc944`

Pinned Zed/GPUI submodule:

`4d80927168182a26f2820f8d7a06495c6d050123`

Rust toolchain:

`1.97.1`

At the start of the 2026-08-24 harness batch the feature branch was 0 commits behind both fork `main` and `remorses/gpuix:main` at the baseline above.

## What is now landed

The branch now has a local-first Windows x64 qualification path instead of depending on one-off launches:

- `docs/windows-runtime-contributor-setup.md` — clean-checkout/toolchain/build/load setup
- `examples/windows-qualification.tsx` — deterministic runtime fixture for React, focus/input, scroll, virtual-list, motion, mutation churn and same-window root remount
- `scripts/windows-runtime-input.ps1` — HWND/Win32 input, resize/lifecycle, DPI and physical client screenshot helper
- `scripts/windows-runtime-qualification.ts` — unchanged-stock-example + qualification-fixture controller with PASS/FAIL/NOT TESTED evidence
- `scripts/windows-remount-qualification.ts` — dedicated proof that a full React root remount reuses the same HWND and survives subsequent paint/input/close
- `scripts/windows-runtime-qualification.ps1` — one-command build/test/runtime orchestration
- root scripts: `windows:qualify`, `windows:qualify:runtime`, `windows:qualify:remount`

Primary command from an interactive Windows x64 Developer PowerShell/Command Prompt:

```powershell
bun run windows:qualify
```

Generated evidence is intentionally ignored under `tmp/windows-runtime/` and includes JSON/Markdown, client-area PNG captures, and per-process stdout/stderr logs.

## Evidence status right now

**Windows runtime is still NOT TESTED at the current branch.**

The harness was authored and reviewed from a non-target environment. Do not convert any implemented check to PASS merely because its source exists. The first Windows x64 execution must retain the generated evidence and then update the qualification plan with the exact executed SHA/toolchain/GPU/Windows build.

Windows ARM64 remains **BUILD VERIFIED / RUNTIME NOT TESTED**.

## Static gaps already identified

These are source-level findings, not runtime failure claims:

1. Live automation has real mouse dispatch on Windows/Linux/FreeBSD, but live keyboard and wheel protocol methods still return `Unsupported`; the harness uses actual Win32 input instead of replacing real runtime coverage with model tests.
2. `GpuixRenderer::get_window_size()` currently returns fixed `800x600`, and `useWindowSize()` reads it only once. Do not use that API as resize proof yet.
3. `TestGpuixRenderer` / `VisualTestAppContext` is currently wired to `gpui_macos::MacPlatform`; Windows native/visual test-renderer support remains open work.
4. Renderer comments document shared scroll/virtual-list state as single-window/singleton for now. Same-process multi-window qualification remains open.
5. Current Windows CI builds x64/ARM64 and load-tests the x64 addon with Bun/Node; it is not runtime CI yet.

## Next execution order

1. Pull `feature/windows-runtime-qualification` on the real Windows x64 machine.
2. Confirm `git status`, exact SHA and `zed` submodule SHA.
3. Run `bun run windows:qualify` without editing the fixture first.
4. Preserve the generated `tmp/windows-runtime/*` evidence long enough to inspect every FAIL.
5. Report PASS/FAIL/NOT TESTED exactly as generated.
6. Reduce the first FAIL to the smallest stock/qualification reproduction.
7. Fix only the owning GPUIX/GPUI abstraction, add regression coverage, and rerun the whole command.
8. After the local harness is trustworthy, investigate completing the live keyboard/wheel bridge and extending the visual test renderer to Windows.
9. Add Windows runtime CI only after the hosted environment is shown to exercise a meaningful interactive GPU/session path.
10. Do not begin downstream application evaluation until the acceptance matrix has credible Windows runtime evidence.

## Priority order

1. Re-sync/compare with `remorses/gpuix:main` before diagnosing problems.
2. Establish a clean Windows x64 contributor/toolchain setup.
3. Build and load the native addon locally.
4. Run existing examples unchanged before qualification-only applications.
5. Prove launch, paint, mouse, keyboard, text/focus, scroll, resize, DPI, clipboard, components, multiple windows, remount and shutdown.
6. Reduce every failure to the smallest standalone GPUIX reproduction.
7. Add reusable regression coverage for each framework defect fixed.
8. Extend runtime/visual test infrastructure to Windows where practical.
9. Add Windows runtime CI only when it tests a real runtime path rather than merely recompiling.
10. Stress/soak the React -> N-API -> GPUI event/mutation loop.
11. Update support docs only when retained evidence warrants stronger claims.

## Evidence rules

- Compilation is not runtime proof.
- Source presence is not PASS.
- Use PASS only for checks actually executed at the exact reported SHA.
- Use NOT TESTED where no runtime evidence exists.
- Record Windows build, architecture, GPU/driver, Rust, JS runtime, command and exit status.
- Preserve useful logs/screenshots/reproductions, but do not commit large opaque binary artifacts without a reason.

## Upstreamability rules

Prefer small, reviewable commits/PRs:

- contributor docs
- minimal runtime fixes
- input/focus fixes
- lifecycle fixes
- Windows qualification harness
- Windows native test-renderer work
- runtime CI
- support-matrix documentation

Before preparing an upstream PR, integrate the latest upstream main, strip fork-specific commentary, include regression coverage, and keep unrelated refactors out.
