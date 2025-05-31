// src/commands/postgres/delete-table.js
// This file is used to delete a table from a PostgreSQL database

const db = require('../../utils/db');
const { promptForTable, confirmAction } = require('../../utils/prompt');
const { isDryRun, printDryRunSQL, printDryRunSummary } = require('../../utils/dry-run');
const chalk = require('chalk');

/**
 * Deletes a table from a PostgreSQL database
 * @param {Object} connection - PostgreSQL connection
 * @param {string} table - Name of the table to delete
 * @param {Object} options - Command options
 * @returns {Promise<boolean>} True if table was deleted successfully, false otherwise
 */
async function deletePostgresTable(connection, table, options) {
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
    
    // Check if this is a system table that should not be deleted
    const systemTables = ['migrations'];
    if (systemTables.includes(table)) {
      console.error(chalk.red(`Table "${table}" is a system table and should not be deleted`));
      
      if (!options.force) {
        const overrideCheck = await confirmAction(chalk.red(`Are you ABSOLUTELY SURE you want to delete system table "${table}"? This may break the db-tools functionality.`));
        
        if (!overrideCheck) {
          console.log('Delete operation canceled');
          return false;
        }
      } else {
        console.log(chalk.yellow('Deleting system table due to --force option.'));
      }
    }
    
    // Get row count
    const countResult = await db.postgres.executeQuery(connection, `SELECT COUNT(*) FROM "${table}"`);
    const rowCount = parseInt(countResult.rows[0].count);
    
    // Check for dry-run mode
    if (isDryRun(options, `Deleting table "${table}"`)) {
      const dropSQL = `DROP TABLE "${table}" CASCADE;`;
      
      printDryRunSQL('SQL statement that would be executed', dropSQL, {
        affectedRows: rowCount,
        warning: rowCount > 0 ? `${rowCount} rows of data would be permanently lost` : undefined
      });
      
      // Check for dependent objects
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
      
      try {
        const dependentObjects = await db.postgres.executeQuery(connection, dependentObjectsQuery, [table]);
        
        const warnings = [];
        if (rowCount > 0) {
          warnings.push(`${rowCount} rows of data would be permanently deleted`);
        }
        if (dependentObjects.rows.length > 0) {
          warnings.push(`${dependentObjects.rows.length} dependent object(s) would also be dropped`);
          console.log(chalk.yellow('\n🔗 Dependent objects that would be affected:'));
          dependentObjects.rows.forEach(obj => {
            console.log(chalk.red(`  ✗ ${obj.dependent_object}`));
          });
        }
        
        printDryRunSummary({
          created: 0,
          modified: 0,
          deleted: 1,
          warnings: warnings
        });
      } catch (error) {
        console.warn(chalk.yellow(`Warning: Could not check dependent objects: ${error.message}`));
        printDryRunSummary({
          created: 0,
          modified: 0,
          deleted: 1,
          warnings: [`${rowCount} rows of data would be permanently deleted`]
        });
      }
      
      return true;
    }
    
    // Confirm the operation
    console.log(chalk.yellow(`Table "${table}" contains ${rowCount} rows that will be permanently deleted.`));
    
    if (!options.force) {
      const confirm = await confirmAction(chalk.red(`Are you sure you want to delete table "${table}" and all its data? This is irreversible!`));
      
      if (!confirm) {
        console.log('Delete operation canceled');
        return false;
      }
      
      // Double confirmation for tables with data
      if (rowCount > 0) {
        const doubleConfirm = await confirmAction(chalk.red(`Final confirmation: Are you ABSOLUTELY SURE you want to delete table "${table}" with ${rowCount} rows of data?`));
        
        if (!doubleConfirm) {
          console.log('Delete operation canceled');
          return false;
        }
      }
    } else {
      console.log(chalk.yellow('Proceeding with deletion due to --force option.'));
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
      
      const dependentObjects = await db.postgres.executeQuery(connection, dependentObjectsQuery, [table]);
      
      if (dependentObjects.rows.length > 0) {
        console.log(chalk.yellow(`Warning: Table "${table}" has dependent objects that will also be dropped:`));
        dependentObjects.rows.forEach(obj => {
          console.log(`- ${obj.dependent_object}`);
        });
        
        if (!options.force) {
          const proceedAnyway = await confirmAction(chalk.red(`Proceed with dropping table "${table}" and its dependencies?`));
          
          if (!proceedAnyway) {
            console.log('Delete operation canceled');
            return false;
          }
        } else {
          console.log(chalk.yellow('Proceeding with deletion of dependent objects due to --force option.'));
        }
      }
      
      // Drop the table with CASCADE option to handle dependencies
      await db.postgres.executeQuery(connection, `DROP TABLE "${table}" CASCADE;`);
      
      console.log(chalk.green(`✓ Table "${table}" successfully deleted`));
      return true;
    } catch (error) {
      console.error(chalk.red(`Error deleting table:`), error.message);
      return false;
    }
  } catch (error) {
    console.error(chalk.red('Error deleting PostgreSQL table:'), error.message);
    return false;
  }
}

module.exports = deletePostgresTable;