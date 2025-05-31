# DB-Tools Unified Test Suite

A comprehensive test framework for db-tools that consolidates all test scripts into a single, maintainable system.

## Overview

The unified test suite replaces the previous collection of individual test scripts with a modular, organized testing framework that supports both PostgreSQL and MongoDB.

## Usage

### Basic Usage

```bash
# Run all tests comprehensively
./scripts/testing/test-suite.sh --all

# Test specific database type
./scripts/testing/test-suite.sh --database postgres --level comprehensive
./scripts/testing/test-suite.sh --database mongodb --level basic

# Quick test run (essential features only)
./scripts/testing/test-suite.sh --database postgres --level quick
```

### Advanced Options

```bash
# Test specific commands only
./scripts/testing/test-suite.sh --database postgres --commands "backup,restore,search"

# Skip cleanup for debugging
./scripts/testing/test-suite.sh --database mongodb --skip-cleanup

# Verbose output for troubleshooting
./scripts/testing/test-suite.sh --database postgres --verbose
```

## Test Levels

- **quick**: Essential functionality only (~2 minutes)
  - Basic connectivity
  - Core command validation
  - Critical operations

- **basic**: Core commands and features (~5 minutes)
  - All quick tests
  - Schema modifications
  - Data operations
  - Backup/restore

- **comprehensive**: All features including edge cases (~10 minutes)
  - All basic tests
  - Advanced queries
  - Safety features
  - Complex operations
  - Edge cases

## Test Structure

```
testing/
├── test-suite.sh         # Main test runner
├── lib/
│   ├── common.sh        # Shared test utilities
│   ├── postgres-tests.sh # PostgreSQL-specific tests
│   └── mongodb-tests.sh  # MongoDB-specific tests
└── fixtures/            # Test data and configurations
```

## What's Tested

### PostgreSQL Tests
- Database initialization
- Table and column operations
- Index creation
- Query execution
- Backup and restore
- Migration support
- Search functionality
- Safety features (safe-delete, safe-remove-column, etc.)
- CASCADE protection
- Temporary backup system

### MongoDB Tests
- Collection management
- Document operations
- Field manipulation
- Index creation
- Aggregation pipelines
- Backup and restore
- Search across collections
- Nested field operations

### Safety Features
- Test database validation
- Automatic temporary backups
- CASCADE relationship warnings
- Confirmation requirements
- Dry-run capabilities

## Requirements

- PostgreSQL 16 client tools
- MongoDB Database Tools
- Bash 4.0+
- db-tools installed globally

## Running in CI/CD

The test suite is designed to work in automated environments:

```bash
# GitHub Actions example
- name: Run db-tools tests
  run: ./scripts/testing/test-suite.sh --all

# Jenkins example
sh './scripts/testing/test-suite.sh --database postgres --level comprehensive'
```

## Debugging Failed Tests

1. Use `--verbose` flag for detailed output
2. Use `--skip-cleanup` to inspect test databases
3. Check individual test output in verbose mode
4. Review test connection files in `fixtures/`

## Extending the Test Suite

To add new tests:

1. Add test functions to the appropriate module (`postgres-tests.sh` or `mongodb-tests.sh`)
2. Group tests by complexity level (essential, core, advanced)
3. Use the common test utilities from `common.sh`
4. Follow the existing naming conventions

Example:
```bash
test_postgres_new_feature() {
    local project_name="$1"
    local connect_file="$2"
    
    start_test_group "New Feature Tests"
    
    test_command "Test new command" \
        "run_db_tools new-command '$project_name' --connect '$connect_file'" \
        "true"
    
    end_test_group
}
```

## Migration from Old Test Scripts

The following deprecated scripts have been replaced:
- `test-tools.sh` → Unified test suite with `--database postgres`
- `test-mongodb.sh` → Unified test suite with `--database mongodb`
- `test-mongodb-comprehensive.sh` → Use `--level comprehensive`
- `test-restore.sh` → Included in core tests
- `test-search.sh` → Included in advanced tests

## Troubleshooting

### Test database not cleaned up
```bash
# Manually clean up test databases
dropdb db_tools_test_* --if-exists
mongosh --eval "db.getMongo().getDBNames().forEach(function(db){ if(db.match(/^db_tools_test_/)) { db.getSiblingDB(db).dropDatabase() } })"
```

### Permission errors
Ensure the test user has CREATE DATABASE permissions for PostgreSQL and appropriate MongoDB permissions.

### Connection failures
Check that both PostgreSQL and MongoDB services are running and accessible on localhost.