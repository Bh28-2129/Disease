@echo off
REM ================================================================
REM  MedAI Predictor — Start All Services (Windows)
REM  Run this script from the project root to start everything
REM ================================================================

echo ========================================
echo  AI Disease Risk Prediction System
echo ========================================
echo.

REM Check if .env exists
if not exist "backend\.env" (
    echo [!] backend\.env not found.
    echo     Copying from .env.example...
    copy backend\.env.example backend\.env
    echo     Please edit backend\.env with your DATABASE_URL before running.
    echo.
    pause
    exit /b 1
)

REM Start Python ML API
echo [1/3] Starting Python ML API on port 5001...
start "ML Flask API" cmd /k "cd ml && (if not exist venv python -m venv venv) && venv\Scripts\activate && pip install -r requirements.txt -q && (if not exist diabetes_model.pkl python train_model.py) && python predict_api.py"

echo     Waiting 5 seconds for ML API to start...
timeout /t 5 /nobreak >nul

REM Start Node.js backend
echo [2/3] Starting Node.js backend on port 3001...
start "Node.js Backend" cmd /k "cd backend && npm install && npm run dev"

echo     Waiting 3 seconds for backend to start...
timeout /t 3 /nobreak >nul

REM Open browser
echo [3/3] Opening browser at http://localhost:3001 ...
start http://localhost:3001

echo.
echo ========================================
echo  All services started!
echo  Frontend: http://localhost:3001
echo  ML API:   http://localhost:5001
echo ========================================
echo  Close the two terminal windows to stop.
echo ========================================
