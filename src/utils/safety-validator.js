// Database Safety Validator
// This module provides safety checks for destructive database operations
// by creating test environments and validating changes before applying them

const db = require('./db');
const { generateFullSchema } = require('./schema');
const chalk = require('chalk');
const { createTempBackup } = require('./temp-backup');

/**
 * Safety levels for different types of operations
 */
const SAFETY_LEVELS = {
  SAFE: 'safe',           // Read-only operations
  CAUTION: 'caution',     // Non-destructive changes (add column, create table)
  WARNING: 'warning',     // Potentially destructive (rename, alter)
  DANGER: 'danger'        // Destructive operations (drop, delete)
};

/**
 * Categorizes database operations by risk level
 */
const OPERATION_RISKS = {
  // Safe operations
  'list-tables': SAFETY_LEVELS.SAFE,
  'list-columns': SAFETY_LEVELS.SAFE,
  'count-records': SAFETY_LEVELS.SAFE,
  'query-select': SAFETY_LEVELS.SAFE,
  'search': SAFETY_LEVELS.SAFE,
  'check': SAFETY_LEVELS.SAFE,
  'list-databases': SAFETY_LEVELS.SAFE,
  'backup': SAFETY_LEVELS.SAFE,
  
  // Caution operations
  'init': SAFETY_LEVELS.CAUTION,
  'add-column': SAFETY_LEVELS.CAUTION,
  'create-index': SAFETY_LEVELS.CAUTION,
  'seed': SAFETY_LEVELS.CAUTION,
  'add-collection': SAFETY_LEVELS.CAUTION,
  
  // Warning operations  
  'rename-table': SAFETY_LEVELS.WARNING,
  'rename-column': SAFETY_LEVELS.WARNING,
  'rename-collection': SAFETY_LEVELS.WARNING,
  'rename-field': SAFETY_LEVELS.WARNING,
  'migrate': SAFETY_LEVELS.WARNING,
  'query-update': SAFETY_LEVELS.WARNING,
  'query-insert': SAFETY_LEVELS.WARNING,
  'query-bulkwrite': SAFETY_LEVELS.WARNING,
  'add-column-not-null': SAFETY_LEVELS.WARNING, // Adding NOT NULL without default
  
  // Danger operations
  'delete-table': SAFETY_LEVELS.DANGER,
  'remove-column': SAFETY_LEVELS.DANGER,
  'delete-collection': SAFETY_LEVELS.DANGER,
  'remove-field': SAFETY_LEVELS.DANGER,
  'restore': SAFETY_LEVELS.DANGER,
  'query-delete': SAFETY_LEVELS.DANGER,
  'query-drop': SAFETY_LEVELS.DANGER,
  'query-truncate': SAFETY_LEVELS.DANGER,
  'query-alter-drop': SAFETY_LEVELS.DANGER,
  'query-drop-cascade': SAFETY_LEVELS.DANGER,
  'query-deletemany': SAFETY_LEVELS.DANGER,
  'query-dropcollection': SAFETY_LEVELS.DANGER,
  'query-dropdatabase': SAFETY_LEVELS.DANGER,
  'query': SAFETY_LEVELS.DANGER // Any arbitrary query should be considered dangerous
};

/**
 * Creates a temporary test database for validation
 * @param {Object} originalConnection - Original database connection
 * @param {string} projectName - Name of the project
 * @returns {Object} Test database connection details
 */
async function createTestDatabase(originalConnection, projectName) {
  const testDbName = `test_${projectName.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
  
  // Get raw connection info from original connection
  const { Pool } = require('pg');
  
  // Extract connection details from the pool connection string
  let adminConnectionString;
  if (originalConnection.options && originalConnection.options.connectionString) {
    adminConnectionString = originalConnection.options.connectionString.replace(/\/[^\/\?]*(\?.*)?$/, '/postgres$1');
  } else if (originalConnection._connectionString) {
    adminConnectionString = originalConnection._connectionString.replace(/\/[^\/\?]*(\?.*)?$/, '/postgres$1');
  } else {
    // Fallback for direct connection objects
    const connDetails = originalConnection.connection || originalConnection;
    adminConnectionString = `postgresql://${connDetails.user || 'postgres'}:${connDetails.password}@${connDetails.host || 'localhost'}:${connDetails.port || 5432}/postgres`;
  }
  
  const adminPool = new Pool({
    connectionString: adminConnectionString
  });
  
  try {
    // Create test database
    await adminPool.query(`CREATE DATABASE "${testDbName}"`);
    console.log(chalk.blue(`Created test database: ${testDbName}`));
    
    // Return test connection details
    const testConnectionString = originalConnection.options.connectionString.replace(/\/[^\/\?]*(\?.*)?$/, `/${testDbName}$1`);
    
    return {
      name: testDbName,
      connection: new Pool({
        connectionString: testConnectionString
      })
    };
  } finally {
    await adminPool.end();
  }
}

/**
 * Copies schema and data from source to test database
 * @param {Object} sourceConnection - Source database connection
 * @param {Object} testConnection - Test database connection
 * @param {string} projectName - Project name
 */
async function populateTestDatabase(sourceConnection, testConnection, projectName) {
  console.log(chalk.blue('Populating test database with current schema and data...'));
  
  const sourcePool = sourceConnection;
  const testPool = testConnection;
  
  try {
    // Get all tables from source
    const tablesResult = await sourcePool.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename
    `);
    
    for (const { tablename } of tablesResult.rows) {
      // Get table structure
      const createTableResult = await sourcePool.query(`
        SELECT 
          'CREATE TABLE ' || quote_ident(tablename) || ' (' ||
          string_agg(
            quote_ident(column_name) || ' ' || 
            column_type || 
            CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END ||
            CASE WHEN column_default IS NOT NULL THEN ' DEFAULT ' || column_default ELSE '' END,
            ', '
          ) || ');' as create_stmt
        FROM (
          SELECT 
            t.tablename,
            c.column_name,
            CASE 
              WHEN c.data_type = 'character varying' THEN 'VARCHAR(' || c.character_maximum_length || ')'
              WHEN c.data_type = 'numeric' THEN 'NUMERIC(' || c.numeric_precision || ',' || c.numeric_scale || ')'
              ELSE UPPER(c.data_type)
            END as column_type,
            c.is_nullable,
            c.column_default
          FROM pg_tables t
          JOIN information_schema.columns c ON c.table_name = t.tablename
          WHERE t.schemaname = 'public' AND t.tablename = $1
          ORDER BY c.ordinal_position
        ) cols
        GROUP BY tablename
      `, [tablename]);
      
      if (createTableResult.rows.length > 0) {
        // Create table in test database
        await testPool.query(createTableResult.rows[0].create_stmt);
        
        // Copy data
        const copyResult = await sourcePool.query(`
          SELECT * FROM "${tablename}"
        `);
        
        if (copyResult.rows.length > 0) {
          // Get column names
          const columns = Object.keys(copyResult.rows[0]);
          const columnList = columns.map(c => `"${c}"`).join(', ');
          
          // Insert data row by row
          for (const row of copyResult.rows) {
            const values = columns.map(col => {
              const val = row[col];
              if (val === null) return 'NULL';
              if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
              if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
              if (val instanceof Date) return `'${val.toISOString()}'`;
              return val;
            }).join(', ');
            
            await testPool.query(
              `INSERT INTO "${tablename}" (${columnList}) VALUES (${values})`
            );
          }
        }
      }
    }
    
    console.log(chalk.green('Test database populated successfully'));
    
  } finally {
    // Don't close source pool as it's managed elsewhere
    // Don't close test pool as it's needed for operation testing
  }
}

/**
 * Validates an operation by running it in a test environment first
 * @param {string} operation - Type of operation
 * @param {Object} params - Operation parameters
 * @param {Object} connection - Database connection
 * @param {string} projectName - Project name
 * @returns {Object} Validation results
 */
async function validateOperation(operation, params, connection, projectName) {
  const riskLevel = OPERATION_RISKS[operation] || SAFETY_LEVELS.WARNING;
  
  console.log(chalk.yellow(`\n=== Safety Validation for ${operation} ===`));
  console.log(chalk.yellow(`Risk Level: ${riskLevel.toUpperCase()}`));
  
  // Skip validation for safe operations
  if (riskLevel === SAFETY_LEVELS.SAFE) {
    return { valid: true, safe: true, riskLevel };
  }
  
  // Create test environment for risky operations
  if ([SAFETY_LEVELS.WARNING, SAFETY_LEVELS.DANGER].includes(riskLevel)) {
    console.log(chalk.blue('Creating test environment for validation...'));
    
    // Create temporary backup for dangerous operations
    let backupInfo = null;
    if (riskLevel === SAFETY_LEVELS.DANGER) {
      backupInfo = await createTempBackup(connection, projectName, operation);
      if (!backupInfo.success) {
        console.warn(chalk.yellow('⚠️  Warning: Could not create temporary backup'));
        console.warn(chalk.yellow(`   ${backupInfo.error}`));
      }
    }
    
    const testDb = await createTestDatabase(connection, projectName);
    
    try {
      // Populate test database
      await populateTestDatabase(connection, testDb.connection, projectName);
      
      // Capture before state
      const beforeState = await captureState(testDb.connection, projectName);
      
      // Execute operation in test environment
      console.log(chalk.blue('Testing operation in safe environment...'));
      const testResult = await executeOperationInTest(
        operation, 
        params, 
        testDb.connection, 
        projectName
      );
      
      // Capture after state
      const afterState = await captureState(testDb.connection, projectName);
      
      // Analyze changes
      const analysis = analyzeChanges(beforeState, afterState, operation);
      
      // Generate validation report
      const validation = {
        valid: testResult.success,
        safe: analysis.safe,
        riskLevel,
        changes: analysis.changes,
        warnings: analysis.warnings,
        errors: testResult.errors || [],
        tempBackup: backupInfo
      };
      
      // Display results
      displayValidationResults(validation);
      
      return validation;
      
    } finally {
      // Cleanup test database
      await cleanupTestDatabase(testDb.name, testDb.connection, connection);
    }
  }
  
  return { valid: true, safe: true, riskLevel };
}

/**
 * Captures the current state of a database
 * @param {Object} connection - Database connection
 * @param {string} projectName - Project name
 * @returns {Object} Database state snapshot
 */
async function captureState(connection, projectName) {
  const pool = connection;
  
  const state = {
    tables: {},
    rowCounts: {},
    indexes: {},
    constraints: {}
  };
  
  // Get all tables
  const tablesResult = await pool.query(`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `);
  
  for (const { tablename } of tablesResult.rows) {
    // Get columns
    const columnsResult = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = $1 AND table_schema = 'public'
      ORDER BY ordinal_position
    `, [tablename]);
    
    state.tables[tablename] = columnsResult.rows;
    
    // Get row count
    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM "${tablename}"`
    );
    state.rowCounts[tablename] = parseInt(countResult.rows[0].count);
  }
  
  return state;
}

/**
 * Analyzes changes between before and after states
 * @param {Object} beforeState - State before operation
 * @param {Object} afterState - State after operation
 * @param {string} operation - Type of operation
 * @returns {Object} Analysis results
 */
function analyzeChanges(beforeState, afterState, operation) {
  const changes = {
    tablesAdded: [],
    tablesRemoved: [],
    columnsAdded: [],
    columnsRemoved: [],
    dataChanges: []
  };
  
  const warnings = [];
  let safe = true;
  
  // Check for table changes
  const beforeTables = Object.keys(beforeState.tables);
  const afterTables = Object.keys(afterState.tables);
  
  changes.tablesAdded = afterTables.filter(t => !beforeTables.includes(t));
  changes.tablesRemoved = beforeTables.filter(t => !afterTables.includes(t));
  
  // Check for data loss
  if (changes.tablesRemoved.length > 0) {
    safe = false;
    warnings.push(`Tables removed: ${changes.tablesRemoved.join(', ')}`);
  }
  
  // Check for column changes and data loss
  for (const table of beforeTables) {
    if (afterTables.includes(table)) {
      const beforeCols = beforeState.tables[table].map(c => c.column_name);
      const afterCols = afterState.tables[table].map(c => c.column_name);
      
      const removedCols = beforeCols.filter(c => !afterCols.includes(c));
      if (removedCols.length > 0) {
        changes.columnsRemoved.push({ table, columns: removedCols });
        safe = false;
        warnings.push(`Columns removed from ${table}: ${removedCols.join(', ')}`);
      }
      
      const addedCols = afterCols.filter(c => !beforeCols.includes(c));
      if (addedCols.length > 0) {
        changes.columnsAdded.push({ table, columns: addedCols });
      }
      
      // Check for data loss
      const beforeCount = beforeState.rowCounts[table] || 0;
      const afterCount = afterState.rowCounts[table] || 0;
      
      if (afterCount < beforeCount) {
        const lostRows = beforeCount - afterCount;
        changes.dataChanges.push({ 
          table, 
          type: 'rows_lost', 
          before: beforeCount, 
          after: afterCount,
          lost: lostRows
        });
        safe = false;
        warnings.push(`Data loss in ${table}: ${lostRows} rows lost`);
      }
    }
  }
  
  return { changes, warnings, safe };
}

/**
 * Executes an operation in the test environment
 * @param {string} operation - Operation type
 * @param {Object} params - Operation parameters
 * @param {Object} testConnection - Test database connection
 * @param {string} projectName - Project name
 * @returns {Object} Execution results
 */
async function executeOperationInTest(operation, params, testConnection, projectName) {
  try {
    // Map operation to command implementation
    const commandImplementation = await getCommandImplementation(operation, testConnection);
    
    if (!commandImplementation) {
      return { success: false, errors: [`No implementation found for operation: ${operation}`] };
    }
    
    // Prepare arguments based on operation type
    const args = prepareOperationArguments(operation, params, testConnection);
    
    // Execute the command in test environment
    const result = await commandImplementation(...args);
    
    return { 
      success: typeof result === 'boolean' ? result : true,
      result 
    };
    
  } catch (error) {
    return { success: false, errors: [error.message] };
  }
}

/**
 * Gets the appropriate command implementation for an operation
 * @param {string} operation - Operation type
 * @param {Object} connection - Database connection
 * @returns {Function} Command implementation function
 */
async function getCommandImplementation(operation, connection) {
  // Determine database type (for now, assume postgres)
  const dbType = 'postgres';
  
  // Map operation names to command file names
  const operationMap = {
    'delete-table': 'delete-table',
    'remove-column': 'remove-column',
    'add-column': 'add-column',
    'rename-table': 'rename-table',
    'rename-column': 'rename-column',
    'create-index': 'create-index',
    'query': 'query',
    'migrate': 'migrate',
    'restore': 'restore',
    'list-tables': 'list-tables',
    'list-columns': 'list-columns',
    'count-records': 'count-records',
    'search': 'search'
  };
  
  const commandFile = operationMap[operation];
  if (!commandFile) {
    throw new Error(`Unknown operation: ${operation}`);
  }
  
  try {
    // Load the database-specific implementation
    const implementation = require(`../commands/${dbType}/${commandFile}`);
    return implementation;
  } catch (error) {
    // Try generic implementation
    try {
      const implementation = require(`../commands/${commandFile}`);
      return implementation;
    } catch (fallbackError) {
      throw new Error(`No implementation found for operation: ${operation}`);
    }
  }
}

/**
 * Prepares arguments for operation execution
 * @param {string} operation - Operation type
 * @param {Object} params - Operation parameters
 * @param {Object} connection - Database connection
 * @returns {Array} Arguments array for the command
 */
function prepareOperationArguments(operation, params, connection) {
  // Most commands follow the pattern: (connection, ...params, options)
  const options = {
    force: true,  // Force operations in test to avoid prompts
    dryRun: false,
    ...params.options
  };
  
  switch (operation) {
    case 'delete-table':
      return [connection, params.table, options];
      
    case 'remove-column':
      return [connection, params.table, params.column, options];
      
    case 'add-column':
      return [connection, params.table, params.column, params.datatype, options];
      
    case 'rename-table':
      return [connection, params.oldName, params.newName, options];
      
    case 'rename-column':
      return [connection, params.table, params.oldColumn, params.newColumn, options];
      
    case 'create-index':
      return [connection, params.table, params.column, params.indexName, options];
      
    case 'query':
      return [connection, params.sql, options];
      
    case 'list-tables':
      return [connection, options];
      
    case 'list-columns':
      return [connection, params.table, options];
      
    case 'count-records':
      return [connection, params.table, options];
      
    case 'search':
      return [connection, params.table, params.column, params.value, options];
      
    default:
      // Generic fallback
      return [connection, ...Object.values(params), options];
  }
}

/**
 * Displays validation results to the user
 * @param {Object} validation - Validation results
 */
function displayValidationResults(validation) {
  console.log(chalk.cyan('\n=== Validation Results ==='));
  
  if (validation.safe && validation.valid) {
    console.log(chalk.green('✓ Operation appears safe to execute'));
  } else {
    if (!validation.valid) {
      console.log(chalk.red('✗ Operation failed in test environment'));
    }
    if (!validation.safe) {
      console.log(chalk.red('⚠ Operation may cause data loss or schema damage'));
    }
  }
  
  if (validation.warnings && validation.warnings.length > 0) {
    console.log(chalk.yellow('\nWarnings:'));
    validation.warnings.forEach(warning => {
      console.log(chalk.yellow(`  - ${warning}`));
    });
  }
  
  if (validation.errors && validation.errors.length > 0) {
    console.log(chalk.red('\nErrors:'));
    validation.errors.forEach(error => {
      console.log(chalk.red(`  - ${error}`));
    });
  }
  
  // Display temp backup info
  if (validation.tempBackup && validation.tempBackup.success) {
    console.log(chalk.blue('\n🔒 Temporary Backup Created:'));
    console.log(chalk.gray(`   Name: ${validation.tempBackup.backupName}`));
    console.log(chalk.gray(`   Expires: ${validation.tempBackup.expiresAt.toLocaleString()}`));
    console.log(chalk.gray(`   Restore: db-tools restore-temp "${validation.tempBackup.backupName}"`));
  }
}

/**
 * Cleans up the test database
 * @param {string} testDbName - Name of test database to remove
 * @param {Object} testConnection - Test database connection to close
 * @param {Object} originalConnection - Original connection for admin access
 */
async function cleanupTestDatabase(testDbName, testConnection, originalConnection) {
  const { Pool } = require('pg');
  
  try {
    // Close test connection first
    await testConnection.end();
    
    // Get admin connection string
    let adminConnectionString;
    if (originalConnection.options && originalConnection.options.connectionString) {
      adminConnectionString = originalConnection.options.connectionString.replace(/\/[^\/\?]*(\?.*)?$/, '/postgres$1');
    } else if (originalConnection._connectionString) {
      adminConnectionString = originalConnection._connectionString.replace(/\/[^\/\?]*(\?.*)?$/, '/postgres$1');
    } else {
      const connDetails = originalConnection.connection || originalConnection;
      adminConnectionString = `postgresql://${connDetails.user || 'postgres'}:${connDetails.password}@${connDetails.host || 'localhost'}:${connDetails.port || 5432}/postgres`;
    }
    
    const adminPool = new Pool({
      connectionString: adminConnectionString
    });
    
    await adminPool.query(`DROP DATABASE IF EXISTS "${testDbName}"`);
    console.log(chalk.blue(`Cleaned up test database: ${testDbName}`));
    
    await adminPool.end();
  } catch (error) {
    console.warn(chalk.yellow(`Warning: Could not cleanup test database ${testDbName}: ${error.message}`));
  }
}

/**
 * Main safety check function - validates operation before execution
 * @param {string} operation - Operation to validate
 * @param {Object} params - Operation parameters
 * @param {Object} connection - Database connection
 * @param {string} projectName - Project name
 * @param {Object} options - Safety options
 * @returns {boolean} Whether operation should proceed
 */
async function performSafetyCheck(operation, params, connection, projectName, options = {}) {
  const { force = false, skipSafety = false } = options;
  
  if (skipSafety) {
    console.log(chalk.yellow('⚠ Safety checks skipped by user request'));
    return true;
  }
  
  const validation = await validateOperation(operation, params, connection, projectName);
  
  // Always allow safe operations
  if (validation.safe && validation.valid) {
    return true;
  }
  
  // For dangerous operations, require explicit confirmation
  if (!validation.safe || !validation.valid) {
    if (force) {
      console.log(chalk.red('⚠ Proceeding with dangerous operation due to --force flag'));
      return true;
    }
    
    console.log(chalk.red('\n🚨 DANGEROUS OPERATION DETECTED 🚨'));
    console.log(chalk.red('This operation may cause data loss or schema damage.'));
    console.log(chalk.yellow('Review the validation results above carefully.'));
    
    // In a real implementation, you'd prompt for user confirmation here
    // For now, return false to prevent execution
    return false;
  }
  
  return true;
}

module.exports = {
  SAFETY_LEVELS,
  OPERATION_RISKS,
  validateOperation,
  performSafetyCheck,
  createTestDatabase,
  cleanupTestDatabase
};