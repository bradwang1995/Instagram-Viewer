@echo off
setlocal
cd /d "%~dp0.."
node_modules\.bin\vite.cmd --host 127.0.0.1 --port 5173
