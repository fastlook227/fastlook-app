param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('Install', 'Configure', 'Restart', 'Status', 'Uninstall')]
  [string]$Action,
  [string]$SourceRoot,
  [string]$StartupDirectory
)

$ErrorActionPreference = 'Stop'
$installDir = Join-Path $env:LOCALAPPDATA 'FastLookPOSBridge'
$configPath = Join-Path $installDir 'config.json'
$startupBase = if ($StartupDirectory) { $StartupDirectory } elseif ($env:FASTLOOK_POS_STARTUP_DIR) { $env:FASTLOOK_POS_STARTUP_DIR } else { [Environment]::GetFolderPath('Startup') }
$startupLink = Join-Path $startupBase 'Fast Look POS Bridge.lnk'
$bridgeUrl = 'http://127.0.0.1:17891'
$noPause = $env:FASTLOOK_POS_NO_PAUSE -eq '1'
$forceAction = $env:FASTLOOK_POS_FORCE -eq '1'

function Pause-IfInteractive {
  if (-not $noPause -and $Host.Name -eq 'ConsoleHost') { Write-Host ''; Read-Host 'Presiona ENTER para cerrar' | Out-Null }
}

function Write-Diagnostics {
  Write-Host '--- Diagnostico de instalacion ---' -ForegroundColor DarkCyan
  Write-Host "Accion: $Action"
  Write-Host "Script: $PSCommandPath"
  Write-Host "PowerShell: $($PSVersionTable.PSVersion)"
  Write-Host "Directorio actual: $((Get-Location).Path)"
  Write-Host "SourceRoot recibido: <$SourceRoot> (longitud: $($SourceRoot.Length))"
  Write-Host "Destino: $installDir"
  Write-Host "Inicio automatico: $startupLink"
  Write-Host '---------------------------------'
}

function Resolve-PackageRoot([string]$path) {
  if ([string]::IsNullOrWhiteSpace($path)) { throw 'SourceRoot esta vacio.' }
  $invalid = [IO.Path]::GetInvalidPathChars()
  if ($path.IndexOfAny($invalid) -ge 0) {
    $codes = ($path.ToCharArray() | ForEach-Object { 'U+{0:X4}' -f [int]$_ }) -join ' '
    throw "SourceRoot contiene caracteres no validos. Valor recibido: <$path>. Codigos: $codes"
  }
  try {
    return (Resolve-Path -LiteralPath $path -ErrorAction Stop).ProviderPath
  } catch {
    throw "No se pudo resolver SourceRoot <$path>: $($_.Exception.Message)"
  }
}

function Protect-Config {
  if (-not (Test-Path -LiteralPath $configPath)) { return }
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
  $acl = [Security.AccessControl.FileSecurity]::new()
  $acl.SetOwner($identity)
  $acl.SetAccessRuleProtection($true, $false)
  $rule = [Security.AccessControl.FileSystemAccessRule]::new($identity, 'FullControl', 'Allow')
  $acl.AddAccessRule($rule)
  Set-Acl -LiteralPath $configPath -AclObject $acl
}

function Save-Config([object]$config) {
  $json = $config | ConvertTo-Json -Depth 6
  [IO.File]::WriteAllText($configPath, "$json`r`n", [Text.UTF8Encoding]::new($false))
  Protect-Config
}

function Read-ExistingConfig {
  if (Test-Path -LiteralPath $configPath) {
    return Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
  }
  return $null
}

function Configure-Bridge {
  $existing = Read-ExistingConfig
  Write-Host 'CONFIGURACION DE FAST LOOK POS BRIDGE' -ForegroundColor Cyan
  Write-Host 'Impresoras detectadas en Windows:'
  try {
    $printers = @(Get-Printer | Sort-Object Name)
    if ($printers.Count -eq 0) { Write-Host '  No se detectaron impresoras.' -ForegroundColor Yellow }
    foreach ($printer in $printers) { Write-Host "  - $($printer.Name)" }
  } catch {
    Write-Host '  No fue posible consultar las impresoras. Puedes escribir el nombre manualmente.' -ForegroundColor Yellow
  }

  $defaultPrinter = if ($existing) { [string]$existing.printer.name } else { '' }
  do {
    $label = if ($defaultPrinter) { "Nombre exacto de la impresora [$defaultPrinter]" } else { 'Nombre exacto de la impresora' }
    $printerName = (Read-Host $label).Trim()
    if (-not $printerName) { $printerName = $defaultPrinter }
  } until ($printerName)

  $token = if ($existing) { [string]$existing.token } else { '' }
  $generateToken = -not $existing
  if ($existing) {
    $answer = (Read-Host '¿Generar un token local nuevo? [s/N]').Trim()
    $generateToken = $answer -match '^[sS]'
  }
  if ($generateToken) {
    $bytes = [byte[]]::new(32)
    $random = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $random.GetBytes($bytes) } finally { $random.Dispose() }
    $token = [Convert]::ToBase64String($bytes)
  }

  $drawerEnabled = if ($existing) { [bool]$existing.drawer.enabled } else { $false }
  $drawerAnswer = (Read-Host "¿Habilitar el cajon de dinero? [s/N] (actual: $drawerEnabled)").Trim()
  if ($drawerAnswer) { $drawerEnabled = $drawerAnswer -match '^[sS]' }
  $drawerPin = if ($existing) { [int]$existing.drawer.pin } else { 0 }
  if ($drawerEnabled) {
    $pinAnswer = (Read-Host "Pin ESC/POS, 0 o 1 [$drawerPin]").Trim()
    if ($pinAnswer) { $drawerPin = [int]$pinAnswer }
    if ($drawerPin -notin @(0, 1)) { throw 'El pin ESC/POS debe ser 0 o 1.' }
  }

  $config = [ordered]@{
    port = 17891
    token = $token
    allowedOrigins = @('https://fastlook-app.vercel.app', 'http://localhost:3000')
    printer = [ordered]@{
      name = $printerName
      widthMm = 58
      charactersPerLine = 32
      encoding = 'windows-1252'
      profile = 'escpos-generic'
    }
    drawer = [ordered]@{
      enabled = $drawerEnabled
      pin = $drawerPin
      pulseOnMs = 100
      pulseOffMs = 200
    }
  }
  Save-Config $config

  if ($generateToken) {
    try { Set-Clipboard -Value $token } catch {}
    Write-Host ''
    Write-Host 'TOKEN LOCAL (copiado al portapapeles):' -ForegroundColor Green
    Write-Host $token
    Write-Host 'Pegalo ahora en Configuracion POS de FAST LOOK. No se volvera a mostrar en las consultas de estado.'
  }
  Write-Host "Configuracion guardada y protegida para el usuario actual: $configPath" -ForegroundColor Green
}

function Get-OwnedBridgeProcess {
  $listener = Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort 17891 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $listener) { return $null }
  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)" -ErrorAction SilentlyContinue
  $expectedNode = Join-Path $installDir 'runtime\node.exe'
  if ($process -and $process.ExecutablePath -and ([IO.Path]::GetFullPath($process.ExecutablePath) -eq [IO.Path]::GetFullPath($expectedNode))) {
    return $process
  }
  throw "El puerto 17891 esta ocupado por otro proceso (PID $($listener.OwningProcess))."
}

function Stop-Bridge {
  $process = Get-OwnedBridgeProcess
  if ($process) {
    Stop-Process -Id $process.ProcessId -Force
    Start-Sleep -Milliseconds 500
  }
}

function Start-Bridge {
  if (-not (Test-Path -LiteralPath $configPath)) { throw 'Falta config.json. Ejecuta configure.cmd.' }
  if (-not (Get-OwnedBridgeProcess)) {
    Start-Process -FilePath "$env:WINDIR\System32\wscript.exe" -ArgumentList "`"$(Join-Path $installDir 'tools\run-hidden.vbs')`"" -WindowStyle Hidden
    Start-Sleep -Seconds 2
  }
  if (-not (Get-OwnedBridgeProcess)) {
    $logPath = Join-Path $installDir 'logs\bridge.log'
    $logDetail = if (Test-Path -LiteralPath $logPath) { (Get-Content -LiteralPath $logPath -Tail 10) -join ' | ' } else { 'No se genero bridge.log.' }
    throw "El Bridge no pudo iniciar. Detalle: $logDetail"
  }
}

function Show-Status {
  $config = Read-ExistingConfig
  if (-not $config) { throw 'El Bridge no esta configurado.' }
  $headers = @{ 'X-FastLook-POS-Token' = [string]$config.token }
  try {
    $status = Invoke-RestMethod -Uri "$bridgeUrl/status" -Headers $headers -TimeoutSec 6
    Write-Host 'Bridge: CONECTADO' -ForegroundColor Green
    Write-Host "Version: $($status.version)"
    Write-Host "Impresora: $($status.impresoraNombre)"
    Write-Host "Impresora disponible: $($status.impresoraDisponible)"
    Write-Host "Cajon configurado: $($status.cajonConfigurado)"
    Write-Host "Cajon disponible: $($status.cajonDisponible)"
  } catch {
    Write-Host 'Bridge: DESCONECTADO' -ForegroundColor Red
    Write-Host $_.Exception.Message
    throw
  }
}

function Create-StartupShortcut {
  $null = New-Item -ItemType Directory -Path $startupBase -Force
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($startupLink)
  $shortcut.TargetPath = "$env:WINDIR\System32\wscript.exe"
  $shortcut.Arguments = "`"$(Join-Path $installDir 'tools\run-hidden.vbs')`""
  $shortcut.WorkingDirectory = $installDir
  $shortcut.Description = 'Fast Look POS Bridge'
  $shortcut.Save()
}

try {
  switch ($Action) {
    'Install' {
      if (-not $SourceRoot) { throw 'No se indico la carpeta del paquete.' }
      Write-Diagnostics
      $SourceRoot = Resolve-PackageRoot $SourceRoot
      Write-Host "Paquete resuelto: $SourceRoot"
      foreach ($required in @('app\server.js', 'runtime\node.exe', 'tools\run-hidden.vbs')) {
        if (-not (Test-Path -LiteralPath (Join-Path $SourceRoot $required))) { throw "Paquete incompleto: falta $required" }
      }
      $null = New-Item -ItemType Directory -Path $installDir -Force
      Stop-Bridge
      foreach ($folder in @('app', 'runtime', 'tools')) {
        $destination = Join-Path $installDir $folder
        $null = New-Item -ItemType Directory -Path $destination -Force
        Copy-Item -Path (Join-Path $SourceRoot "$folder\*") -Destination $destination -Recurse -Force
      }
      Copy-Item -Path (Join-Path $SourceRoot '*.cmd') -Destination $installDir -Force
      Copy-Item -LiteralPath (Join-Path $SourceRoot 'README-WINDOWS.txt') -Destination $installDir -Force
      if (-not (Test-Path -LiteralPath $configPath)) { Configure-Bridge }
      Protect-Config
      Create-StartupShortcut
      Start-Bridge
      Write-Host "Fast Look POS Bridge instalado en: $installDir" -ForegroundColor Green
      Show-Status
    }
    'Configure' { Configure-Bridge; Stop-Bridge; Start-Bridge; Show-Status }
    'Restart' { Stop-Bridge; Start-Bridge; Show-Status }
    'Status' { Show-Status }
    'Uninstall' {
      if (-not $forceAction) {
        $confirmation = (Read-Host 'Escribe DESINSTALAR para eliminar el Bridge y su configuracion').Trim()
        if ($confirmation -cne 'DESINSTALAR') { Write-Host 'Operacion cancelada.'; break }
      }
      Stop-Bridge
      if (Test-Path -LiteralPath $startupLink) { Remove-Item -LiteralPath $startupLink -Force }
      Set-Location -LiteralPath $env:TEMP
      if (Test-Path -LiteralPath $installDir) { Remove-Item -LiteralPath $installDir -Recurse -Force }
      Write-Host 'Fast Look POS Bridge fue desinstalado. La configuracion local fue eliminada.' -ForegroundColor Green
    }
  }
} catch {
  Write-Host ''
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Tipo: $($_.Exception.GetType().FullName)" -ForegroundColor DarkRed
  Write-Host "Ubicacion: $($_.InvocationInfo.PositionMessage)" -ForegroundColor DarkRed
  Pause-IfInteractive
  exit 1
}

Pause-IfInteractive
