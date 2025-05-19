// src/commands/rename-table.js
// This file is used to rename a database table

const { createPool, executeQuery, tableExists } = require('../utils/db');
const { promptForProject, promptForTable } = require('../utils/prompt');
const chalk = require('chalk');
const inquirer = require('inquirer');

/**
 * Command to rename a database table
 * @param {string} projectName - Name of the project
 * @param {string} oldTableName - Current name of the table to rename
 * @param {string} newTableName - New name for the table
 * @param {Object} [cmdOptions={}] - Command-specific options
 * @param {Object} [cmd] - Commander command object
 * @param {boolean} [cmd.parent.opts().force] - Whether to force operations without confirmation
 * @param {string} [cmd.parent.opts().connect] - Custom path to connection file
 * @param {string} [cmdOptions.database] - Database name to override default
 * @returns {Promise<boolean>} True if table was renamed successfully, false otherwise
 */
async function renameTableCommand(projectName, oldTableName, newTableName, cmdOptions = {}, cmd) {
  // Merge command options with global options
  const options = { ...cmd?.parent?.opts(), ...cmdOptions };
  
  // If project name not provided, prompt for it
  if (!projectName) {
    projectName = await promptForProject();
  }
  
  // Create DB connection pool with optional database
  const pool = createPool(projectName, options);
  
  try {
    // If old table name not provided, prompt for it
    if (!oldTableName) {
      oldTableName = await promptForTable(pool, 'Select table to rename:');
      if (!oldTableName) {
        console.error(chalk.red('No table selected for renaming.'));
        return false;
      }
    } else {
      // Verify that old table exists
      const oldTableExists = await tableExists(pool, oldTableName);
      if (!oldTableExists) {
        console.error(chalk.red(`Table "${oldTableName}" does not exist`));
        return false;
      }
    }
    
    // If new table name not provided, prompt for it
    if (!newTableName) {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'newTableName',
          message: 'Enter the new table name:',
          validate: (input) => {
            if (input.trim() === '') {
              return 'Table name cannot be empty';
            }
            if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(input)) {
              return 'Table name must start with a letter or underscore and contain only letters, numbers, and underscores';
            }
            return true;
          }
        }
      ]);
      newTableName = answers.newTableName;
    }
    
    // Verify that new table name doesn't already exist
    const newTableExists = await tableExists(pool, newTableName);
    if (newTableExists) {
      console.error(chalk.red(`Table "${newTableName}" already exists. Please choose a different name.`));
      return false;
    }
    
    // Confirm rename if not using force option
    if (!options.force) {
      const answers = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Are you sure you want to rename table "${oldTableName}" to "${newTableName}"?`,
          default: false
        }
      ]);
      
      if (!answers.confirm) {
        console.log(chalk.yellow('Table rename cancelled.'));
        return false;
      }
    }
    
    // Execute rename query
    const renameQuery = `ALTER TABLE "${oldTableName}" RENAME TO "${newTableName}"`;
    console.log(chalk.cyan('About to execute:'));
    console.log(renameQuery);
    
    await executeQuery(pool, renameQuery);
    console.log(chalk.green(`✓ Table "${oldTableName}" successfully renamed to "${newTableName}"`));
    
    return true;
  } catch (error) {
    console.error(chalk.red('Error renaming table:'), error.message);
    return false;
  } finally {
    // Close connection pool
    await pool.end();
  }
}

module.exports = renameTableCommand;