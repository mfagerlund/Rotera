#!/bin/bash
set -e

echo "Running comprehensive checks..."

# Create temp directory
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Run all checks in parallel
cd frontend
npm test -- --passWithNoTests --silent > "$TEMP_DIR/frontend_test.log" 2>&1 &
FRONTEND_TEST_PID=$!
npm run lint > "$TEMP_DIR/frontend_lint.log" 2>&1 &
FRONTEND_LINT_PID=$!
npm run type-check > "$TEMP_DIR/frontend_type.log" 2>&1 &
FRONTEND_TYPE_PID=$!

cd ../backend
python -m pytest --tb=short -x --maxfail=5 > "$TEMP_DIR/backend_test.log" 2>&1 &
BACKEND_TEST_PID=$!
python -m ruff check . > "$TEMP_DIR/backend_lint.log" 2>&1 &
BACKEND_LINT_PID=$!
python -m mypy pictorigo/ > "$TEMP_DIR/backend_type.log" 2>&1 &
BACKEND_TYPE_PID=$!
python -m black --check . > "$TEMP_DIR/backend_format.log" 2>&1 &
BACKEND_FORMAT_PID=$!

cd ..

# Wait for all processes and collect results
failed_checks=()
all_passed=true

if ! wait $FRONTEND_TEST_PID; then
    failed_checks+=("frontend-tests")
    all_passed=false
fi

if ! wait $FRONTEND_LINT_PID; then
    failed_checks+=("frontend-lint")
    all_passed=false
fi

if ! wait $FRONTEND_TYPE_PID; then
    failed_checks+=("frontend-types")
    all_passed=false
fi

if ! wait $BACKEND_TEST_PID; then
    failed_checks+=("backend-tests")
    all_passed=false
fi

if ! wait $BACKEND_LINT_PID; then
    failed_checks+=("backend-lint")
    all_passed=false
fi

if ! wait $BACKEND_TYPE_PID; then
    failed_checks+=("backend-types")
    all_passed=false
fi

if ! wait $BACKEND_FORMAT_PID; then
    failed_checks+=("backend-format")
    all_passed=false
fi

# Output results
if $all_passed; then
    echo "✓ All checks passed"
else
    echo "✗ Failed checks: ${failed_checks[*]}"
    echo
    echo "Run individual commands (use Read tool with limit for large outputs):"
    for check in "${failed_checks[@]}"; do
        case $check in
            "frontend-tests") echo "  cd frontend && npm test -- --maxWorkers=1" ;;
            "frontend-lint") echo "  cd frontend && npm run lint" ;;
            "frontend-types") echo "  cd frontend && npm run type-check" ;;
            "backend-tests") echo "  cd backend && python -m pytest --tb=short -x --maxfail=5" ;;
            "backend-lint") echo "  cd backend && python -m ruff check ." ;;
            "backend-types") echo "  cd backend && python -m mypy pictorigo/" ;;
            "backend-format") echo "  cd backend && python -m black --check ." ;;
        esac
    done
    exit 1
fi