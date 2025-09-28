@echo off
setlocal enabledelayedexpansion

echo Running comprehensive checks...

:: Create temp files for output
set "frontend_test_log=%TEMP%\frontend_test.log"
set "frontend_lint_log=%TEMP%\frontend_lint.log"
set "frontend_type_log=%TEMP%\frontend_type.log"
set "backend_test_log=%TEMP%\backend_test.log"
set "backend_lint_log=%TEMP%\backend_lint.log"
set "backend_type_log=%TEMP%\backend_type.log"
set "backend_format_log=%TEMP%\backend_format.log"

:: Run all checks in parallel
start /b cmd /c "cd frontend && npm test -- --passWithNoTests --silent > "%frontend_test_log%" 2>&1 && echo PASS > "%frontend_test_log%.status" || echo FAIL > "%frontend_test_log%.status""
start /b cmd /c "cd frontend && npm run lint > "%frontend_lint_log%" 2>&1 && echo PASS > "%frontend_lint_log%.status" || echo FAIL > "%frontend_lint_log%.status""
start /b cmd /c "cd frontend && npm run type-check > "%frontend_type_log%" 2>&1 && echo PASS > "%frontend_type_log%.status" || echo FAIL > "%frontend_type_log%.status""
start /b cmd /c "cd backend && python -m pytest --tb=short -x --maxfail=5 > "%backend_test_log%" 2>&1 && echo PASS > "%backend_test_log%.status" || echo FAIL > "%backend_test_log%.status""
start /b cmd /c "cd backend && python -m ruff check . > "%backend_lint_log%" 2>&1 && echo PASS > "%backend_lint_log%.status" || echo FAIL > "%backend_lint_log%.status""
start /b cmd /c "cd backend && python -m mypy pictorigo/ > "%backend_type_log%" 2>&1 && echo PASS > "%backend_type_log%.status" || echo FAIL > "%backend_type_log%.status""
start /b cmd /c "cd backend && python -m black --check . > "%backend_format_log%" 2>&1 && echo PASS > "%backend_format_log%.status" || echo FAIL > "%backend_format_log%.status""

:: Wait for all processes to complete
:wait_loop
timeout /t 1 /nobreak >nul 2>&1
set "all_done=true"
if not exist "%frontend_test_log%.status" set "all_done=false"
if not exist "%frontend_lint_log%.status" set "all_done=false"
if not exist "%frontend_type_log%.status" set "all_done=false"
if not exist "%backend_test_log%.status" set "all_done=false"
if not exist "%backend_lint_log%.status" set "all_done=false"
if not exist "%backend_type_log%.status" set "all_done=false"
if not exist "%backend_format_log%.status" set "all_done=false"
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
for /f %%i in ('type "%backend_test_log%.status"') do if "%%i"=="FAIL" (
    set "failed_checks=!failed_checks! backend-tests"
    set "all_passed=false"
)
for /f %%i in ('type "%backend_lint_log%.status"') do if "%%i"=="FAIL" (
    set "failed_checks=!failed_checks! backend-lint"
    set "all_passed=false"
)
for /f %%i in ('type "%backend_type_log%.status"') do if "%%i"=="FAIL" (
    set "failed_checks=!failed_checks! backend-types"
    set "all_passed=false"
)
for /f %%i in ('type "%backend_format_log%.status"') do if "%%i"=="FAIL" (
    set "failed_checks=!failed_checks! backend-format"
    set "all_passed=false"
)

:: Output results
if "!all_passed!"=="true" (
    echo ✓ All checks passed
) else (
    echo ✗ Failed checks:!failed_checks!
    echo.
    echo Run individual commands (use Read tool with limit for large outputs):
    if "!failed_checks!" NEQ "!failed_checks:frontend-tests=!" echo   cd frontend ^&^& npm test -- --maxWorkers=1
    if "!failed_checks!" NEQ "!failed_checks:frontend-lint=!" echo   cd frontend ^&^& npm run lint
    if "!failed_checks!" NEQ "!failed_checks:frontend-types=!" echo   cd frontend ^&^& npm run type-check
    if "!failed_checks!" NEQ "!failed_checks:backend-tests=!" echo   cd backend ^&^& python -m pytest --tb=short -x --maxfail=5
    if "!failed_checks!" NEQ "!failed_checks:backend-lint=!" echo   cd backend ^&^& python -m ruff check .
    if "!failed_checks!" NEQ "!failed_checks:backend-types=!" echo   cd backend ^&^& python -m mypy pictorigo/
    if "!failed_checks!" NEQ "!failed_checks:backend-format=!" echo   cd backend ^&^& python -m black --check .
)

:: Cleanup
del "%frontend_test_log%" "%frontend_test_log%.status" 2>nul
del "%frontend_lint_log%" "%frontend_lint_log%.status" 2>nul
del "%frontend_type_log%" "%frontend_type_log%.status" 2>nul
del "%backend_test_log%" "%backend_test_log%.status" 2>nul
del "%backend_lint_log%" "%backend_lint_log%.status" 2>nul
del "%backend_type_log%" "%backend_type_log%.status" 2>nul
del "%backend_format_log%" "%backend_format_log%.status" 2>nul

if "!all_passed!"=="false" exit /b 1