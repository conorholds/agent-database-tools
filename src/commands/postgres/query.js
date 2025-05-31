// src/commands/postgres/query.js
// This file is used to execute SQL queries on a PostgreSQL database

const db = require('../../utils/db');
const { confirmAction } = require('../../utils/prompt');
const chalk = require('chalk');

/**
 * Execute a SQL query on a PostgreSQL database
 * @param {Object} connection - PostgreSQL connection
 * @param {string} query - SQL query to execute
 * @param {Object} options - Command options
 * @returns {Promise<boolean>} True if query was executed successfully, false otherwise
 */
async function executePostgresQuery(connection, sqlQuery, options) {
  // Make sure we have a valid query - allow for query coming from options.raw
  const query = sqlQuery || options.raw;
  
  if (!query) {
    console.error(chalk.red('Error: No SQL query provided'));
    return false;
  }
  
  // Check if the query is potentially destructive (non-SELECT)
  const isDestructive = !query.trim().toLowerCase().startsWith('select');
  
  // Show the query if verbose mode is enabled
  if (options.verbose) {
    console.log(chalk.cyan('Executing SQL query:'));
    console.log(query);
  }
  
  // Ask for confirmation for destructive queries unless force is enabled
  if (isDestructive && !options.force) {
    console.log(chalk.yellow('Warning: This query may modify data or schema'));
    
    const confirm = await confirmAction('Are you sure you want to execute this query?');
    
    if (!confirm) {
      console.log('Query execution canceled');
      return false;
    }
  }
  
  try {
    // Execute the query
    const result = await db.postgres.executeQuery(connection, query);
    
    // Output the results
    if (options.json) {
      // JSON output
      console.log(JSON.stringify(result.rows, null, 2));
    } else {
      // Display results in a formatted table
      if (result.rows && result.rows.length > 0) {
        // Get column names
        const columns = Object.keys(result.rows[0]);
        
        // Calculate column widths based on content
        const columnWidths = {};
        
        columns.forEach(col => {
          // Initialize with the length of the column name
          columnWidths[col] = col.length;
          
          // Check each value's length and update if longer
          result.rows.forEach(row => {
            const valString = row[col] === null ? 'NULL' : String(row[col]);
            const maxLineLength = valString.split('\n').reduce((max, line) => 
              Math.max(max, line.length), 0);
            columnWidths[col] = Math.max(columnWidths[col], maxLineLength);
          });
          
          // Cap column width to a reasonable size
          columnWidths[col] = Math.min(columnWidths[col], 50);
        });
        
        // Print header
        const header = columns.map(col => col.padEnd(columnWidths[col])).join(' | ');
        const separator = columns.map(col => '-'.repeat(columnWidths[col])).join('-+-');
        
        console.log('\n' + header);
        console.log(separator);
        
        // Print rows
        result.rows.forEach(row => {
          const rowValues = columns.map(col => {
            const val = row[col] === null ? chalk.grey('NULL') : String(row[col]);
            
            // Handle multi-line values
            if (val.includes('\n')) {
              return val.split('\n')[0].padEnd(columnWidths[col]) + '...';
            }
            
            // Handle values longer than column width
            if (val.length > columnWidths[col]) {
              return val.substring(0, columnWidths[col] - 3) + '...';
            }
            
            return val.padEnd(columnWidths[col]);
          });
          
          console.log(rowValues.join(' | '));
        });
        
        // Print row count
        console.log(chalk.green(`\n${result.rows.length} row(s)`));
      } else if (result.rowCount !== undefined) {
        // For non-SELECT queries like INSERT, UPDATE, DELETE
        console.log(chalk.green(`\nCommand completed successfully. ${result.rowCount} row(s) affected.`));
      } else {
        // For other commands like CREATE TABLE
        console.log(chalk.green('\nCommand completed successfully.'));
      }
    }
    
    return true;
  } catch (error) {
    console.error(chalk.red('Error executing query:'), error.message);
    return false;
  }
}

module.exports = executePostgresQuery;