param(
  [string]$DeviceName = "",
  [switch]$List
)

$ErrorActionPreference = "Stop"

try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  $OutputEncoding = [System.Text.Encoding]::UTF8
} catch {}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$csPath = Join-Path $scriptDir "AudioSwitcher.cs"

if (-not (Test-Path $csPath)) {
  Write-Error "AudioSwitcher.cs not found: $csPath"
  exit 10
}

try {
  Add-Type -Path $csPath -ErrorAction Stop
} catch {
  Write-Error ("Add-Type failed: " + $_.Exception.Message)
  exit 11
}

try {
  $devices = [OsuSetupAudio.AudioSwitcher]::GetRenderDevices()
} catch {
  Write-Error ("Device list failed: " + $_.Exception.Message)
  exit 12
}

if ($null -eq $devices) {
  Write-Error "Device list failed: returned null."
  exit 14
}

if ($List.IsPresent) {
  if ($devices.Count -eq 0) {
    Write-Output "NO_ACTIVE_RENDER_DEVICES_FOUND"
    exit 0
  }

  foreach ($device in $devices) {
    $prefix = "DEVICE"
    if ($device.IsDefault) { $prefix = "DEFAULT" }
    Write-Output ($prefix + ": " + $device.Name)
  }
  exit 0
}

if ([string]::IsNullOrWhiteSpace($DeviceName)) {
  Write-Error "DeviceName is empty. Press device list and copy part of the target device name."
  exit 2
}

$matched = $null
foreach ($device in $devices) {
  if (($device.Name -like ("*" + $DeviceName + "*")) -or ($device.Id -like ("*" + $DeviceName + "*"))) {
    $matched = $device
    break
  }
}

if ($null -eq $matched) {
  Write-Error ("Device not found: " + $DeviceName)
  Write-Output "AVAILABLE_DEVICES:"
  foreach ($device in $devices) {
    $prefix = "DEVICE"
    if ($device.IsDefault) { $prefix = "DEFAULT" }
    Write-Output ($prefix + ": " + $device.Name)
  }
  exit 3
}

try {
  [OsuSetupAudio.AudioSwitcher]::SetDefaultRenderDevice($matched.Id)
} catch {
  Write-Error ("Set default failed: " + $_.Exception.Message)
  exit 13
}

Write-Output ("SWITCHED_TO: " + $matched.Name)
exit 0
