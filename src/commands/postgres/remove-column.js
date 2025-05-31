// src/commands/postgres/remove-column.js
// This file is used to remove a column from a PostgreSQL table

const db = require('../../utils/db');
const { promptForTable, promptForColumn, confirmAction } = require('../../utils/prompt');
const { isDryRun, printDryRunSQL, printDryRunSummary } = require('../../utils/dry-run');
const chalk = require('chalk');

/**
 * Removes a column from a PostgreSQL table
 * @param {Object} connection - PostgreSQL connection
 * @param {string} table - Name of the table to remove column from
 * @param {string} column - Name of the column to remove
 * @param {Object} options - Command options
 * @returns {Promise<boolean>} True if column was removed successfully, false otherwise
 */
async function removePostgresColumn(connection, table, column, options) {
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
    if (!column) {
      column = await promptForColumn(connection, table);
      if (!column) {
        return false;
      }
    } else {
      // Verify that column exists
      const exists = await db.postgres.columnExists(connection, table, column);
      if (!exists) {
        console.error(chalk.red(`Column "${column}" does not exist in table "${table}"`));
        return false;
      }
    }
    
    // Check if this is a required column or primary key
    const columnInfo = await db.postgres.executeQuery(
      connection,
      `SELECT 
        column_name, 
        data_type, 
        is_nullable, 
        column_default,
        (SELECT constraint_type FROM information_schema.table_constraints tc
          JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
          WHERE tc.table_schema = 'public' AND tc.table_name = $1 
          AND ccu.column_name = c.column_name
          AND tc.constraint_type = 'PRIMARY KEY'
        ) as constraint_type
      FROM information_schema.columns c
      WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
      [table, column]
    );
    
    if (columnInfo.rows.length === 0) {
      console.error(chalk.red(`Column information not found for "${column}" in table "${table}"`));
      return false;
    }
    
    // Check if it's a primary key
    if (columnInfo.rows[0].constraint_type === 'PRIMARY KEY') {
      console.error(chalk.red(`Column "${column}" is a PRIMARY KEY and cannot be removed`));
      return false;
    }
    
    // Check for dependencies (foreign keys)
    const dependenciesQuery = `
      SELECT 
        tc.table_name AS referencing_table,
        kcu.column_name AS referencing_column
      FROM 
        information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
      WHERE 
        tc.constraint_type = 'FOREIGN KEY' 
        AND tc.table_schema = 'public'
        AND ccu.table_name = $1
        AND ccu.column_name = $2;
    `;
    
    const dependencies = await db.postgres.executeQuery(connection, dependenciesQuery, [table, column]);
    
    if (dependencies.rows.length > 0) {
      console.error(chalk.red(`Column "${column}" has foreign key dependencies:`));
      dependencies.rows.forEach(dep => {
        console.error(`- ${dep.referencing_table}.${dep.referencing_column} references ${table}.${column}`);
      });
      
      console.error(chalk.yellow(`These foreign key constraints must be removed before the column can be deleted.`));
      
      if (!options.force) {
        const proceedAnyway = await confirmAction(chalk.red(`Do you want to DROP the column WITH CASCADE? This will drop all dependent objects!`));
        
        if (!proceedAnyway) {
          console.log('Column removal canceled');
          return false;
        }
      } else {
        console.log(chalk.yellow(`Using CASCADE to drop column and dependent objects (--force enabled, skipping confirmation)`));
      }
    }
    
    // Build the ALTER TABLE query
    const query = dependencies.rows.length > 0
      ? `ALTER TABLE "${table}" DROP COLUMN "${column}" CASCADE;`
      : `ALTER TABLE "${table}" DROP COLUMN "${column}";`;
    
    // Get row count
    const countResult = await db.postgres.executeQuery(connection, `SELECT COUNT(*) FROM "${table}"`);
    const rowCount = parseInt(countResult.rows[0].count);
    
    // Check for dry-run mode
    if (isDryRun(options, `Removing column "${column}" from table "${table}"`)) {
      printDryRunSQL('SQL statement that would be executed', query, {
        affectedRows: rowCount,
        warning: rowCount > 0 ? `Data in column "${column}" for ${rowCount} rows would be permanently lost` : undefined
      });
      
      if (dependencies.rows.length > 0) {
        console.log(chalk.yellow('\n🔗 Dependent objects that would be affected:'));
        dependencies.rows.forEach(dep => {
          console.log(chalk.red(`  ✗ ${dep.dependent_name} (${dep.dependent_type})`));
        });
      }
      
      const warnings = [];
      if (rowCount > 0) {
        warnings.push(`Data in column "${column}" for ${rowCount} rows would be permanently lost`);
      }
      if (dependencies.rows.length > 0) {
        warnings.push(`${dependencies.rows.length} dependent object(s) would also be dropped`);
      }
      
      printDryRunSummary({
        created: 0,
        modified: 1,
        deleted: 0,
        warnings: warnings
      });
      
      return true;
    }
    
    // Confirm the operation
    console.log(chalk.cyan('About to execute:'));
    console.log(query);
    
    if (!options.force) {
      const confirm = await confirmAction(chalk.red(`Are you sure you want to remove column "${column}" from table "${table}"? This will delete data in ${rowCount} rows!`));
      
      if (!confirm) {
        console.log('Column removal canceled');
        return false;
      }
      
      // Double confirm for important tables
      if (rowCount > 100) {
        const doubleConfirm = await confirmAction(chalk.red(`Final confirmation: Are you ABSOLUTELY SURE you want to remove column "${column}" from table "${table}" with ${rowCount} rows?`));
        
        if (!doubleConfirm) {
          console.log('Column removal canceled');
          return false;
        }
      }
    } else if (rowCount > 100) {
      console.log(chalk.yellow(`Removing column "${column}" from table "${table}" with ${rowCount} rows (--force enabled, skipping confirmation)`));
    }
    
    // Execute the query
    try {
      await db.postgres.executeQuery(connection, query);
      console.log(chalk.green(`✓ Column "${column}" successfully removed from table "${table}"`));
      return true;
    } catch (error) {
      console.error(chalk.red(`Error removing column:`), error.message);
      return false;
    }
  } catch (error) {
    console.error(chalk.red('Error removing PostgreSQL column:'), error.message);
    return false;
  }
}

module.exports = removePostgresColumn;