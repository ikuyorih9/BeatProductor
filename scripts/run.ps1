<#
.SYNOPSIS
  Inicia o Beat Productor (API + frontend) em http://127.0.0.1:8000

.DESCRIPTION
  Na primeira execução cria o ambiente virtual (.venv) e instala as dependências.

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

if (-not (Test-Path $Python)) {
  Write-Host "Criando ambiente virtual em .venv ..." -ForegroundColor Cyan
  python -m venv $Venv
  if ($LASTEXITCODE -ne 0) { throw "Falha ao criar o ambiente virtual. O Python 3.10+ está instalado?" }
}

Write-Host "Verificando dependências ..." -ForegroundColor Cyan
& $Python -m pip install --disable-pip-version-check -q -r (Join-Path $Root "backend\requirements.txt")
if ($LASTEXITCODE -ne 0) { throw "Falha ao instalar as dependências do backend." }

Write-Host ""
Write-Host "Beat Productor rodando em http://${BindHost}:${Port}  (Ctrl+C para parar)" -ForegroundColor Green
Write-Host ""
& $Python -m uvicorn app.main:app --app-dir (Join-Path $Root "backend") --host $BindHost --port $Port
