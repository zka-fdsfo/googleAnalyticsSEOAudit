@echo off
echo Starting SEO Audit Tool...

echo.
echo [1/2] Starting Backend...
start "SEO Audit Backend" cmd /k "cd backend && npm install && npm run dev"

timeout /t 3 >nul

echo.
echo [2/2] Starting Frontend...
start "SEO Audit Frontend" cmd /k "cd frontend && npm install && npm run dev"

echo.
echo Both servers starting...
echo Backend:  http://localhost:5000
echo Frontend: http://localhost:5173
echo.
echo Press any key to exit this window (servers will keep running)
pause >nul
