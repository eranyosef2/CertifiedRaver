# Updates this extension folder in place from GitHub — no git needed.
#
# Chrome's "Load unpacked" points at a folder path, so replacing the folder's
# *contents* and leaving the folder itself alone keeps Chrome working. You still
# have to click the reload arrow afterwards; Chrome does not watch the
# filesystem for unpacked extensions.
#
# Run it by right-clicking the file and choosing "Run with PowerShell", or:
#   powershell -ExecutionPolicy Bypass -File scripts\update.ps1

$ErrorActionPreference = "Stop"

$ZipUrl = "https://github.com/eranyosef2/CertifiedRaver/archive/refs/heads/main.zip"
$ExtDir = Split-Path -Parent $PSScriptRoot
$Tmp    = Join-Path ([System.IO.Path]::GetTempPath()) ("cr_" + [guid]::NewGuid().ToString("N"))

function Get-Version($path) {
  if (-not (Test-Path $path)) { return "unknown" }
  try { (Get-Content $path -Raw | ConvertFrom-Json).version } catch { "unknown" }
}

try {
  if (-not (Test-Path (Join-Path $ExtDir "manifest.json"))) {
    throw "No manifest.json in $ExtDir - is this script inside the extension folder?"
  }

  $old = Get-Version (Join-Path $ExtDir "manifest.json")
  Write-Host "Extension folder: $ExtDir"
  Write-Host "Currently:        v$old"
  Write-Host "Downloading..."

  New-Item -ItemType Directory -Path $Tmp -Force | Out-Null
  $zip = Join-Path $Tmp "main.zip"
  Invoke-WebRequest -Uri $ZipUrl -OutFile $zip -UseBasicParsing
  Expand-Archive -Path $zip -DestinationPath $Tmp -Force

  $src = Join-Path $Tmp "CertifiedRaver-main"
  if (-not (Test-Path (Join-Path $src "manifest.json"))) {
    throw "The download didn't contain a manifest.json - aborting rather than wiping your folder."
  }
  $new = Get-Version (Join-Path $src "manifest.json")

  # Replace tracked content only. Anything else in the folder is left alone.
  foreach ($entry in @("manifest.json","README.md","src","popup","icons","docs","scripts")) {
    $from = Join-Path $src $entry
    if (-not (Test-Path $from)) { continue }
    $to = Join-Path $ExtDir $entry
    if (Test-Path $to) { Remove-Item $to -Recurse -Force }
    Copy-Item $from $to -Recurse -Force
  }

  Write-Host "Updated:          v$new" -ForegroundColor Green
  Write-Host ""
  Write-Host "Now, in Chrome:"
  Write-Host "  1. chrome://extensions  ->  click the reload arrow on CertifiedRaver"
  Write-Host "  2. hard-reload the Skinrave tab (Ctrl + Shift + R)"
  Write-Host ""
  Write-Host "The console should then say: [CertifiedRaver] v$new loaded"
}
catch {
  Write-Host "Update failed: $_" -ForegroundColor Red
  Write-Host "Your existing folder has not been changed unless the copy step had already started."
  exit 1
}
finally {
  if (Test-Path $Tmp) { Remove-Item $Tmp -Recurse -Force -ErrorAction SilentlyContinue }
}

Write-Host ""
Read-Host "Press Enter to close"
