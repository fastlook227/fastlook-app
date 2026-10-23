param(
  [Parameter(Mandatory = $true)]
  [string]$PackageRoot
)

$ErrorActionPreference = 'Stop'
$PackageRoot = (Resolve-Path -LiteralPath $PackageRoot).ProviderPath
$testRoot = Join-Path ([IO.Path]::GetTempPath()) "Fast Look POS prueba $([Guid]::NewGuid().ToString('N'))"
$packageWithSpaces = Join-Path $testRoot 'Paquete portable con espacios'
$testLocalAppData = Join-Path $testRoot 'Local App Data'
$testInstallDir = Join-Path $testLocalAppData 'FastLookPOSBridge'
$testStartup = Join-Path $testRoot 'Inicio automatico con espacios'
$oldLocalAppData = $env:LOCALAPPDATA
$oldStartup = $env:FASTLOOK_POS_STARTUP_DIR
$oldNoPause = $env:FASTLOOK_POS_NO_PAUSE
$oldForce = $env:FASTLOOK_POS_FORCE

try {
  $null = New-Item -ItemType Directory -Path $packageWithSpaces -Force
  Copy-Item -Path (Join-Path $PackageRoot '*') -Destination $packageWithSpaces -Recurse -Force
  $null = New-Item -ItemType Directory -Path $testInstallDir -Force

  $config = [ordered]@{
    port = 17891
    token = 'token-prueba-instalador-32-caracteres'
    allowedOrigins = @('https://fastlook-app.vercel.app', 'http://localhost:3000')
    printer = [ordered]@{ name = 'IMPRESORA-INEXISTENTE-PRUEBA'; widthMm = 58; charactersPerLine = 32; encoding = 'windows-1252'; profile = 'escpos-generic' }
    drawer = [ordered]@{ enabled = $false; pin = 0; pulseOnMs = 100; pulseOffMs = 200 }
  }
  [IO.File]::WriteAllText((Join-Path $testInstallDir 'config.json'), ($config | ConvertTo-Json -Depth 6), [Text.UTF8Encoding]::new($false))

  $env:LOCALAPPDATA = $testLocalAppData
  $env:FASTLOOK_POS_STARTUP_DIR = $testStartup
  $env:FASTLOOK_POS_NO_PAUSE = '1'
  $env:FASTLOOK_POS_FORCE = '1'

  $installCommand = Join-Path $packageWithSpaces 'install.cmd'
  & $installCommand
  if ($LASTEXITCODE -ne 0) { throw "install.cmd termino con codigo $LASTEXITCODE" }

  foreach ($required in @('app\server.js', 'runtime\node.exe', 'tools\manage.ps1', 'config.json')) {
    if (-not (Test-Path -LiteralPath (Join-Path $testInstallDir $required))) { throw "La instalacion no genero $required" }
  }
  $shortcutPath = Join-Path $testStartup 'Fast Look POS Bridge.lnk'
  if (-not (Test-Path -LiteralPath $shortcutPath)) { throw 'No se genero el acceso directo de inicio automatico.' }
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($shortcutPath)
  if ($shortcut.WorkingDirectory -ne $testInstallDir) { throw "WorkingDirectory incorrecto: $($shortcut.WorkingDirectory)" }

  $headers = @{ 'X-FastLook-POS-Token' = [string]$config.token; Origin = 'https://fastlook-app.vercel.app' }
  $status = Invoke-RestMethod -Uri 'http://127.0.0.1:17891/status' -Headers $headers -TimeoutSec 6
  if (-not $status.bridgeDisponible) { throw 'El Bridge instalado no respondio correctamente.' }

  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $packageWithSpaces 'tools\manage.ps1') -Action Uninstall -StartupDirectory $testStartup
  if ($LASTEXITCODE -ne 0) { throw "uninstall termino con codigo $LASTEXITCODE" }
  if (Test-Path -LiteralPath $testInstallDir) { throw 'La desinstalacion no elimino la carpeta instalada.' }
  if (Test-Path -LiteralPath $shortcutPath) { throw 'La desinstalacion no elimino el acceso directo.' }

  Write-Host 'Prueba real de instalacion con espacios: OK' -ForegroundColor Green
} finally {
  $env:LOCALAPPDATA = $oldLocalAppData
  $env:FASTLOOK_POS_STARTUP_DIR = $oldStartup
  $env:FASTLOOK_POS_NO_PAUSE = $oldNoPause
  $env:FASTLOOK_POS_FORCE = $oldForce
  if (Test-Path -LiteralPath $testRoot) { Remove-Item -LiteralPath $testRoot -Recurse -Force }
}
