#!/bin/bash

# PostgreSQL-specific tests for db-tools
# This module contains all PostgreSQL test cases organized by complexity level

# Setup PostgreSQL test database
setup_postgres_test_db() {
    local project_name="$1"
    local connect_file="$2"
    
    info "Setting up PostgreSQL test database..."
    
    # Extract database name from connection file
    local db_name=$(grep -o 'db_tools_test_[0-9]*' "$connect_file" | head -1)
    
    # Create test database
    createdb "$db_name" 2>/dev/null || true
    
    # Initialize with schema
    test_command "Initialize database" \
        "run_db_tools init '$project_name' --connect '$connect_file' --force" \
        "true"
}

# Teardown PostgreSQL test database
teardown_postgres_test_db() {
    local project_name="$1"
    local connect_file="$2"
    
    info "Cleaning up PostgreSQL test database..."
    
    # Extract database name
    local db_name=$(grep -o 'db_tools_test_[0-9]*' "$connect_file" | head -1)
    
    # Drop test database
    dropdb "$db_name" --if-exists 2>/dev/null || true
}

# Essential tests (quick level)
test_postgres_essential() {
    local project_name="$1"
    local connect_file="$2"
    
    start_test_group "PostgreSQL Essential Tests"
    
    # Connection and basic operations
    test_command "List databases" \
        "run_db_tools list-databases '$project_name' --connect '$connect_file'" \
        "true"
    
    test_command "List tables" \
        "run_db_tools list-tables '$project_name' --connect '$connect_file'" \
        "true"
    
    test_command "Check database structure" \
        "run_db_tools check '$project_name' --connect '$connect_file'" \
        "true"
    
    end_test_group
}

# Core functionality tests (basic level)
test_postgres_core() {
    local project_name="$1"
    local connect_file="$2"
    
    start_test_group "PostgreSQL Core Tests"
    
    # Schema modifications
    test_command "Add column" \
        "run_db_tools add-column '$project_name' users test_column 'VARCHAR(255)' --connect '$connect_file' --force" \
        "true"
    
    test_command "List columns after add" \
        "run_db_tools list-columns '$project_name' users --connect '$connect_file' | grep -q test_column" \
        "true"
    
    test_command "Create index" \
        "run_db_tools create-index '$project_name' users test_column --connect '$connect_file' --force" \
        "true"
    
    # Data operations
    test_command "Count records" \
        "run_db_tools count-records '$project_name' users --connect '$connect_file'" \
        "true"
    
    test_command "Execute SELECT query" \
        "run_db_tools query '$project_name' 'SELECT COUNT(*) FROM users' --connect '$connect_file' --force" \
        "true"
    
    # Backup and restore
    local backup_file="$ROOT_DIR/backups/test_backup_$$.sql"
    test_command "Backup database" \
        "run_db_tools backup '$project_name' --connect '$connect_file' --output '$backup_file' --force" \
        "true"
    
    test_command "Verify backup file" \
        "verify_file_exists '$backup_file'" \
        "true"
    
    # Clean up backup
    rm -f "$backup_file"
    
    end_test_group
}

# Advanced tests (comprehensive level)
test_postgres_advanced() {
    local project_name="$1"
    local connect_file="$2"
    
    start_test_group "PostgreSQL Advanced Tests"
    
    # Complex schema operations (use unique column names not added in basic tests)
    test_command "Add column with constraints" \
        "run_db_tools add-column '$project_name' users phone 'VARCHAR(20)' --default '+1-555-0000' --connect '$connect_file' --force" \
        "true"
    
    test_command "Add timestamp column" \
        "run_db_tools add-column '$project_name' users last_login 'TIMESTAMP' --connect '$connect_file' --force" \
        "true"
    
    # Insert test data for search functionality
    run_db_tools query "$project_name" "INSERT INTO users (name, email) VALUES ('Test User', 'test@example.com')" --connect "$connect_file" --force > /dev/null 2>&1
    
    # Search functionality
    test_command "Search across database" \
        "run_db_tools search '$project_name' 'test' --connect '$connect_file' --limit 10" \
        "true"
    
    test_command "Search with regex" \
        "run_db_tools search '$project_name' --regex '^test.*' --connect '$connect_file' --limit 5" \
        "true"
    
    # Migrations
    local migration_file="$FIXTURES_DIR/test_migration.sql"
    cat > "$migration_file" << 'EOF'
-- Test migration
CREATE TABLE IF NOT EXISTS test_migration_table (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO test_migration_table (name) VALUES ('test1'), ('test2');
EOF
    
    test_command "Run migration" \
        "run_db_tools migrate '$project_name' '$migration_file' --connect '$connect_file' --force" \
        "true"
    
    test_command "Verify migration" \
        "run_db_tools list-tables '$project_name' --connect '$connect_file' | grep -q test_migration_table" \
        "true"
    
    # Cleanup
    rm -f "$migration_file"
    
    # Add JSONB column and data for JSON search test
    run_db_tools add-column "$project_name" users settings "JSONB" --connect "$connect_file" --force > /dev/null 2>&1
    run_db_tools query "$project_name" "UPDATE users SET settings = '{\"theme\": \"dark\", \"language\": \"en\"}' WHERE name = 'Test User'" --connect "$connect_file" --force > /dev/null 2>&1
    
    # JSON operations
    test_command "Search in JSON fields" \
        "run_db_tools search '$project_name' 'settings:theme' --connect '$connect_file'" \
        "true"
    
    # Complex queries
    test_command "Execute complex query" \
        "run_db_tools query '$project_name' 'SELECT COUNT(*) as total, MAX(id) as max_id FROM users' --connect '$connect_file' --json --force" \
        "true"
    
    end_test_group
}

# Safety feature tests
test_postgres_safety() {
    local project_name="$1"
    local connect_file="$2"
    
    start_test_group "PostgreSQL Safety Tests"
    
    # Create a test table for safety operations
    run_db_tools query "$project_name" "CREATE TABLE safety_test (id SERIAL PRIMARY KEY, data TEXT)" --connect "$connect_file" --force > /dev/null 2>&1
    
    # Test delete table (regular command with confirmation)
    test_command "Delete table with confirmation" \
        "run_db_tools delete-table '$project_name' safety_test --connect '$connect_file' --force" \
        "true"
    
    # Create table with foreign key for CASCADE testing
    run_db_tools query "$project_name" "CREATE TABLE parent_table (id SERIAL PRIMARY KEY)" --connect "$connect_file" --force > /dev/null 2>&1
    run_db_tools query "$project_name" "CREATE TABLE child_table (id SERIAL PRIMARY KEY, parent_id INT REFERENCES parent_table(id) ON DELETE CASCADE)" --connect "$connect_file" --force > /dev/null 2>&1
    
    # Test CASCADE relationship detection
    test_command "CASCADE protection warning" \
        "run_db_tools list-columns '$project_name' child_table --connect '$connect_file' 2>&1 | grep -q 'parent_id'" \
        "true"
    
    # Test column removal
    run_db_tools add-column "$project_name" users temp_column "TEXT" --connect "$connect_file" --force > /dev/null 2>&1
    
    test_command "Remove column with validation" \
        "run_db_tools remove-column '$project_name' users temp_column --connect '$connect_file' --force" \
        "true"
    
    # Test temporary backups
    test_command "List temporary backups" \
        "run_db_tools list-temp-backups" \
        "true"
    
    # Test validation
    test_command "Validate configuration" \
        "run_db_tools validate-config --connect '$connect_file'" \
        "true"
    
    # Clean up safety test tables
    run_db_tools query "$project_name" "DROP TABLE IF EXISTS child_table, parent_table CASCADE" --connect "$connect_file" --force > /dev/null 2>&1
    
    end_test_group
}

# Export test counts for main script
export LAST_TOTAL_TESTS
export LAST_PASSED_TESTS
export LAST_FAILED_TESTS