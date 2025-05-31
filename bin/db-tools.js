#!/usr/bin/env node

const { program } = require('commander');
const fs = require('fs');
const path = require('path');
const packageJson = require('../package.json');
const db = require('../src/utils/db');
const chalk = require('chalk');

const { createCommandAdapter } = require('../src/utils/command-adapter');

// Helper function to ensure process exits after command execution
async function executeCommandAndExit(implementation, ...args) {
  try {
    const result = await implementation(...args);
    process.exit(result ? 0 : 1);
  } catch (error) {
    console.error(chalk.red('Command execution error:'), error.message);
    process.exit(1);
  }
}

// Utility function to dynamically select the appropriate command implementation based on database type
/**
 * Gets the appropriate command implementation based on database type
 * @param {string} projectName - Name of the project
 * @param {Object} options - Command options
 * @param {string} commandName - Name of the command
 * @returns {Promise<Function>} The appropriate command implementation
 */
async function getCommandImplementation(projectName, options, commandName) {
  try {
    if (!projectName) {
      // If no project is specified, we can't determine the database type
      // In this case, we'll use the "init" implementation which will prompt for the project
      const initCommand = require(`../src/commands/init`);
      return initCommand;
    }

    // Get connection info to determine database type
    let dbType;
    
    try {
      // First, try using the new modular approach
      const connection = db.getConnectionForProject(projectName, options);
      dbType = db.getDatabaseType(connection);
    } catch (moduleError) {
      console.error(chalk.yellow(`Warning: Error with modular DB approach: ${moduleError.message}`));
      
      // For test environment, let's provide a fallback
      console.log(chalk.cyan(`Using fallback postgres implementation for ${commandName} command`));
      dbType = 'postgres';
    }
    
    console.log(chalk.cyan(`Using ${dbType} implementation for ${commandName} command`));
    
    // Load the appropriate database-specific implementation
    try {
      const implementation = require(`../src/commands/${dbType}/${commandName}`);
      // Wrap the implementation with the adapter to handle connection management
      return createCommandAdapter(implementation);
    } catch (e) {
      // If database-specific implementation is not found, try to load the generic one
      console.warn(chalk.yellow(`Warning: No ${dbType}-specific implementation found for ${commandName}, falling back to generic implementation`));
      try {
        const fallbackImplementation = require(`../src/commands/${commandName}`);
        return fallbackImplementation;
      } catch (fallbackError) {
        console.error(chalk.red(`Error: No implementation found for command '${commandName}'`));
        process.exit(1);
      }
    }
  } catch (error) {
    console.error(chalk.red(`Error determining command implementation:`), error.message);
    process.exit(1);
  }
}

// Special case commands that don't depend on database type
const initCommand = require('../src/commands/init');
const migrateCommand = require('../src/commands/postgres/migrate');
const seedCommand = require('../src/commands/seed');
const checkCommand = require('../src/commands/check');
const managePermissionsCommand = require('../src/commands/postgres/manage-permissions');
const autoBackupCommand = require('../src/commands/auto-backup');
const validateConfigCommand = require('../src/commands/validate-config');

program
  .name('db-tools')
  .description('CLI tool to manage PostgreSQL databases')
  .version(packageJson.version)
  .option('--connect <file>', 'Path to custom connection file (default: connect.json)')
  .option('--type <type>', 'Database type (postgres|mongodb) - useful when multiple connections share the same name');

// Init command (replaces setup)
program
  .command('init')
  .description('Initialize database with all tables, indexes, and seed data')
  .argument('[project]', 'Project to initialize database for')
  .option('--force', 'Force re-creation of tables even if they exist and skip confirmation prompts')
  .option('-d, --database <name>', 'Database to connect to')
  .action(async (...args) => {
    await executeCommandAndExit(initCommand, ...args);
  });

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
  .action(async (project, table, column, datatype, options, cmd) => {
    const implementation = await getCommandImplementation(project, cmd?.parent?.opts(), 'add-column');
    await executeCommandAndExit(implementation, project, table, column, datatype, options, cmd);
  });

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
  .action(async (project, table, column, options, cmd) => {
    const implementation = await getCommandImplementation(project, cmd?.parent?.opts(), 'create-index');
    await executeCommandAndExit(implementation, project, table, column, options, cmd);
  });

// Create Table command
program
  .command('create-table')
  .description('Create a new table')
  .argument('[project]', 'Project to create table for')
  .argument('[table]', 'Name of the table to create')
  .argument('[definition]', 'SQL definition for table columns and constraints')
  .option('-d, --database <name>', 'Database to connect to')
  .option('--dry-run', 'Show what would be executed without making changes')
  .option('--force', 'Skip confirmation prompts')
  .action(async (project, table, definition, options, cmd) => {
    const implementation = await getCommandImplementation(project, cmd?.parent?.opts(), 'create-table');
    await executeCommandAndExit(implementation, project, table, definition, options, cmd);
  });

// Migrate command
program
  .command('migrate')
  .description('Execute a migration file containing SQL statements')
  .argument('[project]', 'Project to run migration for')
  .argument('[migration-file]', 'Path to migration file')
  .option('-d, --database <name>', 'Database to connect to')
  .option('--force', 'Skip confirmation prompts')
  .action(async (...args) => {
    await executeCommandAndExit(migrateCommand, ...args);
  });

// Seed command
program
  .command('seed')
  .description('Seed database tables with initial data')
  .argument('[project]', 'Project to seed database for')
  .argument('[table]', 'Table to seed with data')
  .option('--file <path>', 'Path to JSON file with seed data')
  .option('-d, --database <name>', 'Database to connect to')
  .action(async (...args) => {
    await executeCommandAndExit(seedCommand, ...args);
  });

// Check command
program
  .command('check')
  .description('Verify database structure and report issues')
  .argument('[project]', 'Project to check database for')
  .option('-d, --database <name>', 'Database to connect to')
  .option('--force', 'Skip confirmation prompts')
  .action(async (...args) => {
    await executeCommandAndExit(checkCommand, ...args);
  });

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
  .action(async (project, options, cmd) => {
    // For backup, we need special handling to ensure connection info is passed
    if (project) {
      try {
        // Get the direct PostgreSQL or MongoDB implementation based on project type
        const connection = db.getConnectionForProject(project, cmd?.parent?.opts());
        const dbType = db.getDatabaseType(connection);
        
        // Load the implementation directly, bypassing the dynamic selection
        let implementation;
        if (dbType === 'postgres') {
          implementation = require(`../src/commands/postgres/backup`);
        } else if (dbType === 'mongodb') {
          implementation = require(`../src/commands/mongodb/backup`);
        } else {
          console.error(chalk.red(`Unsupported database type: ${dbType}`));
          return false;
        }
        
        console.log(chalk.cyan(`Using ${dbType} implementation for backup command`));
        
        // Call implementation directly with correct parameters
        const pool = dbType === 'postgres' ? await db.postgres.createPool(connection) : null;
        const mongoConnection = dbType === 'mongodb' ? await db.mongodb.createClient(connection) : null;
        
        try {
          // Execute the correct implementation with the connection and options
          let result;
          if (dbType === 'postgres') {
            result = await implementation(pool, options, connection);
          } else {
            result = await implementation(mongoConnection, options, connection);
          }
          
          // Exit with appropriate code
          process.exit(result ? 0 : 1);
        } finally {
          // Clean up connections
          if (pool) await pool.end();
          if (mongoConnection) await db.mongodb.closeClient(mongoConnection.client);
        }
      } catch (error) {
        console.error(chalk.red(`Error in backup command: ${error.message}`));
        process.exit(1);
      }
    } else {
      // Fall back to the normal method for selecting a project
      const implementation = await getCommandImplementation(null, cmd?.parent?.opts(), 'backup');
      const result = await implementation(null, options, cmd);
      process.exit(result ? 0 : 1);
    }
  });

// Restore command
program
  .command('restore')
  .description('Restore database from backup')
  .argument('[project]', 'Project to restore database for')
  .option('-i, --input <file>', 'Input backup file')
  .option('--dry-run', 'Verify backup without restoring')
  .option('-d, --database <name>', 'Database to connect to (target for restoration)')
  .option('--force', 'Skip confirmation prompts')
  .action(async (project, options, cmd) => {
    // For restore, we need special handling to ensure connection info is passed
    if (project) {
      try {
        // Get the direct PostgreSQL or MongoDB implementation based on project type
        const connection = db.getConnectionForProject(project, cmd?.parent?.opts());
        const dbType = db.getDatabaseType(connection);
        
        // Load the implementation directly, bypassing the dynamic selection
        let implementation;
        if (dbType === 'postgres') {
          implementation = require(`../src/commands/postgres/restore`);
        } else if (dbType === 'mongodb') {
          implementation = require(`../src/commands/mongodb/restore`);
        } else {
          console.error(chalk.red(`Unsupported database type: ${dbType}`));
          return false;
        }
        
        console.log(chalk.cyan(`Using ${dbType} implementation for restore command`));
        
        // Call implementation directly with correct parameters
        // Pass the database option to createPool to override the database
        const pool = dbType === 'postgres' ? await db.postgres.createPool(connection, options) : null;
        const mongoConnection = dbType === 'mongodb' ? await db.mongodb.createClient(connection) : null;
        
        try {
          // Execute the correct implementation with the connection and options
          let result;
          if (dbType === 'postgres') {
            result = await implementation(pool, options, connection);
          } else {
            result = await implementation(mongoConnection, options, connection);
          }
          
          // Exit with appropriate code
          process.exit(result ? 0 : 1);
        } finally {
          // Clean up connections
          if (pool) await pool.end();
          if (mongoConnection) await db.mongodb.closeClient(mongoConnection.client);
        }
      } catch (error) {
        console.error(chalk.red(`Error in restore command: ${error.message}`));
        process.exit(1);
      }
    } else {
      // Fall back to the normal method for selecting a project
      const implementation = await getCommandImplementation(null, cmd?.parent?.opts(), 'restore');
      const result = await implementation(null, options, cmd);
      process.exit(result ? 0 : 1);
    }
  });

// Delete Table command
program
  .command('delete-table')
  .description('Delete an existing table')
  .argument('[project]', 'Project to delete table for')
  .argument('[table]', 'Table to delete')
  .option('-d, --database <name>', 'Database to connect to')
  .option('--dry-run', 'Show what would be deleted without making actual changes')
  .option('--force', 'Skip confirmation prompts')
  .action(async (project, table, options, cmd) => {
    const implementation = await getCommandImplementation(project, cmd?.parent?.opts(), 'delete-table');
    await executeCommandAndExit(implementation, project, table, options, cmd);
  });

// Rename Table command
program
  .command('rename-table')
  .description('Rename an existing table')
  .argument('[project]', 'Project to rename table for')
  .argument('[old-table]', 'Current table name')
  .argument('[new-table]', 'New table name')
  .option('-d, --database <name>', 'Database to connect to')
  .option('--force', 'Skip confirmation prompts')
  .action(async (project, oldTable, newTable, options, cmd) => {
    const implementation = await getCommandImplementation(project, cmd?.parent?.opts(), 'rename-table');
    await executeCommandAndExit(implementation, project, oldTable, newTable, options, cmd);
  });

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
  .action(async (project, table, oldColumn, newColumn, options, cmd) => {
    const implementation = await getCommandImplementation(project, cmd?.parent?.opts(), 'rename-column');
    await executeCommandAndExit(implementation, project, table, oldColumn, newColumn, options, cmd);
  });

// Remove Column command
program
  .command('remove-column')
  .description('Remove a column from an existing table')
  .argument('[project]', 'Project to modify database for')
  .argument('[table]', 'Table to remove column from')
  .argument('[column]', 'Column to remove')
  .option('-d, --database <name>', 'Database to connect to')
  .option('--dry-run', 'Show what would be changed without making actual modifications')
  .option('--force', 'Skip confirmation prompts')
  .action(async (project, table, column, options, cmd) => {
    const implementation = await getCommandImplementation(project, cmd?.parent?.opts(), 'remove-column');
    await executeCommandAndExit(implementation, project, table, column, options, cmd);
  });

// Manage Permissions command
program
  .command('manage-permissions')
  .description('Manage database role permissions')
  .argument('[project]', 'Project to manage permissions for')
  .option('-d, --database <name>', 'Database to connect to')
  .action(async (...args) => {
    await executeCommandAndExit(managePermissionsCommand, ...args);
  });

// List Databases command
program
  .command('list-databases')
  .alias('dbs')
  .description('List all accessible databases')
  .argument('[project]', 'Project to connect through')
  .option('-d, --database <name>', 'Database to connect to')
  .action(async (project, options, cmd) => {
    const implementation = await getCommandImplementation(project, cmd?.parent?.opts(), 'list-databases');
    await executeCommandAndExit(implementation, project, options, cmd);
  });

// List Tables command
program
  .command('list-tables')
  .alias('tables')
  .description('List all tables in the database')
  .argument('[project]', 'Project to list tables for')
  .option('-D, --detailed', 'Show detailed information including row counts')
  .option('-d, --database <name>', 'Database to connect to')
  .action(async (project, options, cmd) => {
    const implementation = await getCommandImplementation(project, cmd?.parent?.opts(), 'list-tables');
    await executeCommandAndExit(implementation, project, options, cmd);
  });

// List Columns command
program
  .command('list-columns')
  .alias('columns')
  .description('List all columns in a table')
  .argument('[project]', 'Project to list columns for')
  .argument('[table]', 'Table to list columns for')
  .option('-d, --database <name>', 'Database to connect to')
  .action(async (project, table, options, cmd) => {
    const implementation = await getCommandImplementation(project, cmd?.parent?.opts(), 'list-columns');
    const result = await implementation(project, table, options, cmd);
    process.exit(result ? 0 : 1);
  });

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
  .action(async (project, table, options, cmd) => {
    const implementation = await getCommandImplementation(project, cmd?.parent?.opts(), 'count-records');
    await executeCommandAndExit(implementation, project, table, options, cmd);
  });

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
  .action(async (project, sql, options, cmd) => {
    const implementation = await getCommandImplementation(project, cmd?.parent?.opts(), 'query');
    await executeCommandAndExit(implementation, project, sql, options, cmd);
  });

// Search command
program
  .command('search')
  .description('Search for values across database tables and columns')
  .argument('[project]', 'Project to search in')
  .argument('[table]', 'Table to search in (optional)')
  .argument('[column]', 'Column to search in (optional)')
  .argument('[value]', 'Value to search for')
  .option('-d, --database <name>', 'Database to connect to')
  .option('-v, --value <search>', 'Value to search for (alternative to passing as argument)')
  .option('-l, --limit <name>', 'Maximum number of results to return (default: 1000)', parseInt)
  .option('-j, --json', 'Output results in JSON format')
  .option('--csv', 'Output results in CSV format')
  .option('-c, --compact', 'Show only matching columns in results')
  .option('--case-sensitive', 'Perform case-sensitive search')
  .option('-e, --exact', 'Search for exact matches only')
  .option('-r, --regex', 'Treat search value as a regular expression')
  .option('--recursive', 'Recursively search inside JSON/JSONB fields')
  .option('--highlight', 'Highlight matched text in output')
  .option('--verbose', 'Show verbose output during search')
  .action(async (project, table, column, value, options, cmd) => {
    // If value is provided via --value option, use that instead
    const searchValue = options.value || value;
    
    // Adjust arguments based on what was provided
    let searchTable = table;
    let searchColumn = column;
    
    // If only 2 arguments provided, it's project and search value
    if (!column && !value && !options.value) {
      // Search value is in the table position
      const actualSearchValue = table;
      searchTable = undefined;
      searchColumn = undefined;
      
      const implementation = await getCommandImplementation(project, cmd?.parent?.opts(), 'search');
      await executeCommandAndExit(implementation, project, searchTable, searchColumn, actualSearchValue, options, cmd);
    } else {
      const implementation = await getCommandImplementation(project, cmd?.parent?.opts(), 'search');
      await executeCommandAndExit(implementation, project, searchTable, searchColumn, searchValue, options, cmd);
    }
  });

// MongoDB-specific commands
program
  .command('rename-collection')
  .description('Rename a MongoDB collection')
  .argument('[project]', 'Project name')
  .argument('[oldName]', 'Current collection name')
  .argument('[newName]', 'New collection name')
  .option('-d, --database <name>', 'Database to connect to')
  .option('--force', 'Skip confirmation prompts')
  .action(async (project, oldName, newName, options, cmd) => {
    const implementation = await getCommandImplementation(project, cmd?.parent?.opts(), 'rename-collection');
    await executeCommandAndExit(implementation, project, oldName, newName, options, cmd);
  });

program
  .command('delete-collection')
  .description('Delete a MongoDB collection')
  .argument('[project]', 'Project name')
  .argument('[collection]', 'Collection name to delete')
  .option('-d, --database <name>', 'Database to connect to')
  .option('--force', 'Skip confirmation prompts')
  .action(async (project, collection, options, cmd) => {
    const implementation = await getCommandImplementation(project, cmd?.parent?.opts(), 'delete-collection');
    await executeCommandAndExit(implementation, project, collection, options, cmd);
  });

program
  .command('remove-field')
  .description('Remove a field from all documents in a MongoDB collection')
  .argument('[project]', 'Project name')
  .argument('[collection]', 'Collection name')
  .argument('[field]', 'Field name to remove')
  .option('-d, --database <name>', 'Database to connect to')
  .option('--dry-run', 'Show what would be removed without actually removing')
  .option('--force', 'Skip confirmation prompts')
  .action(async (project, collection, field, options, cmd) => {
    const implementation = await getCommandImplementation(project, cmd?.parent?.opts(), 'remove-field');
    await executeCommandAndExit(implementation, project, collection, field, options, cmd);
  });

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
  .action(async (...args) => {
    await executeCommandAndExit(autoBackupCommand, ...args);
  });

// Validate Config command
program
  .command('validate-config')
  .description('Validate connect.json configuration and test database connections')
  .option('-t, --test-connections', 'Test actual database connectivity')
  .option('-v, --verbose', 'Show detailed output including suggestions')
  .option('--fix', 'Offer interactive fixes for common configuration issues')
  .action(async (...args) => {
    await executeCommandAndExit(validateConfigCommand, ...args);
  });

// List Temporary Backups command
program
  .command('list-temp-backups')
  .description('List all temporary backups (auto-created before dangerous operations)')
  .action(async (...args) => {
    await executeCommandAndExit(require('../src/commands/list-temp-backups'), ...args);
  });

// Restore from Temporary Backup command
program
  .command('restore-temp')
  .description('Restore database from a temporary backup')
  .argument('[project]', 'Project to restore')
  .argument('[backup-name]', 'Name of the temporary backup')
  .option('--force', 'Skip confirmation prompts')
  .action(async (...args) => {
    await executeCommandAndExit(require('../src/commands/restore-temp'), ...args);
  });

// Setup automatic cleanup on startup
const { setupAutoCleanup } = require('../src/utils/temp-backup');
setupAutoCleanup();

program.parse(process.argv);