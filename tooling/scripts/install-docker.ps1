# Bootstrap Docker Desktop (must be run elevated).
# 1. Removes leftover C:\ProgramData\DockerDesktop (the cause of the previous install failure).
# 2. Downloads Docker Desktop installer if not cached.
# 3. Runs installer silently.
# 4. Launches Docker Desktop.

$ErrorActionPreference = "Stop"
$logFile = "$env:TEMP\docker-install.log"
function Log($msg) { Write-Host $msg; Add-Content $logFile $msg }

Log "=== Docker bootstrap started $(Get-Date) ==="

# 1. Clean leftover folder
$leftover = "C:\ProgramData\DockerDesktop"
if (Test-Path $leftover) {
  Log "Removing leftover $leftover ..."
  takeown /F $leftover /R /D Y | Out-Null
  icacls $leftover /grant Administrators:F /T /Q | Out-Null
  Remove-Item -Path $leftover -Recurse -Force
  Log "Removed."
} else {
  Log "No leftover folder to remove."
}

# 2. Download installer
$installer = "$env:TEMP\DockerDesktopInstaller.exe"
if (-not (Test-Path $installer) -or (Get-Item $installer).Length -lt 100MB) {
  Log "Downloading Docker Desktop installer (~700 MB)..."
  $ProgressPreference = "SilentlyContinue"
  Invoke-WebRequest "https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe" -OutFile $installer -UseBasicParsing
  Log "Downloaded: $((Get-Item $installer).Length / 1MB) MB"
} else {
  Log "Installer already cached at $installer"
}

# 3. Run installer silently
Log "Running installer (this can take 5-10 min)..."
Start-Process -FilePath $installer -ArgumentList "install","--quiet","--accept-license" -Wait -NoNewWindow
Log "Installer exited with code $LASTEXITCODE"

# 4. Launch Docker Desktop
$exe = "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
if (Test-Path $exe) {
  Log "Launching Docker Desktop..."
  Start-Process $exe
  Log "Done. Wait for the whale icon in the system tray to stop animating."
} else {
  Log "Docker Desktop.exe not found at expected path — install may have failed."
  Log "Check $logFile and try the installer manually."
  exit 1
}

Log "=== Bootstrap complete ==="
