#!/bin/bash

# MongoDB-specific tests for db-tools
# This module contains all MongoDB test cases organized by complexity level

# Setup MongoDB test database
setup_mongodb_test_db() {
    local project_name="$1"
    local connect_file="$2"
    
    info "Setting up MongoDB test database..."
    
    # MongoDB databases are created automatically on first use
    # Just verify connection
    test_command "Verify MongoDB connection" \
        "run_db_tools list-databases '$project_name' --connect '$connect_file'" \
        "true"
}

# Teardown MongoDB test database
teardown_mongodb_test_db() {
    local project_name="$1"
    local connect_file="$2"
    
    info "Cleaning up MongoDB test database..."
    
    # Extract database name
    local db_name=$(grep -o 'db_tools_test_[0-9]*' "$connect_file" | head -1)
    
    # Drop test database using mongosh
    mongosh "$db_name" --quiet --eval "db.dropDatabase()" 2>/dev/null || true
}

# Essential tests (quick level)
test_mongodb_essential() {
    local project_name="$1"
    local connect_file="$2"
    
    start_test_group "MongoDB Essential Tests"
    
    # Connection and basic operations
    test_command "List databases" \
        "run_db_tools list-databases '$project_name' --connect '$connect_file'" \
        "true"
    
    test_command "List collections (tables)" \
        "run_db_tools list-tables '$project_name' --connect '$connect_file'" \
        "true"
    
    # Create a test collection by inserting data
    test_command "Insert test document" \
        "run_db_tools query '$project_name' '{\"insert\": \"test_collection\", \"documents\": [{\"name\": \"test\", \"value\": 123}]}' --connect '$connect_file' --force" \
        "true"
    
    test_command "Count documents" \
        "run_db_tools count-records '$project_name' test_collection --connect '$connect_file'" \
        "true"
    
    end_test_group
}

# Core functionality tests (basic level)
test_mongodb_core() {
    local project_name="$1"
    local connect_file="$2"
    
    start_test_group "MongoDB Core Tests"
    
    # Collection operations
    test_command "Add collection" \
        "run_db_tools create-table '$project_name' users --connect '$connect_file' --force" \
        "true"
    
    test_command "List collections after add" \
        "run_db_tools list-tables '$project_name' --connect '$connect_file' | grep -q users" \
        "true"
    
    # Insert a test document so field operations have something to work with
    run_db_tools query "$project_name" '{"insert": "users", "documents": [{"name": "Test User"}]}' --connect "$connect_file" --force > /dev/null 2>&1
    
    # Field operations
    test_command "Add field to documents" \
        "run_db_tools add-column '$project_name' users email 'string' --connect '$connect_file' --force" \
        "true"
    
    test_command "Rename field" \
        "run_db_tools rename-column '$project_name' users email user_email --connect '$connect_file' --force" \
        "true"
    
    # Index operations
    test_command "Create index" \
        "run_db_tools create-index '$project_name' users user_email --connect '$connect_file' --force" \
        "true"
    
    # Query operations
    test_command "Execute find query" \
        "run_db_tools query '$project_name' '{\"find\": \"users\", \"filter\": {}}' --connect '$connect_file' --force" \
        "true"
    
    test_command "Count with detailed stats" \
        "run_db_tools count-records '$project_name' users --detailed --connect '$connect_file'" \
        "true"
    
    # Backup operations
    local backup_file="$ROOT_DIR/backups/mongo_test_backup_$$.gz"
    test_command "Backup database" \
        "run_db_tools backup '$project_name' --connect '$connect_file' --output '$backup_file' --force" \
        "true"
    
    test_command "Verify backup file" \
        "[[ -d '$backup_file' ]]" \
        "true"
    
    # Clean up backup (MongoDB creates a directory)
    rm -rf "$backup_file"
    
    end_test_group
}

# Advanced tests (comprehensive level)
test_mongodb_advanced() {
    local project_name="$1"
    local connect_file="$2"
    
    start_test_group "MongoDB Advanced Tests"
    
    # Complex document operations
    test_command "Insert complex documents" \
        "run_db_tools query '$project_name' '{\"insert\": \"products\", \"documents\": [{\"name\": \"Product 1\", \"price\": 29.99, \"tags\": [\"electronics\", \"mobile\"], \"specs\": {\"color\": \"black\", \"size\": \"medium\"}}]}' --connect '$connect_file' --force" \
        "true"
    
    # Search functionality
    test_command "Search across collections" \
        "run_db_tools search '$project_name' 'Product' --connect '$connect_file' --limit 10" \
        "true"
    
    test_command "Search with regex" \
        "run_db_tools search '$project_name' --regex '^Prod.*' --connect '$connect_file' --limit 5" \
        "true"
    
    test_command "Search in nested fields" \
        "run_db_tools search '$project_name' 'Product' --connect '$connect_file'" \
        "true"
    
    # Aggregation pipeline (with cursor option)
    test_command "Execute aggregation" \
        "run_db_tools query '$project_name' '{\"aggregate\": \"products\", \"pipeline\": [{\"\$group\": {\"_id\": null, \"avgPrice\": {\"\$avg\": \"\$price\"}}}], \"cursor\": {}}' --connect '$connect_file' --force" \
        "true"
    
    # Rename collection
    test_command "Rename collection" \
        "run_db_tools rename-collection '$project_name' products items --connect '$connect_file' --force" \
        "true"
    
    test_command "Verify rename" \
        "run_db_tools list-tables '$project_name' --connect '$connect_file' | grep -q items" \
        "true"
    
    # Field removal
    test_command "Remove field from documents" \
        "run_db_tools remove-field '$project_name' items tags --connect '$connect_file' --force" \
        "true"
    
    # Unique index
    test_command "Create unique index" \
        "run_db_tools create-index '$project_name' items name --unique --connect '$connect_file' --force" \
        "true"
    
    # Backup with encryption
    local encrypted_backup="$ROOT_DIR/backups/mongo_encrypted_$$.gz"
    test_command "Create encrypted backup" \
        "run_db_tools backup '$project_name' --connect '$connect_file' --output '$encrypted_backup' --encrypt --force" \
        "true"
    
    test_command "Verify encrypted backup and key" \
        "[[ -d '$encrypted_backup' ]]" \
        "true"
    
    # Clean up (MongoDB creates a directory for backups)
    rm -rf "$encrypted_backup" "${encrypted_backup}.key"
    
    # Delete collection
    test_command "Delete collection" \
        "run_db_tools delete-collection '$project_name' items --connect '$connect_file' --force" \
        "true"
    
    end_test_group
}

# MongoDB-specific safety tests
test_mongodb_safety() {
    local project_name="$1"
    local connect_file="$2"
    
    start_test_group "MongoDB Safety Tests"
    
    # Create test collection
    run_db_tools query "$project_name" '{"insert": "safety_test", "documents": [{"data": "important"}]}' --connect "$connect_file" --force > /dev/null 2>&1
    
    # Test safe operations (Note: MongoDB has fewer destructive operations than PostgreSQL)
    test_command "Delete collection with confirmation" \
        "echo 'n' | run_db_tools delete-collection '$project_name' safety_test --connect '$connect_file' 2>&1 | grep -q 'cancelled'" \
        "true"
    
    # Test field removal safety
    test_command "Remove field with dry-run" \
        "run_db_tools remove-field '$project_name' safety_test data --connect '$connect_file' --dry-run 2>&1 | grep -q 'would be removed'" \
        "true"
    
    # Test configuration validation
    test_command "Validate MongoDB configuration" \
        "run_db_tools validate-config --connect '$connect_file'" \
        "true"
    
    # Clean up
    run_db_tools delete-collection "$project_name" safety_test --connect "$connect_file" --force > /dev/null 2>&1
    
    end_test_group
}

# Export test counts for main script
export LAST_TOTAL_TESTS
export LAST_PASSED_TESTS
export LAST_FAILED_TESTS