import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connectStdio, type App } from '@gpuix/react/automation'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
const helper = path.join(scriptDir, 'windows-runtime-input.ps1')
const fixture = 'windows-qualification.tsx'
const outputDir = path.join(
  repoRoot,
  'tmp',
  'windows-runtime',
  `remount-${new Date().toISOString().replace(/[:.]/g, '-')}`
)

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function win32(processId: number, action: string, extra: Array<string | number> = []): string {
  const result = spawnSync('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    helper,
    '-ProcessId',
    String(processId),
    '-Action',
    action,
    ...extra.map(String),
  ], { cwd: repoRoot, encoding: 'utf8', windowsHide: true })
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || result.stdout?.trim() || `${action} failed`)
  }
  return result.stdout.trim()
}

async function waitUntil<T>(fn: () => Promise<T | false> | T | false, description: string, timeoutMs = 6000): Promise<T> {
  const started = Date.now()
  let lastError: unknown
  while (Date.now() - started < timeoutMs) {
    try {
      const value = await fn()
      if (value !== false) return value
    } catch (error) {
      lastError = error
    }
    await sleep(40)
  }
  throw new Error(`Timed out waiting for ${description}${lastError ? `: ${String(lastError)}` : ''}`)
}

async function waitText(app: App, expected: string): Promise<string> {
  return waitUntil(async () => {
    const { text } = await app.call('getAllText', {})
    return text.includes(expected) ? expected : false
  }, JSON.stringify(expected))
}

async function openFixture(): Promise<{ child: ChildProcessWithoutNullStreams; app: App; stderr: string[] }> {
  const child = spawn(process.execPath, [fixture], {
    cwd: path.join(repoRoot, 'examples'),
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: false,
  })
  if (!child.pid) throw new Error('Failed to launch remount fixture')
  const stderr: string[] = []
  child.stderr.on('data', chunk => stderr.push(Buffer.from(chunk).toString('utf8')))
  const app = await connectStdio({
    write: chunk => child.stdin.write(chunk),
    feed: listener => child.stdout.on('data', chunk => listener(Buffer.from(chunk).toString('utf8'))),
    close: async () => {
      if (!child.stdin.destroyed) child.stdin.end()
    },
  })
  return { child, app, stderr }
}

async function waitForExit(child: ChildProcessWithoutNullStreams): Promise<number | null> {
  if (child.exitCode !== null) return child.exitCode
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Process did not exit after WM_CLOSE')), 5000)
    child.once('exit', code => {
      clearTimeout(timer)
      resolve(code)
    })
  })
}

async function main() {
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    console.log(`NOT TESTED: same-window remount requires Windows x64; host=${process.platform}/${process.arch}`)
    return
  }

  await mkdir(outputDir, { recursive: true })
  const { child, app, stderr } = await openFixture()
  const pid = child.pid!
  const evidence: Record<string, unknown> = {
    status: 'FAIL',
    pid,
    sha: spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).stdout.trim(),
  }

  try {
    const initialWindow = await waitUntil(() => {
      try {
        const info = JSON.parse(win32(pid, 'window-info')) as { hwnd: number }
        return info.hwnd ? info : false
      } catch {
        return false
      }
    }, 'initial HWND', 10000)

    await waitText(app, 'root-generation:0')
    await app.getByTestId('increment').click()
    await waitText(app, 'count:1')

    await app.getByTestId('remount-root').click()
    await waitText(app, 'root-generation:1')
    await waitText(app, 'count:0')

    const remountedWindow = JSON.parse(win32(pid, 'window-info')) as { hwnd: number }
    if (remountedWindow.hwnd !== initialWindow.hwnd) {
      throw new Error(`HWND changed across root remount: ${initialWindow.hwnd} -> ${remountedWindow.hwnd}`)
    }

    await app.getByTestId('increment').click()
    await waitText(app, 'count:1')

    const screenshotPath = path.join(outputDir, 'after-remount.png')
    const screenshot = JSON.parse(win32(pid, 'screenshot', ['-Path', screenshotPath])) as {
      distinctColors: number
      averageLuma: number
    }
    if (screenshot.distinctColors < 3) {
      throw new Error(`Remounted client looks blank/uniform (${screenshot.distinctColors} sampled colors)`)
    }

    evidence.status = 'PASS'
    evidence.hwnd = initialWindow.hwnd
    evidence.rootGeneration = 1
    evidence.postRemountCount = 1
    evidence.screenshot = path.relative(repoRoot, screenshotPath).replaceAll('\\', '/')
    evidence.screenshotStats = screenshot

    win32(pid, 'close')
    await sleep(120)
    await app.close()
    const exitCode = await waitForExit(child)
    if (exitCode !== 0) throw new Error(`Remount fixture exited with ${exitCode}`)
    evidence.exitCode = exitCode

    console.log(`PASS: React root remounted on the same HWND ${initialWindow.hwnd}, state reset, rendering/input survived, and WM_CLOSE exited cleanly.`)
  } catch (error) {
    evidence.error = error instanceof Error ? error.message : String(error)
    evidence.stderr = stderr.join('')
    throw error
  } finally {
    try {
      await app.close()
    } catch {}
    if (child.exitCode === null && child.signalCode === null) child.kill()
    await writeFile(path.join(outputDir, 'remount-evidence.json'), JSON.stringify(evidence, null, 2), 'utf8')
    console.log(`Remount evidence: ${path.join(outputDir, 'remount-evidence.json')}`)
  }
}

try {
  await main()
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
