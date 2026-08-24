import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connectStdio, type App } from '@gpuix/react/automation'

type Status = 'PASS' | 'FAIL' | 'NOT TESTED'

type Check = {
  capability: string
  status: Status
  detail: string
  artifacts?: string[]
}

type WindowInfo = {
  processId: number
  hwnd: number
  title: string
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
  clientWidth: number
  clientHeight: number
  minimized: boolean
  maximized: boolean
  dpi: number
  scalePercent: number | null
}

type ScreenshotInfo = {
  path: string
  width: number
  height: number
  samples: number
  distinctColors: number
  averageLuma: number
}

type LiveSession = {
  label: string
  child: ChildProcessWithoutNullStreams
  app: App
  stdout: string[]
  stderr: string[]
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
const examplesDir = path.join(repoRoot, 'examples')
const inputHelper = path.join(scriptDir, 'windows-runtime-input.ps1')
const runStamp = new Date().toISOString().replace(/[:.]/g, '-')
const outputDir = path.join(repoRoot, 'tmp', 'windows-runtime', runStamp)
const checks: Check[] = []
const sessions: LiveSession[] = []

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function relativeArtifact(file: string): string {
  return path.relative(repoRoot, file).replaceAll('\\', '/')
}

function commandOutput(command: string, args: string[], cwd = repoRoot): string {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
  })
  const stdout = result.stdout?.trim() ?? ''
  const stderr = result.stderr?.trim() ?? ''
  if (result.status !== 0) {
    return `NOT AVAILABLE (exit ${result.status ?? 'unknown'}): ${stderr || stdout}`
  }
  return stdout || stderr
}

function requiredCommand(command: string, args: string[], cwd = repoRoot): string {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
  })
  const stdout = result.stdout?.trim() ?? ''
  const stderr = result.stderr?.trim() ?? ''
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} exited ${result.status ?? 'unknown'}: ${stderr || stdout}`
    )
  }
  return stdout
}

function win32(
  processId: number,
  action: string,
  args: Array<string | number> = []
): string {
  return requiredCommand('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    inputHelper,
    '-ProcessId',
    String(processId),
    '-Action',
    action,
    ...args.map(String),
  ])
}

function readWindowInfo(processId: number): WindowInfo {
  return JSON.parse(win32(processId, 'window-info')) as WindowInfo
}

async function waitUntil<T>(
  operation: () => T | Promise<T> | null | undefined | false,
  options: { timeoutMs?: number; intervalMs?: number; description: string }
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 5000
  const intervalMs = options.intervalMs ?? 40
  const started = Date.now()
  let lastError: unknown
  while (Date.now() - started < timeoutMs) {
    try {
      const value = await operation()
      if (value !== null && value !== undefined && value !== false) return value
    } catch (error) {
      lastError = error
    }
    await sleep(intervalMs)
  }
  const suffix = lastError ? `; last error: ${errorText(lastError)}` : ''
  throw new Error(`Timed out waiting for ${options.description}${suffix}`)
}

async function waitForWindow(processId: number): Promise<WindowInfo> {
  return waitUntil(() => {
    const info = readWindowInfo(processId)
    return info.hwnd !== 0 ? info : false
  }, { timeoutMs: 10000, description: `HWND for pid ${processId}` })
}

async function waitForText(
  app: App,
  predicate: (text: string) => boolean,
  description: string,
  timeoutMs = 5000
): Promise<string> {
  return waitUntil(async () => {
    const result = await app.call('getAllText', {})
    return result.text.find(predicate) ?? false
  }, { timeoutMs, description })
}

async function waitForExactText(app: App, expected: string, timeoutMs = 5000): Promise<string> {
  return waitForText(app, text => text === expected, JSON.stringify(expected), timeoutMs)
}

async function check<T>(
  capability: string,
  operation: () => T | Promise<T>,
  detail: (value: T) => string = value => String(value),
  artifacts?: (value: T) => string[]
): Promise<T | undefined> {
  try {
    const value = await operation()
    checks.push({
      capability,
      status: 'PASS',
      detail: detail(value),
      artifacts: artifacts?.(value),
    })
    console.log(`[PASS] ${capability}: ${detail(value)}`)
    return value
  } catch (error) {
    const message = errorText(error)
    checks.push({ capability, status: 'FAIL', detail: message })
    console.error(`[FAIL] ${capability}: ${message}`)
    return undefined
  }
}

function notTested(capability: string, detail: string): void {
  checks.push({ capability, status: 'NOT TESTED', detail })
  console.log(`[NOT TESTED] ${capability}: ${detail}`)
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, description: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms: ${description}`)), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function openSession(label: string, entry: string): Promise<LiveSession> {
  const child = spawn(process.execPath, [entry], {
    cwd: examplesDir,
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: false,
  })
  if (!child.pid) throw new Error(`Failed to start ${label}`)

  const stdout: string[] = []
  const stderr: string[] = []
  child.stdout.on('data', chunk => stdout.push(Buffer.from(chunk).toString('utf8')))
  child.stderr.on('data', chunk => stderr.push(Buffer.from(chunk).toString('utf8')))

  const handshake = connectStdio({
    write: chunk => {
      child.stdin.write(chunk)
    },
    feed: listener => {
      child.stdout.on('data', chunk => listener(Buffer.from(chunk).toString('utf8')))
    },
    close: async () => {
      if (!child.stdin.destroyed) child.stdin.end()
    },
  })

  const exited = new Promise<never>((_, reject) => {
    child.once('exit', (code, signal) => {
      reject(
        new Error(
          `${label} exited before automation connected (code=${code ?? 'null'}, signal=${signal ?? 'null'}): ${stderr.join('').trim()}`
        )
      )
    })
  })

  const app = await withTimeout(Promise.race([handshake, exited]), 12000, `${label} automation handshake`)
  const session = { label, child, app, stdout, stderr }
  sessions.push(session)
  return session
}

async function waitForExit(
  child: ChildProcessWithoutNullStreams,
  timeoutMs: number
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return { code: child.exitCode, signal: child.signalCode }
  }
  return new Promise((resolve, reject) => {
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      clearTimeout(timer)
      resolve({ code, signal })
    }
    const timer = setTimeout(() => {
      child.off('exit', onExit)
      reject(new Error(`Process ${child.pid} did not exit within ${timeoutMs}ms`))
    }, timeoutMs)
    child.once('exit', onExit)
  })
}

async function closeSessionByWindow(session: LiveSession): Promise<string> {
  const pid = session.child.pid
  if (!pid) throw new Error(`${session.label} has no pid`)
  win32(pid, 'close')
  await sleep(120)
  await session.app.close()
  const exited = await waitForExit(session.child, 5000)
  if (exited.code !== 0) {
    throw new Error(
      `${session.label} exited with code=${exited.code ?? 'null'} signal=${exited.signal ?? 'null'}`
    )
  }
  return `WM_CLOSE -> exit code 0 (pid ${pid})`
}

async function forceCleanup(session: LiveSession): Promise<void> {
  try {
    await session.app.close()
  } catch {
    // best-effort cleanup after a failed check
  }
  if (session.child.exitCode === null && session.child.signalCode === null) {
    session.child.kill()
    try {
      await waitForExit(session.child, 1500)
    } catch {
      // process teardown is already represented by the qualification failure
    }
  }
}

async function captureClient(processId: number, fileName: string): Promise<ScreenshotInfo> {
  const file = path.join(outputDir, fileName)
  const raw = win32(processId, 'screenshot', ['-Path', file])
  const info = JSON.parse(raw) as ScreenshotInfo
  if (info.distinctColors < 3) {
    throw new Error(
      `Client capture looks blank/uniform: ${info.distinctColors} sampled colors, average luma ${info.averageLuma}`
    )
  }
  return info
}

async function sha256(file: string): Promise<string> {
  const bytes = await readFile(file)
  return createHash('sha256').update(bytes).digest('hex')
}

async function runStockCounter(): Promise<void> {
  let session: LiveSession | undefined
  try {
    session = await check('Stock counter: automation connection', () => openSession('stock-counter', 'counter.tsx'), value => `pid ${value.child.pid}`)
    if (!session?.child.pid) return
    const pid = session.child.pid

    await check('Stock counter: native window creation', () => waitForWindow(pid), value => `${value.title} HWND=${value.hwnd}`)
    await check('Stock counter: React tree mounted', () => waitForExactText(session!.app, 'Click the number or + to increment'), value => value)
    await check(
      'Stock counter: painted client pixels',
      () => captureClient(pid, 'stock-counter.png'),
      value => `${value.width}x${value.height}, ${value.distinctColors} sampled colors`,
      value => [relativeArtifact(value.path)]
    )
    await check('Stock counter: mouse -> React reconciliation', async () => {
      await session!.app.getByText('0').click()
      return waitForExactText(session!.app, '1')
    }, value => `count changed to ${value}`)
    await check('Stock counter: clean window close', () => closeSessionByWindow(session!), value => value)
  } finally {
    if (session) await forceCleanup(session)
  }
}

async function runStockNativeText(): Promise<void> {
  let session: LiveSession | undefined
  try {
    session = await check('Stock native-text: automation connection', () => openSession('stock-native-text', 'native-text.tsx'), value => `pid ${value.child.pid}`)
    if (!session?.child.pid) return
    const pid = session.child.pid

    await check('Stock native-text: native window creation', () => waitForWindow(pid), value => `${value.title} HWND=${value.hwnd}`)
    await check('Stock native-text: markdown host mounted', () => session!.app.getByType('markdown').waitFor(), value => `element ${value.id}`)
    const first = await check(
      'Stock native-text: painted markdown client',
      () => captureClient(pid, 'stock-native-text-markdown.png'),
      value => `${value.distinctColors} sampled colors`,
      value => [relativeArtifact(value.path)]
    )
    await check('Stock native-text: tab interaction mounts native diff', async () => {
      await session!.app.getByText('diff').click()
      const node = await session!.app.getByType('diff').waitFor()
      return `diff element ${node.id}`
    })
    const second = await check(
      'Stock native-text: painted diff client',
      () => captureClient(pid, 'stock-native-text-diff.png'),
      value => `${value.distinctColors} sampled colors`,
      value => [relativeArtifact(value.path)]
    )
    if (first && second) {
      await check('Stock native-text: rendered state changed', async () => {
        const [before, after] = await Promise.all([sha256(first.path), sha256(second.path)])
        if (before === after) throw new Error('Markdown and diff captures were byte-identical')
        return `${before.slice(0, 12)} -> ${after.slice(0, 12)}`
      })
    }
    await check('Stock native-text: clean window close', () => closeSessionByWindow(session!), value => value)
  } finally {
    if (session) await forceCleanup(session)
  }
}

async function runQualificationFixture(): Promise<void> {
  let session: LiveSession | undefined
  try {
    session = await check('Qualification fixture: automation connection', () => openSession('windows-qualification', 'windows-qualification.tsx'), value => `pid ${value.child.pid}`)
    if (!session?.child.pid) return
    const pid = session.child.pid
    const app = session.app

    const initialWindow = await check('Native window creation', () => waitForWindow(pid), value => `${value.title} HWND=${value.hwnd}`)
    await check('React mount readiness', () => waitForExactText(app, 'render:ready'), value => value)
    await check(
      'GPUI/D3D rendered client pixels',
      () => captureClient(pid, 'qualification-initial.png'),
      value => `${value.width}x${value.height}, ${value.distinctColors} sampled colors, avg luma ${value.averageLuma}`,
      value => [relativeArtifact(value.path)]
    )

    const clickResult = await check('Mouse click input', async () => {
      await app.getByTestId('increment').click()
      return waitForExactText(app, 'count:1')
    }, value => `click produced ${value}`)
    if (clickResult) {
      checks.push({ capability: 'React reconciliation/state update', status: 'PASS', detail: 'Native click crossed GPUI -> Rust -> N-API -> React and the retained tree reached count:1' })
    }

    await check('Pointer enter/leave', async () => {
      const bounds = await app.getByTestId('hover-probe').bounds()
      await app.call('mouseMove', { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 })
      await waitForExactText(app, 'hover:inside')
      await app.call('mouseMove', { x: 2, y: 2 })
      await waitForExactText(app, 'hover:outside')
      return 'enter and leave both updated React state'
    })

    const keyboardA = await app.getByTestId('keyboard-a').element()
    await check('Programmatic focus', async () => {
      await app.call('focus', { elementId: keyboardA.id })
      return waitForExactText(app, 'focus:a')
    })
    await check('Keyboard input through Win32', async () => {
      win32(pid, 'send-keys', ['-Keys', 'q'])
      return waitForExactText(app, 'keyboard-events:1')
    }, value => `OS key reached GPUI/React (${value})`)
    await check('Tab focus traversal', async () => {
      win32(pid, 'send-keys', ['-Keys', '{TAB}'])
      await waitForExactText(app, 'focus:b')
      win32(pid, 'send-keys', ['-Keys', 'w'])
      const eventCount = await waitForText(
        app,
        text => text.startsWith('keyboard-events:') && Number(text.split(':')[1]) >= 3,
        'keyboard event after Tab focus transfer'
      )
      return `${eventCount}, focus:b`
    })

    await check('Native text input/focus', async () => {
      await app.getByTestId('text-input').click()
      win32(pid, 'send-keys', ['-Keys', 'gpuix'])
      return waitForExactText(app, 'input:gpuix')
    }, value => value)
    await check('Clipboard paste + Unicode text', async () => {
      win32(pid, 'clipboard-paste', ['-Text', '雪🚀'])
      return waitForExactText(app, 'input:gpuix雪🚀')
    }, value => value)

    await check('Wheel scrolling', async () => {
      const scroll = await app.getByTestId('scroll-box').element()
      const bounds = await app.getByTestId('scroll-box').bounds()
      const before = await app.call('getScrollOffset', { elementId: scroll.id })
      win32(pid, 'wheel', [
        '-X', bounds.x + bounds.width / 2,
        '-Y', bounds.y + bounds.height / 2,
        '-WheelDelta', -480,
      ])
      const after = await waitUntil(async () => {
        const value = await app.call('getScrollOffset', { elementId: scroll.id })
        if (!value.offset) return false
        if (before.offset && value.offset[1] === before.offset[1]) return false
        return value.offset
      }, { description: 'scroll offset to change after Win32 wheel' })
      await waitForText(
        app,
        text => text.startsWith('scroll-events:') && Number(text.split(':')[1]) > 0,
        'onScroll event after wheel'
      )
      return `offset ${JSON.stringify(before.offset)} -> ${JSON.stringify(after)}`
    })

    await check('Virtual-list churn/scroll', async () => {
      const list = await app.getByType('virtual-list').element()
      const bounds = await app.getByType('virtual-list').bounds()
      const before = await app.call('getScrollOffset', { elementId: list.id })
      win32(pid, 'wheel', [
        '-X', bounds.x + bounds.width / 2,
        '-Y', bounds.y + bounds.height / 2,
        '-WheelDelta', -720,
      ])
      const after = await waitUntil(async () => {
        const value = await app.call('getScrollOffset', { elementId: list.id })
        if (!value.offset) return false
        if (before.offset && value.offset[1] === before.offset[1]) return false
        return value.offset
      }, { timeoutMs: 7000, description: 'virtual-list offset to change' })
      const range = await waitForText(
        app,
        text => text.startsWith('visible-range:') && text !== 'visible-range:none' && !text.endsWith(':0-0'),
        'virtual-list visible range event',
        7000
      )
      return `${JSON.stringify(before.offset)} -> ${JSON.stringify(after)}, ${range}`
    })

    await check('Conditional unmount/remount', async () => {
      await app.getByTestId('toggle-conditional').click()
      await waitForExactText(app, 'conditional:unmounted')
      await app.getByTestId('toggle-conditional').click()
      await waitForExactText(app, 'conditional:mounted')
      return 'mounted -> unmounted -> mounted'
    })

    await check('Large keyed reorder mutation', async () => {
      await app.getByTestId('keyed-reorder').click()
      return waitForExactText(app, 'keyed:reverse:119')
    }, value => value)

    await check('Repeated commit churn', async () => {
      await app.getByTestId('stress-start').click()
      return waitForExactText(app, 'stress:idle:120', 12000)
    }, value => value)

    await check('Native animation/update loop', async () => {
      await app.clock.pause()
      await app.clock.set(0)
      await app.getByTestId('toggle-motion').click()
      await waitForExactText(app, 'motion:open')
      await sleep(60)
      const t0 = await captureClient(pid, 'motion-t000.png')
      await app.clock.set(125)
      await sleep(60)
      const t125 = await captureClient(pid, 'motion-t125.png')
      await app.clock.set(300)
      await sleep(60)
      const t300 = await captureClient(pid, 'motion-t300.png')
      await app.clock.resume()
      const hashes = await Promise.all([sha256(t0.path), sha256(t125.path), sha256(t300.path)])
      if (new Set(hashes).size < 2) {
        throw new Error(`Animation captures did not change: ${hashes.join(', ')}`)
      }
      return {
        detail: hashes.map(hash => hash.slice(0, 12)).join(' -> '),
        files: [t0.path, t125.path, t300.path],
      }
    }, value => value.detail, value => value.files.map(relativeArtifact))

    if (initialWindow) {
      await check('Live resize', async () => {
        const targetWidth = initialWindow.width + 140
        const targetHeight = initialWindow.height + 90
        win32(pid, 'resize', ['-Width', targetWidth, '-Height', targetHeight])
        const resized = await waitUntil(() => {
          const info = readWindowInfo(pid)
          return info.width === targetWidth && info.height === targetHeight ? info : false
        }, { timeoutMs: 5000, description: `${targetWidth}x${targetHeight} resized HWND` })
        await waitForExactText(app, 'render:ready')
        const capture = await captureClient(pid, 'qualification-resized.png')
        return { resized, capture }
      }, value => `${value.resized.width}x${value.resized.height}, renderer still responsive`, value => [relativeArtifact(value.capture.path)])

      await check('Resize storm while renderer is live', async () => {
        win32(pid, 'resize-storm', ['-Width', initialWindow.width, '-Height', initialWindow.height])
        const restored = await waitUntil(() => {
          const info = readWindowInfo(pid)
          return info.width === initialWindow.width && info.height === initialWindow.height ? info : false
        }, { timeoutMs: 5000, description: 'final resize-storm dimensions' })
        await app.getByTestId('increment').click()
        await waitForExactText(app, 'count:2')
        return `${restored.width}x${restored.height}, post-storm input/reconciliation passed`
      })
    }

    await check('Minimize/restore lifecycle', async () => {
      win32(pid, 'minimize')
      await waitUntil(() => readWindowInfo(pid).minimized, { description: 'window minimized' })
      win32(pid, 'restore')
      await waitUntil(() => !readWindowInfo(pid).minimized, { description: 'window restored from minimize' })
      await waitForExactText(app, 'render:ready')
      const capture = await captureClient(pid, 'qualification-restored-from-minimize.png')
      return capture
    }, value => `restored and painted ${value.distinctColors} sampled colors`, value => [relativeArtifact(value.path)])

    await check('Maximize/restore lifecycle', async () => {
      win32(pid, 'maximize')
      await waitUntil(() => readWindowInfo(pid).maximized, { description: 'window maximized' })
      win32(pid, 'restore')
      await waitUntil(() => !readWindowInfo(pid).maximized, { description: 'window restored from maximize' })
      await waitForExactText(app, 'render:ready')
      return readWindowInfo(pid)
    }, value => `restored to ${value.width}x${value.height}`)

    await check('Current-monitor DPI metadata', async () => {
      const info = readWindowInfo(pid)
      if (info.dpi <= 0 || info.scalePercent == null) {
        throw new Error(`GetDpiForWindow returned ${info.dpi}`)
      }
      return `${info.dpi} DPI (${info.scalePercent}%)`
    })
    notTested('DPI scaling matrix (100/125/150/200%)', 'The harness records and exercises the current monitor DPI only. It does not mutate system scaling settings.')
    notTested('Mixed-DPI monitor transition', 'Requires two monitors with different DPI settings or an equivalent trustworthy interactive setup.')
    notTested('IME composition', 'Unicode keyboard/clipboard text is exercised, but an actual Windows IME composition session is not synthesized by this harness yet.')
    notTested('Multiple GPUIX windows in one process', 'The current public render host is singleton-oriented and shared scroll state is documented as single-window. This needs a dedicated framework change/reproduction before it can be marked PASS.')
    notTested('Live automation protocol keyboard/wheel methods', 'The live bridge currently exposes real mouse dispatch but intentionally returns Unsupported for live keystrokes and scrollWheel. This harness uses OS-level Win32 input so runtime keyboard/wheel coverage remains real.')
    notTested('React exception recovery', 'A separate subprocess fault-injection fixture is still needed so an intentional JS exception cannot corrupt the main qualification run.')
    notTested('Rust panic containment', 'A separate subprocess fault-injection fixture is still needed; no panic is intentionally triggered in the main qualification run.')
    notTested('Long-duration soak', 'This run includes 120 repeated React commits and resize/list churn, but does not claim an extended-duration soak baseline.')

    await check('Clean shutdown after qualification', () => closeSessionByWindow(session!), value => value)

    let reopened: LiveSession | undefined
    try {
      reopened = await check('Close/reopen: second process automation connection', () => openSession('windows-qualification-reopen', 'windows-qualification.tsx'), value => `pid ${value.child.pid}`)
      if (reopened?.child.pid) {
        const reopenPid = reopened.child.pid
        await check('Close/reopen: second native window', () => waitForWindow(reopenPid), value => `HWND=${value.hwnd}`)
        await check('Close/reopen: second React mount', () => waitForExactText(reopened!.app, 'render:ready'), value => value)
        await check(
          'Close/reopen: second painted client',
          () => captureClient(reopenPid, 'qualification-reopen.png'),
          value => `${value.distinctColors} sampled colors`,
          value => [relativeArtifact(value.path)]
        )
        await check('Close/reopen: second clean shutdown', () => closeSessionByWindow(reopened!), value => value)
      }
    } finally {
      if (reopened) await forceCleanup(reopened)
    }
  } finally {
    if (session) await forceCleanup(session)
  }
}

async function writeSessionLogs(): Promise<void> {
  for (const session of sessions) {
    await writeFile(path.join(outputDir, `${session.label}.stdout.log`), session.stdout.join(''), 'utf8')
    await writeFile(path.join(outputDir, `${session.label}.stderr.log`), session.stderr.join(''), 'utf8')
  }
}

function metadata(): Record<string, string> {
  const windows = commandOutput('powershell.exe', [
    '-NoProfile',
    '-Command',
    "Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,BuildNumber,OSArchitecture | ConvertTo-Json -Compress",
  ])
  const gpu = commandOutput('powershell.exe', [
    '-NoProfile',
    '-Command',
    "Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion | ConvertTo-Json -Compress",
  ])
  const sdk = commandOutput('powershell.exe', [
    '-NoProfile',
    '-Command',
    "$root=(Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows Kits\\Installed Roots' -ErrorAction SilentlyContinue).KitsRoot10; if($root){(Get-ChildItem (Join-Path $root 'Include') -Directory | Sort-Object Name -Descending | Select-Object -First 1).Name}",
  ])
  return {
    date: new Date().toISOString(),
    gpuiSha: commandOutput('git', ['rev-parse', 'HEAD']),
    branch: commandOutput('git', ['branch', '--show-current']),
    upstreamBaseSha: commandOutput('git', ['merge-base', 'HEAD', 'main']),
    zedGpuiSha: commandOutput('git', ['-C', 'zed', 'rev-parse', 'HEAD']),
    gitStatus: commandOutput('git', ['status', '--short']) || 'clean',
    windows,
    architecture: `${process.arch} / ${process.env.PROCESSOR_ARCHITECTURE ?? 'unknown'}`,
    gpu,
    rustc: commandOutput('rustc', ['-Vv']),
    cargo: commandOutput('cargo', ['-V']),
    rustup: commandOutput('rustup', ['show', 'active-toolchain']),
    bun: commandOutput(process.execPath, ['--version']),
    node: commandOutput('node', ['--version']),
    clPath: commandOutput('where.exe', ['cl']),
    linkPath: commandOutput('where.exe', ['link']),
    windowsSdk: sdk || 'NOT AVAILABLE',
  }
}

function markdownEvidence(meta: Record<string, string>): string {
  const lines = [
    '# GPUIX Windows Runtime Qualification Evidence',
    '',
    'This file is generated by `bun run windows:qualify:runtime`. PASS means the check executed in this run. NOT TESTED is intentionally non-failing and must not be presented as runtime proof.',
    '',
    '## Baseline',
    '',
  ]
  for (const [key, value] of Object.entries(meta)) {
    lines.push(`- **${key}:** ${value.replaceAll('\n', ' | ')}`)
  }
  lines.push('', '## Checks', '', '| Capability | Status | Detail |', '| --- | --- | --- |')
  for (const item of checks) {
    lines.push(`| ${item.capability.replaceAll('|', '\\|')} | **${item.status}** | ${item.detail.replaceAll('|', '\\|').replaceAll('\n', ' ')} |`)
  }
  lines.push('', '## Artifacts', '')
  const artifacts = checks.flatMap(item => item.artifacts ?? [])
  if (artifacts.length === 0) {
    lines.push('- None retained.')
  } else {
    for (const artifact of [...new Set(artifacts)]) lines.push(`- \`${artifact}\``)
  }
  lines.push('', 'Session stdout/stderr logs are stored beside this evidence file.', '')
  return lines.join('\n')
}

async function main(): Promise<void> {
  await mkdir(outputDir, { recursive: true })

  if (process.platform !== 'win32') {
    checks.push({
      capability: 'Windows x64 runtime harness',
      status: 'NOT TESTED',
      detail: `Host platform is ${process.platform}; run this command from an interactive Windows x64 session.`,
    })
    return
  }
  if (process.arch !== 'x64') {
    checks.push({
      capability: 'Windows x64 runtime harness',
      status: 'NOT TESTED',
      detail: `Host architecture is ${process.arch}; Windows ARM64 remains runtime NOT TESTED.`,
    })
    return
  }

  await runStockCounter()
  await runStockNativeText()
  await runQualificationFixture()
  notTested('Windows ARM64 runtime', 'Compile/package target only until real ARM64 Windows runtime evidence exists.')
}

let uncaught: unknown
try {
  await main()
} catch (error) {
  uncaught = error
  checks.push({ capability: 'Qualification harness execution', status: 'FAIL', detail: errorText(error) })
  console.error(error)
} finally {
  for (const session of sessions) await forceCleanup(session)
  await mkdir(outputDir, { recursive: true })
  await writeSessionLogs()
  const meta = metadata()
  await writeFile(path.join(outputDir, 'evidence.json'), JSON.stringify({ metadata: meta, checks }, null, 2), 'utf8')
  await writeFile(path.join(outputDir, 'evidence.md'), markdownEvidence(meta), 'utf8')
  console.log(`Evidence: ${path.join(outputDir, 'evidence.md')}`)
}

if (uncaught || checks.some(item => item.status === 'FAIL')) {
  process.exitCode = 1
}
