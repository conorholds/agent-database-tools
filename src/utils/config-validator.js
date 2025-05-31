/**
 * @fileoverview Configuration validation utilities for connect.json and database connections
 * @module utils/config-validator
 * @author DB Tools Team
 * @version 1.0.0
 * 
 * This module provides comprehensive validation for database configuration files,
 * including JSON structure validation, URI format checking, and live connection testing.
 * It supports both PostgreSQL and MongoDB connection validation with detailed error
 * reporting and actionable suggestions for fixing common configuration issues.
 */

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { Pool } = require('pg');
const { MongoClient } = require('mongodb');

/**
 * Validates the structure and format of a connect.json configuration file
 * 
 * Performs comprehensive validation including:
 * - File existence and readability
 * - JSON syntax validation
 * - Array structure validation
 * - Individual connection object validation
 * - Duplicate name detection
 * - URI format validation for both PostgreSQL and MongoDB
 * 
 * @param {string|null} connectionFile - Path to the connection file (defaults to 'connect.json')
 * @returns {Object} Validation result object
 * @returns {boolean} returns.isValid - Whether the configuration is valid
 * @returns {Array<Object>} returns.errors - Array of error objects with type, message, and suggestion
 * @returns {Array<Object>} returns.warnings - Array of warning objects with type, message, and suggestion
 * @returns {Array<Object>} returns.connections - Array of validated connection summaries
 * 
 * @example
 * const result = validateConfigFile('./my-connect.json');
 * if (!result.isValid) {
 *   console.error('Configuration errors:', result.errors);
 * }
 */
function validateConfigFile(connectionFile = null) {
  const result = {
    isValid: true,
    errors: [],
    warnings: [],
    connections: []
  };

  try {
    // Check if file exists
    const connectPath = connectionFile || path.join(process.cwd(), 'connect.json');
    
    if (!fs.existsSync(connectPath)) {
      result.isValid = false;
      result.errors.push({
        type: 'file_not_found',
        message: `Configuration file not found: ${connectPath}`,
        suggestion: 'Create a connect.json file in your project root with database connection details'
      });
      return result;
    }

    // Try to parse JSON
    let rawdata;
    try {
      rawdata = fs.readFileSync(connectPath, 'utf8');
    } catch (error) {
      result.isValid = false;
      result.errors.push({
        type: 'file_read_error',
        message: `Cannot read configuration file: ${error.message}`,
        suggestion: 'Check file permissions and ensure the file is readable'
      });
      return result;
    }

    let connections;
    try {
      connections = JSON.parse(rawdata);
    } catch (error) {
      result.isValid = false;
      result.errors.push({
        type: 'invalid_json',
        message: `Invalid JSON format: ${error.message}`,
        suggestion: 'Validate your JSON syntax using a JSON validator or linter'
      });
      return result;
    }

    // Check if connections is an array
    if (!Array.isArray(connections)) {
      result.isValid = false;
      result.errors.push({
        type: 'invalid_structure',
        message: 'Configuration must be an array of connection objects',
        suggestion: 'Wrap your connection objects in an array: [{"name": "...", ...}]'
      });
      return result;
    }

    // Check if array is empty
    if (connections.length === 0) {
      result.isValid = false;
      result.errors.push({
        type: 'empty_config',
        message: 'Configuration file contains no connection definitions',
        suggestion: 'Add at least one database connection to the configuration array'
      });
      return result;
    }

    // Validate each connection
    for (let i = 0; i < connections.length; i++) {
      const conn = connections[i];
      const connResult = validateConnectionObject(conn, i);
      
      if (!connResult.isValid) {
        result.isValid = false;
        result.errors.push(...connResult.errors);
      }
      
      result.warnings.push(...connResult.warnings);
      result.connections.push({
        index: i,
        name: conn.name,
        type: connResult.detectedType,
        isValid: connResult.isValid
      });
    }

    // Check for duplicate connection names
    const names = connections.map(c => c.name).filter(name => name);
    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
    
    if (duplicates.length > 0) {
      result.warnings.push({
        type: 'duplicate_names',
        message: `Duplicate connection names found: ${[...new Set(duplicates)].join(', ')}`,
        suggestion: 'Use unique names for each database connection to avoid confusion'
      });
    }

    return result;

  } catch (error) {
    result.isValid = false;
    result.errors.push({
      type: 'unexpected_error',
      message: `Unexpected error during validation: ${error.message}`,
      suggestion: 'Please report this as a bug with your configuration file'
    });
    return result;
  }
}

/**
 * Validates a single connection object
 * @param {Object} conn - Connection object to validate
 * @param {number} index - Index of the connection in the array
 * @returns {Object} Validation result for the connection
 */
function validateConnectionObject(conn, index) {
  const result = {
    isValid: true,
    errors: [],
    warnings: [],
    detectedType: 'unknown'
  };

  const prefix = `Connection ${index + 1}`;

  // Check required fields
  if (!conn.name) {
    result.errors.push({
      type: 'missing_name',
      message: `${prefix}: Missing required field 'name'`,
      suggestion: 'Add a "name" field with a descriptive name for this connection'
    });
    result.isValid = false;
  }

  // Check for connection URI
  const hasPostgresUri = conn.postgres_uri && typeof conn.postgres_uri === 'string';
  const hasMongoUri = conn.mongodb_uri && typeof conn.mongodb_uri === 'string';

  if (!hasPostgresUri && !hasMongoUri) {
    result.errors.push({
      type: 'missing_uri',
      message: `${prefix}: Missing database connection URI`,
      suggestion: 'Add either "postgres_uri" or "mongodb_uri" field with a valid connection string'
    });
    result.isValid = false;
  }

  if (hasPostgresUri && hasMongoUri) {
    result.warnings.push({
      type: 'multiple_uris',
      message: `${prefix}: Both postgres_uri and mongodb_uri are present`,
      suggestion: 'Remove one of the URI fields to avoid confusion about database type'
    });
  }

  // Validate PostgreSQL URI format
  if (hasPostgresUri) {
    result.detectedType = 'postgres';
    // More flexible regex that supports various PostgreSQL URI formats
    const pgUriRegex = /^postgresql:\/\/(?:([^:]+)(?::([^@]+))?@)?([^:\/]+)(?::(\d+))?\/([^?]+)(\?.*)?$/;
    
    if (!pgUriRegex.test(conn.postgres_uri)) {
      result.errors.push({
        type: 'invalid_postgres_uri',
        message: `${prefix}: Invalid PostgreSQL URI format`,
        suggestion: 'Use format: postgresql://[username[:password]@]hostname[:port]/database[?options]'
      });
      result.isValid = false;
    }
  }

  // Validate MongoDB URI format
  if (hasMongoUri) {
    result.detectedType = 'mongodb';
    const mongoUriRegex = /^mongodb:\/\//;
    
    if (!mongoUriRegex.test(conn.mongodb_uri)) {
      result.errors.push({
        type: 'invalid_mongodb_uri',
        message: `${prefix}: Invalid MongoDB URI format`,
        suggestion: 'Use format: mongodb://[username:password@]hostname:port/database'
      });
      result.isValid = false;
    }
  }

  // Validate explicit type field if present
  if (conn.type) {
    if (!['postgres', 'mongodb'].includes(conn.type)) {
      result.errors.push({
        type: 'invalid_type',
        message: `${prefix}: Invalid type "${conn.type}"`,
        suggestion: 'Use "postgres" or "mongodb" for the type field'
      });
      result.isValid = false;
    } else if (result.detectedType !== 'unknown' && conn.type !== result.detectedType) {
      result.warnings.push({
        type: 'type_mismatch',
        message: `${prefix}: Type "${conn.type}" doesn't match detected type "${result.detectedType}"`,
        suggestion: 'Ensure the type field matches your connection URI'
      });
    }
  }

  return result;
}

/**
 * Tests actual database connectivity for a connection
 * @param {Object} connection - Connection object to test
 * @param {Object} options - Test options
 * @returns {Promise<Object>} Test result with connection status
 */
async function testConnection(connection, options = {}) {
  const result = {
    isConnectable: false,
    error: null,
    details: {},
    suggestions: []
  };

  const timeout = options.timeout || 5000;

  try {
    if (connection.postgres_uri) {
      return await testPostgreSQLConnection(connection, timeout);
    } else if (connection.mongodb_uri) {
      return await testMongoDBConnection(connection, timeout);
    } else {
      result.error = 'No valid connection URI found';
      result.suggestions.push('Add either postgres_uri or mongodb_uri to the connection');
      return result;
    }
  } catch (error) {
    result.error = error.message;
    result.suggestions.push('Check your network connection and database server status');
    return result;
  }
}

/**
 * Tests PostgreSQL connection
 * @param {Object} connection - Connection object
 * @param {number} timeout - Connection timeout in milliseconds
 * @returns {Promise<Object>} Test result
 */
async function testPostgreSQLConnection(connection, timeout) {
  const result = {
    isConnectable: false,
    error: null,
    details: {},
    suggestions: []
  };

  let pool;
  try {
    pool = new Pool({
      connectionString: connection.postgres_uri,
      connectionTimeoutMillis: timeout,
      idleTimeoutMillis: 1000,
      max: 1
    });

    const client = await pool.connect();
    
    // Get database info
    const versionResult = await client.query('SELECT version()');
    const dbNameResult = await client.query('SELECT current_database()');
    
    result.isConnectable = true;
    result.details = {
      version: versionResult.rows[0].version,
      database: dbNameResult.rows[0].current_database,
      type: 'postgres'
    };
    
    client.release();
  } catch (error) {
    result.error = error.message;
    
    if (error.code === 'ECONNREFUSED') {
      result.suggestions.push('Database server is not running or not accessible');
      result.suggestions.push('Check if PostgreSQL server is started');
    } else if (error.code === '28P01') {
      result.suggestions.push('Authentication failed - check username and password');
    } else if (error.code === '3D000') {
      result.suggestions.push('Database does not exist - check database name in URI');
    } else if (error.code === 'ENOTFOUND') {
      result.suggestions.push('Hostname not found - check hostname in URI');
    } else {
      result.suggestions.push('Check connection parameters and network connectivity');
    }
  } finally {
    if (pool) {
      await pool.end();
    }
  }

  return result;
}

/**
 * Tests MongoDB connection
 * @param {Object} connection - Connection object
 * @param {number} timeout - Connection timeout in milliseconds
 * @returns {Promise<Object>} Test result
 */
async function testMongoDBConnection(connection, timeout) {
  const result = {
    isConnectable: false,
    error: null,
    details: {},
    suggestions: []
  };

  let client;
  try {
    client = new MongoClient(connection.mongodb_uri, {
      serverSelectionTimeoutMS: timeout,
      connectTimeoutMS: timeout
    });

    await client.connect();
    
    // Get database info
    const admin = client.db().admin();
    const serverStatus = await admin.serverStatus();
    const dbName = client.db().databaseName;
    
    result.isConnectable = true;
    result.details = {
      version: serverStatus.version,
      database: dbName,
      type: 'mongodb'
    };
    
  } catch (error) {
    result.error = error.message;
    
    if (error.message.includes('ECONNREFUSED')) {
      result.suggestions.push('MongoDB server is not running or not accessible');
      result.suggestions.push('Check if MongoDB server is started');
    } else if (error.message.includes('Authentication')) {
      result.suggestions.push('Authentication failed - check username and password');
    } else if (error.message.includes('not found')) {
      result.suggestions.push('Database or collection not found - check database name in URI');
    } else {
      result.suggestions.push('Check connection parameters and network connectivity');
    }
  } finally {
    if (client) {
      await client.close();
    }
  }

  return result;
}

/**
 * Prints validation results in a user-friendly format
 * @param {Object} validationResult - Result from validateConfigFile
 * @param {boolean} verbose - Whether to show detailed information
 */
function printValidationResults(validationResult, verbose = false) {
  console.log(chalk.cyan('\n=== Configuration Validation Results ===\n'));

  if (validationResult.isValid) {
    console.log(chalk.green('✓ Configuration file is valid'));
    console.log(chalk.cyan(`Found ${validationResult.connections.length} connection(s):`));
    
    validationResult.connections.forEach(conn => {
      const status = conn.isValid ? chalk.green('✓') : chalk.red('✗');
      console.log(`  ${status} ${conn.name} (${conn.type})`);
    });
  } else {
    console.log(chalk.red('✗ Configuration file has errors'));
  }

  // Show errors
  if (validationResult.errors.length > 0) {
    console.log(chalk.red('\nErrors:'));
    validationResult.errors.forEach(error => {
      console.log(chalk.red(`  ✗ ${error.message}`));
      if (verbose && error.suggestion) {
        console.log(chalk.yellow(`    💡 ${error.suggestion}`));
      }
    });
  }

  // Show warnings
  if (validationResult.warnings.length > 0) {
    console.log(chalk.yellow('\nWarnings:'));
    validationResult.warnings.forEach(warning => {
      console.log(chalk.yellow(`  ⚠ ${warning.message}`));
      if (verbose && warning.suggestion) {
        console.log(chalk.cyan(`    💡 ${warning.suggestion}`));
      }
    });
  }

  console.log(''); // Empty line for spacing
}

/**
 * Prints connection test results
 * @param {string} connectionName - Name of the connection tested
 * @param {Object} testResult - Result from testConnection
 * @param {boolean} verbose - Whether to show detailed information
 */
function printConnectionTestResults(connectionName, testResult, verbose = false) {
  const status = testResult.isConnectable ? chalk.green('✓') : chalk.red('✗');
  console.log(`${status} ${connectionName}`);

  if (testResult.isConnectable && verbose) {
    console.log(chalk.gray(`    Database: ${testResult.details.database}`));
    console.log(chalk.gray(`    Version: ${testResult.details.version}`));
  }

  if (!testResult.isConnectable) {
    console.log(chalk.red(`    Error: ${testResult.error}`));
    if (verbose && testResult.suggestions.length > 0) {
      testResult.suggestions.forEach(suggestion => {
        console.log(chalk.yellow(`    💡 ${suggestion}`));
      });
    }
  }
}

module.exports = {
  validateConfigFile,
  validateConnectionObject,
  testConnection,
  testPostgreSQLConnection,
  testMongoDBConnection,
  printValidationResults,
  printConnectionTestResults
};