// src/commands/init.js
// This file is used to initialize a database with tables, extensions, and seed data

const db = require("../utils/db");
const { promptForProject, confirmAction } = require("../utils/prompt");
const {
  generateInitializationSQL,
  generateFullSchema,
} = require("../utils/schema");
const chalk = require("chalk");

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

  // Create a database connection
  const dbConnection = await db.createConnection(projectName, options);
  const pool = dbConnection.connection;

  try {
    // Confirm before proceeding
    if (!options.force) {
      const confirm = await confirmAction(
        `Are you sure you want to initialize the database for ${projectName}? This will create tables if they don't exist.`
      );

      if (!confirm) {
        console.log("Database initialization canceled");
        return;
      }
    }

    console.log(`Initializing database for project: ${projectName}`);

    // Check required extensions
    await checkAndEnableExtensions(dbConnection, pool, projectName);

    // Initialize the database
    const initializationSQL = generateInitializationSQL(projectName);

    // Execute the initialization SQL as a single statement
    // This avoids issues with splitting function definitions
    let successCount = 0;
    let failedCount = 0;

    // Execute the entire SQL script
    try {
      await db.executeQuery(dbConnection, initializationSQL);
      successCount = 1;
      
      console.log(`Database initialization completed for ${projectName}`);
      console.log(chalk.green("✓ Schema successfully initialized"));

      // Verify the database initialization
      await verifyDatabaseInitialization(dbConnection, pool, projectName);

      return true;
    } catch (error) {
      await db.executeQuery(dbConnection, "ROLLBACK");
      console.error(
        `Error initializing database for ${projectName}:`,
        error.message
      );
      console.error(error.stack);
      return false;
    }
  } finally {
    // Close database connection
    await db.closeConnection(dbConnection);
  }
}

/**
 * Verify database initialization by checking if required tables exist
 * @param {Object} dbConnection - Database connection object
 * @param {Pool} pool - PostgreSQL connection pool
 * @param {string} projectName - Name of the project
 */
async function verifyDatabaseInitialization(dbConnection, pool, projectName) {
  const schema = generateFullSchema(projectName);
  const requiredTables = schema.tables.map((table) => table.name);

  console.log(chalk.cyan("Verifying database initialization..."));

  let allTablesExist = true;

  for (const tableName of requiredTables) {
    try {
      const tableExists = await db.executeQuery(
        dbConnection,
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
    console.log(chalk.green("✓ All required tables have been created"));
  } else {
    console.log(chalk.yellow("⚠ Some required tables are missing"));
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
        const countResult = await db.executeQuery(dbConnection, countQuery);
        const count = parseInt(countResult.rows[0].count);

        if (count > 0) {
          console.log(chalk.green(`✓ Table ${tableName} has ${count} records`));
        } else {
          console.log(chalk.yellow(`⚠ No data found in ${tableName}`));
        }
      } catch (error) {
        console.log(
          chalk.yellow(
            `⚠ Error checking data in ${tableName}: ${error.message}`
          )
        );
      }
    }

    // For YDRV schema compatibility, check admin users if the users table exists
    try {
      // Check if this is the YDRV schema with admin users
      const tableExistsQuery = `SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'is_admin'
      )`;

      const tableExists = await db.executeQuery(dbConnection, tableExistsQuery);

      if (tableExists.rows[0].exists) {
        const userCount = await db.executeQuery(
          dbConnection,
          "SELECT COUNT(*) FROM users WHERE is_admin = true"
        );
        if (parseInt(userCount.rows[0].count) > 0) {
          console.log(chalk.green("✓ Admin user exists"));
        } else {
          console.log(chalk.yellow("⚠ No admin user found"));
        }
      }
    } catch (error) {
      // Ignore errors for tables that don't exist
    }
  } catch (error) {
    console.error("Error checking seed data:", error.message);
  }
}

/**
 * Check required extensions and enable them if necessary
 * @param {Object} dbConnection - Database connection object
 * @param {Pool} pool - PostgreSQL connection pool
 * @param {string} projectName - Name of the project
 */
async function checkAndEnableExtensions(dbConnection, pool, projectName) {
  const schema = generateFullSchema(projectName);
  const requiredExtensions = schema.extensions;

  console.log(chalk.cyan("Checking required PostgreSQL extensions..."));

  // For PostgreSQL connections, use the postgres-specific utility
  let installedExtensions = [];
  if (dbConnection.type === "postgres") {
    installedExtensions = await db.postgres.getInstalledExtensions(pool);
  }
  const installedExtensionNames = installedExtensions.map((ext) => ext.name);

  for (const extension of requiredExtensions) {
    if (installedExtensionNames.includes(extension)) {
      console.log(chalk.green(`✓ Extension ${extension} is already installed`));
    } else {
      console.log(
        chalk.yellow(
          `⚠ Extension ${extension} is not installed, attempting to create...`
        )
      );

      try {
        await db.executeQuery(
          dbConnection,
          `CREATE EXTENSION IF NOT EXISTS "${extension}"`
        );
        console.log(
          chalk.green(`✓ Extension ${extension} was created successfully`)
        );
      } catch (error) {
        console.error(
          chalk.red(`✗ Error creating extension ${extension}:`),
          error.message
        );
      }
    }
  }
}

module.exports = initCommand;
