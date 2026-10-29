@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -File "%~dp0scripts\stop-personal.ps1"
if errorlevel 1 pause
