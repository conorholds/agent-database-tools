// src/commands/create-index.js
// This file is used to create an index on a table column for improved query performance

const { createPool, executeQuery, tableExists, columnExists, indexExists } = require('../utils/db');
const { promptForProject, promptForTable, promptForColumn, confirmAction } = require('../utils/prompt');
const inquirer = require('inquirer');
const chalk = require('chalk');

async function createIndexCommand(projectName, table, column, cmdOptions = {}, cmd) {
  // Merge command options with global options
  const options = { ...cmd?.parent?.opts(), ...cmdOptions };
  // If project name not provided, prompt for it
  if (!projectName) {
    projectName = await promptForProject();
  }
  
  // Create DB connection pool
  const pool = createPool(projectName, options);
  
  try {
    // If table not provided, prompt for it
    if (!table) {
      table = await promptForTable(pool);
      if (!table) {
        return;
      }
    } else {
      // Verify that table exists
      const exists = await tableExists(pool, table);
      if (!exists) {
        console.error(chalk.red(`Table "${table}" does not exist`));
        return;
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
            const tableColumns = await executeQuery(
              pool,
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
      const exists = await columnExists(pool, table, column);
      if (!exists) {
        console.error(chalk.red(`Column "${column}" does not exist in table "${table}"`));
        return;
      }
      
      columns = [column];
    }
    
    // Generate index name
    const indexName = `idx_${table}_${columns.join('_')}`;
    
    // Check if index already exists
    if (columns.length === 1) {
      const exists = await indexExists(pool, table, columns[0]);
      if (exists) {
        console.error(chalk.red(`An index on column "${columns[0]}" already exists for table "${table}"`));
        return;
      }
    } else {
      // For multi-column indexes, we need a different approach
      const result = await executeQuery(
        pool,
        `SELECT indexname FROM pg_indexes WHERE tablename = $1 AND indexname = $2`,
        [table, indexName]
      );
      
      if (result.rows.length > 0) {
        console.error(chalk.red(`Index "${indexName}" already exists for table "${table}"`));
        return;
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
        return;
      }
    }
    
    // Execute the query
    try {
      await executeQuery(pool, query);
      console.log(chalk.green(`✓ Index "${indexName}" successfully created on table "${table}"`));
      return true;
    } catch (error) {
      console.error(chalk.red(`Error creating index:`), error.message);
      return false;
    }
  } finally {
    // Close connection pool
    await pool.end();
  }
}

module.exports = createIndexCommand;