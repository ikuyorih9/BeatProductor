<#
.SYNOPSIS
  Compila launcher\BeatProductor.cs em BeatProductor.exe (na raiz do projeto).

.DESCRIPTION
  Usa o compilador C# do .NET Framework 4.x, que já vem instalado no Windows.
  Não precisa de Visual Studio nem de SDK.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File launcher\build.ps1
#>
$ErrorActionPreference = "Stop"
$Here = $PSScriptRoot
$Root = Split-Path -Parent $Here

$csc = @(
  "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe",
  "$env:WINDIR\Microsoft.NET\Framework\v4.0.30319\csc.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $csc) { throw "csc.exe (.NET Framework 4.x) não encontrado." }

$output = Join-Path $Root "BeatProductor.exe"
& $csc /nologo /target:exe /optimize+ /codepage:65001 /platform:anycpu `
  "/out:$output" "/win32icon:$(Join-Path $Here 'icon.ico')" (Join-Path $Here "BeatProductor.cs")
if ($LASTEXITCODE -ne 0) { throw "Falha na compilação." }
Write-Host "Gerado: $output" -ForegroundColor Green
