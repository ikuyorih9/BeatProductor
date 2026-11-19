<#
.SYNOPSIS
  Roda TODOS os testes: backend (pytest), frontend (node:test + sintaxe) e E2E no navegador.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\test.ps1
#>
param([int]$Port = 8765)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $Root ".venv\Scripts\python.exe"
if (-not (Test-Path $Python)) { throw "Ambiente .venv não encontrado. Rode scripts\run.ps1 uma vez antes." }

function Invoke-Step([string]$Title, [scriptblock]$Block) {
  Write-Host "== $Title ==" -ForegroundColor Cyan
  & $Block
  if ($LASTEXITCODE -ne 0) { throw "Falhou: $Title" }
}

Invoke-Step "Dependências de teste" { & $Python -m pip install --disable-pip-version-check -q -r (Join-Path $Root "backend\requirements-dev.txt") }
Invoke-Step "Backend (pytest)" { Push-Location (Join-Path $Root "backend"); try { & $Python -m pytest } finally { Pop-Location } }
Invoke-Step "Frontend (node:test)" { Push-Location (Join-Path $Root "frontend"); try { npm test --silent } finally { Pop-Location } }
Invoke-Step "Frontend (sintaxe/imports)" { Push-Location (Join-Path $Root "frontend"); try { npm run check --silent } finally { Pop-Location } }

Write-Host "== E2E (navegador headless) ==" -ForegroundColor Cyan
$server = Start-Process -FilePath $Python -PassThru -WindowStyle Hidden -ArgumentList @(
  "-m", "uvicorn", "app.main:app", "--app-dir", (Join-Path $Root "backend"),
  "--host", "127.0.0.1", "--port", "$Port", "--log-level", "warning"
)
try {
  $ready = $false
  for ($i = 0; $i -lt 50 -and -not $ready; $i++) {
    try { Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$Port/api/health" | Out-Null; $ready = $true }
    catch { Start-Sleep -Milliseconds 200 }
  }
  if (-not $ready) { throw "O servidor não respondeu na porta $Port (ela pode estar em uso: tente -Port 8766)." }
  node (Join-Path $Root "tests\e2e\smoke.mjs") "http://127.0.0.1:$Port/" --export
  if ($LASTEXITCODE -ne 0) { throw "Falhou: E2E" }
} finally {
  Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "Todos os testes passaram." -ForegroundColor Green
