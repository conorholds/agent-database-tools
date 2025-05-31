// src/commands/mongodb/search.js
// This file is used to search for values in MongoDB collections and fields

const db = require('../../utils/db');
const { promptForCollection } = require('../../utils/prompt');
const chalk = require('chalk');
const inquirer = require('inquirer');

/**
 * Searches for values in MongoDB collections and fields
 * @param {Object} connection - MongoDB connection object with client and db properties
 * @param {string} collectionName - Optional specific collection to search in
 * @param {string} fieldName - Optional specific field to search in
 * @param {string} searchValue - Value to search for
 * @param {Object} options - Command options
 * @param {boolean} [options.caseSensitive] - Whether search should be case-sensitive
 * @param {boolean} [options.exact] - Whether to perform exact matches only
 * @param {boolean} [options.regex] - Whether to interpret the search value as a regular expression
 * @param {boolean} [options.recursive] - Whether to recursively search inside nested documents
 * @param {number} [options.limit=1000] - Maximum number of results to return
 * @param {boolean} [options.json] - Output results in JSON format
 * @param {boolean} [options.csv] - Output results in CSV format
 * @param {boolean} [options.compact] - Show only matching fields in output
 * @param {boolean} [options.highlight] - Highlight matched text in output
 * @param {boolean} [options.verbose] - Show detailed output including queries
 * @param {boolean} [options.showIds] - Whether to show document IDs in output
 * @returns {Promise<boolean>} True if search found matches, false otherwise
 */
async function searchMongoDB({ client, db: mongoDb }, collectionName, fieldName, searchValue, options) {
  // Store search value for highlighting later
  options.searchValue = searchValue;
  try {
    // If collection is provided but doesn't exist, error out early
    if (collectionName) {
      const collectionExists = await db.mongodb.collectionExists(mongoDb, collectionName);
      if (!collectionExists) {
        console.error(chalk.red(`Collection "${collectionName}" does not exist`));
        return false;
      }
    }
    
    console.log(chalk.cyan(`Searching for "${searchValue}" in MongoDB database...`));
    
    let results = [];
    let totalMatches = 0;

    // Get list of collections to search
    const collections = collectionName ? [collectionName] : await getAllCollections(mongoDb);
    
    for (const collection of collections) {
      // Build and execute search query
      let collectionResults = await searchCollection(mongoDb, collection, fieldName, searchValue, options);
      
      // If matches found, add to results
      if (collectionResults.length > 0) {
        results = results.concat(collectionResults);
        totalMatches += collectionResults.length;
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
    console.error(chalk.red('Error searching MongoDB database:'), error.message);
    return false;
  }
}

/**
 * Get all collections in the MongoDB database
 */
async function getAllCollections(mongoDb) {
  try {
    return await db.mongodb.listCollections(mongoDb);
  } catch (error) {
    console.error(chalk.red('Error listing collections:'), error.message);
    return [];
  }
}

/**
 * Search a specific collection for the given value
 */
async function searchCollection(mongoDb, collectionName, fieldName, searchValue, options) {
  try {
    // Skip system collections
    if (collectionName.startsWith('system.')) {
      return [];
    }
    
    // Build query - different approach needed for MongoDB
    let query = {};
    
    // If specific field is provided, only search that field
    if (fieldName) {
      if (options.exact) {
        // Exact match on specific field
        query[fieldName] = searchValue;
      } else {
        // Partial text match on specific field
        if (options.regex) {
          // Use the search value directly as a regex if regex option is enabled
          query[fieldName] = { $regex: searchValue, $options: options.caseSensitive ? '' : 'i' };
        } else {
          // Escape regex special characters for normal searches
          query[fieldName] = { $regex: escapeStringForRegex(searchValue), $options: options.caseSensitive ? '' : 'i' };
        }
      }
    } else {
      // Search across all fields if no specific field
      if (searchValue.toLowerCase() === 'null') {
        // Special case for null search
        query = { $where: "Object.values(this).includes(null)" };
      } else if (options.exact) {
        // For exact match, need to use $or to check multiple fields
        // This is a simplified approach - a more comprehensive would analyze document structure
        query = { $where: `Object.values(this).some(v => v === '${escapeStringForJs(searchValue)}')` };
      } else {
        // For partial match, use text search if available, otherwise regex
        try {
          // Try to convert search value to different types for comparison
          const numericValue = isNumeric(searchValue) ? parseFloat(searchValue) : null;
          const booleanValue = ['true', 'false'].includes(searchValue.toLowerCase()) ? 
            searchValue.toLowerCase() === 'true' : null;
          
          // Build a flexible query that searches across different types
          const regexOpts = options.caseSensitive ? '' : 'i';
          const regexPattern = options.regex ? searchValue : escapeStringForRegex(searchValue);
          
          query.$or = [
            // String search - partial match with regex
            { $where: `Object.values(this).some(v => typeof v === 'string' && v.match(/${regexPattern}/${regexOpts}))` },
          ];
          
          // Add numeric search if the value can be a number
          if (numericValue !== null) {
            query.$or.push({ $where: `Object.values(this).includes(${numericValue})` });
          }
          
          // Add boolean search if the value can be a boolean
          if (booleanValue !== null) {
            query.$or.push({ $where: `Object.values(this).includes(${booleanValue})` });
          }
        } catch (e) {
          // Fallback to simpler query
          const regexOptions = options.caseSensitive ? '' : 'i';
          const regexPattern = options.regex ? searchValue : escapeStringForRegex(searchValue);
          query = { $where: `JSON.stringify(this).match(/${regexPattern}/${regexOptions})` };
        }
      }
    }
    
    // MongoDB's flexible schema means we need to handle fields dynamically
    // Limit results to avoid excessive matches
    const limit = options.limit || 1000;
    
    if (options.verbose) {
      console.log(chalk.blue('MongoDB Query:'), JSON.stringify(query, null, 2));
    }
    
    const documents = await mongoDb.collection(collectionName).find(query).limit(limit).toArray();
    
    if (documents.length === 0) {
      return [];
    }
    
    // Process results to identify matching fields
    const results = documents.map(doc => {
      // Find all matching fields in this document
      const matchingFields = [];
      
      // If specific field was requested, only check that
      if (fieldName) {
        if (doc[fieldName] !== undefined) {
          const value = doc[fieldName];
          if (checkValueMatch(value, searchValue, options)) {
            matchingFields.push(fieldName);
          }
        }
      } else {
        // Check all fields for matches
        for (const [field, value] of Object.entries(doc)) {
          if (field === '_id') continue; // Skip _id field
          
          if (checkValueMatch(value, searchValue, options)) {
            matchingFields.push(field);
          }
        }
      }
      
      // Only include if we found at least one matching field
      if (matchingFields.length > 0) {
        return {
          table: collectionName, // Using 'table' for consistency with PostgreSQL
          matching_columns: matchingFields, // Using 'columns' for consistency
          data: doc
        };
      }
      
      return null;
    }).filter(Boolean); // Remove nulls
    
    return results;
  } catch (error) {
    console.error(chalk.yellow(`Error searching collection "${collectionName}": ${error.message}`));
    return [];
  }
}

/**
 * Check if a value matches the search criteria
 */
function checkValueMatch(value, searchValue, options) {
  // Handle path-based search for nested objects if recursive option is enabled
  if (options.recursive && searchValue.includes('->') && typeof value === 'object' && value !== null) {
    const pathParts = searchValue.split('->');
    const searchTarget = pathParts.pop().trim(); // Get the value to search for
    
    // Navigate through the object following the path
    let currentValue = value;
    for (const part of pathParts) {
      if (currentValue === null || currentValue === undefined) return false;
      
      // Handle array indices (if part is a number)
      if (!isNaN(part) && Array.isArray(currentValue)) {
        currentValue = currentValue[parseInt(part)];
      } else {
        currentValue = currentValue[part];
      }
    }
    
    // Check if the final value matches the search target
    return checkValueMatch(currentValue, searchTarget, { ...options, recursive: false });
  }
  if (value === null || value === undefined) {
    return searchValue.toLowerCase() === 'null';
  }
  
  try {
    const valueType = typeof value;
    
    if (valueType === 'string') {
      if (options.regex) {
        try {
          // Use the search value as a regex pattern
          const regex = new RegExp(searchValue, options.caseSensitive ? '' : 'i');
          return regex.test(value);
        } catch (e) {
          // If regex is invalid, fall back to normal matching
          console.error(`Invalid regex: ${e.message}`);
          return false;
        }
      } else if (options.exact) {
        return options.caseSensitive ? 
          value === searchValue : 
          value.toLowerCase() === searchValue.toLowerCase();
      } else {
        return options.caseSensitive ? 
          value.includes(searchValue) : 
          value.toLowerCase().includes(searchValue.toLowerCase());
      }
    } else if (valueType === 'number') {
      if (isNumeric(searchValue)) {
        const numericSearch = parseFloat(searchValue);
        return value === numericSearch;
      }
      // Also try string representation match
      return String(value).includes(searchValue);
    } else if (valueType === 'boolean') {
      return String(value) === searchValue.toLowerCase();
    } else if (value instanceof Date) {
      return value.toISOString().includes(searchValue);
    } else if (Array.isArray(value)) {
      // Check if any array element matches
      return value.some(element => checkValueMatch(element, searchValue, options));
    } else if (valueType === 'object') {
      // For objects, check recursive fields if recursive option is enabled
      if (options.recursive) {
        // Recursively check nested objects and arrays
        if (Array.isArray(value)) {
          return value.some(element => checkValueMatch(element, searchValue, options));
        } else {                
          // Check each field in the object
          return Object.values(value).some(v => checkValueMatch(v, searchValue, options));
        }
      }
      
      // For objects, check JSON string representation
      const jsonString = JSON.stringify(value);
      if (options.regex) {
        try {
          const regex = new RegExp(searchValue, options.caseSensitive ? '' : 'i');
          return regex.test(jsonString);
        } catch (e) {
          return false;
        }
      } else {
        return options.caseSensitive ? 
          jsonString.includes(searchValue) : 
          jsonString.toLowerCase().includes(searchValue.toLowerCase());
      }
    }
    
    // Default case - stringify and check
    return String(value).includes(searchValue);
  } catch (error) {
    console.error(`Error checking value match: ${error.message}`);
    return false;
  }
}

/**
 * Check if a string can be converted to a number
 */
function isNumeric(value) {
  return !isNaN(parseFloat(value)) && isFinite(value);
}

/**
 * Escape string for JavaScript evaluation
 */
function escapeStringForJs(str) {
  return str.replace(/'/g, "\\'").replace(/"/g, '\\"');
}

/**
 * Escape string for RegExp constructor
 */
function escapeStringForRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Output results in a readable format
 */
function outputResults(results, options) {
  const compact = options.compact;
  const highlight = options.highlight;
  
  results.forEach((result, index) => {
    console.log(`\n${chalk.cyan('Result')} #${index + 1}`);
    console.log(`${chalk.blue('Collection:')} ${result.table}`);
    console.log(`${chalk.blue('Matching field(s):')} ${result.matching_columns.join(', ')}`);
    
    if (compact) {
      // Show only matching fields in compact mode
      console.log(chalk.blue('Data:'));
      result.matching_columns.forEach(field => {
        const value = result.data[field];
        console.log(`  ${field}: ${formatValue(value, options.highlight, options.searchValue, options.regex)}`);
      });
    } else {
      // Show all fields in regular mode (except _id by default)
      console.log(chalk.blue('Data:'));
      Object.entries(result.data)
        .filter(([key]) => key !== '_id' || options.showIds) // Skip _id field unless showIds is true
        .forEach(([key, value]) => {
          const isMatch = result.matching_columns.includes(key);
          const display = isMatch 
            ? chalk.green(formatValue(value, options.highlight, options.searchValue, options.regex)) 
            : formatValue(value);
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
  // Get all unique fields across all results
  const allFields = new Set();
  results.forEach(result => {
    Object.keys(result.data)
      .filter(key => key !== '_id') // Skip _id field
      .forEach(key => allFields.add(key));
  });
  
  // Convert to array and sort
  const fields = Array.from(allFields).sort();
  
  // Output header row
  const headerRow = ['collection', 'matching_fields', ...fields];
  console.log(headerRow.join(','));
  
  // Output data rows
  results.forEach(result => {
    const row = [
      result.table,
      `"${result.matching_columns.join(';')}"`,
      ...fields.map(field => {
        const value = result.data[field];
        return formatCSVValue(value);
      })
    ];
    console.log(row.join(','));
  });
}

/**
 * Format a value for display
 */
function formatValue(value, highlight = false, searchValue = '', isRegex = false) {
  if (value === null || value === undefined) {
    return chalk.gray('NULL');
  } else if (typeof value === 'object') {
    if (value instanceof Date) {
      return value.toISOString();
    }
    return JSON.stringify(value);
  } else {
    const strValue = String(value);
    
    // If highlighting is enabled, highlight the matching parts
    if (highlight && searchValue) {
      if (isRegex) {
        try {
          const regex = new RegExp(searchValue, 'gi');
          return strValue.replace(regex, match => chalk.yellow.bold(match));
        } catch (e) {
          // If regex is invalid, fall back to regular display
          return strValue;
        }
      } else {
        // Case-insensitive string replacement for highlighting
        try {
          const searchStr = searchValue.toLowerCase();
          let result = strValue;
          let lastIndex = 0;
          let output = '';
          
          while (true) {
            const index = result.toLowerCase().indexOf(searchStr, lastIndex);
            if (index === -1) break;
            
            output += result.substring(lastIndex, index);
            output += chalk.yellow.bold(result.substring(index, index + searchStr.length));
            
            lastIndex = index + searchStr.length;
          }
          
          output += result.substring(lastIndex);
          return output.length > 0 ? output : strValue;
        } catch (e) {
          return strValue;
        }
      }
    }
    return strValue;
  }
}

/**
 * Format a value for CSV output
 */
function formatCSVValue(value) {
  if (value === null || value === undefined) {
    return '';
  } else if (typeof value === 'object') {
    if (value instanceof Date) {
      return `"${value.toISOString()}"`;
    }
    return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
  } else if (typeof value === 'string') {
    return `"${value.replace(/"/g, '""')}"`;
  } else {
    return String(value);
  }
}

module.exports = searchMongoDB;