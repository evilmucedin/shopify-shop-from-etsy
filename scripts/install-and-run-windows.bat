@echo off
REM Windows double-click launcher: runs the PowerShell installer/runner.
setlocal
set SCRIPT_DIR=%~dp0
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%install-and-run-windows.ps1"
pause
