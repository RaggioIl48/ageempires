@echo off
chcp 65001 >nul
title Classroom Empires - crear icono en el escritorio
cd /d "%~dp0"
rem Crea en el escritorio dos accesos directos con el icono del juego:
rem   "Classroom Empires (aula)"   -> Jugar en el aula.bat  (red local de la escuela)
rem   "Classroom Empires (online)" -> Jugar online.bat      (tambien desde la casa, por internet)
rem Doble clic en el icono = arranca el servidor y abre el panel del profesor, como cualquier juego.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$d = [Environment]::GetFolderPath('Desktop'); $w = New-Object -ComObject WScript.Shell; $here = (Get-Location).Path;" ^
  "foreach ($p in @(@('Classroom Empires (aula)', 'Jugar en el aula.bat'), @('Classroom Empires (online)', 'Jugar online.bat'))) {" ^
  "  $s = $w.CreateShortcut((Join-Path $d ($p[0] + '.lnk'))); $s.TargetPath = (Join-Path $here $p[1]); $s.WorkingDirectory = $here;" ^
  "  $s.IconLocation = (Join-Path $here 'tools\icon\classroom-empires.ico') + ',0'; $s.Description = 'Classroom Empires: servidor del juego'; $s.Save() }"
if errorlevel 1 (
  echo.
  echo   No se pudo crear el icono. Puedes abrir el juego con doble clic en "Jugar en el aula.bat".
) else (
  echo.
  echo   Listo: en el escritorio estan "Classroom Empires (aula)" y "Classroom Empires (online)".
)
echo.
pause
