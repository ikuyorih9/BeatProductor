<#
.SYNOPSIS
  Inicia o Beat Productor (API + frontend) em http://127.0.0.1:8000

.DESCRIPTION
  Na primeira execução cria o ambiente virtual (.venv) e instala as dependências.
  Precisa de um Python 3.12 a 3.14 (64 bits). Se não houver nenhum, usa o BeatProductor.exe,
  que instala um Python próprio automaticamente.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\run.ps1
  powershell -ExecutionPolicy Bypass -File scripts\run.ps1 -Port 9000
#>
param(
  [int]$Port = 8000,
  [string]$BindHost = "127.0.0.1"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Venv = Join-Path $Root ".venv"
$Python = Join-Path $Venv "Scripts\python.exe"

# Faixa suportada: as versões fixadas em backend/requirements.txt têm pacotes prontos para 3.12–3.14.
# Mantenha em sincronia com launcher/BeatProductor.cs e backend/pyproject.toml.
$MinMinor = 12
$MaxMinor = 14
$Probe = "import sys, struct, sysconfig; print(int(sys.version_info[0] == 3 and $MinMinor <= sys.version_info[1] <= $MaxMinor and struct.calcsize('P') == 8 and not sysconfig.get_config_var('Py_GIL_DISABLED')))"

function Test-Python([string]$Exe, [string[]]$Prefix = @()) {
  try {
    $out = & $Exe @Prefix -c $Probe 2>$null
    return ($LASTEXITCODE -eq 0 -and "$out".Trim() -eq "1")
  } catch { return $false }
}

if ((Test-Path $Python) -and -not (Test-Python $Python)) {
  Write-Host "O .venv foi criado com um Python fora da faixa 3.12–3.14 (ou está quebrado). Recriando ..." -ForegroundColor Yellow
  Remove-Item -Recurse -Force $Venv
}

if (-not (Test-Path $Python)) {
  $candidates = @(@{ Exe = (Join-Path $env:LOCALAPPDATA "BeatProductor\Python313\python.exe"); Args = @() })
  foreach ($minor in $MinMinor..$MaxMinor) { $candidates += @{ Exe = "py"; Args = @("-3.$minor") } }
  $candidates += @{ Exe = "python"; Args = @() }, @{ Exe = "python3"; Args = @() }
  $base = $candidates | Where-Object { Test-Python $_.Exe $_.Args } | Select-Object -First 1

  if (-not $base) {
    $launcher = Join-Path $Root "BeatProductor.exe"
    if (-not (Test-Path $launcher)) { throw "Nenhum Python 3.12–3.14 (64 bits) encontrado. Instale em https://www.python.org/downloads/" }
    Write-Host "Nenhum Python 3.12–3.14 encontrado; o BeatProductor.exe vai instalar um automaticamente." -ForegroundColor Yellow
    & $launcher --port $Port
    exit $LASTEXITCODE
  }

  Write-Host "Criando ambiente virtual em .venv ..." -ForegroundColor Cyan
  & $base.Exe @($base.Args) -m venv $Venv
  if ($LASTEXITCODE -ne 0) { throw "Falha ao criar o ambiente virtual." }
}

Write-Host "Verificando dependências ..." -ForegroundColor Cyan
& $Python -m pip install --disable-pip-version-check -q --only-binary :all: --retries 5 -r (Join-Path $Root "backend\requirements.txt")
if ($LASTEXITCODE -ne 0) { throw "Falha ao instalar as dependências do backend (verifique a internet)." }

Write-Host ""
Write-Host "Beat Productor rodando em http://${BindHost}:${Port}  (Ctrl+C para parar)" -ForegroundColor Green
Write-Host ""
& $Python -m uvicorn app.main:app --app-dir (Join-Path $Root "backend") --host $BindHost --port $Port
