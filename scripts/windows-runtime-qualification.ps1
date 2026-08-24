param(
  [switch]$SkipInstall,
  [switch]$SkipTests
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repoRoot

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)] [string]$Label,
    [Parameter(Mandatory = $true)] [scriptblock]$Command
  )
  Write-Host "`n==> $Label" -ForegroundColor Cyan
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed with exit code $LASTEXITCODE"
  }
}

if ([System.Environment]::OSVersion.Platform -ne [System.PlatformID]::Win32NT) {
  throw 'Windows runtime qualification must run on Windows.'
}

$architecture = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
if ($architecture -ne 'X64') {
  throw "Windows x64 is the qualified runtime target. Current OS architecture: $architecture"
}

Write-Host 'GPUIX Windows x64 qualification baseline' -ForegroundColor Green
Write-Host "repo: $repoRoot"
Write-Host "date: $([DateTimeOffset]::Now.ToString('o'))"

Invoke-Checked 'git branch/SHA' {
  git status --short --branch
  git rev-parse HEAD
  git submodule status --recursive
  git -C zed rev-parse HEAD
}

Invoke-Checked 'Rust toolchain' {
  rustc -Vv
  cargo -V
  rustup show active-toolchain
}

Invoke-Checked 'JavaScript runtimes' {
  bun --version
  node --version
}

Write-Host "`n==> MSVC / Windows SDK discovery" -ForegroundColor Cyan
where.exe cl
where.exe link
where.exe rc
where.exe mt
$kitsRoot = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows Kits\Installed Roots' -ErrorAction SilentlyContinue).KitsRoot10
if ($kitsRoot) {
  $sdk = Get-ChildItem (Join-Path $kitsRoot 'Include') -Directory | Sort-Object Name -Descending | Select-Object -First 1
  Write-Host "Windows SDK: $($sdk.Name)"
} else {
  Write-Host 'Windows SDK: NOT FOUND'
}

if (-not $SkipInstall) {
  Invoke-Checked 'workspace install (frozen lockfile)' {
    bun install --frozen-lockfile
  }
}

Invoke-Checked 'shipping Windows x64 native addon build' {
  Push-Location packages/native
  try {
    bun run build:release --target x86_64-pc-windows-msvc
  } finally {
    Pop-Location
  }
}

Invoke-Checked 'React package build' {
  bun run build:react
}

Invoke-Checked 'native addon load with Bun' {
  bun -e "require('./packages/native'); console.log('Windows native binding OK (bun)')"
}

Invoke-Checked 'native addon load with Node' {
  node -e "require('./packages/native'); console.log('Windows native binding OK (node)')"
}

if (-not $SkipTests) {
  Invoke-Checked 'Rust unit tests without macOS-only visual test support' {
    cargo test --manifest-path packages/native/Cargo.toml --no-default-features --lib
  }

  Invoke-Checked 'React tests' {
    Push-Location packages/react
    try {
      bun run test
    } finally {
      Pop-Location
    }
  }

  Invoke-Checked 'example tests' {
    Push-Location examples
    try {
      bun run test
    } finally {
      Pop-Location
    }
  }
}

Invoke-Checked 'live Windows runtime qualification' {
  bun scripts/windows-runtime-qualification.ts
}

Invoke-Checked 'same-window React root remount qualification' {
  bun scripts/windows-remount-qualification.ts
}

Write-Host "`nWindows x64 qualification command completed. Review tmp/windows-runtime/* evidence before promoting support status." -ForegroundColor Green
