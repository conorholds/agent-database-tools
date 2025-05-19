# DB-Tools Usage Guide for Agents (Claude Code, Chat GPT Codex, etc)

This document provides instructions for Claude on how to interact with the globally installed version of db-tools to manage PostgreSQL databases.

## Command Structure

All commands follow this general pattern:

```
db-tools <command> [project] [args...] [options]
```

Where:

- `<command>` is the operation to perform
- `[project]` is the project name (e.g., "Yard ReVision")
- `[args...]` are command-specific arguments
- `[options]` are optional flags/parameters

## Core Operations

### 1. Database Information

#### List Databases

```bash
db-tools list-databases "Yard ReVision"
# Alias: db-tools dbs "Yard ReVision"
```

#### List Tables

```bash
db-tools list-tables "Yard ReVision"
# Alias: db-tools tables "Yard ReVision"
```

#### List Columns

```bash
db-tools list-columns "Yard ReVision" <table_name>
# Alias: db-tools columns "Yard ReVision" <table_name>
```

#### Count Records

```bash
db-tools count-records "Yard ReVision" <table_name>
# Alias: db-tools count "Yard ReVision" <table_name>

# Count with WHERE condition
db-tools count-records "Yard ReVision" <table_name> --where "column = 'value'"

# Count all tables
db-tools count-records "Yard ReVision" --all
```

### 2. Schema Modifications

#### Add Column

```bash
db-tools add-column "Yard ReVision" <table_name> <column_name> <data_type> [options]

# Options:
# --default <value>: Set default value
# --null: Allow NULL values (default)
# --not-null: Disallow NULL values
# --force: Skip confirmation prompts

# Examples:
db-tools add-column "Yard ReVision" users email "VARCHAR(255) NOT NULL UNIQUE"
db-tools add-column "Yard ReVision" transactions amount "DECIMAL(10,2)" --default "0.0" --force
db-tools add-column "Yard ReVision" transactions transaction_at "TIMESTAMP WITH TIME ZONE DEFAULT NOW()" --force
```

#### Remove Column

```bash
db-tools remove-column "Yard ReVision" <table_name> <column_name> --force
```

#### Create Index

```bash
db-tools create-index "Yard ReVision" <table_name> <column_name> [options]

# Options:
# --unique: Create a unique index
# --force: Skip confirmation prompts

# Example:
db-tools create-index "Yard ReVision" transactions transaction_at --force
```

### 3. Database Management

#### Initialize Database

```bash
db-tools init "Yard ReVision" [options]

# Options:
# --force: Force re-creation of tables and skip confirmations
```

#### Run Migration

```bash
db-tools migrate "Yard ReVision" <migration_file_path> --force
```

#### Backup Database

```bash
db-tools backup "Yard ReVision" [options]

# Options:
# --output <file>: Output file path
# --format <format>: 'plain' (SQL) or 'custom'
# --encrypt: Encrypt the backup
# --force: Skip confirmation prompts

# Example:
db-tools backup "Yard ReVision" --output ./backups/yard-revision-backup.sql --force
```

#### Restore Database

```bash
db-tools restore "Yard ReVision" --input <backup_file> [options]

# Options:
# --dry-run: Verify backup without restoring
```

### 4. Troubleshooting

#### Check Database Structure

```bash
db-tools check "Yard ReVision"
```

## Working with Different Databases

All commands support the `-d, --database <name>` option to switch databases:

```bash
# Connect to a specific database
db-tools list-tables "Yard ReVision" -d production

# Add column to staging database
db-tools add-column "Yard ReVision" users test_column TEXT -d staging --force
```

## Tips for Claude

When working with databases through db-tools, follow these best practices:

1. **Always check first**: Before modifying, use `list-*` commands to verify the current state.

   ```bash
   db-tools list-columns "Yard ReVision" users
   ```

2. **Use `--force` for automation**: When you need to execute commands without user confirmation.

   ```bash
   db-tools add-column "Yard ReVision" users new_column TEXT --force
   ```

3. **Use custom connection files for testing**:

   ```bash
   db-tools list-tables "Test Project" --connect ./connect-test.json
   ```

4. **Always verify column existence before using it**:

   ```bash
   # Bad: Assuming column exists
   db-tools remove-column "Yard ReVision" users email

   # Good: Check first, then remove
   db-tools list-columns "Yard ReVision" users
   db-tools remove-column "Yard ReVision" users email --force
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
   db-tools migrate "Yard ReVision" ./migrations/123_complex_change.sql --force
   ```

6. **Dealing with transaction_at and other date columns**:

   - Always ensure `transaction_at` exists before running queries that use it
   - For new date columns, prefer `TIMESTAMP WITH TIME ZONE DEFAULT NOW()`
   - Create indexes for date columns used in WHERE clauses and GROUP BY operations

7. **PostgreSQL version compatibility**:
   - The tool requires PostgreSQL 16 client tools for compatibility with PostgreSQL 16 servers
   - Check version with: `db-tools check "Yard ReVision"`

## Common Command Patterns

### Adding columns with foreign keys

```bash
db-tools add-column "Yard ReVision" transactions admin_id "BIGINT REFERENCES users(id)" --force
```

### Setting up timestamp columns

```bash
db-tools add-column "Yard ReVision" transactions transaction_at "TIMESTAMP WITH TIME ZONE DEFAULT NOW()" --force
```

### Creating text columns with defaults

```bash
db-tools add-column "Yard ReVision" transactions admin_note "TEXT DEFAULT ''" --force
```

### Creating indexes for query performance

```bash
db-tools create-index "Yard ReVision" transactions transaction_at --force
```

## Handling Errors

### Column doesn't exist errors

If queries fail with "column X must appear in the GROUP BY clause or be used in an aggregate function":

1. Check if the column exists: `db-tools list-columns "Yard ReVision" table_name`
2. Add the missing column if needed: `db-tools add-column "Yard ReVision" table_name column_name "DATATYPE" --force`
3. Create an index for the column: `db-tools create-index "Yard ReVision" table_name column_name --force`
4. For timestamp columns with existing data, update them:

   ```bash
   # Create a migration file
   cat > migrations/update_timestamps.sql << EOF
   UPDATE table_name SET column_name = created_at WHERE column_name IS NULL;
   EOF

   # Apply the migration
   db-tools migrate "Yard ReVision" ./migrations/update_timestamps.sql --force
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

## Final Notes

- The database schema for production databases should follow the pattern in the Yard ReVision project
- When adding new columns, follow existing naming patterns and data types
- Always create indexes for columns used in WHERE clauses, JOINs, or GROUP BYs
- Back up the database before making significant structural changes
- Use migrations for complex operations that require multiple SQL statements
