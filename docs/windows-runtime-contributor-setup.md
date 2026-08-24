# Windows x64 contributor setup

This page documents the repository requirements for building and qualifying GPUIX on Windows x64. It intentionally separates **repository requirements** from **runtime evidence**: completing these setup steps does not prove that a GPUIX window launches, paints, accepts input, or shuts down correctly.

## Supported qualification target

The first runtime qualification target is:

```text
x86_64-pc-windows-msvc
```

Windows ARM64 remains a build/package target until it is exercised on real ARM64 Windows hardware or an equivalent trustworthy runtime environment.

## Repository-pinned inputs

| Input | Repository value | Source |
| --- | --- | --- |
| Rust | `1.97.1` | `rust-toolchain.toml` |
| GPUI/Zed fork | `https://github.com/remorses/zed.git` | `.gitmodules` |
| GPUI/Zed revision | `4d80927168182a26f2820f8d7a06495c6d050123` | `zed` submodule |
| JS package manager / runner | Bun | root/package scripts and `bun.lock` |
| Node compatibility floor | Node.js 18+ | `README.md` |
| Windows native target | `x86_64-pc-windows-msvc` | `packages/native/package.json` |
| Windows ARM64 package target | `aarch64-pc-windows-msvc` | `packages/native/package.json` |

GPUIX does not currently pin a Visual Studio release or Windows SDK build number. A local qualification record must therefore capture the installed MSVC and Windows SDK versions instead of assuming them.

## Required Windows tooling

Install before cloning/building:

- Git with submodule support.
- Rustup. The repository `rust-toolchain.toml` selects Rust `1.97.1` automatically.
- The MSVC C/C++ build toolchain and a Windows SDK capable of building the `x86_64-pc-windows-msvc` target. Visual Studio 2022 Build Tools with the Desktop development with C++ workload is the normal setup.
- Bun for the workspace install/build/example commands.
- Node.js 18+ when verifying Node loadability in addition to Bun loadability.

The exact `cl.exe`, Windows SDK, Bun, and Node versions used for a PASS belong in the retained evidence record.

## Clean checkout

```powershell
git clone https://github.com/<owner>/gpuix.git
cd gpuix
git checkout feature/windows-runtime-qualification
git submodule update --init --recursive
bun install --frozen-lockfile
```

Verify the pinned submodule rather than silently using another GPUI checkout:

```powershell
git submodule status --recursive
git -C zed rev-parse HEAD
```

The expected top-level `zed` revision for this branch is:

```text
4d80927168182a26f2820f8d7a06495c6d050123
```

## Capture the toolchain before building

Run these commands from the repository root and retain their output with the qualification record:

```powershell
rustc -Vv
cargo -V
rustup show active-toolchain
bun --version
node --version
where.exe cl
where.exe link
where.exe rc
where.exe mt
where.exe cmake
```

Also capture the Windows edition/build and architecture:

```powershell
Get-ComputerInfo | Select-Object WindowsProductName, WindowsVersion, OsBuildNumber, OsArchitecture
$env:PROCESSOR_ARCHITECTURE
```

If `cl.exe`/SDK tools are not on `PATH`, run from a Developer PowerShell/Developer Command Prompt for Visual Studio or initialize the Visual Studio environment before building.

## Build the shipping Windows native path

Do not qualify a debug native addon. On Windows use the same release path as CI and the publish artifacts:

```powershell
cd packages/native
bun run build:release --target x86_64-pc-windows-msvc
cd ../..
```

This distinction matters today: `packages/native` also has a `build` script that enables the `test-support` feature, while the GPU-backed `TestGpuixRenderer` is still gated to macOS and constructs `gpui_macos::MacPlatform`. Windows qualification therefore uses `build:release`, not the macOS visual-test-support build.

Build the React package separately:

```powershell
bun run build:react
```

Upstream `6f4865b8b66c9175e42bce75310cbdfc9407104d` also removed an unused `*.tsbuildinfo` cleanup glob from the React build because Bun treats an unmatched glob as an error on Windows. A current branch should therefore show this package script:

```text
rm -rf dist && tsc
```

The repository's `bun run windows:qualify` command performs the intended Windows native release build, React build, load checks, tests, and runtime checks in one sequence.

## Prove the produced addon loads

Compilation is not enough. Load the generated package through each JS runtime being claimed:

```powershell
bun -e "require('./packages/native'); console.log('gpuix native load: PASS')"
node -e "require('./packages/native'); console.log('gpuix native load: PASS')"
```

A zero exit from these commands proves native-addon loadability only. It does **not** prove window creation, D3D rendering, event pumping, input, or lifecycle behavior.

## Stock examples

Run unchanged repository examples before using a qualification-only app:

```powershell
cd examples
bun counter.tsx
bun native-text.tsx
bun chat.tsx
```

For interactive development the README recommends `bun --hot`, but an exact qualification run should also include a plain single-process launch so process lifetime and shutdown are unambiguous.

For every stock example record separately:

- process launch
- visible native window
- painted content
- responsiveness
- Rust panic / JS fatal exception status
- clean close / process exit

Do not infer any of those PASSes from a successful build.

## Existing test commands

Repository-defined tests are:

```powershell
cargo test --manifest-path packages/native/Cargo.toml --no-default-features --lib

cd packages/react
bun run test

cd ../../examples
bun run test
```

The GPU-backed `TestGpuixRenderer` currently documents screenshot capture as macOS-only. Those tests are useful regression coverage, but they are not a substitute for the Windows live-window qualification path until the native/visual test renderer is extended to the Windows GPUI backend.

## One-command qualification

From an interactive Windows x64 developer shell:

```powershell
bun run windows:qualify
```

The command retains runtime evidence below ignored `tmp/windows-runtime/`. Inspect the generated `evidence.md`, `evidence.json`, screenshots, and process logs before changing any support claim.

## Evidence status

This setup document is currently aligned with upstream base `6f4865b8b66c9175e42bce75310cbdfc9407104d`, merged into this qualification branch at `90a6de0c19814d112b2e04c50b3d357d99310f18`, with Zed/GPUI submodule `4d80927168182a26f2820f8d7a06495c6d050123`.

No Windows runtime command was executed while authoring this page. Runtime checks remain **NOT TESTED** until retained output from an actual Windows x64 run is attached to the qualification plan/evidence record.
