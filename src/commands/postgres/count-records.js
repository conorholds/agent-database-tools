// src/commands/postgres/count-records.js
// This file is used to count records in PostgreSQL tables with optional statistics

const db = require('../../utils/db');
const { promptForTable } = require('../../utils/prompt');
const chalk = require('chalk');

/**
 * Counts records in PostgreSQL tables with optional statistics
 * @param {Object} connection - PostgreSQL connection
 * @param {string} table - Name of the specific table to count records in
 * @param {Object} options - Command options
 * @returns {Promise<boolean>} True if counting was successful, false otherwise
 */
async function countPostgresRecords(connection, table, options) {
  try {
    // If we want to count all tables
    if (options.all) {
      console.log(chalk.cyan(`Counting records in all PostgreSQL tables`));
      
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
      
      const tablesResult = await db.postgres.executeQuery(connection, tablesQuery);
      
      if (tablesResult.rows.length === 0) {
        console.log(chalk.yellow('No tables found in the database'));
        return false;
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
          const countResult = await db.postgres.executeQuery(connection, countQuery);
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
    
    console.log(chalk.cyan(`Counting records in PostgreSQL table "${table}"`));
    
    // Count query
    let countQuery = `SELECT COUNT(*) FROM "${table}"`;
    
    // Add where clause if provided
    if (options.where) {
      countQuery += ` WHERE ${options.where}`;
    }
    
    const countResult = await db.postgres.executeQuery(connection, countQuery);
    const recordCount = parseInt(countResult.rows[0].count);
    
    console.log(chalk.green(`\nTable: ${table}`));
    console.log(`Total records: ${recordCount.toLocaleString()}`);
    
    // If detailed option is provided, show more statistics
    if (options.detailed) {
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
      
      const columnsResult = await db.postgres.executeQuery(connection, columnStatsQuery, [table]);
      
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
          
          const stats = await db.postgres.executeQuery(connection, statsQuery);
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
          
          const stats = await db.postgres.executeQuery(connection, statsQuery);
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
          
          const stats = await db.postgres.executeQuery(connection, statsQuery);
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
          
          const stats = await db.postgres.executeQuery(connection, statsQuery);
          const row = stats.rows[0];
          
          console.log(`  ${column.column_name} (${column.data_type}):`);
          console.log(`    - Unique values: ${row.unique_values}`);
          console.log(`    - Null count: ${row.null_count}`);
        }
      }
    }
    
    return true;
  } catch (error) {
    console.error(chalk.red('Error counting PostgreSQL records:'), error.message);
    return false;
  }
}

module.exports = countPostgresRecords;