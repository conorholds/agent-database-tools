// src/commands/search.js
// This file is used to search for values in database tables and columns

const { createPool, executeQuery, tableExists, columnExists } = require('../utils/db');
const { promptForProject, promptForTable } = require('../utils/prompt');
const chalk = require('chalk');
const inquirer = require('inquirer');

/**
 * Command to search for values across database tables and columns
 * @param {string} projectName - Name of the project to search in
 * @param {string} [tableName] - Optional specific table to search in
 * @param {string} [columnName] - Optional specific column to search in
 * @param {string} [searchValue] - Value to search for
 * @param {Object} [cmdOptions={}] - Command-specific options
 * @param {string} [cmdOptions.value] - Alternative way to specify search value
 * @param {string} [cmdOptions.V] - Shorthand for value option
 * @param {boolean} [cmdOptions.caseSensitive] - Whether search should be case-sensitive
 * @param {boolean} [cmdOptions.exact] - Whether to perform exact matches only
 * @param {number} [cmdOptions.limit=1000] - Maximum number of results to return
 * @param {boolean} [cmdOptions.json] - Output results in JSON format
 * @param {boolean} [cmdOptions.csv] - Output results in CSV format
 * @param {boolean} [cmdOptions.compact] - Show only matching columns in output
 * @param {boolean} [cmdOptions.verbose] - Show detailed output including queries
 * @param {Object} [cmd] - Commander command object
 * @returns {Promise<boolean>} True if search found matches, false otherwise
 */
async function searchCommand(projectName, tableName, columnName, searchValue, cmdOptions = {}, cmd) {
  // Merge command options with global options
  const options = { ...cmd?.parent?.opts(), ...cmdOptions };
  
  // Use provided search value from args or from --value option
  searchValue = searchValue || options.value || options.V;
  
  // If project name not provided, prompt for it
  if (!projectName) {
    projectName = await promptForProject();
  }
  
  // If search value not provided, prompt for it
  if (!searchValue) {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'searchValue',
        message: 'Enter search value:',
        validate: (input) => {
          if (input.trim() === '') {
            return 'Search value cannot be empty';
          }
          return true;
        }
      }
    ]);
    searchValue = answers.searchValue;
  }
  
  // Create DB connection pool with optional database
  const pool = createPool(projectName, options);
  
  try {
    // If table specified but doesn't exist, error out early
    if (tableName) {
      const tableExistsResult = await tableExists(pool, tableName);
      if (!tableExistsResult) {
        console.error(chalk.red(`Table "${tableName}" does not exist`));
        return false;
      }
      
      // If column specified but doesn't exist in this table, error out early
      if (columnName) {
        const columnExistsResult = await columnExists(pool, tableName, columnName);
        if (!columnExistsResult) {
          console.error(chalk.red(`Column "${columnName}" does not exist in table "${tableName}"`));
          return false;
        }
      }
    }
    
    console.log(chalk.cyan(`Searching for "${searchValue}" in ${projectName} database...`));
    
    let results = [];
    let totalMatches = 0;

    // Get list of tables to search
    const tables = tableName ? [tableName] : await getAllTables(pool);
    
    for (const table of tables) {
      // Get list of columns to search in this table
      const columns = columnName ? [columnName] : await getTableColumns(pool, table);
      
      // Skip searching if no valid columns found
      if (columns.length === 0) {
        console.log(chalk.yellow(`Skipping table "${table}": no searchable columns found`));
        continue;
      }
      
      // Build and execute search query for this table/column combination
      let tableResults = await searchTable(pool, table, columns, searchValue, options);
      
      // If matches found, add to results
      if (tableResults.length > 0) {
        results = results.concat(tableResults);
        totalMatches += tableResults.length;
      }
    }
    
    // Display search results
    if (results.length > 0) {
      console.log(chalk.green(`\nFound ${totalMatches} match${totalMatches !== 1 ? 'es' : ''}`));
      
      // Format results differently based on options
      if (options.json) {
        // JSON output format
        console.log(JSON.stringify(results, null, 2));
      } else if (options.csv) {
        // CSV output format
        outputCSV(results);
      } else {
        // Standard output format
        outputResults(results, options);
      }
    } else {
      console.log(chalk.yellow(`\nNo matches found for "${searchValue}"`));
    }
    
    return totalMatches > 0;
  } catch (error) {
    console.error(chalk.red('Error searching database:'), error.message);
    return false;
  } finally {
    // Close connection pool
    await pool.end();
  }
}

/**
 * Get all tables in the database
 */
async function getAllTables(pool) {
  const query = `
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `;
  
  const result = await executeQuery(pool, query);
  return result.rows.map(row => row.table_name);
}

/**
 * Get all searchable columns for a table
 */
async function getTableColumns(pool, tableName) {
  const query = `
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
  
  const result = await executeQuery(pool, query, [tableName]);
  
  // Filter out columns that aren't searchable (like geometric types)
  return result.rows
    .filter(col => isSearchableType(col.data_type))
    .map(col => ({ 
      name: col.column_name, 
      type: col.data_type 
    }));
}

/**
 * Determine if a column type is searchable with string comparison
 */
function isSearchableType(dataType) {
  // Array of data types that can be searched with string comparisons or LIKE
  const searchableTypes = [
    'character', 'character varying', 'text', 'varchar', 'char',
    'integer', 'smallint', 'bigint', 'decimal', 'numeric', 'real', 'double precision',
    'boolean',
    'date', 'time', 'timestamp', 'timestamptz', 'timestamp without time zone', 'timestamp with time zone',
    'json', 'jsonb', 'uuid'
  ];
  
  // Check if the data type or a prefix of it is in our searchable types
  return searchableTypes.some(type => 
    dataType === type || 
    dataType.startsWith(`${type}(`) || 
    dataType.startsWith(`${type} `)
  );
}

/**
 * Search a specific table for the given value across specified columns
 */
async function searchTable(pool, tableName, columns, searchValue, options) {
  // Generate conditions for each column based on its data type
  const conditions = columns
    .filter(column => column && column.name && column.type)
    .map(column => {
      return generateSearchCondition(column.name, column.type, searchValue, options);
    }).filter(Boolean);
  
  // If no valid search conditions, skip this table
  if (conditions.length === 0) {
    return [];
  }
  
  // Build the WHERE clause by joining all conditions with OR
  const whereClause = conditions.join(' OR ');
  
  // Build and execute the query
  const query = `
    SELECT *, '${tableName}' as "_table_name" 
    FROM "${tableName}" 
    WHERE ${whereClause}
    LIMIT ${options.limit || 1000};
  `;
  
  if (options.verbose) {
    console.log(chalk.blue('Query:'), query);
  }
  
  try {
    const result = await executeQuery(pool, query);
    
    // Annotate results with table and matching column info
    return result.rows.map(row => {
      // Find which columns matched
      const matchingColumns = columns.filter(column => {
        // For each column, check if it matches the search condition
        const value = row[column.name];
        if (value === null) return false;
        
        // Handle different data types
        
        try {
          switch (getBaseType(column.type)) {
            case 'string':
              return String(value).toLowerCase().includes(searchValue.toLowerCase());
            case 'number':
              return options.exact ? 
                parseFloat(value) === parseFloat(searchValue) : 
                String(value).includes(searchValue);
            case 'boolean':
              return String(value).toLowerCase() === searchValue.toLowerCase();
            case 'date':
              return String(value).includes(searchValue);
            case 'json':
              return JSON.stringify(value).toLowerCase().includes(searchValue.toLowerCase());
            default:
              return String(value).toLowerCase().includes(searchValue.toLowerCase());
          }
        } catch (e) {
          console.error(`Error comparing value in ${column.name}: ${e.message}`);
          return false;
        }
      });
      
      return {
        table: tableName,
        matching_columns: matchingColumns.map(c => c.name),
        data: row
      };
    });
  } catch (error) {
    // Log error but continue searching other tables
    console.error(chalk.yellow(`Error searching table "${tableName}": ${error.message}`));
    return [];
  }
}

/**
 * Generate SQL condition for searching a column based on its data type
 */
function generateSearchCondition(columnName, dataType, searchValue, options) {
  const baseType = getBaseType(dataType);
  const caseSensitive = options.caseSensitive;
  const exact = options.exact;
  
  // Handle NULL search
  if (searchValue.toLowerCase() === 'null') {
    return `"${columnName}" IS NULL`;
  }
  
  try {
    // Base conditions by type
    switch (baseType) {
      case 'string':
        if (exact) {
          return caseSensitive
            ? `"${columnName}"::TEXT = '${escapeString(searchValue)}'` 
            : `LOWER("${columnName}"::TEXT) = LOWER('${escapeString(searchValue)}')`;
        } else {
          return caseSensitive
            ? `"${columnName}"::TEXT LIKE '%${escapeString(searchValue)}%'` 
            : `LOWER("${columnName}"::TEXT) LIKE LOWER('%${escapeString(searchValue)}%')`;
        }
      
      case 'number':
        // Only search if value could be a number
        if (isNumeric(searchValue)) {
          return `"${columnName}"::TEXT = '${escapeString(searchValue)}'`;
        }
        return null;
      
      case 'boolean':
        // Only search if value could be a boolean
        if (['true', 'false', 't', 'f', 'yes', 'no', 'y', 'n', '1', '0'].includes(searchValue.toLowerCase())) {
          const boolValue = ['true', 't', 'yes', 'y', '1'].includes(searchValue.toLowerCase());
          return `"${columnName}" = ${boolValue}`;
        }
        return null;
      
      case 'date':
        // Include the column if it has the search value as a substring in its string representation
        return `"${columnName}"::TEXT LIKE '%${escapeString(searchValue)}%'`;
      
      case 'json':
        // For JSONB columns, use the contains operator
        if (dataType.toLowerCase() === 'jsonb') {
          // Try exact key match first if it looks like a key search
          if (searchValue.includes(':')) {
            const [key, val] = searchValue.split(':').map(s => s.trim());
            if (key && val) {
              return `"${columnName}" @> '{"${escapeString(key)}": "${escapeString(val)}"}'::jsonb`;
            }
          }
          // Fall back to text search
          return `"${columnName}"::text ILIKE '%${escapeString(searchValue)}%'`;
        }
        // For regular JSON, cast to text and search
        return `"${columnName}"::text ILIKE '%${escapeString(searchValue)}%'`;
      
      default:
        // For other types, convert to text and search
        return `CAST("${columnName}" AS TEXT) LIKE '%${escapeString(searchValue)}%'`;
    }
  } catch (error) {
    console.error(`Error generating search condition for ${columnName}: ${error.message}`);
    // Provide a safe fallback
    return `CAST("${columnName}" AS TEXT) LIKE '%${escapeString(searchValue)}%'`;
  }
}

/**
 * Get the base type category from the PostgreSQL data type
 */
function getBaseType(dataType) {
  if (!dataType) return 'other';
  
  const type = dataType.toLowerCase();
  
  if (type.includes('char') || type.includes('text') || type === 'uuid') {
    return 'string';
  } else if (type.includes('int') || type.includes('decimal') || type.includes('numeric') || 
             type.includes('real') || type.includes('double') || type.includes('float')) {
    return 'number';
  } else if (type === 'boolean') {
    return 'boolean';
  } else if (type.includes('date') || type.includes('time')) {
    return 'date';
  } else if (type === 'json' || type === 'jsonb') {
    return 'json';
  } else {
    return 'other';
  }
}

/**
 * Check if a string can be converted to a number
 */
function isNumeric(value) {
  return !isNaN(parseFloat(value)) && isFinite(value);
}

/**
 * Escape string for SQL queries
 */
function escapeString(str) {
  return str.replace(/'/g, "''");
}

/**
 * Output results in a readable format
 */
function outputResults(results, options) {
  const compact = options.compact;
  
  results.forEach((result, index) => {
    console.log(`\n${chalk.cyan('Result')} #${index + 1}`);
    console.log(`${chalk.blue('Table:')} ${result.table}`);
    console.log(`${chalk.blue('Matching column(s):')} ${result.matching_columns.join(', ')}`);
    
    if (compact) {
      // Show only matching columns in compact mode
      console.log(chalk.blue('Data:'));
      result.matching_columns.forEach(column => {
        const value = result.data[column];
        console.log(`  ${column}: ${formatValue(value)}`);
      });
    } else {
      // Show all columns in regular mode
      console.log(chalk.blue('Data:'));
      Object.entries(result.data)
        .filter(([key]) => key !== '_table_name') // Skip internal _table_name field
        .forEach(([key, value]) => {
          const isMatch = result.matching_columns.includes(key);
          const display = isMatch ? chalk.green(formatValue(value)) : formatValue(value);
          console.log(`  ${key}: ${display}`);
        });
    }
    
    console.log(chalk.gray('-----------------------------------'));
  });
}

/**
 * Output results in CSV format
 */
function outputCSV(results) {
  // Get all unique columns across all results
  const allColumns = new Set();
  results.forEach(result => {
    Object.keys(result.data)
      .filter(key => key !== '_table_name')
      .forEach(key => allColumns.add(key));
  });
  
  // Convert to array and sort
  const columns = Array.from(allColumns).sort();
  
  // Output header row
  const headerRow = ['table', 'matching_columns', ...columns];
  console.log(headerRow.join(','));
  
  // Output data rows
  results.forEach(result => {
    const row = [
      result.table,
      `"${result.matching_columns.join(';')}"`,
      ...columns.map(column => {
        const value = result.data[column];
        return formatCSVValue(value);
      })
    ];
    console.log(row.join(','));
  });
}

/**
 * Format a value for display
 */
function formatValue(value) {
  if (value === null) {
    return chalk.gray('NULL');
  } else if (typeof value === 'object') {
    return JSON.stringify(value);
  } else {
    return String(value);
  }
}

/**
 * Format a value for CSV output
 */
function formatCSVValue(value) {
  if (value === null) {
    return '';
  } else if (typeof value === 'object') {
    return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
  } else if (typeof value === 'string') {
    return `"${value.replace(/"/g, '""')}"`;
  } else {
    return String(value);
  }
}

module.exports = searchCommand;