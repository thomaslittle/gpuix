# GPUIX Windows Runtime Qualification Plan

## Purpose

This fork exists to strengthen GPUIX itself before using it as a dependency in a larger product. The immediate objective is to turn Windows from a compile/package target into a continuously exercised, evidence-backed runtime target, while keeping every generally useful change upstreamable to `remorses/gpuix`.

The first target is **Windows x64 (`x86_64-pc-windows-msvc`)**. Windows ARM64 remains compile/package coverage until a real ARM64 runtime is available.

This work is deliberately **not Crntly-specific**. Do not add broadcast, DirectComposition preview, media-engine, or application-specific APIs to GPUIX during qualification. If a defect is discovered while evaluating a downstream application, reduce it to the smallest standalone GPUIX reproduction first.

## Upstream baseline

Qualification starts from fork baseline:

- upstream/fork head at plan creation: `9f0fb6d082d17acf6a570e93b0c987c1f3ffc944`
- upstream repository: `remorses/gpuix`
- fork: `thomaslittle/gpuix`
- working branch: `feature/windows-runtime-qualification`

Before each substantial batch, compare with upstream `main` and integrate upstream changes before diagnosing failures that may already be fixed.

## Current evidence boundary

At this baseline GPUIX already declares and builds Windows N-API targets, including x64 and ARM64. That proves source-level/toolchain compatibility and artifact production. It does **not** by itself prove that a GPUIX application successfully launches, paints, receives input, pumps the Win32 event loop correctly, survives React/native lifecycle churn, or remains stable over time.

The phrase **Windows runtime validation pending** should therefore be interpreted as an evidence gap, not as a claim that Windows is known broken.

Do not remove or weaken that warning until the acceptance matrix below is backed by retained evidence.

---

# Principles

1. **Upstreamability first.** Prefer small framework fixes and reusable tests over downstream workarounds.
2. **Runtime proof beats compilation.** A `.node` artifact is necessary but not sufficient.
3. **Exercise the shipping path.** Tests should instantiate the same native renderer/event pipeline applications use.
4. **Keep failures minimal.** Every Windows defect should have the smallest reproducible GPUIX case possible.
5. **Separate framework defects from upstream GPUI defects.** If the issue belongs to GPUI/Zed's Windows backend, document and fix it at the correct layer.
6. **No Windows-only semantic forks unless unavoidable.** Windows behavior should match GPUIX's public cross-platform contract.
7. **Retain evidence.** Record exact SHA, OS build, architecture, toolchain, command, exit status, and relevant logs/screenshots for qualification runs.
8. **No premature support claims.** Use PASS only for a check actually executed at the documented SHA.

---

# P0 — Establish a trustworthy Windows baseline

## P0.1 Toolchain and dependency audit

Record and verify:

- [ ] Rust toolchain from `rust-toolchain.toml`
- [ ] Bun/Node/package-manager requirements
- [ ] Visual Studio Build Tools/MSVC requirements
- [ ] Windows SDK requirements
- [ ] N-API target configuration
- [ ] GPUI/Zed fork/submodule revision
- [ ] native addon build command
- [ ] package build command
- [ ] example development/run commands
- [ ] any platform environment variables

Deliverable: a reproducible Windows contributor setup section that works from a clean checkout.

## P0.2 Stock project builds on Windows x64

From an unmodified qualification branch:

- [ ] install dependencies
- [ ] initialize/update submodules exactly as documented
- [ ] build the native addon for `x86_64-pc-windows-msvc`
- [ ] build TypeScript/packages/examples
- [ ] confirm the produced `.node` binary can be loaded by the intended JS runtime
- [ ] retain command output and exact SHA

A successful CI cross-platform artifact does not substitute for this local runtime baseline.

## P0.3 Launch existing examples unchanged

Run existing representative examples without adding Windows-specific application code first.

For each suitable stock example verify:

- [ ] process launches
- [ ] GPUI native window becomes visible
- [ ] content paints
- [ ] window is responsive
- [ ] process exits cleanly
- [ ] no Rust panic
- [ ] no Node/Bun fatal exception
- [ ] no obvious D3D/wgpu initialization error

If an existing example fails, preserve that example as the primary reproduction until the problem is understood.

---

# P1 — Windows interaction qualification application

Create one small canonical test/qualification application inside the GPUIX repository. It should remain useful upstream and cover framework behavior rather than product behavior.

The app should expose deterministic selectors/labels and a compact surface for exercising all major primitives.

## P1.1 Rendering and React reconciliation

- [ ] basic text
- [ ] nested layout
- [ ] flex row/column behavior
- [ ] padding/margins/gaps
- [ ] borders/background/radius
- [ ] dynamic conditional children
- [ ] keyed list insertion/removal/reorder
- [ ] repeated state updates
- [ ] remount/unmount/recreate cycles
- [ ] SVG
- [ ] image
- [ ] canvas/custom drawing where supported

## P1.2 Pointer interaction

- [ ] click
- [ ] double click if part of the public contract
- [ ] pointer enter/leave
- [ ] hover styling
- [ ] active/pressed styling
- [ ] drag if supported
- [ ] pointer capture if supported
- [ ] wheel scrolling
- [ ] nested scrolling

## P1.3 Keyboard and focus

- [ ] focus traversal
- [ ] programmatic focus
- [ ] text input
- [ ] textarea
- [ ] Backspace/Delete
- [ ] Enter
- [ ] Escape
- [ ] Tab/Shift+Tab
- [ ] Ctrl shortcuts
- [ ] Alt behavior where relevant
- [ ] arrow-key navigation in components that support it
- [ ] focus loss/regain when switching windows

## P1.4 Native controls/components

Exercise currently supported higher-level primitives such as:

- [ ] select
- [ ] combobox
- [ ] tooltip
- [ ] popover/menu equivalents
- [ ] virtual list
- [ ] scroll container
- [ ] multiple windows
- [ ] animation/motion

The exact list should track the current public API rather than inventing new controls just for this plan.

---

# P2 — Windows lifecycle and embedding correctness

GPUIX is unusual because GPUI is hosted inside a JS runtime through N-API. This is the highest-risk Windows-specific area and deserves explicit tests.

## P2.1 UI thread ownership

Verify:

- [ ] GPUI event loop owns the thread that creates its HWNDs
- [ ] Node/Bun main runtime can remain on its own thread
- [ ] no hidden dependency on the process main thread exists on Windows
- [ ] posted work reliably wakes the GPUI UI thread
- [ ] idle event-loop behavior does not spin CPU

## P2.2 Event bridge

Exercise repeated cycles of:

`Windows/GPUI event -> Rust -> N-API ThreadsafeFunction -> JS/React handler -> mutation batch -> Rust/GPUI repaint`

Verify:

- [ ] events are not lost under burst input
- [ ] ordering remains correct
- [ ] JS exceptions do not corrupt native renderer state
- [ ] renderer remains responsive after recoverable handler errors
- [ ] mutation batching remains atomic enough to avoid visible intermediate trees

## P2.3 Window lifecycle

- [ ] create window
- [ ] close window
- [ ] create a second window
- [ ] close one while another remains
- [ ] reopen after close
- [ ] repeated open/close loop
- [ ] application exit with windows open
- [ ] application exit after all windows closed
- [ ] React root unmount
- [ ] renderer/root remount
- [ ] clean native teardown

No HWND, renderer, callback, or JS-root identity should be accidentally reused across incompatible lifetimes.

---

# P3 — Windows platform UX qualification

## P3.1 DPI and resize

At minimum verify:

- [ ] 100% scale
- [ ] 125% scale
- [ ] 150% scale
- [ ] 200% scale when practical
- [ ] live window resize
- [ ] maximize/restore
- [ ] minimize/restore
- [ ] resize while React state is changing
- [ ] no stale logical-to-physical coordinate mapping

If mixed-DPI monitors are available, add move-between-monitors testing.

## P3.2 Clipboard and text services

- [ ] copy
- [ ] paste
- [ ] select-all where supported
- [ ] Unicode input
- [ ] emoji/non-ASCII input
- [ ] IME composition if the current GPUI contract supports it on Windows

If a capability belongs to upstream GPUI rather than GPUIX, record the dependency explicitly.

## P3.3 Window activation/focus

- [ ] Alt+Tab away/back
- [ ] click-to-focus
- [ ] keyboard focus survives expected repaint cycles
- [ ] focus does not leak between multiple GPUIX windows
- [ ] tooltips/popovers dismiss correctly on focus changes where applicable

---

# P4 — Automated Windows runtime testing

Compilation-only Windows CI is not the end state.

## P4.1 Runtime smoke

Add a Windows x64 CI/runtime job capable of proving at least:

- [ ] native addon loads
- [ ] GPUI application initializes
- [ ] a window/render target can be created in the chosen CI environment
- [ ] one React mutation reaches painted native state
- [ ] one synthetic/real input path reaches React and updates rendered state
- [ ] app tears down cleanly

If hosted Windows runners cannot provide a usable interactive GPU/session, document the limitation and keep a separate hardware/runtime qualification harness rather than replacing the test with model-only assertions.

## P4.2 Extend native test renderer to Windows

Investigate the existing native test renderer and visual screenshot infrastructure.

Goal:

- [ ] reuse the same semantic test API on Windows
- [ ] drive GPUI's real event path
- [ ] render using the Windows GPUI backend
- [ ] inspect painted text/layout where possible
- [ ] capture screenshots or another trustworthy rendered artifact

Do not emulate Windows by routing Windows CI through the macOS-specific `MacPlatform` test path.

## P4.3 Stable automated suite

Create deterministic tests for the qualification app covering:

- [ ] React reconciliation
- [ ] pointer input
- [ ] keyboard/focus
- [ ] text input
- [ ] scroll
- [ ] resize
- [ ] native component interactions
- [ ] window lifecycle/remount

---

# P5 — Stress, soak, and performance

## P5.1 Mutation stress

Exercise:

- [ ] thousands of nodes
- [ ] large batched commits
- [ ] keyed reorder churn
- [ ] rapid mount/unmount
- [ ] rapid style updates
- [ ] 60Hz state updates for a bounded interval

Watch for:

- panics
- native memory growth
- JS heap growth
- stale node IDs
- deadlocks
- renderer stalls
- ThreadsafeFunction backlog

## P5.2 Input stress

- [ ] sustained typing
- [ ] rapid pointer movement/hover updates
- [ ] fast scrolling
- [ ] repeated focus changes
- [ ] resize storms while input continues

## P5.3 Soak

Run a representative GPUIX app for an extended session while periodically mutating state and exercising input.

Retain:

- start/end memory
- CPU observations
- GPU observations when practical
- crashes/panics/exceptions
- event-loop responsiveness

The first milestone can use a practical developer soak rather than claiming formal longevity qualification.

## P5.4 Performance baseline

Record reproducible baseline measurements for:

- [ ] startup to first window
- [ ] startup to first painted React content
- [ ] idle CPU
- [ ] idle memory
- [ ] large React commit latency
- [ ] typing/update latency
- [ ] resize responsiveness

The goal is regression detection, not premature optimization.

---

# P6 — Documentation and support boundary

Once evidence exists, update GPUIX documentation with a precise support matrix rather than a vague binary supported/unsupported label.

Suggested states:

- **BUILD VERIFIED** — artifacts compile/package
- **RUNTIME VERIFIED** — basic launch/render/input/lifecycle exercised
- **QUALIFIED** — automated runtime suite + documented platform matrix
- **NOT TESTED** — no evidence at current/recent SHA

Document:

- Windows x64 status
- Windows ARM64 status
- required Windows/MSVC SDK/toolchain
- known limitations
- how to run Windows qualification locally
- which runtime tests run in CI
- which checks still require a physical/interactive Windows session

Only replace the existing "Windows runtime validation pending" wording after the actual evidence supports doing so.

---

# Upstream contribution strategy

Do not accumulate one giant Windows-support patch. Prefer focused contributions that can be reviewed independently.

Good upstream PR boundaries include:

1. Windows contributor/run documentation
2. minimal Windows launch/runtime fix
3. event/focus/input correctness fix
4. lifecycle/remount correctness fix
5. Windows qualification example/harness
6. Windows native-test-renderer support
7. Windows runtime CI smoke
8. cross-platform stress/regression test
9. support-matrix documentation update

For every prospective upstream PR:

- rebase/merge latest upstream first
- remove fork-only wording and evidence paths
- ensure the change is useful without Crntly
- include reproduction before the fix when practical
- include automated regression coverage
- describe what was tested and where
- avoid unrelated formatting/refactors

---

# Evidence format

Retained qualification records should make it impossible to confuse source presence with runtime proof.

For each run record:

```text
GPUIX SHA:
Upstream base SHA:
Date:
Windows edition/build:
Architecture:
GPU + driver:
Rust:
Bun/Node:
Command:
Exit status:
Checks executed:
PASS/FAIL/NOT TESTED per check:
Relevant log/artifact paths:
Notes:
```

A future `docs/windows-evidence/` or test-artifact convention may be introduced once the first local qualification run establishes what artifacts are actually useful. Avoid committing large opaque binary outputs unless they materially help reproduce a bug.

---

# Initial acceptance matrix

Windows x64 should not be described as fully runtime-qualified until these are backed by evidence:

| Capability | Required |
| --- | --- |
| Native addon build/load | PASS |
| GPUI window creation | PASS |
| D3D/GPUI rendering | PASS |
| React reconciliation | PASS |
| Mouse input | PASS |
| Keyboard input | PASS |
| Text input/focus | PASS |
| Scrolling | PASS |
| Resize/minimize/restore | PASS |
| DPI scaling | PASS |
| Clipboard | PASS |
| Higher-level components | PASS |
| Multiple windows | PASS |
| Animation/update loop | PASS |
| React unmount/remount | PASS |
| Clean shutdown | PASS |
| Automated runtime smoke | PASS |
| Stress/soak baseline | PASS |

Windows ARM64 remains **BUILD VERIFIED / RUNTIME NOT TESTED** until executed on real ARM64 Windows hardware or an equivalent trustworthy runtime environment.

---

# First execution batch

The first agent working this plan should do a substantial batch rather than stopping after setup:

1. sync/compare against `remorses/gpuix:main`
2. document exact Windows prerequisites discovered from the repo
3. install dependencies on Windows
4. initialize the Zed/GPUI submodule/pin
5. build the Windows x64 native addon
6. verify the addon loads
7. run the smallest stock example
8. run at least one interaction-rich stock example
9. capture all concrete failures with minimal reproductions
10. update this plan with exact PASS/FAIL/NOT TESTED results
11. implement and test straightforward framework fixes exposed by the run
12. commit changes in upstream-reviewable units

Do not start a downstream Crntly GPUIX spike until this Windows qualification work has established a credible runtime baseline.
