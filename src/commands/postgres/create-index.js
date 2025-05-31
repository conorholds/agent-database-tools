// src/commands/postgres/create-index.js
// This file is used to create an index on a PostgreSQL table column for improved query performance

const db = require('../../utils/db');
const { promptForTable, confirmAction } = require('../../utils/prompt');
const inquirer = require('inquirer');
const chalk = require('chalk');

/**
 * Creates an index on a PostgreSQL table column
 * @param {Object} connection - PostgreSQL connection
 * @param {string} table - Name of the table
 * @param {string} column - Name of the column to create index on
 * @param {Object} options - Command options
 * @returns {Promise<boolean>} True if index was created successfully, false otherwise
 */
async function createPostgresIndex(connection, table, column, options) {
  try {
    // If table not provided, prompt for it
    if (!table) {
      table = await promptForTable(connection, 'postgres');
      if (!table) {
        return false;
      }
    } else {
      // Verify that table exists
      const exists = await db.postgres.tableExists(connection, table);
      if (!exists) {
        console.error(chalk.red(`Table "${table}" does not exist`));
        return false;
      }
    }
    
    // If column not provided, prompt for it
    let columns = [];
    
    if (!column) {
      const { selectedColumns } = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'selectedColumns',
          message: 'Select columns to include in the index:',
          choices: async () => {
            const tableColumns = await db.postgres.executeQuery(
              connection,
              `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
              [table]
            );
            return tableColumns.rows.map(row => row.column_name);
          },
          validate: input => input.length > 0 ? true : 'You must select at least one column'
        }
      ]);
      
      columns = selectedColumns;
    } else {
      // Verify column exists
      const exists = await db.postgres.columnExists(connection, table, column);
      if (!exists) {
        console.error(chalk.red(`Column "${column}" does not exist in table "${table}"`));
        return false;
      }
      
      columns = [column];
    }
    
    // Generate index name
    const indexName = `idx_${table}_${columns.join('_')}`;
    
    // Check if index already exists
    if (columns.length === 1) {
      const exists = await db.postgres.indexExists(connection, table, columns[0]);
      if (exists) {
        console.error(chalk.red(`An index on column "${columns[0]}" already exists for table "${table}"`));
        return false;
      }
    } else {
      // For multi-column indexes, we need a different approach
      const result = await db.postgres.executeQuery(
        connection,
        `SELECT indexname FROM pg_indexes WHERE tablename = $1 AND indexname = $2`,
        [table, indexName]
      );
      
      if (result.rows.length > 0) {
        console.error(chalk.red(`Index "${indexName}" already exists for table "${table}"`));
        return false;
      }
    }
    
    // Ask for index type if not provided and not using --force
    let indexType = 'btree'; // Default to btree when using --force
    
    if (!options.force) {
      const result = await inquirer.prompt([
        {
          type: 'list',
          name: 'indexType',
          message: 'Select index type:',
          choices: ['btree', 'hash', 'gist', 'gin', 'brin'],
          default: 'btree'
        }
      ]);
      indexType = result.indexType;
    } else {
      console.log(`Using default 'btree' index type (--force enabled, skipping prompt)`);
    }
    
    // Build the CREATE INDEX query
    let query = options.unique 
      ? `CREATE UNIQUE INDEX "${indexName}" ON "${table}" USING ${indexType} (`
      : `CREATE INDEX "${indexName}" ON "${table}" USING ${indexType} (`;
    
    query += columns.map(col => `"${col}"`).join(', ');
    query += `);`;
    
    // Confirm the operation
    console.log(chalk.cyan('About to execute:'));
    console.log(query);
    
    if (!options.force) {
      const confirm = await confirmAction(`Are you sure you want to create a${options.unique ? ' unique' : 'n'} index on ${columns.length > 1 ? 'columns' : 'column'} "${columns.join(', ')}" for table "${table}"?`);
      
      if (!confirm) {
        console.log('Operation canceled');
        return false;
      }
    }
    
    // Execute the query
    try {
      await db.postgres.executeQuery(connection, query);
      console.log(chalk.green(`✓ Index "${indexName}" successfully created on table "${table}"`));
      return true;
    } catch (error) {
      console.error(chalk.red(`Error creating index:`), error.message);
      return false;
    }
  } catch (error) {
    console.error(chalk.red('Error creating PostgreSQL index:'), error.message);
    return false;
  }
}

module.exports = createPostgresIndex;