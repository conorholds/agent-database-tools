// src/utils/db/postgres.js
// This file contains PostgreSQL-specific database utility functions
// Extracted from the original db.js to support multiple database types

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const crypto = require('crypto');

/**
 * Creates a PostgreSQL connection pool for a specific project
 * @param {Object} connection - Database connection configuration object
 * @param {Object} options - Additional connection options
 * @param {string} [options.database] - Optional database name to override the default in connection URI
 * @returns {Pool} PostgreSQL connection pool
 */
function createPool(connection, options = {}) {
  // Get the connection URI
  let connectionUri = connection.postgres_uri;
  
  // If database option is specified, modify the connection URI to use that database
  if (options.database) {
    // Parse the existing URI to extract components
    const matches = connectionUri.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)(.*)$/);
    
    if (matches) {
      const [, username, password, host, port, , queryParams] = matches;
      // Rebuild the URI with the new database name
      connectionUri = `postgresql://${username}:${password}@${host}:${port}/${options.database}${queryParams || ''}`;
      console.log(`Connecting to database: ${options.database}`);
    } else {
      console.warn(`Could not parse connection URI to change database. Using default.`);
    }
  }
  
  return new Pool({
    connectionString: connectionUri,
    // IMPORTANT: This allows the Node.js process to exit when idle
    allowExitOnIdle: true
  });
}

/**
 * Executes a SQL query with parameters
 * @param {Pool} pool - PostgreSQL connection pool
 * @param {string} query - SQL query to execute
 * @param {Array} [params=[]] - Query parameters
 * @returns {Promise<Object>} Query result
 * @throws Will throw error if query fails
 */
async function executeQuery(pool, query, params = []) {
  try {
    const result = await pool.query(query, params);
    return result;
  } catch (error) {
    console.error('Database error:', error.message);
    throw error;
  }
}

/**
 * Executes multiple SQL queries in a transaction
 * @param {Pool} pool - PostgreSQL connection pool
 * @param {Array<Object>} queries - Array of query objects with query and params properties
 * @param {string} queries[].query - SQL query to execute
 * @param {Array} [queries[].params=[]] - Query parameters
 * @returns {Promise<Array<Object>>} Array of query results
 * @throws Will throw error if transaction fails (and automatically rollback)
 */
async function executeTransaction(pool, queries) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const results = [];
    for (const { query, params = [] } of queries) {
      const result = await client.query(query, params);
      results.push(result);
    }
    
    await client.query('COMMIT');
    return results;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Transaction error:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Lists all tables in the database
 * @param {Pool} pool - PostgreSQL connection pool
 * @returns {Promise<Array<string>>} Array of table names
 */
async function listTables(pool) {
  const query = `
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `;
  const result = await executeQuery(pool, query);
  return result.rows.map(row => row.table_name);
}

/**
 * Gets information about columns in a table
 * @param {Pool} pool - PostgreSQL connection pool
 * @param {string} tableName - Name of the table
 * @returns {Promise<Array<Object>>} Array of column information objects
 */
async function getTableColumns(pool, tableName) {
  const query = `
    SELECT 
      column_name, 
      data_type, 
      is_nullable, 
      column_default,
      character_maximum_length,
      numeric_precision,
      numeric_scale
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position;
  `;
  const result = await executeQuery(pool, query, [tableName]);
  return result.rows;
}

/**
 * Checks if a table exists in the database
 * @param {Pool} pool - PostgreSQL connection pool
 * @param {string} tableName - Name of the table to check
 * @returns {Promise<boolean>} True if table exists, false otherwise
 */
async function tableExists(pool, tableName) {
  const query = `
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = $1
    );
  `;
  const result = await executeQuery(pool, query, [tableName]);
  return result.rows[0].exists;
}

/**
 * Checks if a column exists in a specific table
 * @param {Pool} pool - PostgreSQL connection pool
 * @param {string} tableName - Name of the table
 * @param {string} columnName - Name of the column to check
 * @returns {Promise<boolean>} True if column exists, false otherwise
 */
async function columnExists(pool, tableName, columnName) {
  const query = `
    SELECT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = $1 
      AND column_name = $2
    );
  `;
  const result = await executeQuery(pool, query, [tableName, columnName]);
  return result.rows[0].exists;
}

/**
 * Checks if an index exists for a specific table and column
 * @param {Pool} pool - PostgreSQL connection pool
 * @param {string} tableName - Name of the table
 * @param {string} columnName - Name of the column to check for index
 * @returns {Promise<boolean>} True if index exists, false otherwise
 */
async function indexExists(pool, tableName, columnName) {
  const query = `
    SELECT EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE tablename = $1
      AND indexdef LIKE '%(' || $2 || ')%'
    );
  `;
  const result = await executeQuery(pool, query, [tableName, columnName]);
  return result.rows[0].exists;
}

/**
 * Gets all constraints for a table
 * @param {Pool} pool - PostgreSQL connection pool
 * @param {string} tableName - Name of the table
 * @returns {Promise<Array<Object>>} Array of constraint information objects
 */
async function getTableConstraints(pool, tableName) {
  const query = `
    SELECT 
      tc.constraint_name, 
      tc.constraint_type, 
      kcu.column_name,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name
    FROM 
      information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      LEFT JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
    WHERE 
      tc.table_name = $1
      AND tc.table_schema = 'public';
  `;
  
  const result = await executeQuery(pool, query, [tableName]);
  return result.rows;
}

/**
 * Gets all indexes for a table
 * @param {Pool} pool - PostgreSQL connection pool
 * @param {string} tableName - Name of the table
 * @returns {Promise<Array<Object>>} Array of index information objects
 */
async function getTableIndexes(pool, tableName) {
  const query = `
    SELECT
      indexname,
      indexdef
    FROM
      pg_indexes
    WHERE
      tablename = $1;
  `;
  
  const result = await executeQuery(pool, query, [tableName]);
  return result.rows;
}

/**
 * Checks if a specific PostgreSQL client tool is available
 * @param {string} tool - Name of the PostgreSQL tool to check (e.g., 'pg_dump', 'pg_restore')
 * @returns {boolean} True if tool is available, false otherwise
 */
function isPgClientToolAvailable(tool) {
  try {
    const result = spawnSync(tool, ['--version']);
    return result.status === 0;
  } catch (error) {
    return false;
  }
}

/**
 * Creates a backup of a PostgreSQL database
 * @param {Object} connection - Database connection configuration object
 * @param {string} outputFile - Path to write the backup file
 * @param {Object} [options={}] - Backup options
 * @param {boolean} [options.encrypt=false] - Whether to encrypt the backup
 * @param {string} [options.format='plain'] - Backup format ('plain' or 'custom')
 * @returns {Promise<boolean>} True if backup was successful, false otherwise
 */
async function createDatabaseBackup(connection, outputFile, options = {}) {
  // Set default options
  const encrypt = options.encrypt || false;
  const format = options.format || 'plain'; // 'plain' or 'custom'
  try {
    // Check if pg_dump is available
    if (!isPgClientToolAvailable('pg_dump')) {
      throw new Error('pg_dump command not found. Please install PostgreSQL client tools.');
    }
    
    // Parse connection string to extract credentials
    // Handle both authenticated and unauthenticated connections
    let username, password, host, port, database;
    
    // Try with credentials first
    let matches = connection.postgres_uri.match(/postgresql:\/\/([^:]+):([^@]+)@([^:\/]+)(?::(\d+))?\/([^?]+)/);
    
    if (matches) {
      // Format: postgresql://user:pass@host:port/db
      [, username, password, host, port = '5432', database] = matches;
    } else {
      // Try without credentials
      matches = connection.postgres_uri.match(/postgresql:\/\/([^:\/]+)(?::(\d+))?\/([^?]+)/);
      if (matches) {
        // Format: postgresql://host:port/db or postgresql://host/db
        [, host, port = '5432', database] = matches;
        username = process.env.USER || 'postgres'; // Default username
        password = ''; // No password
      } else {
        throw new Error('Invalid PostgreSQL connection string format');
      }
    }
    
    // Create backup directory if it doesn't exist
    const backupDir = path.dirname(outputFile);
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    // Temporary file for unencrypted backup
    const tempBackupFile = outputFile + '.tmp';
    
    // Perform the backup
    console.log(`Creating backup of database ${database}...`);
    
    // Set PGPASSWORD environment variable for pg_dump
    process.env.PGPASSWORD = password;
    
    // Execute pg_dump
    const formatFlag = format === 'custom' ? '-F c' : '-F p';
    execSync(`pg_dump -h ${host} -p ${port} -U ${username} ${formatFlag} -b -v -f "${tempBackupFile}" ${database}`);
    
    // If encryption is requested, encrypt the backup
    if (encrypt) {
      console.log('Encrypting backup...');
      const key = crypto.randomBytes(32); // Generate a random 32-byte key
      const iv = crypto.randomBytes(16);  // Generate a random 16-byte IV
      
      // Create cipher and streams
      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
      const input = fs.createReadStream(tempBackupFile);
      const output = fs.createWriteStream(outputFile);
      
      // Write the IV to the beginning of the file
      output.write(iv);
      
      // Encrypt and pipe to output
      input.pipe(cipher).pipe(output);
      
      // Wait for encryption to complete
      await new Promise((resolve, reject) => {
        output.on('finish', () => {
          // Delete the temporary unencrypted file
          fs.unlinkSync(tempBackupFile);
          
          // Save the key to a separate file
          const keyFile = outputFile + '.key';
          fs.writeFileSync(keyFile, key);
          console.log(`Encryption key saved to ${keyFile}`);
          
          resolve();
        });
        output.on('error', reject);
      });
      
      console.log(`Encrypted database backup saved to ${outputFile}`);
    } else {
      // If not encrypting, just rename the temp file
      fs.renameSync(tempBackupFile, outputFile);
      console.log(`Database backup saved to ${outputFile}`);
    }
    
    return true;
  } catch (error) {
    console.error('Error backing up database:', error.message);
    return false;
  } finally {
    // Clear password from environment
    delete process.env.PGPASSWORD;
  }
}

/**
 * Restores a PostgreSQL database from a backup file
 * @param {Object} connection - Database connection configuration object
 * @param {string} inputFile - Path to the backup file
 * @param {boolean} [dryRun=false] - If true, only verify the backup without restoring
 * @param {Object} [options={}] - Additional options (e.g., database override)
 * @returns {Promise<boolean>} True if restore was successful, false otherwise
 */
async function restoreDatabase(connection, inputFile, dryRun = false, options = {}) {
  try {
    // Check if pg_restore is available
    if (!isPgClientToolAvailable('pg_restore')) {
      throw new Error('pg_restore command not found. Please install PostgreSQL client tools.');
    }
    
    // Check if backup file exists
    if (!fs.existsSync(inputFile)) {
      throw new Error(`Backup file ${inputFile} not found`);
    }
    
    // Check if file is encrypted
    const isEncrypted = await isFileEncrypted(inputFile);
    let fileToRestore = inputFile;
    
    // If encrypted, decrypt first
    if (isEncrypted) {
      console.log('Backup file is encrypted, decrypting...');
      
      // Check for key file
      const keyFile = inputFile + '.key';
      if (!fs.existsSync(keyFile)) {
        throw new Error(`Encryption key file ${keyFile} not found`);
      }
      
      // Read the key and decrypt
      const key = fs.readFileSync(keyFile);
      fileToRestore = await decryptBackup(inputFile, key);
    }
    
    // Parse connection string to extract credentials
    // Handle both authenticated and unauthenticated connections
    let username, password, host, port, defaultDatabase;
    
    // Try with credentials first
    let matches = connection.postgres_uri.match(/postgresql:\/\/([^:]+):([^@]+)@([^:\/]+)(?::(\d+))?\/([^?]+)/);
    
    if (matches) {
      // Format: postgresql://user:pass@host:port/db
      [, username, password, host, port = '5432', defaultDatabase] = matches;
    } else {
      // Try without credentials
      matches = connection.postgres_uri.match(/postgresql:\/\/([^:\/]+)(?::(\d+))?\/([^?]+)/);
      if (matches) {
        // Format: postgresql://host:port/db or postgresql://host/db
        [, host, port = '5432', defaultDatabase] = matches;
        username = process.env.USER || 'postgres'; // Default username
        password = ''; // No password
      } else {
        throw new Error('Invalid PostgreSQL connection string format');
      }
    }
    
    // Use the database from options if provided, otherwise use the one from connection string
    const database = options.database || defaultDatabase;
    
    // Set PGPASSWORD environment variable for pg_restore
    process.env.PGPASSWORD = password;
    
    // For dry run, just verify the backup
    if (dryRun) {
      console.log('Verifying backup integrity (dry run)...');
      execSync(`pg_restore -l "${fileToRestore}"`);
      console.log('Backup verification completed successfully');
      return true;
    }
    
    // Check file format and use appropriate restore method
    // PostgreSQL custom format files start with "PGDMP"
    const fileHeader = Buffer.alloc(5);
    const fd = fs.openSync(fileToRestore, 'r');
    fs.readSync(fd, fileHeader, 0, 5, 0);
    fs.closeSync(fd);
    
    // Execute restore based on file format
    console.log(`Restoring database ${database} from backup...`);
    
    if (fileHeader.toString().startsWith('PGDMP')) {
      // Custom format - use pg_restore
      execSync(`pg_restore -h ${host} -p ${port} -U ${username} -d ${database} -c -v "${fileToRestore}"`);
    } else {
      // Plain SQL format - use psql
      if (!isPgClientToolAvailable('psql')) {
        throw new Error('psql command not found. Please install PostgreSQL client tools.');
      }
      execSync(`psql -h ${host} -p ${port} -U ${username} -d ${database} -f "${fileToRestore}"`);
    }
    
    // Cleanup temporary decrypted file if we decrypted
    if (isEncrypted && fileToRestore !== inputFile) {
      fs.unlinkSync(fileToRestore);
    }
    
    console.log(`Database restored from ${inputFile}`);
    return true;
  } catch (error) {
    console.error('Error restoring database:', error.message);
    return false;
  } finally {
    // Clear password from environment
    delete process.env.PGPASSWORD;
  }
}

/**
 * Checks if a backup file is encrypted
 * @param {string} filePath - Path to the backup file
 * @returns {Promise<boolean>} True if file is encrypted, false otherwise
 */
async function isFileEncrypted(filePath) {
  // Check if a .key file exists for this backup
  const keyFile = filePath + '.key';
  return fs.existsSync(keyFile);
}

/**
 * Decrypts an encrypted backup file
 * @param {string} filePath - Path to the encrypted backup file
 * @param {Buffer} key - Encryption key
 * @returns {Promise<string>} Path to the decrypted file
 * @throws Will throw error if decryption fails
 */
async function decryptBackup(filePath, key) {
  const decryptedPath = filePath + '.decrypted';
  
  try {
    // Read the IV from the beginning of the file
    const fileContent = fs.readFileSync(filePath);
    const iv = fileContent.slice(0, 16);
    const encryptedData = fileContent.slice(16);
    
    // Create decipher and decrypt
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    const decrypted = Buffer.concat([
      decipher.update(encryptedData),
      decipher.final()
    ]);
    
    // Write decrypted data to file
    fs.writeFileSync(decryptedPath, decrypted);
    
    return decryptedPath;
  } catch (error) {
    console.error('Error decrypting backup:', error.message);
    throw error;
  }
}

/**
 * Gets installed PostgreSQL extensions
 * @param {Pool} pool - PostgreSQL connection pool
 * @returns {Promise<Array<Object>>} Array of installed extension information
 */
async function getInstalledExtensions(pool) {
  const query = `
    SELECT name, default_version, installed_version
    FROM pg_available_extensions
    WHERE installed_version IS NOT NULL;
  `;
  
  const result = await executeQuery(pool, query);
  return result.rows;
}

/**
 * Records an applied migration in the migrations table
 * @param {Pool} pool - PostgreSQL connection pool
 * @param {string} migrationName - Name of the migration
 * @param {string} sql - SQL content of the migration
 * @returns {Promise<Object>} Result object with applied status and message
 */
async function trackMigration(pool, migrationName, sql) {
  // Check if the migrations table exists, create if not
  const migrationsTableQuery = `
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      sql_content TEXT
    );
  `;
  
  await executeQuery(pool, migrationsTableQuery);
  
  // Check if migration has already been applied
  const existingQuery = `
    SELECT id FROM migrations WHERE name = $1;
  `;
  
  const existingResult = await executeQuery(pool, existingQuery, [migrationName]);
  
  if (existingResult.rows.length > 0) {
    return { applied: false, message: `Migration ${migrationName} has already been applied` };
  }
  
  // Track the migration
  const trackQuery = `
    INSERT INTO migrations (name, sql_content)
    VALUES ($1, $2);
  `;
  
  await executeQuery(pool, trackQuery, [migrationName, sql]);
  
  return { applied: true, message: `Migration ${migrationName} tracked successfully` };
}

/**
 * Checks if a specific migration has been applied
 * @param {Pool} pool - PostgreSQL connection pool
 * @param {string} migrationName - Name of the migration to check
 * @returns {Promise<boolean>} True if migration has been applied, false otherwise
 */
async function isMigrationApplied(pool, migrationName) {
  // Check if the migrations table exists
  const tableCheck = `
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'migrations'
    );
  `;
  
  const tableExists = await executeQuery(pool, tableCheck);
  
  if (!tableExists.rows[0].exists) {
    return false;
  }
  
  // Check if migration exists
  const query = `
    SELECT EXISTS (
      SELECT FROM migrations
      WHERE name = $1
    );
  `;
  
  const result = await executeQuery(pool, query, [migrationName]);
  return result.rows[0].exists;
}

/**
 * Gets a list of all applied migrations
 * @param {Pool} pool - PostgreSQL connection pool
 * @returns {Promise<Array<Object>>} Array of applied migration information
 */
async function getAppliedMigrations(pool) {
  // Check if the migrations table exists
  const tableCheck = `
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'migrations'
    );
  `;
  
  const tableExists = await executeQuery(pool, tableCheck);
  
  if (!tableExists.rows[0].exists) {
    return [];
  }
  
  // Get migrations
  const query = `
    SELECT name, applied_at
    FROM migrations
    ORDER BY applied_at;
  `;
  
  const result = await executeQuery(pool, query);
  return result.rows;
}

// Export PostgreSQL-specific functionality
module.exports = {
  createPool,
  executeQuery,
  executeTransaction,
  listTables,
  getTableColumns,
  tableExists,
  columnExists,
  indexExists,
  getTableConstraints,
  getTableIndexes,
  createDatabaseBackup,
  restoreDatabase,
  getInstalledExtensions,
  trackMigration,
  isMigrationApplied,
  getAppliedMigrations,
  isPgClientToolAvailable
};