# PharmaTrack-X Backend Startup Script
Set-Location "c:\Users\Admin\Desktop\PHARMA TRACK-X"
$env:PYTHONPATH = ".;backend;backend/packages/decision_module"
Write-Host "Starting PharmaTrack-X backend on http://127.0.0.1:8000 ..." -ForegroundColor Cyan
Write-Host "API Docs: http://127.0.0.1:8000/docs" -ForegroundColor Green
.\venv\Scripts\uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000