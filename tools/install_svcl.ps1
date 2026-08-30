param(
  [Parameter(Mandatory=$true)]
  [string]$ToolsDir
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$downloadUrl = 'https://www.nirsoft.net/utils/svcl-x64.zip'
$tempDir = Join-Path $env:TEMP ('osu_setup_svcl_' + [guid]::NewGuid().ToString('N'))
$zipPath = Join-Path $tempDir 'svcl-x64.zip'
$extractDir = Join-Path $tempDir 'extract'

New-Item -ItemType Directory -Force -Path $tempDir | Out-Null
New-Item -ItemType Directory -Force -Path $extractDir | Out-Null
New-Item -ItemType Directory -Force -Path $ToolsDir | Out-Null

Write-Output "Download: $downloadUrl"
Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath -UseBasicParsing

Write-Output "Extract: $zipPath"
Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force

$svcl = Get-ChildItem -Path $extractDir -Recurse -Filter 'svcl.exe' | Select-Object -First 1
if (-not $svcl) {
  throw 'svcl.exe was not found in the downloaded archive.'
}

Copy-Item -Path $svcl.FullName -Destination (Join-Path $ToolsDir 'svcl.exe') -Force

$readme = Get-ChildItem -Path $extractDir -Recurse -File | Where-Object { $_.Name -match 'readme|license|chm|txt' } | Select-Object -First 10
foreach ($file in $readme) {
  Copy-Item -Path $file.FullName -Destination (Join-Path $ToolsDir $file.Name) -Force -ErrorAction SilentlyContinue
}

Write-Output ('OK: svcl.exe installed to ' + (Join-Path $ToolsDir 'svcl.exe'))
