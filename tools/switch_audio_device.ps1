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

  # Device class / role words are not stable identifiers. The query-side class
  # word can be English even when Windows renders the candidate in another locale.
  $stopWords = @(
    'audio', 'device', 'render', 'default', 'endpoint', 'output', 'high', 'definition',
    'speaker', 'speakers', 'headphone', 'headphones', 'headset', 'headsets',
    'earphone', 'earphones', 'earbud', 'earbuds'
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
      $activeBonus = 0
      try { if ($device.IsActive) { $activeBonus = 25 } } catch {}
      $ranked += [PSCustomObject]@{ Score = ($score + $activeBonus); Device = $device }
    }
  }

  $best = $ranked | Sort-Object -Property Score -Descending | Select-Object -First 1
  if ($null -eq $best) { return $null }
  return $best.Device
}

function Test-FxSoundTarget([string]$Value) {
  return (Normalize-AudioText $Value).Contains('fxsound')
}

function Find-FxSoundExecutable {
  $programFilesX86 = [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
  $candidates = @(
    (Join-Path $env:ProgramFiles 'FxSound LLC\FxSound\FxSound.exe'),
    $(if (-not [string]::IsNullOrWhiteSpace($programFilesX86)) { Join-Path $programFilesX86 'FxSound LLC\FxSound\FxSound.exe' } else { '' }),
    (Join-Path $env:LOCALAPPDATA 'Programs\FxSound\FxSound.exe'),
    (Join-Path $env:LOCALAPPDATA 'FxSound\FxSound.exe')
  )
  foreach ($candidate in $candidates) {
    if (-not [string]::IsNullOrWhiteSpace($candidate) -and (Test-Path $candidate)) { return $candidate }
  }
  return ""
}

function Ensure-FxSoundProcess {
  try {
    $running = Get-Process -Name 'FxSound' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -ne $running) {
      Write-Output ("FXSOUND_PROCESS: already running pid=" + $running.Id)
      return $true
    }
  } catch {}

  $exe = Find-FxSoundExecutable
  if ([string]::IsNullOrWhiteSpace($exe)) {
    Write-Output "FXSOUND_PROCESS: executable not found in known install paths"
    return $false
  }

  try {
    Start-Process -FilePath $exe -WorkingDirectory (Split-Path -Parent $exe) -WindowStyle Minimized | Out-Null
    Write-Output ("FXSOUND_PROCESS: started " + $exe)
    return $true
  } catch {
    Write-Output ("FXSOUND_PROCESS: start failed: " + $_.Exception.Message)
    return $false
  }
}

if ($SelfTest.IsPresent) {
  $fixtures = @(
    [PSCustomObject]@{ Name = 'Localized Output (FxSound Audio Enhancer)'; Id = '{0.0.0.00000000}.{FXSOUND-LOCALIZED}'; State = 'Unplugged'; IsActive = $false; IsDefault = $false },
    [PSCustomObject]@{ Name = 'Speakers (FxSound Audio Enhancer)'; Id = '{0.0.0.00000000}.{FXSOUND-EN}'; State = 'Active'; IsActive = $true; IsDefault = $false },
    [PSCustomObject]@{ Name = '2- Arctis GameBuds'; Id = '{0.0.0.00000000}.{ARCTIS}'; State = 'Active'; IsActive = $true; IsDefault = $true }
  )
  $fixtureHint = 'FxSound Audio Enhancer\Device\FxSound Speakers\Render'

  $fixtureMatchActive = Find-BestRenderDeviceMatch -Devices $fixtures -Expected 'FxSound Speakers' -Hint ''
  if ($null -eq $fixtureMatchActive -or $fixtureMatchActive.Name -ne 'Speakers (FxSound Audio Enhancer)') {
    Write-Error 'AUDIO_MATCH_SELF_TEST_FAILED: active FxSound endpoint was not preferred.'
    exit 20
  }

  $fixtureMatchHint = Find-BestRenderDeviceMatch -Devices @($fixtures[0], $fixtures[2]) -Expected 'unknown output' -Hint $fixtureHint
  if ($null -eq $fixtureMatchHint -or -not $fixtureMatchHint.Name.Contains('FxSound Audio Enhancer')) {
    Write-Error 'AUDIO_MATCH_SELF_TEST_FAILED: SVCL command-line hint did not resolve to an FxSound endpoint.'
    exit 21
  }

  $negative = Find-BestRenderDeviceMatch -Devices @($fixtures[2]) -Expected 'FxSound Speakers' -Hint ''
  if ($null -ne $negative) {
    Write-Error 'AUDIO_MATCH_SELF_TEST_FAILED: FxSound query incorrectly matched an Arctis endpoint.'
    exit 22
  }

  Write-Output 'AUDIO_MATCH_SELF_TEST_OK: active endpoint preference and FxSound matching are valid'
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

function Test-SvclTargetActive([string]$Target) {
  $state = Get-SvclColumn $Target 'Device State'
  if (-not [string]::IsNullOrWhiteSpace($state)) {
    Write-Output ("SVCL_TARGET_STATE: " + $state)
  }
  return ($state -match 'active')
}

function Verify-SvclDefault([string]$Expected, [string]$Hint) {
  if ([string]::IsNullOrWhiteSpace($svclPath) -or -not (Test-Path $svclPath)) { return $false }
  foreach ($alias in @('DefaultRenderDeviceMulti', 'DefaultRenderDevice', 'DefaultRenderDeviceComm')) {
    $name = Get-SvclColumn $alias 'Name'
    $id = Get-SvclColumn $alias 'Command-Line Friendly ID'
    if (
      (Test-AudioTextMatch $Expected $name) -or
      (Test-AudioTextMatch $Expected $id) -or
      (-not [string]::IsNullOrWhiteSpace($Hint) -and (Test-AudioTextMatch $Hint $name)) -or
      (-not [string]::IsNullOrWhiteSpace($Hint) -and (Test-AudioTextMatch $Hint $id))
    ) {
      $verifiedLabel = if ($name) { $name } else { $id }
      Write-Output ("VERIFIED_DEFAULT_SVCL: " + $verifiedLabel)
      return $true
    }
  }
  return $false
}

$fxSoundTarget = (Test-FxSoundTarget ($DeviceName + ' ' + $DeviceHint))
if (-not $List.IsPresent -and $fxSoundTarget) {
  $null = Ensure-FxSoundProcess
  Start-Sleep -Milliseconds 900
}

if (-not $List.IsPresent -and -not [string]::IsNullOrWhiteSpace($DeviceName)) {
  $null = Test-SvclTargetActive $DeviceName
  if (Verify-SvclDefault -Expected $DeviceName -Hint $DeviceHint) { exit 0 }
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

function Get-CoreAudioSnapshot {
  try {
    return @([OsuSetupAudio.AudioSwitcher]::GetRenderDevicesAll())
  } catch {
    Write-Error ("Device list failed: " + $_.Exception.Message)
    exit 12
  }
}

function Format-CoreAudioDevices($Devices) {
  $items = @()
  foreach ($device in $Devices) {
    $items += ($device.Name + ' [' + $device.State.ToString() + ']')
  }
  return ($items -join ' | ')
}

function Resolve-CoreAudioTarget {
  param([string]$Expected, [string]$Hint = "")
  $devices = Get-CoreAudioSnapshot
  $match = Find-BestRenderDeviceMatch -Devices $devices -Expected $Expected -Hint $Hint
  return [PSCustomObject]@{ Devices = $devices; Match = $match }
}

function Wait-CoreAudioTargetActive {
  param([string]$Expected, [string]$Hint = "", [int]$Attempts = 12)
  for ($i = 0; $i -lt $Attempts; $i++) {
    $resolved = Resolve-CoreAudioTarget -Expected $Expected -Hint $Hint
    if ($null -ne $resolved.Match -and $resolved.Match.IsActive) { return $resolved }
    Start-Sleep -Milliseconds 450
  }
  return (Resolve-CoreAudioTarget -Expected $Expected -Hint $Hint)
}

$devices = Get-CoreAudioSnapshot

if ($List.IsPresent) {
  if ($devices.Count -eq 0) {
    Write-Output "NO_RENDER_DEVICES_FOUND"
    exit 0
  }

  foreach ($device in $devices) {
    $prefix = "DEVICE"
    if ($device.IsDefault) { $prefix = "DEFAULT" }
    Write-Output ($prefix + ": " + $device.Name + " [" + $device.State.ToString() + "]")
  }
  exit 0
}

if ([string]::IsNullOrWhiteSpace($DeviceName)) {
  Write-Error "DeviceName is empty. Press device list and copy part of the target device name."
  exit 2
}

$resolvedTarget = Resolve-CoreAudioTarget -Expected $DeviceName -Hint $DeviceHint
$matched = $resolvedTarget.Match

if ($null -eq $matched -and $fxSoundTarget) {
  $null = Ensure-FxSoundProcess
  $resolvedTarget = Wait-CoreAudioTargetActive -Expected $DeviceName -Hint $DeviceHint -Attempts 12
  $matched = $resolvedTarget.Match
}

if ($null -ne $matched -and -not $matched.IsActive) {
  Write-Output ("MATCHED_CORE_AUDIO_INACTIVE: " + $matched.Name + " [" + $matched.State.ToString() + "]")

  if (-not [string]::IsNullOrWhiteSpace($svclPath) -and (Test-Path $svclPath) -and ($matched.State.ToString() -match 'Disabled')) {
    try {
      & $svclPath /Enable $matched.Id 2>&1 | Out-Null
      Write-Output ("SVCL_ENABLE_ATTEMPT: " + $matched.Id)
    } catch {
      Write-Output ("SVCL_ENABLE_ATTEMPT_FAILED: " + $_.Exception.Message)
    }
  }

  if ($fxSoundTarget) { $null = Ensure-FxSoundProcess }
  $resolvedTarget = Wait-CoreAudioTargetActive -Expected $DeviceName -Hint $DeviceHint -Attempts 14
  $matched = $resolvedTarget.Match
}

if ($null -eq $matched) {
  $queryTokens = ((Get-AudioTokens ($DeviceName + ' ' + $DeviceHint)) -join ', ')
  $available = Format-CoreAudioDevices $resolvedTarget.Devices
  Write-Error ("Device not found in Core Audio: " + $DeviceName + "; MATCH_TOKENS=" + $queryTokens + "; AVAILABLE_DEVICES=" + $available)
  exit 3
}

if (-not $matched.IsActive) {
  $available = Format-CoreAudioDevices $resolvedTarget.Devices
  Write-Error ("Target endpoint is not active: " + $matched.Name + "; STATE=" + $matched.State.ToString() + "; AVAILABLE_DEVICES=" + $available)
  exit 17
}

Write-Output ("MATCHED_CORE_AUDIO: " + $matched.Name + " [" + $matched.State.ToString() + "]")
Write-Output ("MATCH_TOKENS: " + ((Get-AudioTokens ($DeviceName + ' ' + $DeviceHint)) -join ', '))

if (-not [string]::IsNullOrWhiteSpace($svclPath) -and (Test-Path $svclPath)) {
  try {
    & $svclPath /SetDefault $matched.Id all 2>&1 | Out-Null
    Start-Sleep -Milliseconds 300
    if (Verify-SvclDefault -Expected $DeviceName -Hint $DeviceHint) {
      Write-Output ("SWITCHED_TO: " + $matched.Name)
      exit 0
    }
  } catch {
    Write-Output ("SVCL_RETRY_FAILED: " + $_.Exception.Message)
  }
}

try {
  [OsuSetupAudio.AudioSwitcher]::SetDefaultRenderDevice($matched.Id)
} catch {
  Write-Error ("Set default failed: " + $_.Exception.Message)
  exit 13
}

Start-Sleep -Milliseconds 300

try {
  $afterDevices = @([OsuSetupAudio.AudioSwitcher]::GetRenderDevices())
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