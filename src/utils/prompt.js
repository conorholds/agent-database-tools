// src/utils/prompt.js
// This file contains utility functions for interactive command-line prompts
// Provides user prompts for projects, tables, columns, and confirmations

const inquirer = require('inquirer');
const { listProjects, listTables, getTableColumns } = require('./db');

/**
 * Prompts the user to select a project from available projects
 * @returns {Promise<string>} The selected project name
 */
async function promptForProject() {
  const projects = await listProjects();
  
  const { projectName } = await inquirer.prompt([
    {
      type: 'list',
      name: 'projectName',
      message: 'Select a project:',
      choices: projects
    }
  ]);
  
  return projectName;
}

/**
 * Prompts the user to select a table from the database
 * @param {Pool} pool - PostgreSQL connection pool
 * @returns {Promise<string|null>} The selected table name or null if no tables found
 */
async function promptForTable(pool) {
  const tables = await listTables(pool);
  
  if (tables.length === 0) {
    console.log('No tables found in the database');
    return null;
  }
  
  const { tableName } = await inquirer.prompt([
    {
      type: 'list',
      name: 'tableName',
      message: 'Select a table:',
      choices: tables
    }
  ]);
  
  return tableName;
}

/**
 * Prompts the user to select a column from a specific table
 * @param {Pool} pool - PostgreSQL connection pool
 * @param {string} tableName - Name of the table
 * @returns {Promise<string|null>} The selected column name or null if no columns found
 */
async function promptForColumn(pool, tableName) {
  const columns = await getTableColumns(pool, tableName);
  
  if (columns.length === 0) {
    console.log(`No columns found in table ${tableName}`);
    return null;
  }
  
  const { columnName } = await inquirer.prompt([
    {
      type: 'list',
      name: 'columnName',
      message: 'Select a column:',
      choices: columns.map(col => col.column_name)
    }
  ]);
  
  return columnName;
}

/**
 * Prompts the user to provide details for a new column definition
 * @returns {Promise<Object>} Column definition object with name, type, nullable, and default properties
 */
async function promptForColumnDefinition() {
  const { columnName } = await inquirer.prompt([
    {
      type: 'input',
      name: 'columnName',
      message: 'Enter column name:',
      validate: input => input.trim() !== ''
    }
  ]);
  
  const { dataType } = await inquirer.prompt([
    {
      type: 'list',
      name: 'dataType',
      message: 'Select data type:',
      choices: [
        'text',
        'integer',
        'bigint',
        'boolean',
        'date',
        'timestamp',
        'json',
        'jsonb',
        'uuid',
        'varchar',
        'numeric',
        'float',
        'serial'
      ]
    }
  ]);
  
  const { nullable } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'nullable',
      message: 'Can this column be null?',
      default: true
    }
  ]);
  
  const { defaultValue } = await inquirer.prompt([
    {
      type: 'input',
      name: 'defaultValue',
      message: 'Default value (leave empty for none):'
    }
  ]);
  
  return {
    name: columnName,
    type: dataType,
    nullable,
    default: defaultValue.trim() !== '' ? defaultValue : null
  };
}

/**
 * Prompts the user to confirm an action
 * @param {string} message - Confirmation message to display
 * @returns {Promise<boolean>} True if confirmed, false otherwise
 */
async function confirmAction(message) {
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message,
      default: false
    }
  ]);
  
  return confirm;
}

module.exports = {
  promptForProject,
  promptForTable,
  promptForColumn,
  promptForColumnDefinition,
  confirmAction
};