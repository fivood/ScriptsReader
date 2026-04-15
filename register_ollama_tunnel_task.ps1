# Register Ollama SSH reverse tunnel as a hidden startup task
$TaskName = "ScriptsReader_OllamaTunnel"
$ScriptPath = Resolve-Path "$PSScriptRoot\start_ollama_tunnel.ps1"
$Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -File `"$ScriptPath`""
$Trigger = New-ScheduledTaskTrigger -AtLogOn
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -Hidden
$Principal = New-ScheduledTaskPrincipal -UserId "$env:USERNAME" -LogonType Interactive

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Force
Write-Host "Registered startup task: $TaskName" -ForegroundColor Green
Write-Host "To start now: Start-ScheduledTask -TaskName $TaskName"
Write-Host "To remove:    Unregister-ScheduledTask -TaskName $TaskName -Confirm:`$false"
