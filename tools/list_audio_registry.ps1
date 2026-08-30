$ErrorActionPreference = "Stop"
try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  $OutputEncoding = [System.Text.Encoding]::UTF8
} catch {}

function Add-Name {
  param(
    [hashtable]$Seen,
    [string]$Name,
    [string]$Prefix
  )
  if ([string]::IsNullOrWhiteSpace($Name)) { return }
  $clean = $Name.Trim()
  if ($clean.StartsWith("@%")) { return }
  if ($clean.StartsWith("@{")) { return }
  if ($clean.Length -lt 2) { return }
  $key = $clean.ToLowerInvariant()
  if (-not $Seen.ContainsKey($key)) {
    $Seen[$key] = $true
    Write-Output ($Prefix + $clean)
  }
}

$root = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\Render"
if (-not (Test-Path $root)) {
  Write-Output "NO_RENDER_REGISTRY_FOUND"
  exit 0
}

$seen = @{}
$devices = Get-ChildItem -LiteralPath $root -ErrorAction Stop

foreach ($device in $devices) {
  $deviceState = 0
  try {
    $deviceState = (Get-ItemProperty -LiteralPath $device.PSPath -Name DeviceState -ErrorAction Stop).DeviceState
  } catch {}

  if ($deviceState -ne 1) { continue }

  $propsPath = "$($device.PSPath)\Properties"
  if (-not (Test-Path $propsPath)) { continue }

  $props = Get-ItemProperty -LiteralPath $propsPath -ErrorAction SilentlyContinue
  if ($null -eq $props) { continue }

  $strings = @()
  foreach ($prop in $props.PSObject.Properties) {
    if ($prop.Name -like "PS*") { continue }
    if ($prop.Value -is [string]) {
      $value = $prop.Value.Trim()
      if ($value -and -not $value.StartsWith("@%") -and -not $value.StartsWith("@{")) {
        $strings += $value
      }
    }
  }

  $uniqueStrings = $strings | Select-Object -Unique
  $baseNames = @()
  $hardwareNames = @()

  foreach ($name in $uniqueStrings) {
    if ($name -match "スピーカー|ヘッドホン|イヤホン|Speakers|Speaker|Headphones|Headset|Earbuds") {
      $baseNames += $name
    }
    if ($name -match "High Definition Audio|NVIDIA|Realtek|FxSound|USB|Bluetooth|Razer|Camo|Audio Device|Audio Enhancer") {
      $hardwareNames += $name
    }
  }

  foreach ($base in ($baseNames | Select-Object -Unique)) {
    Add-Name -Seen $seen -Name $base -Prefix "DEVICE: "
    foreach ($hardware in ($hardwareNames | Select-Object -Unique)) {
      if ($hardware -ne $base -and $base -notlike "*($hardware)*") {
        Add-Name -Seen $seen -Name ($base + " (" + $hardware + ")") -Prefix "DEVICE: "
      }
    }
  }

  foreach ($name in $uniqueStrings) {
    Add-Name -Seen $seen -Name $name -Prefix "ALT: "
  }
}

if ($seen.Count -eq 0) {
  Write-Output "NO_ACTIVE_RENDER_DEVICE_NAME_FOUND"
}
