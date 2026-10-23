param()

$ErrorActionPreference = 'Stop'
$bridgeRoot = Split-Path -Parent $PSScriptRoot
$package = Get-Content -LiteralPath (Join-Path $bridgeRoot 'package.json') -Raw | ConvertFrom-Json
$version = [string]$package.version
$releaseRoot = Join-Path $bridgeRoot 'release'
$packageName = "FastLook-POS-Bridge-$version-windows-x64"
$stagingRoot = Join-Path $releaseRoot $packageName
$archivePath = Join-Path $releaseRoot "$packageName.zip"
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source

if ([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -ne 'X64') {
  throw 'El paquete debe generarse en Windows x64 para Windows 10/11 x64.'
}

if (Test-Path -LiteralPath $stagingRoot) { Remove-Item -LiteralPath $stagingRoot -Recurse -Force }
if (Test-Path -LiteralPath $archivePath) { Remove-Item -LiteralPath $archivePath -Force }

$null = New-Item -ItemType Directory -Path (Join-Path $stagingRoot 'app') -Force
$null = New-Item -ItemType Directory -Path (Join-Path $stagingRoot 'runtime') -Force
$null = New-Item -ItemType Directory -Path (Join-Path $stagingRoot 'tools') -Force

Copy-Item -Path (Join-Path $bridgeRoot 'dist\*') -Destination (Join-Path $stagingRoot 'app') -Recurse -Force
Copy-Item -LiteralPath $nodePath -Destination (Join-Path $stagingRoot 'runtime\node.exe') -Force
Copy-Item -LiteralPath (Join-Path $bridgeRoot 'windows\manage.ps1') -Destination (Join-Path $stagingRoot 'tools\manage.ps1') -Force
Copy-Item -LiteralPath (Join-Path $bridgeRoot 'windows\run-hidden.vbs') -Destination (Join-Path $stagingRoot 'tools\run-hidden.vbs') -Force
Copy-Item -Path (Join-Path $bridgeRoot 'windows\*.cmd') -Destination $stagingRoot -Force
Copy-Item -LiteralPath (Join-Path $bridgeRoot 'windows\README-WINDOWS.txt') -Destination $stagingRoot -Force

Compress-Archive -LiteralPath $stagingRoot -DestinationPath $archivePath -CompressionLevel Optimal
$installerTest = Join-Path $PSScriptRoot 'test-windows-installer.ps1'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installerTest -PackageRoot $stagingRoot
if ($LASTEXITCODE -ne 0) { throw "La prueba real del instalador fallo con codigo $LASTEXITCODE." }
$hash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash
[IO.File]::WriteAllText("$archivePath.sha256.txt", "$hash  $packageName.zip`r`n", [Text.UTF8Encoding]::new($false))

Write-Host "Paquete generado: $archivePath"
Write-Host "SHA-256: $hash"
