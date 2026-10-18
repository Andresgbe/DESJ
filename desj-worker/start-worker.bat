@echo off
rem Deja el worker de DESJ corriendo y lo reinicia si se cae. Log en worker.log.
cd /d "%~dp0"
:loop
echo [%date% %time%] Arrancando el worker de DESJ... >> worker.log
call npm run worker >> worker.log 2>&1
echo [%date% %time%] El worker se cortó, reintentando en 10 s... >> worker.log
timeout /t 10 /nobreak >nul
goto loop
