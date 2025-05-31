#!/bin/bash

# Verify All Databases Script
# This script verifies all database environments against their schema

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
DB_TOOLS_DIR="$(dirname "$SCRIPT_DIR")"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Default project name
PROJECT_NAME="${1:-YDRV}"

echo -e "${YELLOW}=== Verifying All Databases for Project: $PROJECT_NAME ===${NC}\n"

# Array of environments to check
ENVIRONMENTS=("development" "staging" "production")

# Track overall results
TOTAL_ERRORS=0

# Verify each environment
for ENV in "${ENVIRONMENTS[@]}"; do
    echo -e "${YELLOW}Checking $ENV database...${NC}"
    
    # Run verification and capture exit code
    cd "$DB_TOOLS_DIR"
    node scripts/verify-database.js "$PROJECT_NAME" "$ENV"
    EXIT_CODE=$?
    
    if [ $EXIT_CODE -eq 0 ]; then
        echo -e "${GREEN}✓ $ENV database verification passed${NC}\n"
    else
        echo -e "${RED}✗ $ENV database verification failed${NC}\n"
        TOTAL_ERRORS=$((TOTAL_ERRORS + 1))
    fi
done

# Final summary
echo -e "${YELLOW}=== Final Summary ===${NC}"
if [ $TOTAL_ERRORS -eq 0 ]; then
    echo -e "${GREEN}✓ All databases match schema perfectly!${NC}"
    exit 0
else
    echo -e "${RED}✗ $TOTAL_ERRORS database(s) have errors${NC}"
    exit 1
fi