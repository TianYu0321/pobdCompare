@echo off
chcp 65001 >nul

set "REPO_ROOT=%~dp0"
powershell -ExecutionPolicy Bypass -File "%REPO_ROOT%scripts\start-workbench.ps1" %*
set EXITCODE=%ERRORLEVEL%
if %EXITCODE% neq 0 (
    echo.
    echo [INFO] Launch failed, exit code %EXITCODE%. Check output above.
    pause
)
exit /b %EXITCODE%
