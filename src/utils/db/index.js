/**
 * @fileoverview Main entry point for database utilities with multi-database abstraction
 * @module utils/db
 * @author DB Tools Team
 * @version 1.0.0
 * 
 * This module provides a unified interface for working with multiple database types
 * (PostgreSQL and MongoDB). It handles connection management, query execution,
 * and database-agnostic operations while delegating database-specific functionality
 * to specialized modules. All functions include enhanced error handling with
 * actionable suggestions and comprehensive validation.
 */

const fs = require('fs');
const path = require('path');
const postgresUtils = require('./postgres');
const mongodbUtils = require('./mongodb');

/**
 * Loads and validates database connection configuration from a JSON file
 * 
 * This function performs comprehensive loading and basic validation of the connection
 * configuration file. It includes enhanced error handling with specific error types
 * and actionable suggestions for common issues.
 * 
 * @param {string|null} connectionFile - Path to the connection file (defaults to './connect.json')
 * @returns {Array<Object>} Array of connection configuration objects
 * @returns {string} returns[].name - Human-readable name for the connection
 * @returns {string} [returns[].type] - Database type ('postgres' or 'mongodb')
 * @returns {string} [returns[].postgres_uri] - PostgreSQL connection URI
 * @returns {string} [returns[].mongodb_uri] - MongoDB connection URI
 * 
 * @throws {Error} Will exit process with code 1 if file cannot be loaded or parsed
 * 
 * @example
 * const connections = loadConnections();
 * const pgConnection = connections.find(c => c.type === 'postgres');
 * 
 * @example
 * const connections = loadConnections('./config/database.json');
 */
function loadConnections(connectionFile = null) {
  const chalk = require('chalk');
  const connectPath = connectionFile || path.join(process.cwd(), 'connect.json');
  
  try {
    // Check if file exists first
    if (!fs.existsSync(connectPath)) {
      console.error(chalk.red(`✗ Configuration file not found: ${connectPath}`));
      console.log(chalk.cyan('\n💡 Suggestions:'));
      console.log(chalk.cyan('  • Create a connect.json file in your project root'));
      console.log(chalk.cyan('  • Run "db-tools validate-config --fix" to create a sample configuration'));
      console.log(chalk.cyan('  • Use --connect <path> to specify a different configuration file'));
      process.exit(1);
    }
    
    const rawdata = fs.readFileSync(connectPath);
    const connections = JSON.parse(rawdata);
    
    // Basic validation
    if (!Array.isArray(connections)) {
      console.error(chalk.red('✗ Configuration file must contain an array of connection objects'));
      console.log(chalk.cyan('\n💡 Suggestions:'));
      console.log(chalk.cyan('  • Wrap your connection objects in an array: [{"name": "...", ...}]'));
      console.log(chalk.cyan('  • Run "db-tools validate-config" for detailed validation'));
      process.exit(1);
    }
    
    if (connections.length === 0) {
      console.error(chalk.red('✗ Configuration file contains no database connections'));
      console.log(chalk.cyan('\n💡 Suggestions:'));
      console.log(chalk.cyan('  • Add at least one database connection to the configuration'));
      console.log(chalk.cyan('  • Run "db-tools validate-config --fix" to get help setting up connections'));
      process.exit(1);
    }
    
    return connections;
  } catch (error) {
    if (error.name === 'SyntaxError') {
      console.error(chalk.red(`✗ Invalid JSON in configuration file: ${connectPath}`));
      console.log(chalk.red(`  ${error.message}`));
      console.log(chalk.cyan('\n💡 Suggestions:'));
      console.log(chalk.cyan('  • Check your JSON syntax (missing commas, quotes, brackets, etc.)'));
      console.log(chalk.cyan('  • Use a JSON validator or linter to check the file'));
      console.log(chalk.cyan('  • Run "db-tools validate-config" for detailed validation'));
    } else if (error.code === 'EACCES') {
      console.error(chalk.red(`✗ Permission denied reading configuration file: ${connectPath}`));
      console.log(chalk.cyan('\n💡 Suggestions:'));
      console.log(chalk.cyan('  • Check file permissions (should be readable)'));
      console.log(chalk.cyan('  • Run with appropriate permissions or change file ownership'));
    } else {
      console.error(chalk.red(`✗ Error loading configuration file: ${error.message}`));
      console.log(chalk.cyan('\n💡 Suggestions:'));
      console.log(chalk.cyan('  • Check that the file exists and is readable'));
      console.log(chalk.cyan('  • Run "db-tools validate-config" for detailed diagnosis'));
    }
    
    process.exit(1);
  }
}

/**
 * Gets connection information for a specific project
 * @param {string} projectName - Name of the project to find connection information for
 * @param {Object} options - Additional options
 * @param {string} [options.connect] - Custom path to connection file
 * @returns {Object} Connection configuration object for the specified project
 * @throws Will exit process if project is not found
 */
function getConnectionForProject(projectName, options = {}) {
  const connections = loadConnections(options.connect);
  
  // Filter by type if specified
  let filteredConnections = connections;
  if (options.type) {
    filteredConnections = connections.filter(conn => conn.type === options.type);
    
    // If no connections match the type, show helpful error
    if (filteredConnections.length === 0) {
      const chalk = require('chalk');
      console.error(chalk.red(`✗ No connections found with type "${options.type}"`));
      console.log(chalk.cyan('\nAvailable connection types:'));
      const types = [...new Set(connections.map(conn => conn.type).filter(Boolean))];
      types.forEach(type => {
        console.log(chalk.green(`  ✓ ${type}`));
      });
      process.exit(1);
    }
  }
  
  const connection = filteredConnections.find(conn => conn.name === projectName);
  
  if (!connection) {
    const chalk = require('chalk');
    let errorMessage = `✗ No connection found for project: "${projectName}"`;
    if (options.type) {
      errorMessage += ` with type "${options.type}"`;
    }
    console.error(chalk.red(errorMessage));
    console.log(chalk.cyan('\nAvailable projects:'));
    
    if (filteredConnections.length === 0) {
      console.log(chalk.yellow('  (No projects configured)'));
      console.log(chalk.cyan('\n💡 Suggestions:'));
      console.log(chalk.cyan('  • Run "db-tools validate-config --fix" to create a sample configuration'));
      console.log(chalk.cyan('  • Check that your connect.json file exists and contains project definitions'));
    } else {
      filteredConnections.forEach(conn => {
        const typeInfo = conn.type ? ` (${conn.type})` : '';
        console.log(chalk.green(`  ✓ ${conn.name}${typeInfo}`));
      });
      
      // Check for similar names (simple string similarity)
      const similarNames = filteredConnections
        .map(conn => conn.name)
        .filter(name => name && (
          name.toLowerCase().includes(projectName.toLowerCase()) ||
          projectName.toLowerCase().includes(name.toLowerCase())
        ));
      
      if (similarNames.length > 0) {
        console.log(chalk.cyan('\n💡 Did you mean:'));
        similarNames.forEach(name => {
          console.log(chalk.cyan(`  • "${name}"`));
        });
      }
      
      console.log(chalk.cyan('\n💡 Suggestions:'));
      console.log(chalk.cyan('  • Check the spelling of the project name'));
      console.log(chalk.cyan('  • Use exact name including capitalization and spaces'));
      if (options.type) {
        console.log(chalk.cyan(`  • Verify the project exists with type "${options.type}"`));
      }
      console.log(chalk.cyan('  • Run "db-tools validate-config" to verify your configuration'));
    }
    
    process.exit(1);
  }
  
  return connection;
}

/**
 * Determines the database type of a connection
 * @param {Object} connection - Connection configuration object
 * @returns {string} Database type ('postgres', 'mongodb', or 'unknown')
 */
function getDatabaseType(connection) {
  // First check for explicit type field (preferred method)
  if (connection.type) {
    if (connection.type === 'postgres' || connection.type === 'mongodb') {
      return connection.type;
    }
  }
  
  // Fall back to URI detection for backward compatibility
  if (connection.postgres_uri) {
    return 'postgres';
  } else if (connection.mongodb_uri) {
    return 'mongodb';
  } else {
    return 'unknown';
  }
}

/**
 * Creates a database connection for a specific project
 * @param {string} projectName - Name of the project to create connection for
 * @param {Object} options - Additional connection options
 * @returns {Promise<Object>} Database connection object
 * @throws Will throw error if database type is unsupported
 */
async function createConnection(projectName, options = {}) {
  const connection = getConnectionForProject(projectName, options);
  const dbType = getDatabaseType(connection);
  
  if (dbType === 'postgres') {
    const pool = postgresUtils.createPool(connection, options);
    return { type: 'postgres', connection: pool, raw: connection };
  } else if (dbType === 'mongodb') {
    const { client, db } = await mongodbUtils.createClient(connection, options);
    return { type: 'mongodb', connection: { client, db }, raw: connection };
  } else {
    throw new Error(`Unsupported database type for project: ${projectName}`);
  }
}

/**
 * Closes a database connection
 * @param {Object} dbConnection - Database connection object returned by createConnection
 * @returns {Promise<void>}
 */
async function closeConnection(dbConnection) {
  if (!dbConnection) return;
  
  try {
    if (dbConnection.type === 'postgres') {
      await dbConnection.connection.end();
    } else if (dbConnection.type === 'mongodb') {
      await mongodbUtils.closeClient(dbConnection.connection.client);
    }
  } catch (error) {
    console.error('Error closing database connection:', error.message);
  }
}

/**
 * Lists all available projects from connection configuration
 * @returns {Promise<Array<string>>} Array of project names
 */
async function listProjects() {
  const connections = loadConnections();
  return connections.map(conn => conn.name);
}

/**
 * Executes a database query
 * @param {Object} dbConnection - Database connection object returned by createConnection
 * @param {string|Object} query - Query to execute (SQL string for PostgreSQL, query object for MongoDB)
 * @param {Array|Object} params - Query parameters (array for PostgreSQL, object for MongoDB)
 * @returns {Promise<Object>} Query result
 */
async function executeQuery(dbConnection, query, params = []) {
  if (dbConnection.type === 'postgres') {
    return postgresUtils.executeQuery(dbConnection.connection, query, params);
  } else if (dbConnection.type === 'mongodb') {
    // For MongoDB, query is expected to be an object with collection, query, and options fields
    return mongodbUtils.executeQuery(
      dbConnection.connection.db, 
      query.collection, 
      query.query, 
      query.options || {}
    );
  } else {
    throw new Error(`Unsupported database type: ${dbConnection.type}`);
  }
}

/**
 * Lists tables or collections in the database
 * @param {Object} dbConnection - Database connection object returned by createConnection
 * @returns {Promise<Array<string>>} Array of table/collection names
 */
async function listTablesOrCollections(dbConnection) {
  if (dbConnection.type === 'postgres') {
    return postgresUtils.listTables(dbConnection.connection);
  } else if (dbConnection.type === 'mongodb') {
    return mongodbUtils.listCollections(dbConnection.connection.db);
  } else {
    throw new Error(`Unsupported database type: ${dbConnection.type}`);
  }
}

/**
 * Creates a database backup
 * @param {Object} dbConnection - Database connection object returned by createConnection
 * @param {string} outputPath - Path for the backup output
 * @param {Object} options - Backup options
 * @returns {Promise<Object>} Backup result
 */
async function createBackup(dbConnection, outputPath, options = {}) {
  if (dbConnection.type === 'postgres') {
    return postgresUtils.createDatabaseBackup(dbConnection.raw, outputPath, options);
  } else if (dbConnection.type === 'mongodb') {
    return mongodbUtils.createDatabaseBackup(dbConnection.raw, outputPath, options);
  } else {
    throw new Error(`Unsupported database type for backup: ${dbConnection.type}`);
  }
}

/**
 * Restores a database from a backup
 * @param {Object} dbConnection - Database connection object returned by createConnection
 * @param {string} backupPath - Path to the backup file
 * @param {Object} options - Restore options
 * @returns {Promise<Object>} Restore result
 */
async function restoreBackup(dbConnection, backupPath, options = {}) {
  if (dbConnection.type === 'postgres') {
    return postgresUtils.restoreDatabase(dbConnection.raw, backupPath, options.dryRun);
  } else if (dbConnection.type === 'mongodb') {
    return mongodbUtils.restoreDatabase(dbConnection.raw, backupPath, options);
  } else {
    throw new Error(`Unsupported database type for restore: ${dbConnection.type}`);
  }
}

/**
 * Tracks a database migration
 * @param {Object} dbConnection - Database connection object returned by createConnection
 * @param {string} migrationName - Name of the migration
 * @param {string|Object} migrationContent - Content of the migration (SQL or operations)
 * @returns {Promise<Object>} Migration tracking result
 */
async function trackMigration(dbConnection, migrationName, migrationContent) {
  if (dbConnection.type === 'postgres') {
    return postgresUtils.trackMigration(dbConnection.connection, migrationName, migrationContent);
  } else if (dbConnection.type === 'mongodb') {
    return mongodbUtils.trackMigration(dbConnection.connection.db, migrationName, migrationContent);
  } else {
    throw new Error(`Unsupported database type for migration tracking: ${dbConnection.type}`);
  }
}

/**
 * Gets a list of applied migrations
 * @param {Object} dbConnection - Database connection object returned by createConnection
 * @returns {Promise<Array<Object>>} List of applied migrations
 */
async function getAppliedMigrations(dbConnection) {
  if (dbConnection.type === 'postgres') {
    return postgresUtils.getAppliedMigrations(dbConnection.connection);
  } else if (dbConnection.type === 'mongodb') {
    return mongodbUtils.getAppliedMigrations(dbConnection.connection.db);
  } else {
    throw new Error(`Unsupported database type for getting migrations: ${dbConnection.type}`);
  }
}

// Export both the high-level API and the direct database-specific utilities
module.exports = {
  // High-level database-agnostic functions
  createConnection,
  closeConnection,
  executeQuery,
  listTablesOrCollections,
  createBackup,
  restoreBackup,
  trackMigration,
  getAppliedMigrations,
  listProjects,
  loadConnections,
  getConnectionForProject,
  getDatabaseType,
  
  // Database-specific utilities (for direct access when needed)
  postgres: postgresUtils,
  mongodb: mongodbUtils
};