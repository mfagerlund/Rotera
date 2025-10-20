@echo off
setlocal enabledelayedexpansion

echo Running comprehensive checks...

:: Create temp files for output
set "frontend_test_log=%TEMP%\frontend_test.log"
set "frontend_lint_log=%TEMP%\frontend_lint.log"
set "frontend_type_log=%TEMP%\frontend_type.log"

:: Run all checks in parallel
start /b cmd /c "npm test -- --passWithNoTests --silent > "%frontend_test_log%" 2>&1 && echo PASS > "%frontend_test_log%.status" || echo FAIL > "%frontend_test_log%.status""
start /b cmd /c "npm run lint > "%frontend_lint_log%" 2>&1 && echo PASS > "%frontend_lint_log%.status" || echo FAIL > "%frontend_lint_log%.status""
start /b cmd /c "npm run type-check > "%frontend_type_log%" 2>&1 && echo PASS > "%frontend_type_log%.status" || echo FAIL > "%frontend_type_log%.status""

:: Wait for all processes to complete
:wait_loop
timeout /t 1 /nobreak >nul 2>&1
set "all_done=true"
if not exist "%frontend_test_log%.status" set "all_done=false"
if not exist "%frontend_lint_log%.status" set "all_done=false"
if not exist "%frontend_type_log%.status" set "all_done=false"
if "!all_done!"=="false" goto wait_loop

:: Check results
set "failed_checks="
set "all_passed=true"

for /f %%i in ('type "%frontend_test_log%.status"') do if "%%i"=="FAIL" (
    set "failed_checks=!failed_checks! frontend-tests"
    set "all_passed=false"
)
for /f %%i in ('type "%frontend_lint_log%.status"') do if "%%i"=="FAIL" (
    set "failed_checks=!failed_checks! frontend-lint"
    set "all_passed=false"
)
for /f %%i in ('type "%frontend_type_log%.status"') do if "%%i"=="FAIL" (
    set "failed_checks=!failed_checks! frontend-types"
    set "all_passed=false"
)

:: Output results
if "!all_passed!"=="true" (
    echo ✓ All checks passed
) else (
    echo ✗ Failed checks:!failed_checks!
    echo.
    echo Run individual commands (use Read tool with limit for large outputs):
    if "!failed_checks!" NEQ "!failed_checks:frontend-tests=!" echo   npm test -- --maxWorkers=1
    if "!failed_checks!" NEQ "!failed_checks:frontend-lint=!" echo   npm run lint
    if "!failed_checks!" NEQ "!failed_checks:frontend-types=!" echo   npm run type-check
)

:: Cleanup
del "%frontend_test_log%" "%frontend_test_log%.status" 2>nul
del "%frontend_lint_log%" "%frontend_lint_log%.status" 2>nul
del "%frontend_type_log%" "%frontend_type_log%.status" 2>nul

if "!all_passed!"=="false" exit /b 1