# Deploy Edge Functions + push DB migrations + upload secrets.
#
# Auth (one of):
#   $env:SUPABASE_ACCESS_TOKEN = "sbp_..."   (personal access token from
#                                            https://supabase.com/dashboard/account/tokens)
#   ...or run: supabase login   (interactive, opens browser)
#
# Run:  powershell -File tooling/scripts/deploy-functions.ps1

param(
  [string]$ProjectRef = "your-project-ref",
  [string]$DbPassword = $env:SUPABASE_DB_PASSWORD
)

$ErrorActionPreference = "Stop"
$bundled = Join-Path $PSScriptRoot "supabase.exe"
$cmd = Get-Command supabase -ErrorAction SilentlyContinue
if (Test-Path $bundled) {
  $cli = $bundled
} elseif ($cmd) {
  $cli = $cmd.Source
} else {
  Write-Host "Supabase CLI not found. Install it with: npm install -D supabase" -ForegroundColor Red
  exit 1
}

# Sanity check auth
& $cli projects list > $null 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "Not authenticated. Set `$env:SUPABASE_ACCESS_TOKEN` or run: $cli login" -ForegroundColor Red
  exit 1
}

$functions = Get-ChildItem -Path "supabase/functions" -Directory |
  Where-Object { $_.Name -ne "_shared" } |
  Sort-Object Name |
  ForEach-Object { $_.Name }

# 1. Link project
Write-Host "`n[1/4] Linking project $ProjectRef ..." -ForegroundColor Cyan
if ($DbPassword) { & $cli link --project-ref $ProjectRef --password $DbPassword }
else             { & $cli link --project-ref $ProjectRef }

# 2. Push DB migrations
Write-Host "`n[2/4] Pushing DB migrations ..." -ForegroundColor Cyan
if ($DbPassword) { & $cli db push --password $DbPassword --include-all }
else             { & $cli db push --include-all }
if ($LASTEXITCODE -ne 0) { Write-Host "DB push failed" -ForegroundColor Red; exit 1 }

# 3. Upload function secrets from supabase/.env
if (Test-Path "supabase/.env") {
  Write-Host "`n[3/4] Uploading function secrets ..." -ForegroundColor Cyan
  $secretArgs = @()
  Get-Content "supabase/.env" | ForEach-Object {
    if ($_ -match "^\s*([A-Z0-9_]+)\s*=\s*(.+)$" -and
        $matches[1] -notmatch "^(SUPABASE_URL|SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_|EXPO_PUBLIC_)" -and
        -not $matches[2].Trim().EndsWith("REPLACE")) {
      $secretArgs += "$($matches[1])=$($matches[2].Trim())"
    }
  }
  if ($secretArgs.Count -gt 0) { & $cli secrets set @secretArgs }
}

# 4. Deploy each function
Write-Host "`n[4/4] Deploying functions ..." -ForegroundColor Cyan
$failed = @()
foreach ($fn in $functions) {
  Write-Host "  -> $fn" -ForegroundColor Gray
  & $cli functions deploy $fn --project-ref $ProjectRef
  if ($LASTEXITCODE -ne 0) { $failed += $fn }
}

Write-Host "`n──────── Deploy summary ────────" -ForegroundColor Green
Write-Host ("  Passed: {0}/{1}" -f ($functions.Count - $failed.Count), $functions.Count)
if ($failed.Count -gt 0) {
  Write-Host "  Failed: $($failed -join ', ')" -ForegroundColor Red
  exit 1
}
Write-Host "`nNext: npm run smoke" -ForegroundColor Yellow