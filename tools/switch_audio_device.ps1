param(
  [string]$DeviceName = "",
  [string]$DeviceHint = "",
  [switch]$List,
  [switch]$SelfTest
)

$ErrorActionPreference = "Stop"

try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  $OutputEncoding = [System.Text.Encoding]::UTF8
} catch {}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$csPath = Join-Path $scriptDir "AudioSwitcher.cs"
$svclPath = ""
$svclCandidates = @(
  (Join-Path $scriptDir "svcl.exe"),
  (Join-Path $env:APPDATA "osu-setup-launcher\tools\svcl.exe"),
  (Join-Path $env:APPDATA "osu Setup Launcher\tools\svcl.exe")
)
foreach ($candidate in $svclCandidates) {
  if (-not [string]::IsNullOrWhiteSpace($candidate) -and (Test-Path $candidate)) {
    $svclPath = $candidate
    break
  }
}

function Normalize-AudioText([string]$Value) {
  if ($null -eq $Value) { return "" }
  return (($Value.Trim().ToLowerInvariant()) -replace '[\s_\-\(\)\[\]\{\}\\/]+', ' ').Trim()
}

function Get-AudioTokens([string]$Value) {
  $normalized = Normalize-AudioText $Value
  if ([string]::IsNullOrWhiteSpace($normalized)) { return @() }

  # Device class / role words differ by Windows display language and provider.
  # They are intentionally ignored so a stable vendor/product token (for example
  # "fxsound") can bridge "FxSound Speakers" and "スピーカー (FxSound Audio Enhancer)".
  $stopWords = @(
    'audio', 'device', 'render', 'default', 'endpoint', 'output', 'high', 'definition',
    'speaker', 'speakers', 'headphone', 'headphones', 'headset', 'headsets',
    'earphone', 'earphones', 'earbud', 'earbuds',
    'スピーカー', 'ヘッドホン', 'ヘッドセット', 'イヤホン'
  )
  $tokens = @()
  foreach ($token in ($normalized -split ' ')) {
    $item = $token.Trim()
    if ($item.Length -lt 2) { continue }
    if ($stopWords -contains $item) { continue }
    if ($tokens -notcontains $item) { $tokens += $item }
  }
  return $tokens
}

function Test-AllAudioTokensPresent([string[]]$Tokens, [string]$Candidate) {
  if ($null -eq $Tokens -or $Tokens.Count -eq 0) { return $false }
  $candidateNormalized = Normalize-AudioText $Candidate
  if ([string]::IsNullOrWhiteSpace($candidateNormalized)) { return $false }
  foreach ($token in $Tokens) {
    if (-not $candidateNormalized.Contains($token)) { return $false }
  }
  return $true
}

function Test-AudioTextMatch([string]$Expected, [string]$Actual) {
  $expectedNormalized = Normalize-AudioText $Expected
  $actualNormalized = Normalize-AudioText $Actual
  if ([string]::IsNullOrWhiteSpace($expectedNormalized) -or [string]::IsNullOrWhiteSpace($actualNormalized)) {
    return $false
  }
  if (
    ($expectedNormalized -eq $actualNormalized) -or
    $expectedNormalized.Contains($actualNormalized) -or
    $actualNormalized.Contains($expectedNormalized)
  ) {
    return $true
  }

  return Test-AllAudioTokensPresent (Get-AudioTokens $Expected) $Actual
}

function Get-AudioDeviceMatchScore {
  param(
    [string]$Expected,
    [string]$Hint,
    [string]$Name,
    [string]$Id
  )

  $expectedNormalized = Normalize-AudioText $Expected
  $hintNormalized = Normalize-AudioText $Hint
  $nameNormalized = Normalize-AudioText $Name
  $idNormalized = Normalize-AudioText $Id
  $candidate = (($nameNormalized + ' ' + $idNormalized).Trim())

  if (-not [string]::IsNullOrWhiteSpace($expectedNormalized)) {
    if ($nameNormalized -eq $expectedNormalized -or $idNormalized -eq $expectedNormalized) { return 120 }
    if ($nameNormalized.Contains($expectedNormalized) -or $idNormalized.Contains($expectedNormalized)) { return 110 }
    $expectedTokens = Get-AudioTokens $Expected
    if (Test-AllAudioTokensPresent $expectedTokens $candidate) { return (90 + [Math]::Min(9, $expectedTokens.Count)) }
  }

  if (-not [string]::IsNullOrWhiteSpace($hintNormalized)) {
    if ($nameNormalized -eq $hintNormalized -or $idNormalized -eq $hintNormalized) { return 108 }
    if ($candidate.Contains($hintNormalized)) { return 104 }
    $hintTokens = Get-AudioTokens $Hint
    if (Test-AllAudioTokensPresent $hintTokens $candidate) { return (84 + [Math]::Min(9, $hintTokens.Count)) }
  }

  return 0
}

function Find-BestRenderDeviceMatch {
  param(
    $Devices,
    [string]$Expected,
    [string]$Hint = ""
  )

  $ranked = @()
  foreach ($device in $Devices) {
    $score = Get-AudioDeviceMatchScore -Expected $Expected -Hint $Hint -Name $device.Name -Id $device.Id
    if ($score -gt 0) {
      $ranked += [PSCustomObject]@{ Score = $score; Device = $device }
    }
  }

  $best = $ranked | Sort-Object -Property Score -Descending | Select-Object -First 1
  if ($null -eq $best) { return $null }
  return $best.Device
}

if ($SelfTest.IsPresent) {
  $fixtures = @(
    [PSCustomObject]@{ Name = 'スピーカー (FxSound Audio Enhancer)'; Id = '{0.0.0.00000000}.{FXSOUND-JA}'; IsDefault = $false },
    [PSCustomObject]@{ Name = 'Speakers (FxSound Audio Enhancer)'; Id = '{0.0.0.00000000}.{FXSOUND-EN}'; IsDefault = $false },
    [PSCustomObject]@{ Name = '2- Arctis GameBuds'; Id = '{0.0.0.00000000}.{ARCTIS}'; IsDefault = $true }
  )
  $fixtureHint = 'FxSound Audio Enhancer\Device\FxSound Speakers\Render'

  $fixtureMatchJa = Find-BestRenderDeviceMatch -Devices $fixtures -Expected 'FxSound Speakers' -Hint ''
  if ($null -eq $fixtureMatchJa -or $fixtureMatchJa.Name -ne 'スピーカー (FxSound Audio Enhancer)') {
    Write-Error 'AUDIO_MATCH_SELF_TEST_FAILED: localized FxSound fixture did not resolve from FxSound Speakers.'
    exit 20
  }

  $fixtureMatchHint = Find-BestRenderDeviceMatch -Devices $fixtures -Expected 'unknown output' -Hint $fixtureHint
  if ($null -eq $fixtureMatchHint -or -not $fixtureMatchHint.Name.Contains('FxSound Audio Enhancer')) {
    Write-Error 'AUDIO_MATCH_SELF_TEST_FAILED: SVCL command-line hint did not resolve to an FxSound endpoint.'
    exit 21
  }

  $negative = Find-BestRenderDeviceMatch -Devices @($fixtures[2]) -Expected 'FxSound Speakers' -Hint ''
  if ($null -ne $negative) {
    Write-Error 'AUDIO_MATCH_SELF_TEST_FAILED: FxSound query incorrectly matched an Arctis endpoint.'
    exit 22
  }

  Write-Output 'AUDIO_MATCH_SELF_TEST_OK: FxSound Speakers -> localized FxSound Audio Enhancer endpoint'
  exit 0
}

function Get-SvclColumn([string]$Alias, [string]$Column) {
  if ([string]::IsNullOrWhiteSpace($svclPath) -or -not (Test-Path $svclPath)) { return "" }
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

if (-not $List.IsPresent -and -not [string]::IsNullOrWhiteSpace($DeviceName) -and -not [string]::IsNullOrWhiteSpace($svclPath)) {
  Start-Sleep -Milliseconds 350
  foreach ($alias in @("DefaultRenderDeviceMulti", "DefaultRenderDevice", "DefaultRenderDeviceComm")) {
    $name = Get-SvclColumn $alias "Name"
    $id = Get-SvclColumn $alias "Command-Line Friendly ID"
    if (
      (Test-AudioTextMatch $DeviceName $name) -or
      (Test-AudioTextMatch $DeviceName $id) -or
      (-not [string]::IsNullOrWhiteSpace($DeviceHint) -and (Test-AudioTextMatch $DeviceHint $name)) -or
      (-not [string]::IsNullOrWhiteSpace($DeviceHint) -and (Test-AudioTextMatch $DeviceHint $id))
    ) {
      $verifiedLabel = if ($name) { $name } else { $id }
      Write-Output ("VERIFIED_DEFAULT_SVCL: " + $verifiedLabel)
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

$matched = Find-BestRenderDeviceMatch -Devices $devices -Expected $DeviceName -Hint $DeviceHint

if ($null -eq $matched) {
  $queryTokens = ((Get-AudioTokens ($DeviceName + ' ' + $DeviceHint)) -join ', ')
  $available = (($devices | ForEach-Object { $_.Name }) -join ' | ')
  Write-Error ("Device not found: " + $DeviceName + "; MATCH_TOKENS=" + $queryTokens + "; AVAILABLE_DEVICES=" + $available)
  if (-not [string]::IsNullOrWhiteSpace($DeviceHint)) {
    Write-Output ("DEVICE_HINT: " + $DeviceHint)
  }
  Write-Output ("MATCH_TOKENS: " + $queryTokens)
  Write-Output "AVAILABLE_DEVICES:"
  foreach ($device in $devices) {
    $prefix = "DEVICE"
    if ($device.IsDefault) { $prefix = "DEFAULT" }
    Write-Output ($prefix + ": " + $device.Name)
  }
  exit 3
}

Write-Output ("MATCHED_CORE_AUDIO: " + $matched.Name)
Write-Output ("MATCH_TOKENS: " + ((Get-AudioTokens ($DeviceName + ' ' + $DeviceHint)) -join ', '))

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