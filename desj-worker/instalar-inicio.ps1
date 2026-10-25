# Deja el cerebro de DESJ (este worker) arrancando solo cada vez que inicias sesión en Windows.
# Crea una tarea programada "DESJ worker" que corre start-worker.bat sin ventana (log en worker.log).
#
# Uso (desde desj-worker/, en PowerShell):
#   .\instalar-inicio.ps1           instala la tarea y arranca el worker ya
#   .\instalar-inicio.ps1 -Quitar   detiene el worker y borra la tarea
param([switch]$Quitar)

$ErrorActionPreference = 'Stop'
$Tarea = 'DESJ worker'
$Aqui = $PSScriptRoot

function Detener {
  if (Get-ScheduledTask -TaskName $Tarea -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask -TaskName $Tarea -ErrorAction SilentlyContinue
  }
  # Detener la tarea no siempre cierra los procesos hijos: se cierran el .bat, "npm run worker" y el node del
  # worker (su línea de comando no trae la carpeta, por eso se reconoce por "--no-warnings worker.js").
  Get-CimInstance Win32_Process |
    Where-Object { ($_.Name -in 'cmd.exe', 'node.exe') -and $_.CommandLine -and
      ($_.CommandLine -like '*start-worker.bat*' -or $_.CommandLine -like '*--no-warnings worker.js*' -or $_.CommandLine -like '*run worker*') } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 1
}

if ($Quitar) {
  Detener
  if (Get-ScheduledTask -TaskName $Tarea -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $Tarea -Confirm:$false
  }
  Write-Host 'Listo: el worker de DESJ ya no arranca solo.'
  exit 0
}

# --- Requisitos -------------------------------------------------------------
$faltan = @()
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  $faltan += 'Node.js 24 (https://nodejs.org)'
} elseif ([int]((node --version) -replace '^v(\d+).*', '$1') -lt 24) {
  $faltan += 'Node.js 24 o más nuevo (tienes ' + (node --version) + ')'
}
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
  $faltan += 'Claude Code de terminal: corre  irm https://claude.ai/install.ps1 | iex  y luego  claude  una vez para iniciar sesión'
}
$envFile = Join-Path $Aqui '.env'
if (-not (Test-Path $envFile) -or -not (Select-String -Path $envFile -Pattern '^DESJ_SUPABASE_SECRET_KEY=\S+' -Quiet)) {
  $faltan += 'desj-worker\.env con DESJ_SUPABASE_URL y DESJ_SUPABASE_SECRET_KEY (copia .env.example)'
}
if ($faltan) {
  Write-Host 'Antes de instalar falta:' -ForegroundColor Yellow
  $faltan | ForEach-Object { Write-Host "  - $_" }
  exit 1
}
if (-not (Test-Path (Join-Path $Aqui 'node_modules'))) {
  Write-Host 'Instalando dependencias del worker...'
  Push-Location $Aqui; try { npm ci } finally { Pop-Location }
}

# --- Tarea programada -------------------------------------------------------
# conhost --headless corre la consola sin mostrar ventana.
$bat = Join-Path $Aqui 'start-worker.bat'
$accion = New-ScheduledTaskAction -Execute 'conhost.exe' -Argument "--headless cmd.exe /c `"$bat`"" -WorkingDirectory $Aqui
$usuario = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$disparo = New-ScheduledTaskTrigger -AtLogOn -User $usuario
$disparo.Delay = 'PT30S'  # deja que la red se conecte primero
$ajustes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId $usuario -LogonType Interactive -RunLevel Limited

Detener
Register-ScheduledTask -TaskName $Tarea -Action $accion -Trigger $disparo -Settings $ajustes -Principal $principal `
  -Description 'Cerebro de DESJ: responde el chat de la app con Claude Code. Log en desj-worker\worker.log.' -Force | Out-Null
Start-ScheduledTask -TaskName $Tarea

Write-Host "Listo: el worker de DESJ está corriendo y arrancará solo al iniciar sesión." -ForegroundColor Green
Write-Host "Log: $(Join-Path $Aqui 'worker.log')"
