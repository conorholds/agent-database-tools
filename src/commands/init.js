// src/commands/init.js
// This file is used to initialize a database with tables, extensions, and seed data

const { createPool, executeQuery, executeTransaction, getInstalledExtensions } = require('../utils/db');
const { promptForProject, confirmAction } = require('../utils/prompt');
const { generateInitializationSQL, generateFullSchema } = require('../utils/schema');
const chalk = require('chalk');

/**
 * Command to initialize a database by creating required tables, extensions, and seed data
 * @param {string} projectName - Name of the project to initialize
 * @param {Object} [cmdOptions={}] - Command-specific options
 * @param {Object} [cmd] - Commander command object
 * @param {boolean} [cmd.parent.opts().force] - Whether to force operations without confirmation
 * @param {string} [cmd.parent.opts().connect] - Custom path to connection file
 * @param {string} [cmdOptions.database] - Database name to override default
 * @returns {Promise<boolean>} True if initialization was successful, false otherwise
 */
async function initCommand(projectName, cmdOptions = {}, cmd) {
  // Merge command options with global options
  const options = { ...cmd?.parent?.opts(), ...cmdOptions };
  // If project name not provided, prompt for it
  if (!projectName) {
    projectName = await promptForProject();
  }
  
  // Create DB connection pool
  const pool = createPool(projectName, options);
  
  try {
    // Confirm before proceeding
    if (!options.force) {
      const confirm = await confirmAction(
        `Are you sure you want to initialize the database for ${projectName}? This will create tables if they don't exist.`
      );
      
      if (!confirm) {
        console.log('Database initialization canceled');
        return;
      }
    } else {
      const confirm = await confirmAction(
        chalk.red(`WARNING: You are using --force which may recreate existing tables for ${projectName}. Are you sure?`)
      );
      
      if (!confirm) {
        console.log('Database initialization canceled');
        return;
      }
    }
    
    console.log(`Initializing database for project: ${projectName}`);
    
    // Check required extensions
    await checkAndEnableExtensions(pool, projectName);
    
    // Initialize the database
    const initializationSQL = generateInitializationSQL(projectName);
    
    // Split the SQL into individual statements
    const statements = initializationSQL.split(';').filter(stmt => stmt.trim().length > 0);
    
    let successCount = 0;
    let failedCount = 0;
    
    // Execute each statement in a transaction
    try {
      await executeQuery(pool, 'BEGIN');
      
      for (let i = 0; i < statements.length; i++) {
        const statement = statements[i] + ';';
        
        try {
          await executeQuery(pool, statement);
          successCount++;
        } catch (error) {
          console.error(`Error executing statement (${i+1}/${statements.length}):`, error.message);
          failedCount++;
          
          // Only log the first few lines of the statement to avoid flooding the console
          const statementPreview = statement.split('\n').slice(0, 3).join('\n');
          console.error('Statement preview:', statementPreview + (statement.split('\n').length > 3 ? '...' : ''));
          
          // Continue with the next statement
        }
      }
      
      await executeQuery(pool, 'COMMIT');
      
      console.log(`Database initialization completed for ${projectName}`);
      console.log(`Successfully executed ${successCount} out of ${statements.length} statements`);
      
      if (failedCount > 0) {
        console.log(chalk.yellow(`${failedCount} statements failed to execute. This may be normal if certain objects already exist.`));
      }
      
      // Verify the database initialization
      await verifyDatabaseInitialization(pool, projectName);
      
      return true;
    } catch (error) {
      await executeQuery(pool, 'ROLLBACK');
      console.error(`Error initializing database for ${projectName}:`, error.message);
      console.error(error.stack);
      return false;
    }
  } finally {
    // Close connection pool
    await pool.end();
  }
}

/**
 * Verify database initialization by checking if required tables exist
 * @param {Pool} pool - PostgreSQL connection pool
 * @param {string} projectName - Name of the project
 */
async function verifyDatabaseInitialization(pool, projectName) {
  const schema = generateFullSchema(projectName);
  const requiredTables = schema.tables.map(table => table.name);
  
  console.log(chalk.cyan('Verifying database initialization...'));
  
  let allTablesExist = true;
  
  for (const tableName of requiredTables) {
    try {
      const tableExists = await executeQuery(
        pool,
        `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1)`,
        [tableName]
      );
      
      if (tableExists.rows[0].exists) {
        console.log(chalk.green(`✓ Table ${tableName} exists`));
      } else {
        console.log(chalk.red(`✗ Table ${tableName} does not exist`));
        allTablesExist = false;
      }
    } catch (error) {
      console.error(`Error checking table ${tableName}:`, error.message);
      allTablesExist = false;
    }
  }
  
  if (allTablesExist) {
    console.log(chalk.green('✓ All required tables have been created'));
  } else {
    console.log(chalk.yellow('⚠ Some required tables are missing'));
  }
  
  // Check seed data in key tables
  try {
    // Check which tables exist in this schema
    const schema = generateFullSchema(projectName);
    const seedData = schema.seedData || {};
    
    // Check each table with seed data
    for (const [tableName, data] of Object.entries(seedData)) {
      if (!data || !Array.isArray(data) || data.length === 0) continue;
      
      try {
        const countQuery = `SELECT COUNT(*) FROM "${tableName}"`;
        const countResult = await executeQuery(pool, countQuery);
        const count = parseInt(countResult.rows[0].count);
        
        if (count > 0) {
          console.log(chalk.green(`✓ Table ${tableName} has ${count} records`));
        } else {
          console.log(chalk.yellow(`⚠ No data found in ${tableName}`));
        }
      } catch (error) {
        console.log(chalk.yellow(`⚠ Error checking data in ${tableName}: ${error.message}`));
      }
    }
    
    // For Yard ReVision schema compatibility, check admin users if the users table exists
    try {
      // Check if this is the Yard ReVision schema with admin users
      const tableExistsQuery = `SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'is_admin'
      )`;
      
      const tableExists = await executeQuery(pool, tableExistsQuery);
      
      if (tableExists.rows[0].exists) {
        const userCount = await executeQuery(pool, 'SELECT COUNT(*) FROM users WHERE is_admin = true');
        if (parseInt(userCount.rows[0].count) > 0) {
          console.log(chalk.green('✓ Admin user exists'));
        } else {
          console.log(chalk.yellow('⚠ No admin user found'));
        }
      }
    } catch (error) {
      // Ignore errors for tables that don't exist
    }
  } catch (error) {
    console.error('Error checking seed data:', error.message);
  }
}

/**
 * Check required extensions and enable them if necessary
 * @param {Pool} pool - PostgreSQL connection pool
 * @param {string} projectName - Name of the project
 */
async function checkAndEnableExtensions(pool, projectName) {
  const schema = generateFullSchema(projectName);
  const requiredExtensions = schema.extensions;
  
  console.log(chalk.cyan('Checking required PostgreSQL extensions...'));
  
  const installedExtensions = await getInstalledExtensions(pool);
  const installedExtensionNames = installedExtensions.map(ext => ext.name);
  
  for (const extension of requiredExtensions) {
    if (installedExtensionNames.includes(extension)) {
      console.log(chalk.green(`✓ Extension ${extension} is already installed`));
    } else {
      console.log(chalk.yellow(`⚠ Extension ${extension} is not installed, attempting to create...`));
      
      try {
        await executeQuery(pool, `CREATE EXTENSION IF NOT EXISTS "${extension}"`);
        console.log(chalk.green(`✓ Extension ${extension} was created successfully`));
      } catch (error) {
        console.error(chalk.red(`✗ Error creating extension ${extension}:`), error.message);
      }
    }
  }
}

module.exports = initCommand;