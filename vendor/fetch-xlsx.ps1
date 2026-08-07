$ErrorActionPreference = "Stop"

$uri = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"
$outFile = Join-Path $PSScriptRoot "xlsx.full.min.js"

Write-Host "Downloading pinned SheetJS xlsx@0.18.5..."
Invoke-WebRequest -Uri $uri -OutFile $outFile

if (-not (Test-Path $outFile)) {
  throw "SheetJS download did not create $outFile"
}

$size = (Get-Item $outFile).Length
if ($size -lt 800000) {
  Remove-Item $outFile -Force -ErrorAction SilentlyContinue
  throw "Downloaded SheetJS file is unexpectedly small ($size bytes)."
}

Write-Host "Saved vendor/xlsx.full.min.js ($size bytes)."
