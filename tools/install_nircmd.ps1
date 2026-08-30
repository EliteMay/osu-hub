param(
  [Parameter(Mandatory=$true)]
  [string]$ToolsDir
)

$ErrorActionPreference = 'Stop'
$Url = 'https://www.nirsoft.net/utils/nircmd-x64.zip'
$DownloadDir = Join-Path $ToolsDir '_nircmd_download'
$ExtractDir = Join-Path $ToolsDir 'nircmd_package'
$ZipPath = Join-Path $DownloadDir 'nircmd-x64.zip'

try {
  New-Item -ItemType Directory -Force -Path $ToolsDir | Out-Null
  New-Item -ItemType Directory -Force -Path $DownloadDir | Out-Null

  Write-Output "Downloading NirCmd from official site..."
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Invoke-WebRequest -Uri $Url -OutFile $ZipPath -UseBasicParsing

  if (Test-Path $ExtractDir) {
    Remove-Item -Path $ExtractDir -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $ExtractDir | Out-Null

  Write-Output "Extracting NirCmd package..."
  Expand-Archive -Path $ZipPath -DestinationPath $ExtractDir -Force

  $NirCmdC = Get-ChildItem -Path $ExtractDir -Filter 'nircmdc.exe' -File -Recurse | Select-Object -First 1
  if (-not $NirCmdC) {
    throw 'nircmdc.exe was not found in the downloaded package.'
  }

  Copy-Item -Path $NirCmdC.FullName -Destination (Join-Path $ToolsDir 'nircmdc.exe') -Force

  $NirCmd = Get-ChildItem -Path $ExtractDir -Filter 'nircmd.exe' -File -Recurse | Select-Object -First 1
  if ($NirCmd) {
    Copy-Item -Path $NirCmd.FullName -Destination (Join-Path $ToolsDir 'nircmd.exe') -Force
  }

  $NoticePath = Join-Path $ToolsDir 'NirCmd_source_notice.txt'
  @(
    'NirCmd is downloaded from the official NirSoft site.',
    'Official page: https://www.nirsoft.net/utils/nircmd.html',
    'Downloaded zip: https://www.nirsoft.net/utils/nircmd-x64.zip',
    'The original extracted package is stored in tools\nircmd_package when available.',
    'This launcher uses nircmdc.exe for setdefaultsounddevice.'
  ) | Set-Content -Path $NoticePath -Encoding UTF8

  Write-Output "OK: nircmdc.exe installed."
  Write-Output (Join-Path $ToolsDir 'nircmdc.exe')
  exit 0
}
catch {
  Write-Error $_.Exception.Message
  exit 1
}
