# Starts both services locally (SQLite). Usage: powershell -File backend\run_dev.ps1
$root = $PSScriptRoot
Get-Content "$root\.env" | Where-Object { $_ -match '^\s*[^#\s].*=' } | ForEach-Object {
  $k, $v = $_ -split '=', 2
  Set-Item -Path "Env:$($k.Trim())" -Value $v.Trim()
}
Start-Process python -ArgumentList '-m','uvicorn','main:app','--host','0.0.0.0','--port','8001' -WorkingDirectory "$root\pet-service"
Start-Process python -ArgumentList '-m','uvicorn','main:app','--host','0.0.0.0','--port','8002' -WorkingDirectory "$root\adoption-service"
Write-Host "pet-service :8001, adoption-service :8002"
Write-Host "Serve the frontend with:  cd frontend; python -m http.server 8080 --bind 0.0.0.0   then open http://localhost:8080"
