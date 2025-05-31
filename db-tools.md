# DB-Tools Usage Guide for Agents

> ⚠️ **CRITICAL SAFETY NOTICE** ⚠️
>
> **NEVER use the `query` command or direct SQL for destructive operations!**
>
> Always use database-specific commands and proper validations:
>
> - Use `delete-table` with proper confirmation instead of direct `DROP TABLE`
> - Use `remove-column` with validation instead of direct `ALTER TABLE ... DROP COLUMN`
> - Use `rename-table`/`rename-collection` instead of direct SQL/MongoDB operations
> - Always use `--force` carefully and understand the implications
>
> See the [Safety Instructions](#-critical-safety-instructions-) section for details.

This document provides instructions for Claude on how to interact with the globally installed version of db-tools to manage PostgreSQL and MongoDB databases.

## Command Structure

All commands follow this general pattern:

```
db-tools <command> [project] [args...] [options]
```

Where:

- `<command>` is the operation to perform
- `[project]` is the project name (e.g., "YDRV")
- `[args...]` are command-specific arguments
- `[options]` are optional flags/parameters

## 🚨 CRITICAL SAFETY INSTRUCTIONS 🚨

**NEVER use the query command or direct SQL for destructive operations!**

### ❌ DO NOT DO THIS:

```bash
# DANGEROUS - Never use these:
db-tools query "YDRV" "DROP TABLE users"
db-tools query "YDRV" "DELETE FROM orders WHERE id > 100"
db-tools query "YDRV" "TRUNCATE transactions"
db-tools query "YDRV" "ALTER TABLE users DROP COLUMN email"

# EXTREMELY DANGEROUS - CASCADE operations affect multiple tables:
db-tools query "YDRV" "DROP TABLE users CASCADE"  # Deletes ALL dependent data!
db-tools query "YDRV" "ALTER TABLE parent DROP COLUMN id CASCADE"  # Breaks ALL foreign keys!

# ALSO DANGEROUS:
db-tools migrate "YDRV" ./untested-migration.sql  # Could contain any SQL!
db-tools restore "YDRV" --input backup.sql  # Replaces entire database!
```

### ✅ ALWAYS USE PROPER COMMANDS:

```bash
# SAFE - Always use these database-specific commands:
db-tools delete-table "YDRV" users --force  # With confirmation
db-tools remove-column "YDRV" users email --force  # With validation
db-tools rename-table "YDRV" old_name new_name --force  # PostgreSQL
db-tools rename-collection "YDRV" old_name new_name --force  # MongoDB
db-tools restore "YDRV" --input backup_file
db-tools migrate "YDRV" migration.sql --force
```

### Why Use Safe Commands?

1. **Test Database Validation** - Operations are tested in an isolated copy first
2. **Automatic Backups** - Tables are backed up before deletion
3. **Dependency Analysis** - Shows foreign key relationships and cascade effects
4. **Data Loss Prevention** - Warns about rows that will be deleted
5. **Confirmation Required** - Must type the exact name to confirm dangerous operations

### Safety Command Options

- `--force` - Skip confirmation prompts (still performs validation)
- `--skip-safety` - Bypass safety validation (NEVER USE IN PRODUCTION)
- `--no-backup` - Skip backup creation (NOT RECOMMENDED)
- `--dry-run` - Preview changes without executing

## Core Operations

### 1. Database Information

#### List Databases

```bash
db-tools list-databases "YDRV"
# Alias: db-tools dbs "YDRV"
```

#### List Tables

```bash
db-tools list-tables "YDRV"
# Alias: db-tools tables "YDRV"
```

#### List Columns

```bash
db-tools list-columns "YDRV" <table_name>
# Alias: db-tools columns "YDRV" <table_name>
```

#### Count Records

```bash
db-tools count-records "YDRV" <table_name>
# Alias: db-tools count "YDRV" <table_name>

# Count with WHERE condition
db-tools count-records "YDRV" <table_name> --where "column = 'value'"

# Count all tables
db-tools count-records "YDRV" --all
```

### 2. Schema Modifications

#### Add Column

```bash
db-tools add-column "YDRV" <table_name> <column_name> <data_type> [options]

# Options:
# --default <value>: Set default value
# --null: Allow NULL values (default)
# --not-null: Disallow NULL values
# --force: Skip confirmation prompts

# Examples:
db-tools add-column "YDRV" users email "VARCHAR(255) NOT NULL UNIQUE"
db-tools add-column "YDRV" transactions amount "DECIMAL(10,2)" --default "0.0" --force
db-tools add-column "YDRV" transactions transaction_at "TIMESTAMP WITH TIME ZONE DEFAULT NOW()" --force
```

#### Remove Column (SAFE)

```bash
# ALWAYS use the safe version:
db-tools safe-remove-column "YDRV" <table_name> <column_name>

# Options:
# --force: Skip confirmation (still validates)
# --dry-run: Preview changes without executing

# DEPRECATED/DANGEROUS - Do not use:
# db-tools remove-column "YDRV" <table_name> <column_name>
```

#### Create Index

```bash
db-tools create-index "YDRV" <table_name> <column_name> [options]

# Options:
# --unique: Create a unique index
# --force: Skip confirmation prompts

# Example:
db-tools create-index "YDRV" transactions transaction_at --force
```

### 3. ⚠️ CASCADE WARNING - The Silent Data Killer

**CASCADE operations are the most dangerous** because they can delete data across multiple tables without explicit warnings:

```bash
# THIS SINGLE COMMAND CAN DELETE DATA IN MANY TABLES:
"DROP TABLE users CASCADE"  # Deletes users AND all tables with foreign keys to users!

# THIS CAN BREAK YOUR ENTIRE SCHEMA:
"ALTER TABLE parent DROP COLUMN id CASCADE"  # Removes column AND all foreign key constraints!
```

**What happened to us:** A single CASCADE operation unintentionally deleted data across multiple linked tables, causing significant data loss.

**ALWAYS:**

1. Check foreign key dependencies before any DROP operation
2. Use safe commands that show dependency analysis
3. Never add CASCADE without understanding ALL affected tables

### 4. Dangerous Operations (USE SAFE COMMANDS)

#### Delete Table (SAFE)

```bash
# ALWAYS use the safe version:
db-tools safe-delete-table "YDRV" <table_name>

# Features:
# - Tests deletion in isolated database first
# - Shows table info and dependencies
# - Creates automatic backup
# - Requires typing table name to confirm

# Options:
# --force: Skip confirmation (still validates)
# --dry-run: Preview without executing
# --no-backup: Skip backup (NOT RECOMMENDED)

# NEVER use direct SQL:
# db-tools query "YDRV" "DROP TABLE users"  # DANGEROUS!
```

#### Rename Table (SAFE)

```bash
# ALWAYS use the safe version:
db-tools safe-rename-table "YDRV" <old_name> <new_name>

# Options:
# --force: Skip confirmation
# --dry-run: Preview changes
```

#### Truncate Table (SAFE)

```bash
# ALWAYS use the safe version:
db-tools safe-truncate "YDRV" <table_name>

# Features:
# - Shows row count before truncation
# - Creates backup of data
# - Requires confirmation

# NEVER use:
# db-tools query "YDRV" "TRUNCATE transactions"  # DANGEROUS!
```

### 5. ⚠️ Query Command - Use With Extreme Caution

The `query` command allows arbitrary SQL execution and should ONLY be used for:

- SELECT queries for data analysis
- Complex read-only operations
- Emergency data recovery (with expert supervision)

```bash
# ✅ ACCEPTABLE uses of query command:
db-tools query "YDRV" "SELECT COUNT(*) FROM users WHERE created_at > '2024-01-01'"
db-tools query "YDRV" "SELECT * FROM orders JOIN users ON orders.user_id = users.id"

# ❌ NEVER use query for:
db-tools query "YDRV" "DELETE FROM..."     # Use safe commands instead!
db-tools query "YDRV" "DROP TABLE..."      # Use safe-delete-table!
db-tools query "YDRV" "TRUNCATE..."       # Use safe-truncate!
db-tools query "YDRV" "ALTER TABLE DROP..." # Use safe-remove-column!
```

### 6. Database Management

#### Initialize Database

```bash
db-tools init "YDRV" [options]

# Options:
# --force: Force re-creation of tables and skip confirmations
```

#### Run Migration (⚠️ CAUTION)

```bash
# ALWAYS review migration files before running!
cat migration.sql  # Review the SQL first!

# If migration contains DROP/DELETE/TRUNCATE, use safe-migrate:
db-tools safe-migrate "YDRV" <migration_file_path>

# Only for safe migrations (CREATE, INSERT, UPDATE):
db-tools migrate "YDRV" <migration_file_path> --force
```

**WARNING:** Migration files can contain ANY SQL including destructive operations!

#### Backup Database

```bash
db-tools backup "YDRV" [options]

# Options:
# --output <file>: Output file path
# --format <format>: 'plain' (SQL) or 'custom'
# --encrypt: Encrypt the backup
# --force: Skip confirmation prompts

# Example:
db-tools backup "YDRV" --output ./backups/yard-revision-backup.sql --force
```

#### Restore Database

```bash
db-tools restore "YDRV" --input <backup_file> [options]

# Options:
# --dry-run: Verify backup without restoring
```

### 4. Troubleshooting

#### Check Database Structure

```bash
db-tools check "YDRV"
```

## Working with Different Databases

All commands support the `-d, --database <name>` option to switch databases:

```bash
# Connect to a specific database
db-tools list-tables "YDRV" -d production

# Add column to staging database
db-tools add-column "YDRV" users test_column TEXT -d staging --force
```

## Tips for Claude

When working with databases through db-tools, follow these best practices:

1. **Always check first**: Before modifying, use `list-*` commands to verify the current state.

   ```bash
   db-tools list-columns "YDRV" users
   ```

2. **Use `--force` for automation**: When you need to execute commands without user confirmation.

   ```bash
   db-tools add-column "YDRV" users new_column TEXT --force
   ```

3. **Use custom connection files for testing**:

   ```bash
   db-tools list-tables "Test Project" --connect ./connect-test.json
   ```

4. **Always verify column existence before using it**:

   ```bash
   # Bad: Assuming column exists
   db-tools remove-column "YDRV" users email

   # Good: Check first, then use safe remove
   db-tools list-columns "YDRV" users
   db-tools safe-remove-column "YDRV" users email
   ```

5. **For complex SQL operations**: Create a migration file and use the migrate command:

   ```bash
   # Create migration file
   cat > migrations/123_complex_change.sql << EOF
   -- Update existing data
   UPDATE table SET column = value WHERE condition;

   -- Add new constraints
   ALTER TABLE table ADD CONSTRAINT name CHECK (condition);
   EOF

   # Run migration
   db-tools migrate "YDRV" ./migrations/123_complex_change.sql --force
   ```

6. **Dealing with transaction_at and other date columns**:

   - Always ensure `transaction_at` exists before running queries that use it
   - For new date columns, prefer `TIMESTAMP WITH TIME ZONE DEFAULT NOW()`
   - Create indexes for date columns used in WHERE clauses and GROUP BY operations

7. **PostgreSQL version compatibility**:
   - The tool requires PostgreSQL 16 client tools for compatibility with PostgreSQL 16 servers
   - Check version with: `db-tools check "YDRV"`

## Common Command Patterns

### Adding columns with foreign keys

```bash
db-tools add-column "YDRV" transactions admin_id "BIGINT REFERENCES users(id)" --force
```

### Setting up timestamp columns

```bash
db-tools add-column "YDRV" transactions transaction_at "TIMESTAMP WITH TIME ZONE DEFAULT NOW()" --force
```

### Creating text columns with defaults

```bash
db-tools add-column "YDRV" transactions admin_note "TEXT DEFAULT ''" --force
```

### Creating indexes for query performance

```bash
db-tools create-index "YDRV" transactions transaction_at --force
```

### MongoDB-Specific Operations

#### 🚨 MongoDB Safety Considerations

**NEVER use direct MongoDB commands for destructive operations!**

```bash
# ❌ DANGEROUS - Never use these MongoDB operations:
db-tools query "YDRV" '{"drop": "users"}' --force                    # Drops entire collection!
db-tools query "YDRV" '{"deleteMany": {"filter": {}}}' --force       # Deletes all documents!
db-tools query "YDRV" '{"dropDatabase": 1}' --force                  # Drops entire database!

# ✅ SAFE - Always use proper commands:
db-tools delete-collection "YDRV" users --force                      # With confirmation
db-tools remove-field "YDRV" users field_name --force               # With validation
```

#### Collection Management

```bash
# Create a collection (automatically created when adding documents)
db-tools query "YDRV" '{"insert": "new_collection", "documents": [{"name": "test"}]}' --force

# Rename a collection
db-tools rename-collection "YDRV" products items --force

# Delete a collection (SAFE - with confirmation)
db-tools delete-collection "YDRV" temp_collection --force

# Remove a field from all documents (SAFE - with validation)
db-tools remove-field "YDRV" users old_field --force

# Add field to documents (when collection has data)
db-tools add-column "YDRV" users new_field "string" --force

# Preview field removal without executing
db-tools remove-field "YDRV" users field_name --dry-run
```

#### MongoDB Document Operations (SAFE)

```bash
# Insert documents
db-tools query "YDRV" '{"insert": "users", "documents": [{"name": "John", "email": "john@example.com"}]}' --force

# Find documents
db-tools query "YDRV" '{"find": "users", "filter": {"name": "John"}}' --force

# Find with projection (specific fields only)
db-tools query "YDRV" '{"find": "users", "filter": {"active": true}, "projection": {"name": 1, "email": 1}}' --force

# Find with sorting and limiting
db-tools query "YDRV" '{"find": "users", "filter": {}, "sort": {"created_at": -1}, "limit": 10}' --force

# Update documents (SAFE - updates specific documents)
db-tools query "YDRV" '{"update": "users", "updates": [{"q": {"name": "John"}, "u": {"$set": {"email": "newemail@example.com"}}}]}' --force

# Update multiple documents
db-tools query "YDRV" '{"update": "users", "updates": [{"q": {"active": false}, "u": {"$set": {"status": "inactive"}}, "multi": true}]}' --force

# Upsert operation (update or insert)
db-tools query "YDRV" '{"update": "users", "updates": [{"q": {"email": "new@example.com"}, "u": {"$set": {"name": "New User"}}, "upsert": true}]}' --force

# Count documents in collection
db-tools count-records "YDRV" users --force

# Count with filter
db-tools query "YDRV" '{"count": "users", "query": {"active": true}}' --force
```

#### MongoDB Aggregation Pipelines

```bash
# Group by field and count
db-tools query "YDRV" '{"aggregate": "orders", "pipeline": [{"$group": {"_id": "$status", "count": {"$sum": 1}}}], "cursor": {}}' --force

# Match, group, and sort
db-tools query "YDRV" '{"aggregate": "orders", "pipeline": [{"$match": {"created_at": {"$gte": "2024-01-01"}}}, {"$group": {"_id": "$customer_id", "total": {"$sum": "$amount"}}}, {"$sort": {"total": -1}}], "cursor": {}}' --force

# Complex aggregation with lookup (join)
db-tools query "YDRV" '{"aggregate": "orders", "pipeline": [{"$lookup": {"from": "users", "localField": "customer_id", "foreignField": "_id", "as": "customer"}}, {"$unwind": "$customer"}, {"$project": {"order_id": 1, "amount": 1, "customer_name": "$customer.name"}}], "cursor": {}}' --force

# Calculate averages and totals
db-tools query "YDRV" '{"aggregate": "orders", "pipeline": [{"$group": {"_id": null, "avg_amount": {"$avg": "$amount"}, "total_amount": {"$sum": "$amount"}, "order_count": {"$sum": 1}}}], "cursor": {}}' --force
```

#### MongoDB Index Operations

```bash
# Create index on single field
db-tools create-index "YDRV" users email --force

# Create compound index
db-tools query "YDRV" '{"createIndexes": "users", "indexes": [{"key": {"name": 1, "email": 1}, "name": "name_email_idx"}]}' --force

# Create unique index
db-tools create-index "YDRV" users email --unique --force

# Create text index for search
db-tools query "YDRV" '{"createIndexes": "users", "indexes": [{"key": {"name": "text", "bio": "text"}, "name": "text_search_idx"}]}' --force

# List indexes for a collection
db-tools query "YDRV" '{"listIndexes": "users"}' --force
```

#### MongoDB Backup and Restore

```bash
# Create backup (creates a directory structure)
db-tools backup "YDRV" --output ./backups/mongo_backup --force

# Create encrypted backup
db-tools backup "YDRV" --output ./backups/mongo_backup_encrypted --encrypt --force

# Restore from backup
db-tools restore "YDRV" --input ./backups/mongo_backup --force

# Verify backup without restoring
db-tools restore "YDRV" --input ./backups/mongo_backup --dry-run
```

#### MongoDB Database Administration

```bash
# List all collections
db-tools list-tables "YDRV" --force

# Get detailed collection stats
db-tools list-tables "YDRV" --detailed --force

# Check database statistics
db-tools query "YDRV" '{"dbStats": 1}' --force

# Get collection statistics
db-tools query "YDRV" '{"collStats": "users"}' --force

# List all databases
db-tools list-databases "YDRV" --force
```

#### Working with Multiple Database Types

When you have both PostgreSQL and MongoDB connections with the same project name, use the `--type` flag:

```bash
# List PostgreSQL tables
db-tools list-tables "YDRV" --type postgres

# List MongoDB collections  
db-tools list-tables "YDRV" --type mongodb

# Query PostgreSQL
db-tools query "YDRV" "SELECT * FROM users" --type postgres

# Query MongoDB
db-tools query "YDRV" '{"find": "users", "filter": {}}' --type mongodb
```

## Handling Errors

### Column doesn't exist errors

If queries fail with "column X must appear in the GROUP BY clause or be used in an aggregate function":

1. Check if the column exists: `db-tools list-columns "YDRV" table_name`
2. Add the missing column if needed: `db-tools add-column "YDRV" table_name column_name "DATATYPE" --force`
3. Create an index for the column: `db-tools create-index "YDRV" table_name column_name --force`
4. For timestamp columns with existing data, update them:

   ```bash
   # Create a migration file
   cat > migrations/update_timestamps.sql << EOF
   UPDATE table_name SET column_name = created_at WHERE column_name IS NULL;
   EOF

   # Apply the migration
   db-tools migrate "YDRV" ./migrations/update_timestamps.sql --force
   ```

### NULL conversion errors

If queries fail with "converting NULL to int64 is unsupported":

1. This is likely happening in the backend code trying to scan NULL results into non-nullable types
2. For query usage, you can use COALESCE to provide default values:
   ```bash
   # Create a migration file with a modified query
   cat > migrations/fix_null_scan.sql << EOF
   -- Original query modified to handle NULL
   SELECT COALESCE(SUM(credits), 0) as credits_used FROM transactions WHERE conditions;
   EOF
   ```

## ⚠️ CRITICAL: Always Use Safety-Enabled Commands

This guide outlines best practices for safely managing database operations to prevent accidental data loss or schema damage.

## 🚨 DO NOT Use These Methods for Destructive Operations

### ❌ NEVER use direct SQL for:

- `DROP TABLE` (especially with CASCADE)
- `DELETE FROM`
- `TRUNCATE`
- `ALTER TABLE ... DROP COLUMN` (especially with CASCADE)
- `DROP DATABASE`
- `DROP INDEX`
- `ALTER TABLE ... DROP CONSTRAINT`
- Any operation with `CASCADE` keyword
- Migration files with destructive SQL
- MongoDB: `dropCollection()`, `dropDatabase()`, `deleteMany()`

### ❌ NEVER use these tools directly:

```bash
# DON'T DO THIS:
psql -c "DROP TABLE users CASCADE;"
db-tools query "YDRV" "DELETE FROM orders;"
db-tools query "YDRV" "TRUNCATE transactions;"
db-tools query "YDRV" "ALTER TABLE users DROP COLUMN email CASCADE;"
db-tools migrate "YDRV" ./dangerous-migration.sql
```

## ✅ ALWAYS Use Safety-Enabled Commands

### Safe Table Deletion

```bash
# DO THIS INSTEAD:
db-tools safe-delete-table "YDRV" users

# Features:
# - Creates test database to validate operation
# - Shows table info and dependencies
# - Creates automatic backup
# - Requires explicit confirmation
# - Validates no unexpected data loss
```

### Safe Column Removal

```bash
# DO THIS:
db-tools safe-remove-column "YDRV" users email

# NOT THIS:
db-tools query "YDRV" "ALTER TABLE users DROP COLUMN email;"
```

### Safe Database Operations

```bash
# Use safety-enabled commands:
db-tools safe-rename-table "YDRV" old_name new_name
db-tools safe-truncate "YDRV" table_name
db-tools safe-restore "YDRV" backup_file
db-tools safe-migrate "YDRV" migration_file
```

### ⚠️ CASCADE Operations Are Especially Dangerous!

The CASCADE keyword can cause **unintended deletions** across multiple tables:

```bash
# EXTREMELY DANGEROUS - Can delete data in ALL linked tables:
ALTER TABLE parent_table DROP COLUMN id CASCADE;  # Deletes ALL foreign key references!
DROP TABLE users CASCADE;  # Deletes ALL dependent tables and constraints!

# This is what happened to us - a single CASCADE operation deleted data across multiple tables
```

## 🔒 Safety System Features

### 1. **Test Database Validation**

- All dangerous operations are tested in an isolated copy first
- Full schema and data are replicated to test environment
- Changes are analyzed before applying to real database

### 2. **Risk Classification**

- **SAFE** (Green): Read-only operations
- **CAUTION** (Yellow): Non-destructive changes
- **WARNING** (Orange): Potentially destructive operations
- **DANGER** (Red): Destructive operations requiring validation

### 3. **Automatic Backups**

#### Temporary Encrypted Backups (NEW!)

- **Automatically created** before DANGER-level operations
- **Encrypted** with unique keys for security
- **Auto-deleted** after 4 hours
- **Quick restore** available during the 4-hour window

#### Manual Table Backups

- Tables are backed up before deletion
- Backup tables are named: `backup_[table]_[timestamp]`
- Use `db-tools restore` to recover if needed

### 4. **Dependency Analysis**

- Shows foreign key relationships
- Warns about cascade effects
- Prevents breaking referential integrity

## 📋 Safe Operation Checklist

Before any destructive operation:

1. **Use the safe command variant** (safe-delete-table, safe-remove-column, etc.)
2. **Review the validation report** carefully
3. **Check dependencies** shown in the output
4. **Verify row counts** match expectations
5. **Confirm the operation** by typing the exact name
6. **Keep note of backup tables** created

## 🚀 Command Reference

### Safe Destructive Commands

```bash
# Delete table with safety validation
db-tools safe-delete-table [project] [table]

# Remove column with safety validation
db-tools safe-remove-column [project] [table] [column]

# Rename table with validation
db-tools safe-rename-table [project] [old_name] [new_name]

# Truncate table with validation
db-tools safe-truncate [project] [table]
```

### Options

- `--force` - Skip confirmation prompts (use with extreme caution!)
- `--skip-safety` - Bypass safety validation (NOT RECOMMENDED)
- `--no-backup` - Skip backup creation (NOT RECOMMENDED)
- `--dry-run` - Preview changes without executing

## 🆘 Emergency Recovery

If you accidentally delete data:

### 1. **Check Temporary Backups (First 4 Hours)**

```bash
# List all temporary backups
db-tools list-temp-backups

# Restore from temporary backup
db-tools restore-temp "YDRV" temp_yard_revision_delete_table_2024-01-24T10-30-00
```

### 2. **Check Manual Table Backups**

```bash
# List backup tables
db-tools list-tables "YDRV" | grep backup_

# Restore from backup table
db-tools query "YDRV" "CREATE TABLE users AS SELECT * FROM backup_users_2024_01_24"
```

### 3. **Full Database Restore**

```bash
# If you have a full backup
db-tools restore "YDRV" --input backup.sql
```

### 4. **Point-in-Time Recovery**

Use PostgreSQL's PITR if configured in your setup

## 🎯 Best Practices

1. **Always use safe commands** for destructive operations
2. **Run with --dry-run first** to preview changes
3. **Keep backups enabled** (default behavior)
4. **Review validation reports** before confirming
5. **Document major changes** in your team's changelog
6. **Test in development first** before production changes

## 🚫 What NOT to Do

```bash
# NEVER bypass safety for convenience:
alias delete-table='db-tools query $1 "DROP TABLE $2"'  # BAD!

# NEVER use force without reading the warnings:
db-tools safe-delete-table prod users --force --skip-safety  # DANGEROUS!

# NEVER delete backups immediately:
db-tools query prod "DROP TABLE backup_users_2024_01_24"  # RISKY!
```

## 📢 Team Guidelines

1. **Require safe commands** in all scripts and documentation
2. **Code review** any use of --force or --skip-safety flags
3. **Educate new team members** about the safety system
4. **Report issues** if safety validation fails or seems incorrect
5. **Maintain backups** for at least 7 days before cleanup

---

Remember: **Data loss is permanent. Safety validation is temporary inconvenience.**

When in doubt, use the safe commands and review the validation report!

```

### What This Means for Claude/AI Agents:

1. **ALWAYS use safe commands** for destructive operations
2. **NEVER use query command** for DROP/DELETE/TRUNCATE
3. **CHECK temp backups** if something goes wrong
4. **WARN users** about CASCADE operations
5. **REVIEW migration files** before running them

## Final Notes

- The database schema for production databases should follow the pattern in the YDRV project
- When adding new columns, follow existing naming patterns and data types
- Always create indexes for columns used in WHERE clauses, JOINs, or GROUP BYs
- Back up the database before making significant structural changes
- Use migrations for complex operations that require multiple SQL statements
- **NEW**: Always use safe commands for destructive operations - the safety system will protect against accidental data loss
```
