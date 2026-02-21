# Avukatım - Windows Smoke Test Runner
# Kullanım:
#   powershell -ExecutionPolicy Bypass -File scripts\smoke.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\smoke.ps1 https://senin-domainin.com

$ErrorActionPreference = "Stop"

# Output UTF-8 (Türkçe karakterler bozulmasın)
try {
  [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
} catch {}

$base = $args[0]
if ([string]::IsNullOrWhiteSpace($base)) {
  $base = "http://localhost:3000"
}

$env:BASE_URL = $base

Write-Host "Running smoke tests against $env:BASE_URL" -ForegroundColor Cyan

# Node gerekir
node -v | Out-Null

node scripts/smoke.mjs
