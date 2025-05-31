// src/commands/postgres/rename-column.js
// This file is used to rename a column in a PostgreSQL table

const db = require('../../utils/db');
const { promptForTable, promptForColumn } = require('../../utils/prompt');
const chalk = require('chalk');
const inquirer = require('inquirer');

/**
 * Renames a column in a PostgreSQL table
 * @param {Object} connection - PostgreSQL connection
 * @param {string} tableName - Name of the table containing the column
 * @param {string} oldColumnName - Current name of the column to rename
 * @param {string} newColumnName - New name for the column
 * @param {Object} options - Command options
 * @returns {Promise<boolean>} True if column was renamed successfully, false otherwise
 */
async function renamePostgresColumn(connection, tableName, oldColumnName, newColumnName, options) {
  try {
    // If table name not provided, prompt for it
    if (!tableName) {
      tableName = await promptForTable(connection, 'postgres');
      if (!tableName) {
        console.error(chalk.red('No table selected.'));
        return false;
      }
    } else {
      // Verify that table exists
      const tableExistsResult = await db.postgres.tableExists(connection, tableName);
      if (!tableExistsResult) {
        console.error(chalk.red(`Table "${tableName}" does not exist`));
        return false;
      }
    }
    
    // If old column name not provided, prompt for it
    if (!oldColumnName) {
      oldColumnName = await promptForColumn(connection, tableName, 'Select column to rename:');
      if (!oldColumnName) {
        console.error(chalk.red('No column selected for renaming.'));
        return false;
      }
    } else {
      // Verify that old column exists
      const oldColumnExistsResult = await db.postgres.columnExists(connection, tableName, oldColumnName);
      if (!oldColumnExistsResult) {
        console.error(chalk.red(`Column "${oldColumnName}" does not exist in table "${tableName}"`));
        return false;
      }
    }
    
    // If new column name not provided, prompt for it
    if (!newColumnName) {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'newColumnName',
          message: 'Enter the new column name:',
          validate: (input) => {
            if (input.trim() === '') {
              return 'Column name cannot be empty';
            }
            if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(input)) {
              return 'Column name must start with a letter or underscore and contain only letters, numbers, and underscores';
            }
            return true;
          }
        }
      ]);
      newColumnName = answers.newColumnName;
    }
    
    // Verify that new column name doesn't already exist in the table
    const newColumnExistsResult = await db.postgres.columnExists(connection, tableName, newColumnName);
    if (newColumnExistsResult) {
      console.error(chalk.red(`Column "${newColumnName}" already exists in table "${tableName}". Please choose a different name.`));
      return false;
    }
    
    // Confirm rename if not using force option
    if (!options.force) {
      const answers = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Are you sure you want to rename column "${oldColumnName}" to "${newColumnName}" in table "${tableName}"?`,
          default: false
        }
      ]);
      
      if (!answers.confirm) {
        console.log(chalk.yellow('Column rename cancelled.'));
        return false;
      }
    }
    
    // Execute rename query
    const renameQuery = `ALTER TABLE "${tableName}" RENAME COLUMN "${oldColumnName}" TO "${newColumnName}"`;
    console.log(chalk.cyan('About to execute:'));
    console.log(renameQuery);
    
    await db.postgres.executeQuery(connection, renameQuery);
    console.log(chalk.green(`✓ Column "${oldColumnName}" successfully renamed to "${newColumnName}" in table "${tableName}"`));
    
    return true;
  } catch (error) {
    console.error(chalk.red('Error renaming PostgreSQL column:'), error.message);
    return false;
  }
}

module.exports = renamePostgresColumn;