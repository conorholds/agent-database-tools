// src/commands/query.js
// This file is used to execute SQL queries on a database

const { createPool, executeQuery } = require('../utils/db');
const { promptForProject } = require('../utils/prompt');
const chalk = require('chalk');

/**
 * Command to execute SQL queries on a PostgreSQL database
 * @param {string} projectName - Name of the project
 * @param {string} sqlQuery - SQL query to execute
 * @param {Object} [cmdOptions={}] - Command-specific options
 * @param {Object} [cmd] - Commander command object
 * @param {boolean} [cmd.parent.opts().verbose] - Whether to show verbose output
 * @param {string} [cmd.parent.opts().connect] - Custom path to connection file
 * @param {string} [cmdOptions.database] - Database name to override default
 * @param {boolean} [cmdOptions.json] - Output results as JSON
 * @param {string} [cmdOptions.raw] - Raw SQL query (alternative to sqlQuery parameter)
 * @returns {Promise<boolean>} True if query execution was successful, false otherwise
 */
async function queryCommand(projectName, sqlQuery, cmdOptions = {}, cmd) {
  // Merge command options with global options
  const options = { ...cmd?.parent?.opts(), ...cmdOptions };
  
  // If project name not provided, prompt for it
  if (!projectName) {
    projectName = await promptForProject();
  }
  
  // If SQL query not provided from command line, use raw option
  if (!sqlQuery && options.raw) {
    sqlQuery = options.raw;
  }
  
  // Must have an SQL query
  if (!sqlQuery) {
    console.error(chalk.red('Error: SQL query is required'));
    console.log('Example usage: db-tools query "Project Name" "SELECT * FROM users LIMIT 10"');
    return false;
  }
  
  // Create DB connection pool with optional database
  const pool = createPool(projectName, options);
  
  try {
    console.log(chalk.cyan(`Executing query for project: ${projectName}`));
    
    if (options.verbose) {
      console.log(chalk.blue('Query:'), sqlQuery);
    }
    
    // Execute the query
    const result = await executeQuery(pool, sqlQuery);
    
    // If there are results to display
    if (result.rows && result.rows.length > 0) {
      console.log(chalk.green(`\nResults (${result.rows.length} rows):`));
      
      // Get column names from the first row
      const columns = Object.keys(result.rows[0]);
      
      if (options.json) {
        // Output as JSON if requested
        console.log(JSON.stringify(result.rows, null, 2));
      } else {
        // Format as a table
        
        // Calculate column widths based on data
        const colWidths = {};
        
        // Initialize with header lengths
        columns.forEach(col => {
          colWidths[col] = col.length;
        });
        
        // Find maximum width for each column
        result.rows.forEach(row => {
          columns.forEach(col => {
            const cellValue = row[col] === null ? 'NULL' : String(row[col]);
            colWidths[col] = Math.max(colWidths[col], cellValue.length);
          });
        });
        
        // Print header
        const headerRow = columns.map(col => chalk.bold(col.padEnd(colWidths[col]))).join(' | ');
        const separator = columns.map(col => '-'.repeat(colWidths[col])).join('-+-');
        
        console.log(headerRow);
        console.log(separator);
        
        // Print data rows
        result.rows.forEach(row => {
          const rowStr = columns.map(col => {
            const cellValue = row[col] === null ? chalk.italic('NULL') : String(row[col]);
            return cellValue.padEnd(colWidths[col]);
          }).join(' | ');
          
          console.log(rowStr);
        });
      }
    } else if (result.rowCount !== undefined) {
      // For non-SELECT queries like INSERT, UPDATE, DELETE
      console.log(chalk.green(`Query executed successfully. ${result.rowCount} rows affected.`));
    } else {
      // Other types of queries
      console.log(chalk.green('Query executed successfully.'));
    }
    
    // Show execution time if verbose
    if (options.verbose) {
      console.log(chalk.blue('Command complete.'));
    }
    
    return true;
  } catch (error) {
    console.error(chalk.red('Error executing query:'), error.message);
    return false;
  } finally {
    // Close connection pool
    await pool.end();
  }
}

module.exports = queryCommand;