#!/bin/bash
set -e

echo "Running comprehensive checks..."

# Create temp directory
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Run all checks in parallel
npm test -- --passWithNoTests --silent --watchAll=false > "$TEMP_DIR/frontend_test.log" 2>&1 &
FRONTEND_TEST_PID=$!
npm run lint > "$TEMP_DIR/frontend_lint.log" 2>&1 &
FRONTEND_LINT_PID=$!
npm run type-check > "$TEMP_DIR/frontend_type.log" 2>&1 &
FRONTEND_TYPE_PID=$!
npx tsx check-no-runtime-ids.ts > "$TEMP_DIR/no_runtime_ids.log" 2>&1 &
NO_RUNTIME_IDS_PID=$!

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

if ! wait $NO_RUNTIME_IDS_PID; then
    failed_checks+=("no-runtime-ids")
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
            "frontend-tests") echo "  npm test -- --maxWorkers=1" ;;
            "frontend-lint") echo "  npm run lint" ;;
            "frontend-types") echo "  npm run type-check" ;;
            "no-runtime-ids") echo "  npx tsx check-no-runtime-ids.ts" ;;
        esac
    done
    exit 1
fi