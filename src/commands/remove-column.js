// src/commands/remove-column.js
// This file is used to remove a column from a database table

const { createPool, executeQuery, columnExists, tableExists } = require('../utils/db');
const { promptForProject, promptForTable, promptForColumn, confirmAction } = require('../utils/prompt');
const chalk = require('chalk');

async function removeColumnCommand(projectName, table, column, cmdOptions = {}, cmd) {
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
    if (!column) {
      column = await promptForColumn(pool, table);
      if (!column) {
        return;
      }
    } else {
      // Verify that column exists
      const exists = await columnExists(pool, table, column);
      if (!exists) {
        console.error(chalk.red(`Column "${column}" does not exist in table "${table}"`));
        return;
      }
    }
    
    // Check if this is a required column or primary key
    const columnInfo = await executeQuery(
      pool,
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
      return;
    }
    
    // Check if it's a primary key
    if (columnInfo.rows[0].constraint_type === 'PRIMARY KEY') {
      console.error(chalk.red(`Column "${column}" is a PRIMARY KEY and cannot be removed`));
      return;
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
    
    const dependencies = await executeQuery(pool, dependenciesQuery, [table, column]);
    
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
          return;
        }
      } else {
        console.log(chalk.yellow(`Using CASCADE to drop column and dependent objects (--force enabled, skipping confirmation)`));
      }
    }
    
    // Build the ALTER TABLE query
    const query = dependencies.rows.length > 0
      ? `ALTER TABLE "${table}" DROP COLUMN "${column}" CASCADE;`
      : `ALTER TABLE "${table}" DROP COLUMN "${column}";`;
    
    // Confirm the operation
    console.log(chalk.cyan('About to execute:'));
    console.log(query);
    
    // Get row count
    const countResult = await executeQuery(pool, `SELECT COUNT(*) FROM "${table}"`);
    const rowCount = parseInt(countResult.rows[0].count);
    
    if (!options.force) {
      const confirm = await confirmAction(chalk.red(`Are you sure you want to remove column "${column}" from table "${table}"? This will delete data in ${rowCount} rows!`));
      
      if (!confirm) {
        console.log('Column removal canceled');
        return;
      }
      
      // Double confirm for important tables
      if (rowCount > 100) {
        const doubleConfirm = await confirmAction(chalk.red(`Final confirmation: Are you ABSOLUTELY SURE you want to remove column "${column}" from table "${table}" with ${rowCount} rows?`));
        
        if (!doubleConfirm) {
          console.log('Column removal canceled');
          return;
        }
      }
    } else if (rowCount > 100) {
      console.log(chalk.yellow(`Removing column "${column}" from table "${table}" with ${rowCount} rows (--force enabled, skipping confirmation)`));
    }
    
    // Execute the query
    try {
      await executeQuery(pool, query);
      console.log(chalk.green(`✓ Column "${column}" successfully removed from table "${table}"`));
      return true;
    } catch (error) {
      console.error(chalk.red(`Error removing column:`), error.message);
      return false;
    }
  } finally {
    // Close connection pool
    await pool.end();
  }
}

module.exports = removeColumnCommand;