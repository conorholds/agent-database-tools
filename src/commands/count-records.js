// src/commands/count-records.js
// This file is used to count records in database tables with optional statistics

const { createPool, executeQuery, tableExists } = require('../utils/db');
const { promptForProject, promptForTable } = require('../utils/prompt');
const chalk = require('chalk');

/**
 * Command to count records in database tables
 * @param {string} projectName - Name of the project
 * @param {string} [table] - Name of the specific table to count records in
 * @param {Object} [cmdOptions={}] - Command-specific options
 * @param {Object} [cmd] - Commander command object
 * @param {boolean} [cmd.parent.opts().verbose] - Whether to show verbose output
 * @param {string} [cmd.parent.opts().connect] - Custom path to connection file
 * @param {string} [cmdOptions.database] - Database name to override default
 * @param {boolean} [cmdOptions.all] - Whether to count records in all tables
 * @param {boolean} [cmdOptions.detailed] - Whether to show detailed column statistics
 * @param {string} [cmdOptions.where] - Optional WHERE clause for filtering the count
 * @returns {Promise<boolean>} True if counting was successful, false otherwise
 */
async function countRecordsCommand(projectName, table, cmdOptions = {}, cmd) {
  // Merge command options with global options
  const options = { ...cmd?.parent?.opts(), ...cmdOptions };
  // If project name not provided, prompt for it
  if (!projectName) {
    projectName = await promptForProject();
  }
  
  // Create DB connection pool with optional database
  const pool = createPool(projectName, options);
  
  try {
    // If we want to count all tables
    if (options && options.all) {
      console.log(chalk.cyan(`Counting records in all tables for project: ${projectName}`));
      
      // Get all tables
      const tablesQuery = `
        SELECT 
          table_name 
        FROM 
          information_schema.tables 
        WHERE 
          table_schema = 'public' 
          AND table_type = 'BASE TABLE'
        ORDER BY 
          table_name;
      `;
      
      const tablesResult = await executeQuery(pool, tablesQuery);
      
      if (tablesResult.rows.length === 0) {
        console.log(chalk.yellow('No tables found in the database'));
        return;
      }
      
      // Print table header
      console.log(chalk.green('\nTable Record Counts:'));
      console.log('---------------------------------------------------');
      console.log(`${chalk.bold('Table Name'.padEnd(40))} | ${chalk.bold('Record Count')}`);
      console.log('---------------------------------------------------');
      
      let totalRecords = 0;
      
      // Count records in each table
      for (const tableRow of tablesResult.rows) {
        const tableName = tableRow.table_name;
        const countQuery = `SELECT COUNT(*) FROM "${tableName}"`;
        
        try {
          const countResult = await executeQuery(pool, countQuery);
          const recordCount = parseInt(countResult.rows[0].count);
          totalRecords += recordCount;
          
          console.log(`${tableName.padEnd(40)} | ${recordCount.toLocaleString()}`);
        } catch (error) {
          console.log(`${tableName.padEnd(40)} | Error: ${error.message}`);
        }
      }
      
      console.log('---------------------------------------------------');
      console.log(`Total: ${tablesResult.rows.length} tables, ${totalRecords.toLocaleString()} records`);
      
      return true;
    }
    
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
    
    console.log(chalk.cyan(`Counting records in table "${table}" for project: ${projectName}`));
    
    // Count query
    const countQuery = `SELECT COUNT(*) FROM "${table}"`;
    
    // Add where clause if provided
    if (options && options.where) {
      countQuery += ` WHERE ${options.where}`;
    }
    
    const countResult = await executeQuery(pool, countQuery);
    const recordCount = parseInt(countResult.rows[0].count);
    
    console.log(chalk.green(`\nTable: ${table}`));
    console.log(`Total records: ${recordCount.toLocaleString()}`);
    
    // If detailed option is provided, show more statistics
    if (options && options.detailed) {
      // Get more detailed statistics for each column
      const columnStatsQuery = `
        SELECT 
          column_name,
          data_type
        FROM 
          information_schema.columns
        WHERE 
          table_schema = 'public'
          AND table_name = $1
        ORDER BY 
          ordinal_position;
      `;
      
      const columnsResult = await executeQuery(pool, columnStatsQuery, [table]);
      
      console.log(chalk.cyan('\nColumn Statistics:'));
      
      for (const column of columnsResult.rows) {
        let statsQuery;
        
        // Different stats based on data type
        if (column.data_type.includes('char') || column.data_type === 'text') {
          // String columns
          statsQuery = `
            SELECT
              COUNT(DISTINCT "${column.column_name}") AS unique_values,
              COUNT(*) FILTER (WHERE "${column.column_name}" IS NULL) AS null_count,
              MIN(LENGTH("${column.column_name}")) AS min_length,
              MAX(LENGTH("${column.column_name}")) AS max_length,
              AVG(LENGTH("${column.column_name}")) AS avg_length
            FROM
              "${table}";
          `;
          
          const stats = await executeQuery(pool, statsQuery);
          const row = stats.rows[0];
          
          console.log(`  ${column.column_name} (${column.data_type}):`);
          console.log(`    - Unique values: ${row.unique_values}`);
          console.log(`    - Null count: ${row.null_count}`);
          console.log(`    - Length range: ${row.min_length} - ${row.max_length} chars`);
          console.log(`    - Average length: ${parseFloat(row.avg_length).toFixed(2)} chars`);
          
        } else if (['int', 'integer', 'bigint', 'numeric', 'decimal', 'float', 'double'].some(t => column.data_type.includes(t))) {
          // Numeric columns
          statsQuery = `
            SELECT
              COUNT(DISTINCT "${column.column_name}") AS unique_values,
              COUNT(*) FILTER (WHERE "${column.column_name}" IS NULL) AS null_count,
              MIN("${column.column_name}") AS min_value,
              MAX("${column.column_name}") AS max_value,
              AVG("${column.column_name}") AS avg_value
            FROM
              "${table}";
          `;
          
          const stats = await executeQuery(pool, statsQuery);
          const row = stats.rows[0];
          
          console.log(`  ${column.column_name} (${column.data_type}):`);
          console.log(`    - Unique values: ${row.unique_values}`);
          console.log(`    - Null count: ${row.null_count}`);
          console.log(`    - Value range: ${row.min_value} - ${row.max_value}`);
          console.log(`    - Average value: ${parseFloat(row.avg_value).toFixed(2)}`);
          
        } else if (column.data_type.includes('timestamp') || column.data_type.includes('date')) {
          // Date/time columns
          statsQuery = `
            SELECT
              COUNT(DISTINCT "${column.column_name}") AS unique_values,
              COUNT(*) FILTER (WHERE "${column.column_name}" IS NULL) AS null_count,
              MIN("${column.column_name}") AS min_value,
              MAX("${column.column_name}") AS max_value
            FROM
              "${table}";
          `;
          
          const stats = await executeQuery(pool, statsQuery);
          const row = stats.rows[0];
          
          console.log(`  ${column.column_name} (${column.data_type}):`);
          console.log(`    - Unique values: ${row.unique_values}`);
          console.log(`    - Null count: ${row.null_count}`);
          console.log(`    - Date range: ${row.min_value} - ${row.max_value}`);
          
        } else {
          // Other data types
          statsQuery = `
            SELECT
              COUNT(DISTINCT "${column.column_name}") AS unique_values,
              COUNT(*) FILTER (WHERE "${column.column_name}" IS NULL) AS null_count
            FROM
              "${table}";
          `;
          
          const stats = await executeQuery(pool, statsQuery);
          const row = stats.rows[0];
          
          console.log(`  ${column.column_name} (${column.data_type}):`);
          console.log(`    - Unique values: ${row.unique_values}`);
          console.log(`    - Null count: ${row.null_count}`);
        }
      }
    }
    
    return true;
  } catch (error) {
    console.error(chalk.red('Error counting records:'), error.message);
    return false;
  } finally {
    // Close connection pool
    await pool.end();
  }
}

module.exports = countRecordsCommand;