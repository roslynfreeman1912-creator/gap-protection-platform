@echo off
REM GAP Protection - Quick Launch Script
REM Professional Security Scanner for Windows

echo.
echo ========================================================================
echo   GAP PROTECTION - ENTERPRISE SECURITY SCANNER
echo   Professional Vulnerability Assessment Tool
echo ========================================================================
echo.

REM Check if virtual environment exists
if not exist ".venv" (
    echo [!] Virtual environment not found!
    echo [+] Creating virtual environment...
    python -m venv .venv
    echo [+] Virtual environment created
    echo.
)

REM Activate virtual environment
call .venv\Scripts\activate.bat

REM Check if dependencies are installed
echo [+] Checking dependencies...
python -c "import aiohttp, yaml, reportlab" 2>nul
if errorlevel 1 (
    echo [+] Installing dependencies...
    pip install -q aiohttp beautifulsoup4 pyyaml flask rich reportlab
    echo [+] Dependencies installed
    echo.
)

REM Display menu
:menu
echo.
echo ========================================================================
echo   MAIN MENU / HAUPTMENU
echo ========================================================================
echo.
echo   1. Run Full Scan / Vollstandigen Scan durchfuhren
echo   2. Run Quick Scan / Schnellen Scan durchfuhren
echo   3. View Last Results / Letzte Ergebnisse anzeigen
echo   4. Generate PDF Report / PDF-Bericht erstellen
echo   5. Check System Status / Systemstatus prufen
echo   6. Exit / Beenden
echo.
set /p choice="Select option / Option wahlen (1-6): "

if "%choice%"=="1" goto fullscan
if "%choice%"=="2" goto quickscan
if "%choice%"=="3" goto viewresults
if "%choice%"=="4" goto generatepdf
if "%choice%"=="5" goto checkstatus
if "%choice%"=="6" goto end
goto menu

:fullscan
echo.
echo [+] Starting Full Security Scan...
echo.
set /p target="Enter target URL / Ziel-URL eingeben: "
set /p client="Enter client name / Kundenname eingeben: "
echo.
echo [+] Scanning %target% for %client%...
python complete_scan.py %target% "%client%"
echo.
pause
goto menu

:quickscan
echo.
echo [+] Starting Quick Scan (Admin Panels + Sensitive Files)...
echo.
set /p target="Enter target URL / Ziel-URL eingeben: "
echo.
python -c "import asyncio; from advanced_scanner import AdvancedSecurityScanner; import aiohttp; async def quick(): scanner = AdvancedSecurityScanner('%target%'); async with aiohttp.ClientSession() as s: panels = await scanner.find_admin_panels(s); files = await scanner.find_sensitive_files(s); print(f'\n[+] Found {len(panels)} admin panels and {len(files)} sensitive files'); asyncio.run(quick())"
echo.
pause
goto menu

:viewresults
echo.
echo [+] Recent scan results:
echo.
dir /b /o-d scan_results_*.json 2>nul | findstr /n "^" | findstr "^[1-5]:"
echo.
set /p resultfile="Enter file number to view / Dateinummer zum Anzeigen: "
for /f "tokens=2 delims=:" %%i in ('dir /b /o-d scan_results_*.json ^| findstr /n "^" ^| findstr "^%resultfile%:"') do set file=%%i
if defined file (
    echo.
    type "%file%"
    echo.
) else (
    echo [!] File not found / Datei nicht gefunden
)
pause
goto menu

:generatepdf
echo.
echo [+] Generate PDF Report / PDF-Bericht erstellen
echo.
dir /b /o-d scan_results_*.json 2>nul | findstr /n "^" | findstr "^[1-5]:"
echo.
set /p resultfile="Enter file number / Dateinummer: "
for /f "tokens=2 delims=:" %%i in ('dir /b /o-d scan_results_*.json ^| findstr /n "^" ^| findstr "^%resultfile%:"') do set file=%%i
if defined file (
    set /p client="Enter client name / Kundenname: "
    echo.
    echo [+] Generating bilingual reports...
    python pdf_report_generator.py "%file%" "!client!" GAP-Protection-10.png
    echo.
) else (
    echo [!] File not found / Datei nicht gefunden
)
pause
goto menu

:checkstatus
echo.
echo ========================================================================
echo   SYSTEM STATUS / SYSTEMSTATUS
echo ========================================================================
echo.
echo [+] Python Version:
python --version
echo.
echo [+] Installed Packages / Installierte Pakete:
pip list | findstr "aiohttp yaml reportlab beautifulsoup4 flask"
echo.
echo [+] Vulnerability Payloads:
python -c "from advanced_scanner import AdvancedSecurityScanner; s = AdvancedSecurityScanner('http://test.com'); p = s.load_all_payloads(); print(f'Loaded {sum(len(v) for v in p.values())} payloads from {len(p)} categories')"
echo.
echo [+] Available Logos / Verfugbare Logos:
dir /b *GAP*.png 2>nul
echo.
echo [+] Recent Scans / Letzte Scans:
dir /b /o-d scan_results_*.json 2>nul | findstr /n "^" | findstr "^[1-3]:"
echo.
echo [+] Recent Reports / Letzte Berichte:
dir /b /o-d Security_Report_*.pdf 2>nul | findstr /n "^" | findstr "^[1-3]:"
echo.
pause
goto menu

:end
echo.
echo [+] Thank you for using GAP Protection Scanner!
echo [+] Vielen Dank fur die Nutzung des GAP Protection Scanners!
echo.
deactivate
exit /b 0
