/**
 * @fileoverview PostgreSQL create table command implementation
 * @module commands/postgres/create-table
 * @author DB Tools Team
 * @version 1.0.0
 * 
 * This module provides functionality to create new tables in PostgreSQL databases
 * with comprehensive validation, column definitions, constraints, and indexes.
 */

const db = require('../../utils/db');
const { confirmAction } = require('../../utils/prompt');
const { validateDatabaseIdentifier, validateNonEmptyString, throwIfInvalid } = require('../../utils/validation');
const chalk = require('chalk');

/**
 * Creates a new table in a PostgreSQL database
 * 
 * @param {Object} connection - PostgreSQL connection object
 * @param {string} table - Name of the table to create
 * @param {string} definition - SQL definition for the table (columns, constraints, etc.)
 * @param {Object} [options={}] - Command options
 * @param {boolean} [options.force=false] - Skip confirmation prompts
 * @param {boolean} [options.dryRun=false] - Show what would be executed without running
 * 
 * @returns {Promise<boolean>} True if table was created successfully, false otherwise
 * 
 * @throws {Error} Throws validation errors for invalid inputs
 */
async function createPostgresTable(connection, table, definition, options = {}) {
  try {
    // Validate inputs
    const tableValidation = validateDatabaseIdentifier(table, 'Table name');
    throwIfInvalid(tableValidation);
    
    const definitionValidation = validateNonEmptyString(definition, 'Table definition');
    throwIfInvalid(definitionValidation);
    
    // Check if table already exists
    const tableExists = await db.postgres.tableExists(connection, table);
    if (tableExists) {
      console.error(chalk.red(`Table "${table}" already exists`));
      return false;
    }
    
    // Build the CREATE TABLE statement
    const createTableQuery = `CREATE TABLE "${table}" (${definition})`;
    
    // Show what will be executed
    console.log(chalk.cyan('About to execute:'));
    console.log(chalk.gray(createTableQuery));
    
    // If dry run, stop here
    if (options.dryRun) {
      console.log(chalk.yellow('Dry run mode - no changes made'));
      return true;
    }
    
    // Confirm action if not forced
    if (!options.force) {
      const confirmed = await confirmAction(
        `Are you sure you want to create table "${table}"?`
      );
      
      if (!confirmed) {
        console.log('Operation cancelled');
        return false;
      }
    }
    
    // Execute the CREATE TABLE statement
    await db.postgres.executeQuery(connection, createTableQuery);
    
    console.log(chalk.green(`✓ Table "${table}" successfully created`));
    return true;
  } catch (error) {
    console.error(chalk.red('Error creating PostgreSQL table:'), error.message);
    return false;
  }
}

module.exports = createPostgresTable;