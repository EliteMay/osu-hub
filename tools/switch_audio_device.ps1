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
$svclPath = Join-Path $scriptDir "svcl.exe"

function Normalize-AudioText([string]$Value) {
  if ($null -eq $Value) { return "" }
  return (($Value.Trim().ToLowerInvariant()) -replace '[\s_\-\(\)\[\]\{\}\\/]+', ' ').Trim()
}

function Test-AudioTextMatch([string]$Expected, [string]$Actual) {
  $expectedNormalized = Normalize-AudioText $Expected
  $actualNormalized = Normalize-AudioText $Actual
  if ([string]::IsNullOrWhiteSpace($expectedNormalized) -or [string]::IsNullOrWhiteSpace($actualNormalized)) {
    return $false
  }
  return ($expectedNormalized -eq $actualNormalized) -or
         $expectedNormalized.Contains($actualNormalized) -or
         $actualNormalized.Contains($expectedNormalized)
}

function Get-SvclColumn([string]$Alias, [string]$Column) {
  if (-not (Test-Path $svclPath)) { return "" }
  try {
    $output = & $svclPath /GetColumnValue $Alias $Column 2>&1
    if ($LASTEXITCODE -ne 0) { return "" }
    $text = (($output | ForEach-Object { $_.ToString() }) -join "`n").Trim()
    if ($text -match 'no items found') { return "" }
    return $text
  } catch {
    return ""
  }
}

if (-not $List.IsPresent -and -not [string]::IsNullOrWhiteSpace($DeviceName) -and (Test-Path $svclPath)) {
  Start-Sleep -Milliseconds 350
  foreach ($alias in @("DefaultRenderDeviceMulti", "DefaultRenderDevice", "DefaultRenderDeviceComm")) {
    $name = Get-SvclColumn $alias "Name"
    $id = Get-SvclColumn $alias "Command-Line Friendly ID"
    if ((Test-AudioTextMatch $DeviceName $name) -or (Test-AudioTextMatch $DeviceName $id)) {
      Write-Output ("VERIFIED_DEFAULT_SVCL: " + $(if ($name) { $name } else { $id }))
      exit 0
    }
  }
}

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

Start-Sleep -Milliseconds 250

try {
  $afterDevices = [OsuSetupAudio.AudioSwitcher]::GetRenderDevices()
  $verified = $afterDevices | Where-Object {
    $_.IsDefault -and [String]::Equals($_.Id, $matched.Id, [StringComparison]::OrdinalIgnoreCase)
  } | Select-Object -First 1
} catch {
  Write-Error ("Default verification failed: " + $_.Exception.Message)
  exit 15
}

if ($null -eq $verified) {
  Write-Error ("Default verification failed: target is not the current multimedia default: " + $matched.Name)
  exit 16
}

Write-Output ("SWITCHED_TO: " + $matched.Name)
Write-Output ("VERIFIED_DEFAULT: " + $verified.Name)
exit 0
