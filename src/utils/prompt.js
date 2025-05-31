// src/utils/prompt.js
// This file contains utility functions for interactive command-line prompts
// Provides user prompts for projects, tables/collections, columns/fields, and confirmations

const inquirer = require('inquirer');
const { listProjects, listTables, getTableColumns, getDatabaseType } = require('./db');

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
 * @param {Pool|Object} connection - PostgreSQL connection pool or MongoDB connection
 * @param {string} [dbType] - Database type ('postgres' or 'mongodb')
 * @returns {Promise<string|null>} The selected table name or null if no tables found
 */
async function promptForTable(connection, dbType = 'postgres') {
  const tables = await listTables(connection);
  
  if (tables.length === 0) {
    console.log(`No ${dbType === 'mongodb' ? 'collections' : 'tables'} found in the database`);
    return null;
  }
  
  const promptMessage = dbType === 'mongodb' ? 'Select a collection:' : 'Select a table:';
  const promptName = dbType === 'mongodb' ? 'collectionName' : 'tableName';
  
  const result = await inquirer.prompt([
    {
      type: 'list',
      name: promptName,
      message: promptMessage,
      choices: tables
    }
  ]);
  
  return result[promptName];
}

/**
 * Prompts the user to select a collection from MongoDB
 * @param {Object} connection - MongoDB connection object with db property
 * @returns {Promise<string|null>} The selected collection name or null if no collections found
 */
async function promptForCollection(connection) {
  return promptForTable(connection, 'mongodb');
}

/**
 * Prompts the user to select a column from a specific table
 * @param {Pool|Object} connection - PostgreSQL connection pool or MongoDB connection object
 * @param {string} tableName - Name of the table or collection
 * @param {string} [dbType] - Database type ('postgres' or 'mongodb')
 * @returns {Promise<string|null>} The selected column/field name or null if none found
 */
async function promptForColumn(connection, tableName, dbType = 'postgres') {
  const columns = await getTableColumns(connection, tableName);
  
  if (columns.length === 0) {
    console.log(`No ${dbType === 'mongodb' ? 'fields' : 'columns'} found in ${dbType === 'mongodb' ? 'collection' : 'table'} ${tableName}`);
    return null;
  }
  
  const promptMessage = dbType === 'mongodb' ? 'Select a field:' : 'Select a column:';
  const promptName = 'columnName';
  const columnProperty = dbType === 'mongodb' ? 'name' : 'column_name';
  
  const { columnName } = await inquirer.prompt([
    {
      type: 'list',
      name: promptName,
      message: promptMessage,
      choices: columns.map(col => col[columnProperty])
    }
  ]);
  
  return columnName;
}

/**
 * Prompts the user to select a field from a MongoDB collection
 * @param {Object} connection - MongoDB connection object with db property
 * @param {string} collectionName - Name of the collection
 * @returns {Promise<string|null>} The selected field name or null if no fields found
 */
async function promptForField(connection, collectionName) {
  return promptForColumn(connection, collectionName, 'mongodb');
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
  promptForCollection,
  promptForField,
  promptForColumn,
  promptForColumnDefinition,
  confirmAction
};