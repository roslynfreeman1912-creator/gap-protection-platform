@echo off
REM GAP Protection Setup Script for Windows

echo 🛡️  GAP Protection - Setup Script
echo ==================================

REM Check Python
echo Checking Python version...
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Python not found. Please install Python 3.11+
    exit /b 1
)
echo ✅ Python found

REM Check Node.js
echo Checking Node.js version...
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js not found. Please install Node.js 18+
    exit /b 1
)
echo ✅ Node.js found

REM Create .env if not exists
if not exist .env (
    echo Creating .env file from template...
    copy .env.example .env
    echo ⚠️  Please edit .env and add your API keys!
)

REM Install Python dependencies
echo Installing Python dependencies...
pip install -e .

REM Install Node dependencies
echo Installing Node.js dependencies...
call npm install

REM Create necessary directories
echo Creating directories...
if not exist logs mkdir logs
if not exist reports mkdir reports
if not exist vuln mkdir vuln

echo.
echo ✅ Setup complete!
echo.
echo Next steps:
echo 1. Edit .env and add your API keys
echo 2. If using database: npm run db:push
echo 3. Start development: npm run dev
echo 4. Or build for production: npm run build ^&^& npm start

pause
