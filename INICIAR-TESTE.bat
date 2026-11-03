@echo off
rem Abre o site no computador para teste. Deixe esta janela aberta enquanto testa.
cd /d "%~dp0"
echo Iniciando o servidor de teste em http://localhost:8080/
echo Para encerrar, feche esta janela.
rem Abre o navegador 2 segundos depois, quando o servidor já estiver no ar.
start "" /min cmd /c "timeout /t 2 >nul & start http://localhost:8080/"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor-teste.ps1"
pause
