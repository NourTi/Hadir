@echo off
title Hadir
where node >nul 2>nul || (echo Node.js is not installed. Install version 22.13 or newer from https://nodejs.org then run this file again. & pause & exit /b 1)
for /f "tokens=1 delims=v." %%a in ('node -v') do set MAJOR=%%a
echo Starting Hadir... leave this window open while you use it.
start "" http://localhost:3000
node --disable-warning=ExperimentalWarning server\index.js
pause
