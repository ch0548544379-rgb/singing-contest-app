$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $dir
Start-Process -FilePath (Join-Path $dir "node-runtime\node.exe") -ArgumentList '"server\server.js"' -WorkingDirectory $dir
Start-Sleep -Seconds 2
Start-Process "http://localhost:3000/control/"
