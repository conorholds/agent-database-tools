// src/commands/postgres/rename-table.js
// This file is used to rename a PostgreSQL table

const db = require('../../utils/db');
const { promptForTable } = require('../../utils/prompt');
const chalk = require('chalk');
const inquirer = require('inquirer');

/**
 * Renames a PostgreSQL table
 * @param {Object} connection - PostgreSQL connection
 * @param {string} oldTableName - Current name of the table to rename
 * @param {string} newTableName - New name for the table
 * @param {Object} options - Command options
 * @returns {Promise<boolean>} True if table was renamed successfully, false otherwise
 */
async function renamePostgresTable(connection, oldTableName, newTableName, options) {
  try {
    // If old table name not provided, prompt for it
    if (!oldTableName) {
      oldTableName = await promptForTable(connection, 'postgres', 'Select table to rename:');
      if (!oldTableName) {
        console.error(chalk.red('No table selected for renaming.'));
        return false;
      }
    } else {
      // Verify that old table exists
      const oldTableExists = await db.postgres.tableExists(connection, oldTableName);
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
    const newTableExists = await db.postgres.tableExists(connection, newTableName);
    if (newTableExists) {
      console.error(chalk.red(`Table "${newTableName}" already exists. Please choose a different name.`));
      return false;
    }
    
    // Check for dependent objects
    const dependencyQuery = `
      SELECT 
        dependent_ns.nspname as dependent_schema,
        dependent_view.relname as dependent_view 
      FROM pg_depend 
      JOIN pg_rewrite ON pg_depend.objid = pg_rewrite.oid 
      JOIN pg_class as dependent_view ON pg_rewrite.ev_class = dependent_view.oid 
      JOIN pg_class as source_table ON pg_depend.refobjid = source_table.oid 
      JOIN pg_namespace dependent_ns ON dependent_view.relnamespace = dependent_ns.oid 
      JOIN pg_namespace source_ns ON source_table.relnamespace = source_ns.oid 
      WHERE 
        source_ns.nspname = 'public'
        AND source_table.relname = $1
        AND dependent_ns.nspname = 'public'
        AND dependent_view.relname != $1;
    `;
    
    const dependentObjects = await db.postgres.executeQuery(connection, dependencyQuery, [oldTableName]);
    
    if (dependentObjects.rows.length > 0) {
      console.log(chalk.yellow(`Warning: Table "${oldTableName}" has dependent objects that may be affected by this rename:`));
      dependentObjects.rows.forEach(obj => {
        console.log(`- ${obj.dependent_schema}.${obj.dependent_view}`);
      });
      
      if (!options.force) {
        const { proceed } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'proceed',
            message: 'Do you want to proceed with the rename? This may affect dependent objects.',
            default: false
          }
        ]);
        
        if (!proceed) {
          console.log(chalk.yellow('Table rename cancelled.'));
          return false;
        }
      } else {
        console.log(chalk.yellow('Proceeding with rename despite dependent objects (--force enabled)'));
      }
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
    
    await db.postgres.executeQuery(connection, renameQuery);
    console.log(chalk.green(`✓ Table "${oldTableName}" successfully renamed to "${newTableName}"`));
    
    return true;
  } catch (error) {
    console.error(chalk.red('Error renaming PostgreSQL table:'), error.message);
    return false;
  }
}

module.exports = renamePostgresTable;