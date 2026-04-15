# Ollama SSH Reverse Tunnel Launcher
# Maps local Windows Ollama (127.0.0.1:11434) to server's 127.0.0.1:11434
param(
    [string]$ServerIp = "49.232.65.116",
    [string]$SshKey = "$PSScriptRoot\..\..\screader.pem",
    [string]$RemoteUser = "ubuntu",
    [int]$RemotePort = 11434,
    [int]$LocalPort = 11434
)

$KeyPath = Resolve-Path $SshKey -ErrorAction SilentlyContinue
if (-not $KeyPath) {
    Write-Error "SSH key not found: $SshKey"
    exit 1
}

Write-Host "Starting Ollama reverse tunnel..." -ForegroundColor Green
Write-Host "  Local  -> 127.0.0.1:$LocalPort"
Write-Host "  Remote -> $ServerIp`:$RemotePort (via SSH -R)"

# Use ssh -N (no shell) + keepalive to keep tunnel alive
$sshArgs = @(
    "-o", "ServerAliveInterval=60",
    "-o", "ServerAliveCountMax=3",
    "-o", "ExitOnForwardFailure=yes",
    "-o", "StrictHostKeyChecking=no",
    "-R", "127.0.0.1:${RemotePort}:127.0.0.1:${LocalPort}",
    "-N",
    "-i", $KeyPath.Path,
    "${RemoteUser}@${ServerIp}"
)

try {
    & ssh @sshArgs
} catch {
    Write-Error "Tunnel exited unexpectedly: $_"
    exit 1
}
