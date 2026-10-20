@echo off
chcp 65001 >nul
title Classroom Empires - aula (red local)
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js no esta instalado. Descargalo de https://nodejs.org ^(version LTS^), instalalo y vuelve a abrir este archivo.
  echo.
  pause
  exit /b 1
)
node scripts/classroom.mjs
pause
