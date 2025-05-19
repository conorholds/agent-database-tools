// src/commands/delete-table.js
// This file is used to delete a table from a database

const { createPool, executeQuery, tableExists } = require('../utils/db');
const { promptForProject, promptForTable, confirmAction } = require('../utils/prompt');
const chalk = require('chalk');

async function deleteTableCommand(projectName, table) {
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
    
    // Check if this is a system table that should not be deleted
    const systemTables = ['migrations'];
    if (systemTables.includes(table)) {
      console.error(chalk.red(`Table "${table}" is a system table and should not be deleted`));
      
      const overrideCheck = await confirmAction(chalk.red(`Are you ABSOLUTELY SURE you want to delete system table "${table}"? This may break the db-tools functionality.`));
      
      if (!overrideCheck) {
        console.log('Delete operation canceled');
        return;
      }
    }
    
    // Get row count
    const countResult = await executeQuery(pool, `SELECT COUNT(*) FROM "${table}"`);
    const rowCount = parseInt(countResult.rows[0].count);
    
    // Confirm the operation
    console.log(chalk.yellow(`Table "${table}" contains ${rowCount} rows that will be permanently deleted.`));
    
    const confirm = await confirmAction(chalk.red(`Are you sure you want to delete table "${table}" and all its data? This is irreversible!`));
    
    if (!confirm) {
      console.log('Delete operation canceled');
      return;
    }
    
    // Double confirmation for tables with data
    if (rowCount > 0) {
      const doubleConfirm = await confirmAction(chalk.red(`Final confirmation: Are you ABSOLUTELY SURE you want to delete table "${table}" with ${rowCount} rows of data?`));
      
      if (!doubleConfirm) {
        console.log('Delete operation canceled');
        return;
      }
    }
    
    // Execute the query
    try {
      console.log(chalk.cyan(`Deleting table "${table}"...`));
      
      // First check for dependent objects
      const dependentObjectsQuery = `
        SELECT
          objid::regclass AS dependent_object
        FROM
          pg_depend d
          JOIN pg_class c ON c.oid = d.refobjid
        WHERE
          c.relname = $1
          AND d.deptype = 'n'
          AND objid != refobjid;
      `;
      
      const dependentObjects = await executeQuery(pool, dependentObjectsQuery, [table]);
      
      if (dependentObjects.rows.length > 0) {
        console.log(chalk.yellow(`Warning: Table "${table}" has dependent objects that will also be dropped:`));
        dependentObjects.rows.forEach(obj => {
          console.log(`- ${obj.dependent_object}`);
        });
        
        const proceedAnyway = await confirmAction(chalk.red(`Proceed with dropping table "${table}" and its dependencies?`));
        
        if (!proceedAnyway) {
          console.log('Delete operation canceled');
          return;
        }
      }
      
      // Drop the table with CASCADE option to handle dependencies
      await executeQuery(pool, `DROP TABLE "${table}" CASCADE;`);
      
      console.log(chalk.green(`✓ Table "${table}" successfully deleted`));
      return true;
    } catch (error) {
      console.error(chalk.red(`Error deleting table:`), error.message);
      return false;
    }
  } finally {
    // Close connection pool
    await pool.end();
  }
}

module.exports = deleteTableCommand;