# Avukatım - Root smoke runner (Windows)
# Bu dosya sadece "kolay kullanım" için var:
#   powershell -ExecutionPolicy Bypass -File .\smoke.ps1
# veya:
#   powershell -ExecutionPolicy Bypass -File .\smoke.ps1 https://senin-domainin.com

$ErrorActionPreference = "Stop"

# UTF-8 output
try {
  [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
} catch {}

$base = $args[0]
if ([string]::IsNullOrWhiteSpace($base)) {
  $base = "http://localhost:3000"
}

$env:BASE_URL = $base

Write-Host "Running smoke tests against $env:BASE_URL" -ForegroundColor Cyan

# Delegate to the maintained script
powershell -ExecutionPolicy Bypass -File scripts\smoke.ps1 $env:BASE_URL
