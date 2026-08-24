# Windows Runtime Qualification — Agent Handoff

Work in `thomaslittle/gpuix` on branch `feature/windows-runtime-qualification`.

Read `docs/windows-runtime-qualification-plan.md` first and keep it current as evidence lands.

## Mission

Strengthen GPUIX itself by making Windows x64 a real exercised runtime target, then contribute generally useful fixes/tests/docs back to `remorses/gpuix`.

This is **not** a downstream application spike. Do not add Crntly-specific APIs, media-engine integration, DirectComposition preview behavior, broadcasting code, or private product assumptions to GPUIX.

## Baseline

Plan-created baseline:

`9f0fb6d082d17acf6a570e93b0c987c1f3ffc944`

That baseline already declares/builds Windows N-API targets. The missing evidence is actual Windows runtime behavior.

## Priority order

1. Re-sync/compare with `remorses/gpuix:main` before diagnosing problems.
2. Establish a clean Windows x64 contributor/toolchain setup.
3. Build and load the native addon locally.
4. Run existing examples unchanged before adding test-only applications.
5. Prove launch, paint, mouse, keyboard, text/focus, scroll, resize, DPI, clipboard, components, multiple windows, remount and shutdown.
6. Reduce every failure to the smallest standalone GPUIX reproduction.
7. Add reusable regression coverage for each framework defect fixed.
8. Build a canonical Windows qualification app/harness.
9. Extend runtime/visual test infrastructure to Windows where practical.
10. Add Windows runtime CI only when it tests a real runtime path rather than merely recompiling.
11. Stress/soak the React -> N-API -> GPUI event/mutation loop.
12. Update support docs only when retained evidence warrants stronger claims.

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

## First batch expectation

Do not stop after getting dependencies installed. In one substantial batch, aim to build the addon, load it, launch stock examples, exercise core input/window behavior, capture failures, fix straightforward framework defects, add tests, update the qualification plan, and commit/push coherent changes.
