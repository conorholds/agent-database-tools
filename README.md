# Agent Database Tools

A command-line interface tool to manage PostgreSQL and MongoDB databases through direct commands or natural language interactions with AI agents. Query, migrate, back‑up & explore your databases with either precise commands or plain‑English prompts sent through ChatGPT, Claude, or any other shell‑enabled LLM.

> ⚠️ **DISCLAIMER: DEVELOPMENTAL SOFTWARE** ⚠️
>
> This software is currently in development and is provided "AS IS" without warranty of any kind. Use at your own risk.
> While we test extensively, operations that modify database structure or data may cause unintended consequences.
> Always backup your databases before using this tool, especially in production environments.

---

## Table of Contents

1. [Overview](#overview)
2. [AI-Powered Database Management](#ai-powered-database-management)
3. [Why db-tools?](#why-db-tools)
4. [Features](#features)
5. [Installation](#installation)
6. [Configuring for AI Agent Use](#configuring-for-ai-agent-use)
7. [Project Structure](#project-structure)
8. [Usage](#usage)
9. [Commands Reference](#commands-reference)
10. [Automatic Database Backups](#automatic-database-backups)
11. [Schema Configuration](#schema-configuration)
12. [Database Migration Support](#database-migration-support)
13. [Backup and Restore](#backup-and-restore)
14. [Security Best Practices](#security-best-practices)
15. [Extension Support](#extension-support)
16. [Compatibility](#compatibility)
17. [Contribution Guidelines](#contribution-guidelines)
18. [License](#license)
19. [Troubleshooting](#troubleshooting)

---

## Overview

db-tools CLI provides two powerful ways to interact with your databases:

1. **Direct Command Usage** - Traditional CLI commands for database operations
2. **AI Agent Integration** - Natural language conversations with AI to explore and modify databases

This dual approach lets you switch between precise command execution and conversational database management depending on your needs.

### 🛡️ Enhanced Safety Features

- **Test Database Validation** - All dangerous operations are tested in an isolated copy first
- **Automatic Temporary Backups** - Encrypted backups created before dangerous operations (4-hour retention)
- **CASCADE Protection** - Special warnings and validation for operations that affect multiple tables
- **Multi-level Confirmation** - Requires explicit confirmation for dangerous operations
- **Dependency Analysis** - Shows all affected tables and foreign key relationships

### Supported Databases

- **PostgreSQL** - Full support for PostgreSQL 12+ with native tool integration
- **MongoDB** - Full support for MongoDB 4.0+ with collection management, queries, and all CRUD operations

## AI-Powered Database Management

DB Tools CLI was designed specifically to work with AI assistants like Claude, ChatGPT, and other LLMs. This integration allows you to:

- **Query databases using natural language** instead of SQL or MongoDB queries
- **Make database changes through conversation** rather than remembering command syntax
- **Explore database schema intuitively** by asking the AI about your tables/collections and relationships
- **Troubleshoot database issues** by describing the problem in everyday language

## Why db-tools?

- **Two modes, one binary** – traditional CLI flags when you need surgical accuracy, natural-language when you just want to _ask_.
- **Schema-aware AI** – db-tools surfaces metadata so your LLM can write safe queries automatically.
- **End-to-end workflow** – initialise, migrate, seed, back-up, restore and audit – all in one place.
- **Multi-database support** – Works with both PostgreSQL and MongoDB, with a consistent interface.

### Example Conversations

Instead of remembering syntax and flags, you can have conversations like:

```
You: "Show me all users who signed up in the last month"
Agent: *uses db-tools to query the database and returns formatted results*

You: "Add a 'preferred_language' column to the users table"
Agent: *runs the appropriate db-tools command to add the column*

You: "Back up the production database and encrypt it"
Agent: *executes the backup command with encryption enabled*

You: "What tables are related to the orders table?"
Agent: *inspects database schema and explains the relationships*
```

### How It Works

1. The AI agent has access to all db-tools commands
2. When you make a request in natural language, the agent:
   - Interprets your intent
   - Selects the appropriate db-tools command(s)
   - Executes the command(s) with proper parameters
   - Returns the results in a user-friendly format
   - Can explain what it did and why

### Security Considerations

- The AI only has as much access as the db-tools user
- Sensitive operations still require confirmation
- All operations are logged for audit purposes
- The AI will ask for clarification before executing potentially destructive operations

## Features

### Core Database Operations

- Initialize databases with project-specific schemas
- Modify existing tables/collections (add columns/fields, remove fields, etc.)
- Create indexes on tables/collections
- Run SQL migrations for PostgreSQL
- Track migration operations for MongoDB
- Seed tables/collections with initial data
- Check database structure and integrity
- Backup databases (with optional encryption)
- Set up automated scheduled backups with retention policies
- Restore databases from backups
- Delete tables/collections with validation
- Rename tables/collections (PostgreSQL tables, MongoDB collections)
- Advanced search across databases, tables/collections, and fields with regex and highlighting
- Execute raw SQL/MongoDB queries with formatted results
- MongoDB-specific operations: collection management, document field operations

### Enhanced Developer Experience

- **Comprehensive validation** - Input validation and type checking for all operations
- **Enhanced error handling** - Detailed error messages with actionable suggestions
- **Dry-run mode** - Preview destructive operations before execution
- **Configuration validation** - Validate and test database configurations
- **Standardized logging** - Structured error logging and debugging support
- **Extensive documentation** - Comprehensive JSDoc comments and examples

## Installation

### Prerequisites

This tool requires:

- **For PostgreSQL**: PostgreSQL 16 client tools

  - pg_dump
  - pg_restore
  - psql
  - createdb/dropdb

- **For MongoDB**: MongoDB Database Tools
  - mongodump
  - mongorestore

> **IMPORTANT:** PostgreSQL 16 client tools are required for compatibility with PostgreSQL 16 servers.

The installation script will handle the installation of PostgreSQL 16 client tools, but if you want to install them manually:

**macOS (with Homebrew):**

```bash
# Install PostgreSQL 16
brew install postgresql@16

# Start the PostgreSQL 16 server (required for testing)
brew services start postgresql@16

# Add PostgreSQL 16 to your PATH
echo 'export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

# Install MongoDB and MongoDB Database Tools
brew tap mongodb/brew
brew install mongodb-community mongodb-database-tools
```

**Ubuntu/Debian:**

```bash
# Add PostgreSQL 16 apt repository
sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -
sudo apt-get update

# Install PostgreSQL 16 client and server
sudo apt-get install postgresql-16 postgresql-client-16

# Start the PostgreSQL 16 server
sudo systemctl start postgresql@16-main

# Install MongoDB and tools
wget -qO - https://www.mongodb.org/static/pgp/server-4.4.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu $(lsb_release -cs)/mongodb-org/4.4 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-4.4.list
sudo apt-get update
sudo apt-get install -y mongodb-org mongodb-database-tools
```

**Windows:**

1. Download PostgreSQL 16 from https://www.postgresql.org/download/windows/
2. Run the installer and select the client tools
3. Add the bin directory to your PATH
4. Download MongoDB Database Tools from https://www.mongodb.com/try/download/database-tools
5. Add MongoDB bin directory to your PATH

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd db-tools

# Run the installation script (automatically installs required tools)
./install.sh
```

The installation script will:

1. Check if PostgreSQL 16 client tools are installed
2. Install or upgrade to PostgreSQL 16 if needed (using brew on macOS or apt-get/yum on Linux)
3. Check if MongoDB tools are installed and install them if needed
4. Update your shell profile to include the required paths
5. Install DB Tools dependencies
6. Make the tool available globally

After installation, you may need to run `source ~/.zshrc` (or your appropriate shell profile) to update your PATH in the current shell.

## Configuring for AI Agent Use

To maximize the benefits of AI agent integration, consider:

1. **Setting up a dedicated database user** with appropriate permissions
2. **Creating comprehensive schema definitions** to help the AI understand your data model
3. **Storing common operations in scripts** that the AI can reference and explain

### Connect an AI Agent

Most AI agents can be set up to use db-tools by:

1. Ensuring the agent has access to the command
2. Creating a connect.json file with your database credentials
3. Asking the agent to help you manage your database

The AI can then use all db-tools commands as if it were a human operator.

### Using DB-Tools with AI in Other Projects

Once db-tools is globally installed, you can use it with AI assistants in any of your projects:

1. Copy the `db-tools.md` file from this repository to your other project
2. Create a `connect.json` file in your project with your database credentials
3. Ask the AI to help you manage your database using the instructions in db-tools.md

The AI assistant will be able to reference the commands and best practices in the db-tools.md file, allowing it to effectively manage your database in any project context.

For best results, run db-tools commands directly in the db-tools repository where all documentation and examples are available to the AI.

## Project Structure

```
db-tools/
├── bin/                    # CLI entry point
├── src/
│   ├── commands/           # Command implementations
│   │   ├── postgres/       # PostgreSQL-specific commands
│   │   ├── mongodb/        # MongoDB-specific commands
│   │   └── *.js           # Database-agnostic commands
│   ├── utils/              # Shared utilities
│   │   ├── db/             # Database-specific utilities
│   │   │   ├── postgres.js # PostgreSQL utilities
│   │   │   ├── mongodb.js  # MongoDB utilities
│   │   │   └── index.js    # Database abstraction layer
│   │   └── *.js           # Other utilities
│   └── schemas/            # Default schema templates
├── schemas/                # Project-specific schema files
├── backups/                # Database backup files
├── scripts/                # Testing and utility scripts
│   ├── testing/            # Test framework
│   └── production/         # Production scripts
└── migrations/             # Database migration files
```

## Usage

### Configure Connection

The tool uses a `connect.json` file in the project root to manage database connections. The file should have the following format:

```json
[
  {
    "name": "PostgreSQL Project",
    "type": "postgres",
    "postgres_uri": "postgresql://username:password@hostname:port/database?sslmode=disable"
  },
  {
    "name": "MongoDB Project",
    "type": "mongodb",
    "mongodb_uri": "mongodb://username:password@hostname:port/database"
  }
]
```

The `type` field explicitly identifies the database type ("postgres" or "mongodb"). While this field is optional (the tool can detect the database type from the connection URI), it's recommended to include it for clarity and future compatibility.

#### Working with Multiple Database Types

When you have multiple connections with the same project name but different database types, use the `--type` flag to specify which database to use:

```bash
# If you have both PostgreSQL and MongoDB connections named "Production"
# List PostgreSQL tables
db-tools list-tables "Production" --type postgres

# List MongoDB collections  
db-tools list-tables "Production" --type mongodb

# Backup PostgreSQL database
db-tools backup "Production" --type postgres --output ./backups/pg_backup.sql

# Backup MongoDB database
db-tools backup "Production" --type mongodb --output ./backups/mongo_backup
```

This `--type` flag is available on all commands and provides a clean way to work with mixed database environments without needing separate connection names.

#### Working with Different Databases

All commands support a `-d, --database <n>` option to specify which database to connect to, allowing you to easily switch between databases (development, staging, production) without modifying the `connect.json` file:

```bash
# List tables in the production database
db-tools list-tables "Project Name" -d production

# Count records in the staging database
db-tools count-records "Project Name" users -d staging

# Check the structure of the testing database
db-tools check "Project Name" -d testing
```

The tool will keep the same connection parameters (username, password, host, port) but will connect to the specified database name instead of the one in the connection string.

##### Common Database Operations with the `-d` Flag

```bash
# Initialize a new test database with the schema
db-tools init "Project Name" -d test_db

# Backup the production database
db-tools backup "Project Name" -d production --output ./backups/production_backup.backup

# Restore a backup to the development database
db-tools restore "Project Name" -d development --input ./backups/production_backup.backup

# Migrate a specific database
db-tools migrate "Project Name" -d staging ./migrations/002_add_user_preferences.sql
```

### Natural Language Examples vs. Direct Commands

The power of DB Tools CLI is the ability to use either precise commands or conversational language with an AI agent. Here are some examples comparing both approaches:

#### Exploring Database Structure

**Traditional Command:**

```bash
db-tools list-tables "Project Name"
db-tools list-columns "Project Name" users
```

**Natural Language with AI:**

```
"Show me all the tables in the Project Name database"
"What columns are in the users table?"
"Can you explain how the users and transactions tables are related?"
```

#### Modifying Database Structure

**Traditional Command:**

```bash
db-tools add-column "Project Name" users profile_image TEXT
db-tools create-index "Project Name" transactions user_id
```

**Natural Language with AI:**

```
"Add a profile_image column to the users table"
"We need an index on user_id in the transactions table to speed up queries"
"Can you help me optimize the database for faster user lookup?"
```

#### Data Operations

**Traditional Command:**

```bash
db-tools query "Project Name" "SELECT * FROM users WHERE created_at > '2025-01-01'" -d production
```

**Natural Language with AI:**

```
"Show me users who joined this year in the production database"
"How many active users do we have in each region?"
"Find users who haven't made a transaction in the last 30 days"
```

#### Database Maintenance

**Traditional Command:**

```bash
db-tools backup "Project Name" -d production --encrypt
db-tools auto-backup "Project Name" --retention-days 14 --schedule "0 2 * * 0"
```

**Natural Language with AI:**

```
"Back up the production database and encrypt it"
"Set up weekly backups on Sunday night with a two-week retention policy"
"What's our backup strategy right now?"
```

### Commands Reference

#### Initialize Database

```bash
# Interactive mode
db-tools init

# Specify project name
db-tools init "Project Name"

# Force re-creation of tables even if they exist
db-tools init "Project Name" --force
```

#### Add Column to Table (PostgreSQL)

```bash
# Interactive mode
db-tools add-column

# Specify project, table, column, and data type
db-tools add-column "Project Name" users new_column TEXT

# With constraints
db-tools add-column "Project Name" users new_column TEXT --default 'value' --not-null
```

#### Create Index

```bash
# Interactive mode
db-tools create-index

# Specify project, table, and column
db-tools create-index "Project Name" designs user_id

# Create a unique index
db-tools create-index "Project Name" users email --unique
```

#### Run Migration

```bash
# Interactive mode - lists available migrations
db-tools migrate "Project Name"

# Specify migration file
db-tools migrate "Project Name" ./migrations/001_create_admin_user.sql
```

#### Seed Data

```bash
# Interactive mode - lists available tables with seed data
db-tools seed "Project Name"

# Specify table to seed
db-tools seed "Project Name" templates

# Use custom seed data file
db-tools seed "Project Name" templates --file ./data/custom_templates.json
```

#### Check Database

```bash
# Check database structure and report issues
db-tools check "Project Name"
```

#### Search in Database

The search command provides powerful capabilities to find data across multiple tables and columns:

```bash
# Search for "smith" across all tables and columns
db-tools search "Project Name" smith

# Search in a specific table
db-tools search "Project Name" users smith

# Search in a specific table and column
db-tools search "Project Name" users email smith

# Search with options
db-tools search "Project Name" --value "smith" --limit 50 --case-sensitive

# Search with exact matching
db-tools search "Project Name" --value "smith@example.com" --exact

# Output results as JSON
db-tools search "Project Name" smith --json

# Search in JSONB data (format: "key:value")
db-tools search "Project Name" "settings:dark_mode"

# Search in a specific database
db-tools search "Project Name" smith -d production

# Search with regular expressions
db-tools search "Project Name" --regex "^smith.*@gmail\.com"

# Search with highlighted results
db-tools search "Project Name" smith --highlight

# Search recursively in nested JSON/JSONB data
db-tools search "Project Name" "data->users->name" --recursive

# Search in MongoDB using regex and highlighting
db-tools search "MongoDB Project" --regex "^user.*" --highlight
```

The search command intelligently handles different data types:

- String: Case-insensitive substring matching by default
- Number: Exact match or substring matching
- Boolean: Matches TRUE/FALSE with various formats (true, t, yes, y, 1, etc.)
- Date/Time: Substring matching in string representation
- JSON/JSONB: Text search or key-value matching with "key:value" format
- Special handling for NULL values (search for "null")
- Nested objects/arrays: Recursive search with path notation (e.g., "data->users->0->name")

Available options include:

- `-v, --value <search>`: Value to search for (alternative to passing as argument)
- `-l, --limit <n>`: Maximum number of results to return (default: 1000)
- `-j, --json`: Output results in JSON format
- `--csv`: Output results in CSV format
- `-c, --compact`: Show only matching columns in results
- `--case-sensitive`: Perform case-sensitive search
- `-e, --exact`: Search for exact matches only
- `--regex`: Interpret search value as a regular expression
- `--recursive`: Search recursively in nested JSON/JSONB fields or MongoDB documents
- `--highlight`: Highlight matched text in the output for better visibility
- `--verbose`: Show verbose output during search
- `-d, --database <n>`: Specify database to connect to

#### Execute SQL Queries

The query command enables you to run raw SQL queries and see formatted results:

```bash
# Execute a simple SELECT query
db-tools query "Project Name" "SELECT * FROM users LIMIT 10"

# Execute a complex query with joins and aggregation
db-tools query "Project Name" "SELECT u.name, COUNT(t.id) FROM users u JOIN transactions t ON u.id = t.user_id GROUP BY u.name ORDER BY COUNT(t.id) DESC LIMIT 5"

# Execute a query with the --raw option
db-tools query "Project Name" --raw "UPDATE users SET last_login = NOW() WHERE id = 123"

# Get JSON output
db-tools query "Project Name" "SELECT * FROM users WHERE created_at > '2025-01-01'" --json

# Execute a query against a specific database
db-tools query "Project Name" "SELECT COUNT(*) FROM users" -d production

# Execute a query with verbose output
db-tools query "Project Name" "SELECT * FROM transactions WHERE amount > 1000" --verbose
```

The query command:

- Executes any valid SQL query against the database
- Automatically formats results as an aligned table
- Shows row count for SELECT queries
- Reports affected row count for UPDATE/INSERT/DELETE queries
- Handles NULL values with special formatting

Available options:

- `-r, --raw <query>`: Raw SQL query (alternative to passing as argument)
- `-j, --json`: Output results in JSON format
- `-v, --verbose`: Show verbose output including the executed query
- `--force`: Skip confirmation prompts
- `-d, --database <n>`: Database to connect to

Best practices:

- Always use quotes around SQL queries to prevent shell interpretation issues
- For complex queries, consider creating a migration file
- Test complex queries on development before running in production
- Use --verbose to see the exact query being executed

#### Backup Database

```bash
# Interactive mode
db-tools backup

# Specify project name
db-tools backup "Project Name"

# Specify output file
db-tools backup "Project Name" --output /path/to/backup.sql

# Create encrypted backup
db-tools backup "Project Name" --encrypt

# Use custom format
db-tools backup "Project Name" --format custom
```

For PostgreSQL, the backup command uses PostgreSQL's `pg_dump` tool and supports two formats:

1. **Plain SQL** (default): Standard SQL dump that can be restored with `psql`
2. **Custom Format**: PostgreSQL-specific format with compression and more features

For MongoDB, the backup command uses MongoDB's `mongodump` tool with the `--archive` and `--gzip` options to create a compressed backup. Unlike PostgreSQL which creates a single file, MongoDB backups create a directory structure.

```bash
# MongoDB backup examples
db-tools backup "MongoDB Project" --output ./backups/mongo_backup --force
db-tools backup "MongoDB Project" --encrypt --output ./backups/mongo_encrypted --force

# MongoDB backup creates a directory structure, not a single file
# The directory will contain BSON files for each collection
```

> **Note**: The backup command includes automatic version detection and will use the correct tool version for your server, avoiding version mismatch errors.

#### Restore Database

```bash
# Interactive mode - lists available backups
db-tools restore "Project Name"

# Specify input file
db-tools restore "Project Name" --input /path/to/backup.sql

# Restore a custom format backup
db-tools restore "Project Name" --input /path/to/backup.backup

# Verify backup without restoring (dry run)
db-tools restore "Project Name" --input /path/to/backup.backup --dry-run
```

For PostgreSQL, the restore command automatically detects the backup format:

- Plain SQL backups are restored using `psql`
- Custom format backups are restored using `pg_restore`

For MongoDB, the restore command uses `mongorestore` with the `--archive` and `--gzip` options.

```bash
# MongoDB restore examples
db-tools restore "MongoDB Project" --input ./backups/mongo_backup --force
db-tools restore "MongoDB Project" --input ./backups/mongo_encrypted --force

# MongoDB restore from directory structure
# The tool automatically detects if input is a directory or archive file
```

#### Temporary Backups (Auto-created)

```bash
# List all temporary backups (auto-deleted after 4 hours)
db-tools list-temp-backups

# Restore from a temporary backup
db-tools restore-temp "Project Name"

# Restore specific temporary backup
db-tools restore-temp "Project Name" temp_project_delete_table_2024-01-24T10-30-00

# Force restore without confirmation
db-tools restore-temp "Project Name" backup-name --force
```

Temporary backups are:

- **Automatically created** before dangerous operations (DELETE, DROP, TRUNCATE)
- **Encrypted** with unique keys for security
- **Auto-deleted** after 4 hours to save space
- **Listed with expiration times** for easy management

#### Delete Table/Collection

```bash
# Interactive mode
db-tools delete-table

# Specify project and table/collection
db-tools delete-table "Project Name" temp_data
```

#### Remove Column (PostgreSQL)

```bash
# Interactive mode
db-tools remove-column

# Specify project, table, and column
db-tools remove-column "Project Name" designs unused_column
```

#### MongoDB-Specific Commands

MongoDB has additional commands for collection management and document operations:

##### Collection Management

```bash
# List collections in MongoDB database
db-tools list-tables "MongoDB Project"
db-tools list-tables "MongoDB Project" --detailed  # With document counts

# Create a collection (automatically created when inserting documents)
db-tools query "MongoDB Project" '{"insert": "new_collection", "documents": [{"name": "test"}]}' --force

# Rename a collection
db-tools rename-collection "MongoDB Project" old_collection new_collection --force

# Delete a collection (with safety confirmation)
db-tools delete-collection "MongoDB Project" collection_name --force

# Remove a field from all documents in a collection
db-tools remove-field "MongoDB Project" collection_name field_name --force

# Preview field removal without executing
db-tools remove-field "MongoDB Project" collection_name field_name --dry-run

# Add a field to documents (when collection has data)
db-tools add-column "MongoDB Project" collection_name new_field "string" --force
```

##### Document Operations

```bash
# Insert documents
db-tools query "MongoDB Project" '{"insert": "users", "documents": [{"name": "John", "email": "john@example.com", "active": true}]}' --force

# Find documents with filtering
db-tools query "MongoDB Project" '{"find": "users", "filter": {"active": true}}' --force

# Find with projection (specific fields only)
db-tools query "MongoDB Project" '{"find": "users", "filter": {"active": true}, "projection": {"name": 1, "email": 1}}' --force

# Find with sorting and limiting
db-tools query "MongoDB Project" '{"find": "users", "filter": {}, "sort": {"created_at": -1}, "limit": 10}' --force

# Update documents
db-tools query "MongoDB Project" '{"update": "users", "updates": [{"q": {"name": "John"}, "u": {"$set": {"email": "newemail@example.com"}}}]}' --force

# Update multiple documents
db-tools query "MongoDB Project" '{"update": "users", "updates": [{"q": {"active": false}, "u": {"$set": {"status": "inactive"}}, "multi": true}]}' --force

# Count documents
db-tools count-records "MongoDB Project" users
db-tools count-records "MongoDB Project" users --detailed

# Count with filter
db-tools query "MongoDB Project" '{"count": "users", "query": {"active": true}}' --force
```

##### MongoDB Aggregation Pipelines

```bash
# Group by field and count
db-tools query "MongoDB Project" '{"aggregate": "orders", "pipeline": [{"$group": {"_id": "$status", "count": {"$sum": 1}}}], "cursor": {}}' --force

# Match, group, and sort (complex aggregation)
db-tools query "MongoDB Project" '{"aggregate": "orders", "pipeline": [{"$match": {"created_at": {"$gte": "2024-01-01"}}}, {"$group": {"_id": "$customer_id", "total": {"$sum": "$amount"}}}, {"$sort": {"total": -1}}], "cursor": {}}' --force

# Aggregation with lookup (join collections)
db-tools query "MongoDB Project" '{"aggregate": "orders", "pipeline": [{"$lookup": {"from": "users", "localField": "customer_id", "foreignField": "_id", "as": "customer"}}, {"$unwind": "$customer"}, {"$project": {"order_id": 1, "amount": 1, "customer_name": "$customer.name"}}], "cursor": {}}' --force
```

##### MongoDB Index Management

```bash
# Create index on single field
db-tools create-index "MongoDB Project" users email --force

# Create unique index
db-tools create-index "MongoDB Project" users email --unique --force

# Create compound index
db-tools query "MongoDB Project" '{"createIndexes": "users", "indexes": [{"key": {"name": 1, "email": 1}, "name": "name_email_idx"}]}' --force

# Create text index for search
db-tools query "MongoDB Project" '{"createIndexes": "users", "indexes": [{"key": {"name": "text", "bio": "text"}, "name": "text_search_idx"}]}' --force

# List indexes for a collection
db-tools query "MongoDB Project" '{"listIndexes": "users"}' --force
```

##### MongoDB Search

```bash
# Search across all collections
db-tools search "MongoDB Project" "john@example.com"

# Search in specific collection
db-tools search "MongoDB Project" users "john"

# Search with regex
db-tools search "MongoDB Project" --regex "^user.*" --highlight

# Search with limit
db-tools search "MongoDB Project" users "john" --limit 50
```

#### Manage Permissions

```bash
# Interactive mode
db-tools manage-permissions "Project Name"
```

This command provides interactive options to:

- Create app_user role with appropriate permissions
- Update permissions for app_user role
- Revoke all permissions from app_user role
- Drop app_user role
- Show current permissions

#### List Databases

```bash
# Interactive mode
db-tools list-databases
db-tools dbs  # Short alias

# Specify project to connect through
db-tools list-databases "Project Name"
```

#### List Tables/Collections

```bash
# Interactive mode
db-tools list-tables
db-tools tables  # Short alias

# Specify project
db-tools list-tables "Project Name"

# Show detailed information including row counts
db-tools list-tables "Project Name" --detailed
```

#### List Columns (PostgreSQL)

```bash
# Interactive mode
db-tools list-columns
db-tools columns  # Short alias

# Specify project and table
db-tools list-columns "Project Name" users
```

#### Count Records

```bash
# Interactive mode
db-tools count-records
db-tools count  # Short alias

# Specify project and table/collection
db-tools count-records "Project Name" users

# Count records in all tables/collections
db-tools count-records "Project Name" --all

# Show detailed statistics
db-tools count-records "Project Name" users --detailed

# Count with SQL WHERE condition (PostgreSQL)
db-tools count-records "Project Name" users --where "is_admin = true"

# Count with MongoDB query
db-tools count-records "MongoDB Project" users --query '{"is_admin": true}'
```

## Automatic Database Backups

The CLI provides a powerful automatic backup feature that can schedule regular backups with retention policies.

### Setting Up Automatic Backups

```bash
# Set up daily backups with default settings
db-tools auto-backup "Project Name"

# Backup a specific database with a 14-day retention period
db-tools auto-backup "Project Name" --database production --retention-days 14

# Encrypted backup running weekly on Sundays at 2AM
db-tools auto-backup "Project Name" --encrypt --schedule "0 2 * * 0"
```

### Available Options

| Option                 | Description                        | Default                          |
| ---------------------- | ---------------------------------- | -------------------------------- |
| `--database <n>`       | Specific database to backup        | (All databases)                  |
| `--backup-dir <path>`  | Directory to store backups         | ./backups                        |
| `--retention-days <n>` | Number of days to keep backups     | 30                               |
| `--format <format>`    | Backup format: `plain` or `custom` | custom                           |
| `--encrypt`            | Encrypt the backup files           | (Not encrypted)                  |
| `--schedule <cron>`    | Cron schedule expression           | 0 0 \* \* \* (daily at midnight) |
| `--disable`            | Disable automatic backups          | (Not disabled)                   |
| `--connect <file>`     | Path to custom connection file     | connect.json                     |

### Common Schedule Examples

```bash
# Daily at midnight (default)
--schedule "0 0 * * *"

# Every hour
--schedule "0 * * * *"

# Every Sunday at 2 AM
--schedule "0 2 * * 0"

# First day of each month at 3 AM
--schedule "0 3 1 * *"

# Every 6 hours (midnight, 6 AM, noon, 6 PM)
--schedule "0 0,6,12,18 * * *"
```

### Disabling Automatic Backups

```bash
db-tools auto-backup "Project Name" --disable
```

## Schema Configuration

The database schema for your project can be defined in code. Examples are provided in the `schemas/` directory.

## Database Migration Support

The tool includes support for tracking and applying SQL migrations for PostgreSQL. Migrations should be placed in the `migrations/` directory and follow the naming pattern `NNN_description.sql` where `NNN` is a sequence number.

Migrations that have been applied are tracked in a `migrations` table in the database to prevent duplicate execution.

For MongoDB, the tool tracks migration operations in a `migrations` collection.

## Backup and Restore

The tool supports both plain and encrypted backups. When using encrypted backups, a `.key` file is generated alongside the backup file. Both files are required for restoration.

## Safety System 🛡️

db-tools includes a comprehensive safety validation system to prevent accidental data loss or database corruption.

**⚠️ IMPORTANT: Always use safety-enabled commands for destructive operations!**

See the [Safety Guide](./SAFETY_GUIDE.md) for detailed information on:

- Using safe commands vs direct SQL
- Understanding the test database validation system
- Risk levels and operation classification
- Automatic temporary encrypted backups (4-hour retention)
- Best practices for team usage

### Key Safety Features

1. **Test Environment Validation** - Operations tested in isolated database first
2. **Temporary Encrypted Backups** - Auto-created before dangerous operations, deleted after 4 hours
3. **Dependency Analysis** - Shows foreign key relationships before deletions
4. **Multi-level Confirmation** - Requires explicit confirmation for dangerous operations

### Quick Safety Reference

```bash
# ✅ SAFE - Use these commands with proper validation:
db-tools delete-table "Project" table_name --force
db-tools remove-column "Project" table column --force
db-tools rename-table "Project" old_name new_name --force  # PostgreSQL
db-tools rename-collection "Project" old_name new_name --force  # MongoDB

# ❌ UNSAFE - Never use direct SQL for:
db-tools query "Project" "DROP TABLE users"  # DON'T DO THIS!
psql -c "DELETE FROM orders"                 # DANGEROUS!
```

## Security Best Practices

- Database passwords are never logged
- Prepared statements are used for all SQL operations
- Encrypted backups are supported
- Sensitive operations require confirmation
- Foreign keys are properly managed
- Permissions are carefully controlled

## Extension Support

The tool automatically manages required PostgreSQL extensions:

- uuid-ossp
- btree_gin
- pg_stat_statements
- pgcrypto

## Compatibility

- **PostgreSQL**: Requires PostgreSQL 16 client tools for compatibility with PostgreSQL 16 servers
- **MongoDB**: Works with MongoDB 4.0+ and requires MongoDB Database Tools
- **Node.js**: 14 and higher
- **Operating Systems**: macOS, Linux, and Windows
- **AI Assistants**: Compatible with major AI assistants that can execute shell commands

> **Note:** While db-tools can connect to any PostgreSQL server (version 12 and higher), the client tools must match the server version for backup and restore operations to work correctly. The tool is configured to require PostgreSQL 16 client tools by default, which is the version used by our production servers.

## Contribution Guidelines

Contributions to DB Tools CLI are welcome! Here's how you can help:

1. **Report bugs** - If you find a bug, please create an issue with detailed reproduction steps
2. **Suggest features** - Have an idea for a new feature? Open an issue to discuss it
3. **Submit pull requests** - Want to fix a bug or add a feature? Fork the repo and submit a PR
4. **Improve documentation** - Documentation improvements are always welcome

When contributing code, please:

- Follow the existing code style
- Add tests for new functionality
- Update documentation as needed
- Ensure all tests pass before submitting a PR

### Running Tests

The project includes a test script that verifies core functionality. To run the tests:

```bash
# Navigate to the project directory
cd db-tools

# Run the unified test suite
./scripts/testing/test-suite.sh --all

# Run tests for specific database
./scripts/testing/test-suite.sh --database postgres --level basic
./scripts/testing/test-suite.sh --database mongodb --level basic
```

The test suite will:

1. Verify PostgreSQL 16 and MongoDB tools are installed
2. Create temporary test databases
3. Run comprehensive tests on all major commands for both databases
4. Clean up after itself by dropping the test databases

Make sure PostgreSQL server is running locally before executing the tests. The script requires PostgreSQL client tools to be installed and properly configured.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Troubleshooting

### Connection Issues

#### Connection Refused

**Problem**: `Error: connect ECONNREFUSED 127.0.0.1:5432` or `psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory`

**Possible causes**:

- PostgreSQL server is not running
- PostgreSQL is running on a different port
- Firewall is blocking the connection

**Solutions**:

1. Check if PostgreSQL server is running:

   ```bash
   # Using pg_isready (recommended)
   pg_isready
   ```

2. Start the PostgreSQL server:

   **macOS (Homebrew):**

   ```bash
   brew services start postgresql@16
   ```

   **Ubuntu/Debian:**

   ```bash
   sudo systemctl start postgresql
   # or for specific version
   sudo systemctl start postgresql@16-main
   ```

3. Verify connection details in `connect.json`

#### Authentication Failed

**Problem**: `Error: password authentication failed for user`

**Solutions**:

1. Check that the password in connect.json is correct
2. Verify the user has proper permissions
3. Check PostgreSQL's pg_hba.conf file for authentication requirements

### Backup or Restore Issues

**Problem**: `pg_dump` or `pg_restore` or `psql` command not found

**Solutions**:

1. Install PostgreSQL client tools:
   - macOS: `brew install postgresql`
   - Ubuntu/Debian: `sudo apt-get install postgresql-client`
   - Windows: Download from https://www.postgresql.org/download/windows/
2. Ensure the PostgreSQL bin directory is in your PATH

**Problem**: Version mismatch error ("server version X; pg_dump version Y")

**Solutions**:

1. Install the PostgreSQL client tools that match your server version
2. Run the install.sh script which installs the correct version (PostgreSQL 16 by default)

### MongoDB Connectivity Issues

**Problem**: Cannot connect to MongoDB server

**Solutions**:

1. Verify MongoDB is running:
   ```bash
   # Check if MongoDB service is running
   mongosh
   ```
2. Check connection URI format:

   ```
   mongodb://[username:password@]host[:port][/database]
   ```

3. Ensure MongoDB Database Tools are installed:
   ```bash
   # Check mongodump version
   mongodump --version
   ```

## Extending the Tool

### Adding Custom Commands

If you need to add custom commands:

1. Create a new command file in `src/commands/`
2. Add the command to `bin/db-tools.js`
3. Update the help documentation

### Adding Custom Schema

To add support for a new project:

1. Create a schema definition in `schemas/{project-name}.js`
2. Follow the format in existing schema files

## Contact Support

If you continue to experience issues:

1. Create an issue in the project repository
2. Include detailed error messages and reproduction steps
3. Specify the database version and operating system
