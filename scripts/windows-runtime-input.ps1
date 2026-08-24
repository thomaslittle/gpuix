param(
  [Parameter(Mandatory = $true)]
  [int]$ProcessId,

  [Parameter(Mandatory = $true)]
  [ValidateSet('window-info', 'activate', 'send-keys', 'wheel', 'resize', 'resize-storm', 'clipboard-paste', 'screenshot', 'close')]
  [string]$Action,

  [string]$Keys = '',
  [string]$Text = '',
  [string]$Path = '',
  [double]$X = 0,
  [double]$Y = 0,
  [int]$WheelDelta = -120,
  [int]$Width = 980,
  [int]$Height = 760
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

if (-not ('GpuixWindowsQualification.NativeMethods' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

namespace GpuixWindowsQualification {
  public static class NativeMethods {
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
      public int Left;
      public int Top;
      public int Right;
      public int Bottom;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct POINT {
      public int X;
      public int Y;
    }

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool GetClientRect(IntPtr hWnd, out RECT rect);

    [DllImport("user32.dll")]
    public static extern uint GetDpiForWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool ClientToScreen(IntPtr hWnd, ref POINT point);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool SetCursorPos(int x, int y);

    [DllImport("user32.dll")]
    public static extern void mouse_event(uint flags, int dx, int dy, int data, UIntPtr extraInfo);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool SetWindowPos(
      IntPtr hWnd,
      IntPtr hWndInsertAfter,
      int x,
      int y,
      int cx,
      int cy,
      uint flags
    );

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool PostMessage(IntPtr hWnd, uint message, UIntPtr wParam, IntPtr lParam);
  }
}
'@
}

function Get-GpuixProcessWindow {
  $process = Get-Process -Id $ProcessId -ErrorAction Stop
  $process.Refresh()
  $handle = $process.MainWindowHandle
  if ($handle -eq [IntPtr]::Zero) {
    throw "Process $ProcessId does not have a visible main window yet"
  }
  return @($process, $handle)
}

function Get-WindowRectChecked([IntPtr]$Handle) {
  $rect = New-Object GpuixWindowsQualification.NativeMethods+RECT
  if (-not [GpuixWindowsQualification.NativeMethods]::GetWindowRect($Handle, [ref]$rect)) {
    throw "GetWindowRect failed for process $ProcessId"
  }
  return $rect
}

function Get-ClientCaptureRect([IntPtr]$Handle) {
  $client = New-Object GpuixWindowsQualification.NativeMethods+RECT
  if (-not [GpuixWindowsQualification.NativeMethods]::GetClientRect($Handle, [ref]$client)) {
    throw "GetClientRect failed for process $ProcessId"
  }
  $origin = New-Object GpuixWindowsQualification.NativeMethods+POINT
  $origin.X = 0
  $origin.Y = 0
  if (-not [GpuixWindowsQualification.NativeMethods]::ClientToScreen($Handle, [ref]$origin)) {
    throw "ClientToScreen failed for process $ProcessId"
  }
  return [pscustomobject]@{
    left = $origin.X
    top = $origin.Y
    width = $client.Right - $client.Left
    height = $client.Bottom - $client.Top
  }
}

function Activate-Window([IntPtr]$Handle) {
  if (-not [GpuixWindowsQualification.NativeMethods]::SetForegroundWindow($Handle)) {
    throw "SetForegroundWindow failed for process $ProcessId"
  }
  Start-Sleep -Milliseconds 60
}

$window = Get-GpuixProcessWindow
$process = $window[0]
$handle = [IntPtr]$window[1]

switch ($Action) {
  'window-info' {
    $rect = Get-WindowRectChecked $handle
    $client = Get-ClientCaptureRect $handle

    $dpi = 0
    try {
      $dpi = [GpuixWindowsQualification.NativeMethods]::GetDpiForWindow($handle)
    } catch {
      $dpi = 0
    }

    [pscustomobject]@{
      processId = $ProcessId
      hwnd = $handle.ToInt64()
      title = $process.MainWindowTitle
      left = $rect.Left
      top = $rect.Top
      right = $rect.Right
      bottom = $rect.Bottom
      width = $rect.Right - $rect.Left
      height = $rect.Bottom - $rect.Top
      clientWidth = $client.width
      clientHeight = $client.height
      dpi = $dpi
      scalePercent = if ($dpi -gt 0) { [math]::Round(($dpi / 96.0) * 100, 2) } else { $null }
    } | ConvertTo-Json -Compress
    break
  }

  'activate' {
    Activate-Window $handle
    break
  }

  'send-keys' {
    if ([string]::IsNullOrEmpty($Keys)) {
      throw '-Keys is required for send-keys'
    }
    Activate-Window $handle
    [System.Windows.Forms.SendKeys]::SendWait($Keys)
    break
  }

  'wheel' {
    $point = New-Object GpuixWindowsQualification.NativeMethods+POINT
    $point.X = [int][math]::Round($X)
    $point.Y = [int][math]::Round($Y)
    if (-not [GpuixWindowsQualification.NativeMethods]::ClientToScreen($handle, [ref]$point)) {
      throw "ClientToScreen failed for process $ProcessId"
    }
    if (-not [GpuixWindowsQualification.NativeMethods]::SetCursorPos($point.X, $point.Y)) {
      throw "SetCursorPos failed for process $ProcessId"
    }
    Activate-Window $handle
    [GpuixWindowsQualification.NativeMethods]::mouse_event(0x0800, 0, 0, $WheelDelta, [UIntPtr]::Zero)
    break
  }

  'resize' {
    $flags = 0x0002 -bor 0x0004 -bor 0x0010 # SWP_NOMOVE | SWP_NOZORDER | SWP_NOACTIVATE
    if (-not [GpuixWindowsQualification.NativeMethods]::SetWindowPos($handle, [IntPtr]::Zero, 0, 0, $Width, $Height, $flags)) {
      throw "SetWindowPos failed for process $ProcessId"
    }
    break
  }

  'resize-storm' {
    $flags = 0x0002 -bor 0x0004 -bor 0x0010
    for ($i = 0; $i -lt 24; $i += 1) {
      $delta = ($i % 4) * 28
      $nextWidth = $Width + $delta
      $nextHeight = $Height + (($i % 3) * 22)
      if (-not [GpuixWindowsQualification.NativeMethods]::SetWindowPos($handle, [IntPtr]::Zero, 0, 0, $nextWidth, $nextHeight, $flags)) {
        throw "SetWindowPos failed during resize storm at iteration $i"
      }
      Start-Sleep -Milliseconds 12
    }
    if (-not [GpuixWindowsQualification.NativeMethods]::SetWindowPos($handle, [IntPtr]::Zero, 0, 0, $Width, $Height, $flags)) {
      throw 'SetWindowPos failed while restoring final resize-storm dimensions'
    }
    break
  }

  'clipboard-paste' {
    Activate-Window $handle
    Set-Clipboard -Value $Text
    [System.Windows.Forms.SendKeys]::SendWait('^v')
    break
  }

  'screenshot' {
    if ([string]::IsNullOrEmpty($Path)) {
      throw '-Path is required for screenshot'
    }
    Activate-Window $handle
    $client = Get-ClientCaptureRect $handle
    if ($client.width -le 0 -or $client.height -le 0) {
      throw "Window has invalid client capture dimensions $($client.width)x$($client.height)"
    }

    $fullPath = [System.IO.Path]::GetFullPath($Path)
    $directory = [System.IO.Path]::GetDirectoryName($fullPath)
    [System.IO.Directory]::CreateDirectory($directory) | Out-Null
    $bitmap = New-Object System.Drawing.Bitmap($client.width, $client.height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
      $graphics.CopyFromScreen($client.left, $client.top, 0, 0, $bitmap.Size)
      $bitmap.Save($fullPath, [System.Drawing.Imaging.ImageFormat]::Png)

      $colors = New-Object 'System.Collections.Generic.HashSet[string]'
      $samples = 0
      $luma = 0.0
      $stepX = [math]::Max(1, [math]::Floor($client.width / 24))
      $stepY = [math]::Max(1, [math]::Floor($client.height / 18))
      for ($sampleY = 0; $sampleY -lt $client.height; $sampleY += $stepY) {
        for ($sampleX = 0; $sampleX -lt $client.width; $sampleX += $stepX) {
          $pixel = $bitmap.GetPixel($sampleX, $sampleY)
          [void]$colors.Add("$($pixel.R),$($pixel.G),$($pixel.B)")
          $luma += ($pixel.R + $pixel.G + $pixel.B) / 3.0
          $samples += 1
        }
      }

      [pscustomobject]@{
        path = $fullPath
        width = $client.width
        height = $client.height
        samples = $samples
        distinctColors = $colors.Count
        averageLuma = if ($samples -gt 0) { [math]::Round($luma / $samples, 2) } else { 0 }
      } | ConvertTo-Json -Compress
    } finally {
      $graphics.Dispose()
      $bitmap.Dispose()
    }
    break
  }

  'close' {
    if (-not [GpuixWindowsQualification.NativeMethods]::PostMessage($handle, 0x0010, [UIntPtr]::Zero, [IntPtr]::Zero)) {
      throw "PostMessage(WM_CLOSE) failed for process $ProcessId"
    }
    break
  }
}
