$ErrorActionPreference = "Stop"

function Assert-Command($Name, $InstallHint) {
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $cmd) {
    Write-Host "[FAIL] $Name not found. $InstallHint" -ForegroundColor Red
    exit 1
  }
  Write-Host "[OK] $Name found: $($cmd.Source)" -ForegroundColor Green
}

Assert-Command "supabase" "Run: npm install -D supabase"
Assert-Command "docker" "Install and start Docker Desktop."

try {
  docker info *> $null
  Write-Host "[OK] Docker daemon reachable" -ForegroundColor Green
} catch {
  Write-Host "[FAIL] Docker daemon is not reachable." -ForegroundColor Red
  Write-Host "Start Docker Desktop, wait until it says Running, then retry: npm run be:doctor" -ForegroundColor Yellow
  exit 1
}

if (-not (Test-Path "supabase/config.toml")) {
  Write-Host "[FAIL] supabase/config.toml missing. Run from repository root." -ForegroundColor Red
  exit 1
}
Write-Host "[OK] supabase/config.toml found" -ForegroundColor Green

if (-not (Test-Path "supabase/.env")) {
  Write-Host "[WARN] supabase/.env missing. Edge Functions may fail until secrets are added locally." -ForegroundColor Yellow
} else {
  Write-Host "[OK] supabase/.env found" -ForegroundColor Green
}

Write-Host "Local Supabase prerequisites look ready." -ForegroundColor Green
