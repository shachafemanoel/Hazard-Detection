@echo off
echo 🚀 Starting Hazard Detection Application Locally
echo ==============================================

:: Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js not found. Please install Node.js 18+ from https://nodejs.org/
    pause
    exit /b 1
)

echo ✅ Node.js detected: 
node --version

:: Check if Redis is running (basic check)
echo 🔍 Checking for Redis...
timeout /t 1 >nul 2>&1

:: Check if .env file exists
if not exist "server\.env" (
    echo ⚠️  .env file not found. Creating basic .env file...
    if exist "server\.env.example" (
        copy "server\.env.example" "server\.env" >nul
    ) else (
        echo # Basic config for local development> server\.env
        echo REDIS_HOST=localhost>> server\.env
        echo REDIS_PORT=6379>> server\.env
        echo REDIS_PASSWORD=>> server\.env
        echo SESSION_SECRET=local-development-secret-key-change-in-production>> server\.env
        echo NODE_ENV=development>> server\.env
        echo PORT=3000>> server\.env
    )
    echo ✅ Created server\.env file. Edit it with your API keys if needed.
)

:: Install dependencies if needed
if not exist "node_modules" (
    echo 📦 Installing dependencies...
    npm install
)

:: Start the server
echo 🚀 Starting server on http://localhost:3000
echo    Press Ctrl+C to stop
echo.

npm start

pause