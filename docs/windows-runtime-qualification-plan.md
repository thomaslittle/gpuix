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

## Progress log — 2026-08-24 harness batch

Branch synchronization at the start of this batch found `feature/windows-runtime-qualification` **0 commits behind** both fork `main` and `remorses/gpuix:main`. The common upstream base was:

- GPUIX upstream base: `9f0fb6d082d17acf6a570e93b0c987c1f3ffc944`
- pinned Zed/GPUI submodule: `4d80927168182a26f2820f8d7a06495c6d050123`
- pinned Rust toolchain: `1.97.1`

The current branch now contains a repeatable Windows x64 qualification path instead of relying on ad-hoc manual launches:

- `229261e32807a36ad0e3aee5e72f0a28fe748ffb` — reproducible Windows contributor/setup contract (`docs/windows-runtime-contributor-setup.md`)
- `032d7d982484c9f02f6dd77b354f6587babd1068` — deterministic qualification fixture with real React state, focus/input, scroll, virtual-list, motion, stress, and same-window root remount controls
- `fa82c0d0b5cee1eb4a458014c8e9de456bca80ef` — Win32 HWND helper for OS keyboard, wheel, resize, minimize/maximize/restore, clipboard, client screenshot sampling, DPI, and WM_CLOSE
- `2d8da5ec21d1815c556d7e124523eae6d6743542` — live runtime controller covering unchanged stock examples plus the qualification fixture
- `f915a0ed6bb7f6f360941ad7f548a1757465de62` — dedicated same-HWND React root remount proof
- `e4a8fc76db8be9a43bd41ac0486a2313ebce7489` — one-command Windows build/test/runtime orchestration
- `febf1cf1af9b967ead40482c38f02134291b7b13` — root package scripts exposing the qualification commands

Primary command from an interactive Windows x64 Developer PowerShell/Command Prompt:

```powershell
bun run windows:qualify
```

That command is intentionally local-first and performs, in order:

```text
git/submodule/toolchain capture
bun install --frozen-lockfile
packages/native: bun run build:release --target x86_64-pc-windows-msvc
bun run build:react
Bun native-addon require/load
Node native-addon require/load
cargo test --manifest-path packages/native/Cargo.toml --no-default-features --lib
packages/react: bun run test
examples: bun run test
bun scripts/windows-runtime-qualification.ts
bun scripts/windows-remount-qualification.ts
```

Runtime evidence is written below ignored `tmp/windows-runtime/` as JSON/Markdown plus client-area screenshots and stdout/stderr logs. Every check is explicitly recorded as `PASS`, `FAIL`, or `NOT TESTED`.

**Evidence status for this batch:** Windows runtime remains **NOT TESTED** here. The repository changes were authored/reviewed through the source repository, but this execution environment is not the target interactive Windows x64 machine. No runtime PASS is inferred from source presence, CI compilation, or the existence of the harness. The first actual Windows run must retain its generated evidence before support wording changes.

### Static gaps identified while building the harness

These are code-level findings, not runtime failure claims:

1. **Live automation keyboard/wheel gap.** The production/live automation adapter supports real mouse dispatch on Windows/Linux/FreeBSD, but its live `scrollWheel`, `keystrokes`, `keyDown`, and `keyUp` paths currently return `Unsupported`. The native `TestGpuixRenderer` has corresponding GPUI simulation helpers. The Windows harness therefore injects keyboard/wheel through the real HWND/Win32 session and observes GPUIX state through the live automation bridge. A future framework patch should make the live protocol complete without weakening the real-window coverage.
2. **Window-size API is not resize evidence yet.** `GpuixRenderer::get_window_size()` currently returns a fixed `800x600`. `useWindowSize()` only reads it once. The runtime harness deliberately verifies physical HWND dimensions with Win32 rather than using this API to manufacture a resize PASS. This should be reduced/fixed after the first Windows run demonstrates the desired GPUI window-size source/event semantics.
3. **Native visual test renderer is macOS-only today.** `TestGpuixRenderer` constructs `gpui_macos::MacPlatform` / `VisualTestAppContext` and its screenshot path is documented as Metal/macOS. Extending the semantic visual-test API to the real Windows GPUI backend remains open P4.2 work.
4. **Same-process multi-window support needs dedicated work.** Renderer comments explicitly describe shared scroll/virtual-list handle storage as singleton/single-window for now. The harness does not convert two separate processes into a fake same-process multi-window PASS.
5. **Current Windows CI is build/load coverage, not runtime coverage.** `.github/workflows/ci.yml` builds Windows x64/ARM64 and verifies the x64 addon can be required by Bun and Node. No Windows runtime CI change is being added until the local interactive harness is proven trustworthy.

### Checks implemented by the harness

The first interactive Windows x64 run can now retain evidence for:

- unchanged stock `counter` launch, paint, click/reconciliation, shutdown
- unchanged stock `native-text` launch, native markdown/diff paint and interaction, shutdown
- native HWND creation
- non-uniform client-area painted pixels (screen-composited evidence rather than a model tree)
- React mount and state reconciliation
- mouse click and pointer enter/leave
- programmatic focus
- real OS keyboard input and Tab traversal
- native `<input>` text entry
- Unicode/emoji clipboard paste
- real Win32 wheel scrolling plus GPUIX scroll-offset/event observation
- virtual-list scroll/range churn
- conditional mount/unmount
- large keyed reorder
- 120 repeated React commit cycles
- deterministic native motion frames using the GPUIX clock plus physical screenshots
- live resize and a 24-step resize storm
- minimize/restore and maximize/restore
- current-monitor DPI metadata
- WM_CLOSE/process exit
- close/reopen in a fresh process
- same-native-HWND full React root remount with state reset and post-remount input/render proof

The harness intentionally leaves these `NOT TESTED` until stronger evidence exists: multi-scale/mixed-monitor DPI, real IME composition, same-process multiple windows, direct live automation keyboard/wheel methods, React exception recovery, Rust panic containment, long-duration soak, and Windows ARM64 runtime.

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

The runtime harness writes this evidence under ignored `tmp/windows-runtime/`. Curated evidence may later move into `docs/windows-evidence/` once a real Windows run establishes which small artifacts are useful to retain in Git. Avoid committing large opaque binary outputs unless they materially help reproduce a bug.

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

The first interactive Windows x64 execution of the harness should now:

1. pull `feature/windows-runtime-qualification` and confirm the exact branch SHA
2. run `bun run windows:qualify`
3. retain the generated `tmp/windows-runtime/*/evidence.md`, `evidence.json`, screenshots, and stderr/stdout logs long enough to diagnose any failure
4. run the same-window remount probe (included automatically by the command)
5. report every generated PASS/FAIL/NOT TESTED result without promoting unexecuted checks
6. reduce the first FAIL to the smallest GPUIX reproduction
7. fix it at the framework/GPUI abstraction that owns the bug
8. rerun the whole qualification command after each coherent framework fix
9. update this plan with the exact executed SHA, Windows build/GPU/toolchain, commands, and retained evidence
10. only after the local harness is trustworthy, add a Windows runtime CI job where the hosted runner can provide meaningful interactive GPU/session evidence

Do not start a downstream Crntly GPUIX spike until this Windows qualification work has established a credible runtime baseline.
