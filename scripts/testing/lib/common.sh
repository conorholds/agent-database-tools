#!/bin/bash

# Common functions for db-tools test suite
# Shared utilities used across all test scripts

# Colors for output (if not already defined)
RED=${RED:-'\033[0;31m'}
GREEN=${GREEN:-'\033[0;32m'}
YELLOW=${YELLOW:-'\033[1;33m'}
BLUE=${BLUE:-'\033[0;34m'}
NC=${NC:-'\033[0m'} # No Color

# Logging functions
info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

debug() {
    if [[ "$VERBOSE" == true ]]; then
        echo -e "${YELLOW}[DEBUG]${NC} $1"
    fi
}

# Test execution functions
test_command() {
    local test_name="$1"
    local command="$2"
    local expected_result="${3:-true}"
    
    echo -n "Testing $test_name... "
    
    if [[ "$VERBOSE" == true ]]; then
        echo
        debug "Command: $command"
    fi
    
    # Execute command and capture result
    if eval "$command" > /tmp/test_output.txt 2>&1; then
        local actual_result="true"
    else
        local actual_result="false"
    fi
    
    # Check result
    if [[ "$actual_result" == "$expected_result" ]]; then
        echo -e "${GREEN}✓${NC}"
        ((LAST_PASSED_TESTS++))
    else
        echo -e "${RED}✗${NC}"
        ((LAST_FAILED_TESTS++))
        if [[ "$VERBOSE" == true ]]; then
            error "Expected: $expected_result, Got: $actual_result"
            error "Output:"
            cat /tmp/test_output.txt | sed 's/^/    /'
        fi
    fi
    
    ((LAST_TOTAL_TESTS++))
    rm -f /tmp/test_output.txt
}

# Test group functions
start_test_group() {
    local group_name="$1"
    echo
    echo "=== $group_name ==="
    LAST_TOTAL_TESTS=0
    LAST_PASSED_TESTS=0
    LAST_FAILED_TESTS=0
}

end_test_group() {
    echo
    echo "Group Results: $LAST_PASSED_TESTS/$LAST_TOTAL_TESTS passed"
    if [[ $LAST_FAILED_TESTS -gt 0 ]]; then
        echo -e "${RED}$LAST_FAILED_TESTS tests failed${NC}"
    fi
}

# Database connection helpers
create_test_connections() {
    # Create PostgreSQL test connection
    cat > "$FIXTURES_DIR/postgres-test.json" << EOF
[
  {
    "name": "${TEST_PROJECT_PREFIX}_PG",
    "type": "postgres",
    "postgres_uri": "postgresql://localhost/db_tools_test_${RANDOM}?sslmode=disable"
  }
]
EOF

    # Create MongoDB test connection
    cat > "$FIXTURES_DIR/mongodb-test.json" << EOF
[
  {
    "name": "${TEST_PROJECT_PREFIX}_MONGO",
    "type": "mongodb",
    "mongodb_uri": "mongodb://localhost/db_tools_test_${RANDOM}"
  }
]
EOF
}

# Command execution helpers
run_db_tools() {
    if [[ "$VERBOSE" == true ]]; then
        db-tools "$@"
    else
        db-tools "$@" 2>/dev/null
    fi
}

# Cleanup helpers
cleanup_test_files() {
    local pattern="$1"
    find "$ROOT_DIR" -name "$pattern" -type f -delete 2>/dev/null || true
}

# Verification helpers
verify_output_contains() {
    local output="$1"
    local expected="$2"
    
    if echo "$output" | grep -q "$expected"; then
        return 0
    else
        return 1
    fi
}

verify_file_exists() {
    local file="$1"
    
    if [[ -f "$file" ]]; then
        return 0
    else
        return 1
    fi
}

# Safety test helpers
test_safety_command() {
    local test_name="$1"
    local command="$2"
    local should_require_confirmation="${3:-true}"
    
    echo -n "Testing $test_name (safety check)... "
    
    if [[ "$should_require_confirmation" == true ]]; then
        # Command should fail without --force
        if eval "$command" > /tmp/test_output.txt 2>&1; then
            echo -e "${RED}✗${NC} (should have required confirmation)"
            ((LAST_FAILED_TESTS++))
        else
            # Now try with --force
            if eval "$command --force" > /tmp/test_output.txt 2>&1; then
                echo -e "${GREEN}✓${NC}"
                ((LAST_PASSED_TESTS++))
            else
                echo -e "${RED}✗${NC} (failed even with --force)"
                ((LAST_FAILED_TESTS++))
            fi
        fi
    else
        test_command "$test_name" "$command" "true"
    fi
    
    ((LAST_TOTAL_TESTS++))
    rm -f /tmp/test_output.txt
}

# Wait for database operations
wait_for_postgres() {
    local max_attempts=30
    local attempt=1
    
    while ! pg_isready -q 2>/dev/null; do
        if [[ $attempt -gt $max_attempts ]]; then
            error "PostgreSQL not ready after $max_attempts attempts"
            return 1
        fi
        sleep 1
        ((attempt++))
    done
}

wait_for_mongodb() {
    local max_attempts=30
    local attempt=1
    
    while ! mongosh --quiet --eval "db.version()" > /dev/null 2>&1; do
        if [[ $attempt -gt $max_attempts ]]; then
            error "MongoDB not ready after $max_attempts attempts"
            return 1
        fi
        sleep 1
        ((attempt++))
    done
}

# Export functions for use in other scripts
export -f info success warning error debug
export -f test_command start_test_group end_test_group
export -f run_db_tools verify_output_contains verify_file_exists
export -f test_safety_command cleanup_test_files
export -f wait_for_postgres wait_for_mongodb