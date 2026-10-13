# Build a forwardable installer package on the Desktop.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build_install_package.ps1
#
# Produces, inside the output directory (Desktop by default):
#   dsh-startup-animation-<version>\      install.ps1 + the launcher + notes + plugin\
#   dsh-startup-animation-<version>.zip   the same thing, ready to forward
#
# The plugin payload defaults to the deployment this machine is actually running, so the
# package is by construction the configuration that has been tested here.

[CmdletBinding()]
param(
  [string]$PluginSource,
  [string]$OutDir,
  [string]$Version = 'v0.4.0'
)

$ErrorActionPreference = 'Stop'

if (-not $PluginSource) { $PluginSource = Join-Path $env:USERPROFILE '.dsh\startup-animation\plugin' }
if (-not $OutDir) { $OutDir = [Environment]::GetFolderPath('Desktop') }
if (-not (Test-Path (Join-Path $PluginSource 'plugin.mjs'))) { throw "plugin payload not found in $PluginSource" }
if (-not (Test-Path $OutDir)) { throw "output directory not found: $OutDir" }

$name = "dsh-startup-animation-$Version"
$folder = Join-Path $OutDir $name
$zip = Join-Path $OutDir "$name.zip"

Write-Host ''
Write-Host "Building $name" -ForegroundColor Cyan
Write-Host "  payload : $PluginSource"
Write-Host "  output  : $OutDir"

if (Test-Path $folder) { Remove-Item $folder -Recurse -Force }
New-Item -ItemType Directory -Force -Path $folder | Out-Null

# 1) plugin payload
Copy-Item $PluginSource (Join-Path $folder 'plugin') -Recurse -Force

# 2) installer (renamed to the name the launcher expects)
Copy-Item (Join-Path $PSScriptRoot 'install_startup_animation.ps1') (Join-Path $folder 'install.ps1') -Force

# 3) launcher + notes, copied without naming them (their names are not ASCII)
$packaging = Join-Path (Split-Path $PSScriptRoot -Parent) 'packaging'
Get-ChildItem -Path $packaging -File | ForEach-Object { Copy-Item $_.FullName (Join-Path $folder $_.Name) -Force }

# 4) zip (the folder itself, so it extracts as one directory)
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path $folder -DestinationPath $zip -Force

$files = (Get-ChildItem $folder -Recurse -File).Count
$size = [math]::Round((Get-Item $zip).Length / 1KB)
Write-Host ''
Write-Host "  folder : $folder  ($files files)" -ForegroundColor Green
Write-Host "  zip    : $zip  ($size KB)" -ForegroundColor Green
Get-ChildItem $folder | Select-Object -First 8 | ForEach-Object { Write-Host "    $($_.Name)" }
