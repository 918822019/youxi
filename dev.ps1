$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$python = Join-Path $root 'backend\.venv\Scripts\python.exe'
$frontend = Join-Path $root 'frontend'

if (-not (Test-Path -LiteralPath $python)) {
    Write-Error "Backend venv not found. Run: python -m venv backend\.venv; backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt"
    exit 1
}

if (-not (Test-Path -LiteralPath (Join-Path $frontend 'node_modules'))) {
    Write-Error "Frontend dependencies not found. Run: npm install (in frontend)"
    exit 1
}

Start-Process -FilePath $python `
    -ArgumentList '-m', 'uvicorn', 'backend.api.main:app', '--reload', '--host', '127.0.0.1', '--port', '8018' `
    -WorkingDirectory $root

Start-Process -FilePath 'npm' `
    -ArgumentList 'run', 'dev' `
    -WorkingDirectory $frontend

Write-Host "Backend  -> http://127.0.0.1:8018 (reload on .py changes)"
Write-Host "Frontend -> http://127.0.0.1:5173 (HMR on src changes)"
