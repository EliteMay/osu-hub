$ErrorActionPreference = "Stop"
try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  $OutputEncoding = [System.Text.Encoding]::UTF8
} catch {}

$printed = $false
try {
  $endpoints = Get-PnpDevice -Class AudioEndpoint -Status OK -ErrorAction Stop
  foreach ($endpoint in $endpoints) {
    if ($endpoint.FriendlyName) {
      Write-Output ("DEVICE: " + $endpoint.FriendlyName)
      $printed = $true
    }
  }
} catch {}

if (-not $printed) {
  try {
    $devices = Get-CimInstance Win32_SoundDevice -ErrorAction Stop
    foreach ($device in $devices) {
      if ($device.Name) {
        Write-Output ("DEVICE: " + $device.Name)
        $printed = $true
      }
    }
  } catch {}
}

if (-not $printed) {
  Write-Output "NO_AUDIO_DEVICE_NAME_FOUND"
}
