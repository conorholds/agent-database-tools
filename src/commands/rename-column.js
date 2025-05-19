// src/commands/rename-column.js
// This file is used to rename a column in a database table

const { createPool, executeQuery, tableExists, columnExists } = require('../utils/db');
const { promptForProject, promptForTable, promptForColumn } = require('../utils/prompt');
const chalk = require('chalk');
const inquirer = require('inquirer');

/**
 * Command to rename a column in a database table
 * @param {string} projectName - Name of the project
 * @param {string} tableName - Name of the table containing the column
 * @param {string} oldColumnName - Current name of the column to rename
 * @param {string} newColumnName - New name for the column
 * @param {Object} [cmdOptions={}] - Command-specific options
 * @param {Object} [cmd] - Commander command object
 * @param {boolean} [cmd.parent.opts().force] - Whether to force operations without confirmation
 * @param {string} [cmd.parent.opts().connect] - Custom path to connection file
 * @param {string} [cmdOptions.database] - Database name to override default
 * @returns {Promise<boolean>} True if column was renamed successfully, false otherwise
 */
async function renameColumnCommand(projectName, tableName, oldColumnName, newColumnName, cmdOptions = {}, cmd) {
  // Merge command options with global options
  const options = { ...cmd?.parent?.opts(), ...cmdOptions };
  
  // If project name not provided, prompt for it
  if (!projectName) {
    projectName = await promptForProject();
  }
  
  // Create DB connection pool with optional database
  const pool = createPool(projectName, options);
  
  try {
    // If table name not provided, prompt for it
    if (!tableName) {
      tableName = await promptForTable(pool);
      if (!tableName) {
        console.error(chalk.red('No table selected.'));
        return false;
      }
    } else {
      // Verify that table exists
      const tableExistsResult = await tableExists(pool, tableName);
      if (!tableExistsResult) {
        console.error(chalk.red(`Table "${tableName}" does not exist`));
        return false;
      }
    }
    
    // If old column name not provided, prompt for it
    if (!oldColumnName) {
      oldColumnName = await promptForColumn(pool, tableName, 'Select column to rename:');
      if (!oldColumnName) {
        console.error(chalk.red('No column selected for renaming.'));
        return false;
      }
    } else {
      // Verify that old column exists
      const oldColumnExistsResult = await columnExists(pool, tableName, oldColumnName);
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
    const newColumnExistsResult = await columnExists(pool, tableName, newColumnName);
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
    
    await executeQuery(pool, renameQuery);
    console.log(chalk.green(`✓ Column "${oldColumnName}" successfully renamed to "${newColumnName}" in table "${tableName}"`));
    
    return true;
  } catch (error) {
    console.error(chalk.red('Error renaming column:'), error.message);
    return false;
  } finally {
    // Close connection pool
    await pool.end();
  }
}

module.exports = renameColumnCommand;