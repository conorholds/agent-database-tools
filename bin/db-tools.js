#!/usr/bin/env node

const { program } = require('commander');
const fs = require('fs');
const path = require('path');
const packageJson = require('../package.json');

// Load commands
const initCommand = require('../src/commands/init');
const addColumnCommand = require('../src/commands/add-column');
const removeColumnCommand = require('../src/commands/remove-column');
const createIndexCommand = require('../src/commands/create-index');
const migrateCommand = require('../src/commands/migrate');
const seedCommand = require('../src/commands/seed');
const checkCommand = require('../src/commands/check');
const backupCommand = require('../src/commands/backup');
const restoreCommand = require('../src/commands/restore');
const deleteTableCommand = require('../src/commands/delete-table');
const renameTableCommand = require('../src/commands/rename-table');
const renameColumnCommand = require('../src/commands/rename-column');
const managePermissionsCommand = require('../src/commands/manage-permissions');
const listDatabasesCommand = require('../src/commands/list-databases');
const listTablesCommand = require('../src/commands/list-tables');
const listColumnsCommand = require('../src/commands/list-columns');
const countRecordsCommand = require('../src/commands/count-records');
const queryCommand = require('../src/commands/query');
const searchCommand = require('../src/commands/search');
const autoBackupCommand = require('../src/commands/auto-backup');

program
  .name('db-tools')
  .description('CLI tool to manage PostgreSQL databases')
  .version(packageJson.version)
  .option('--connect <file>', 'Path to custom connection file (default: connect.json)');

// Init command (replaces setup)
program
  .command('init')
  .description('Initialize database with all tables, indexes, and seed data')
  .argument('[project]', 'Project to initialize database for')
  .option('--force', 'Force re-creation of tables even if they exist and skip confirmation prompts')
  .option('-d, --database <name>', 'Database to connect to')
  .action(initCommand);

// Add Column command
program
  .command('add-column')
  .description('Add a new column to an existing table')
  .argument('[project]', 'Project to modify database for')
  .argument('[table]', 'Table to add column to')
  .argument('[column]', 'Column name')
  .argument('[datatype]', 'Data type for the column')
  .option('--default <value>', 'Default value for the column')
  .option('--null', 'Column can be null (default)')
  .option('--not-null', 'Column cannot be null')
  .option('-d, --database <name>', 'Database to connect to')
  .option('--force', 'Skip confirmation prompts')
  .action(addColumnCommand);

// Create Index command
program
  .command('create-index')
  .description('Create an index on a table column')
  .argument('[project]', 'Project to modify database for')
  .argument('[table]', 'Table to create index on')
  .argument('[column]', 'Column to index')
  .option('--unique', 'Create a unique index')
  .option('-d, --database <name>', 'Database to connect to')
  .option('--force', 'Skip confirmation prompts')
  .action(createIndexCommand);

// Migrate command
program
  .command('migrate')
  .description('Execute a migration file containing SQL statements')
  .argument('[project]', 'Project to run migration for')
  .argument('[migration-file]', 'Path to migration file')
  .option('-d, --database <name>', 'Database to connect to')
  .option('--force', 'Skip confirmation prompts')
  .action(migrateCommand);

// Seed command
program
  .command('seed')
  .description('Seed database tables with initial data')
  .argument('[project]', 'Project to seed database for')
  .argument('[table]', 'Table to seed with data')
  .option('--file <path>', 'Path to JSON file with seed data')
  .option('-d, --database <name>', 'Database to connect to')
  .action(seedCommand);

// Check command
program
  .command('check')
  .description('Verify database structure and report issues')
  .argument('[project]', 'Project to check database for')
  .option('-d, --database <name>', 'Database to connect to')
  .option('--force', 'Skip confirmation prompts')
  .action(checkCommand);

// Backup command
program
  .command('backup')
  .description('Backup the entire database')
  .argument('[project]', 'Project to backup database for')
  .option('-o, --output <file>', 'Output file for backup')
  .option('--encrypt', 'Encrypt the backup')
  .option('-f, --format <format>', 'Backup format (plain or custom)', 'plain')
  .option('-d, --database <name>', 'Database to connect to')
  .option('--force', 'Skip confirmation prompts')
  .action(backupCommand);

// Restore command
program
  .command('restore')
  .description('Restore database from backup')
  .argument('[project]', 'Project to restore database for')
  .option('-i, --input <file>', 'Input backup file')
  .option('--dry-run', 'Verify backup without restoring')
  .option('-d, --database <name>', 'Database to connect to (target for restoration)')
  .action(restoreCommand);

// Delete Table command
program
  .command('delete-table')
  .description('Delete an existing table')
  .argument('[project]', 'Project to delete table for')
  .argument('[table]', 'Table to delete')
  .option('-d, --database <name>', 'Database to connect to')
  .action(deleteTableCommand);

// Rename Table command
program
  .command('rename-table')
  .description('Rename an existing table')
  .argument('[project]', 'Project to rename table for')
  .argument('[old-table]', 'Current table name')
  .argument('[new-table]', 'New table name')
  .option('-d, --database <name>', 'Database to connect to')
  .option('--force', 'Skip confirmation prompts')
  .action(renameTableCommand);

// Rename Column command
program
  .command('rename-column')
  .description('Rename a column in an existing table')
  .argument('[project]', 'Project to rename column for')
  .argument('[table]', 'Table containing the column')
  .argument('[old-column]', 'Current column name')
  .argument('[new-column]', 'New column name')
  .option('-d, --database <name>', 'Database to connect to')
  .option('--force', 'Skip confirmation prompts')
  .action(renameColumnCommand);

// Remove Column command
program
  .command('remove-column')
  .description('Remove a column from an existing table')
  .argument('[project]', 'Project to modify database for')
  .argument('[table]', 'Table to remove column from')
  .argument('[column]', 'Column to remove')
  .option('-d, --database <name>', 'Database to connect to')
  .option('--force', 'Skip confirmation prompts')
  .action(removeColumnCommand);

// Manage Permissions command
program
  .command('manage-permissions')
  .description('Manage database role permissions')
  .argument('[project]', 'Project to manage permissions for')
  .option('-d, --database <name>', 'Database to connect to')
  .action(managePermissionsCommand);

// List Databases command
program
  .command('list-databases')
  .alias('dbs')
  .description('List all accessible databases')
  .argument('[project]', 'Project to connect through')
  .option('-d, --database <name>', 'Database to connect to')
  .action(listDatabasesCommand);

// List Tables command
program
  .command('list-tables')
  .alias('tables')
  .description('List all tables in the database')
  .argument('[project]', 'Project to list tables for')
  .option('-D, --detailed', 'Show detailed information including row counts')
  .option('-d, --database <name>', 'Database to connect to')
  .action(listTablesCommand);

// List Columns command
program
  .command('list-columns')
  .alias('columns')
  .description('List all columns in a table')
  .argument('[project]', 'Project to list columns for')
  .argument('[table]', 'Table to list columns for')
  .option('-d, --database <name>', 'Database to connect to')
  .action(listColumnsCommand);

// Count Records command
program
  .command('count-records')
  .alias('count')
  .description('Count records in a table')
  .argument('[project]', 'Project to count records for')
  .argument('[table]', 'Table to count records in')
  .option('-a, --all', 'Count records in all tables')
  .option('-D, --detailed', 'Show detailed statistics')
  .option('-w, --where <condition>', 'SQL WHERE condition')
  .option('-d, --database <name>', 'Database to connect to')
  .action(countRecordsCommand);

// Query command
program
  .command('query')
  .description('Execute a raw SQL query')
  .argument('[project]', 'Project to execute query for')
  .argument('[sql]', 'SQL query to execute')
  .option('-d, --database <name>', 'Database to connect to')
  .option('-r, --raw <query>', 'Raw SQL query (alternative to passing as argument)')
  .option('-j, --json', 'Output results in JSON format')
  .option('-v, --verbose', 'Show verbose output')
  .option('--force', 'Skip confirmation prompts')
  .action(queryCommand);

// Search command
program
  .command('search')
  .description('Search for values across database tables and columns')
  .argument('[project]', 'Project to search in')
  .argument('[table]', 'Table to search in (optional)')
  .argument('[column]', 'Column to search in (optional)')
  .argument('[value]', 'Value to search for')
  .option('-d, --database <name>', 'Database to connect to')
  .option('-V, --value <search>', 'Value to search for (alternative to passing as argument)')
  .option('-l, --limit <name>', 'Maximum number of results to return (default: 1000)', parseInt)
  .option('-j, --json', 'Output results in JSON format')
  .option('--csv', 'Output results in CSV format')
  .option('-c, --compact', 'Show only matching columns in results')
  .option('--case-sensitive', 'Perform case-sensitive search')
  .option('-e, --exact', 'Search for exact matches only')
  .option('--verbose', 'Show verbose output during search')
  .action(searchCommand);

// Auto-backup command
program
  .command('auto-backup')
  .description('Set up or disable automatic backups')
  .argument('<project>', 'Project to set up automatic backups for')
  .option('-d, --database <name>', 'Database to connect to')
  .option('--backup-dir <path>', 'Directory to store backups (default: ./backups)')
  .option('--retention-days <days>', 'Number of days to keep backups (default: 30)', parseInt)
  .option('--format <format>', 'Backup format - plain or custom (default: custom)')
  .option('--encrypt', 'Encrypt the backups')
  .option('--schedule <cron>', 'Cron schedule (default: "0 0 * * *" - daily at midnight)')
  .option('--disable', 'Disable automatic backups for the project')
  .action(autoBackupCommand);

program.parse(process.argv);