// Safe Delete Table Command
// Enhanced version of delete-table with safety validation

const { performSafetyCheck } = require('../../utils/safety-validator');
const deleteTableCommand = require('./delete-table');
const db = require('../../utils/db');
const chalk = require('chalk');

/**
 * Enhanced delete table command with safety validation
 * @param {string} projectName - Name of the project
 * @param {string} tableName - Name of the table to delete
 * @param {Object} cmdOptions - Command options
 * @param {Object} cmd - Commander command object
 */
async function safeDeleteTable(projectName, tableName, cmdOptions = {}, cmd) {
  const options = { ...cmd?.parent?.opts(), ...cmdOptions };
  const { force = false, dryRun = false, backup = true } = options;
  
  console.log(chalk.cyan(`\n=== Safe Table Deletion: ${tableName} ===`));
  
  if (!projectName || !tableName) {
    console.error(chalk.red('Error: Project name and table name are required'));
    return false;
  }
  
  // Create database connection
  const dbConnection = await db.createConnection(projectName, options);
  
  try {
    // Perform safety validation
    const safetyCheck = await performSafetyCheck(
      'delete-table',
      { table: tableName, options },
      dbConnection.connection,
      projectName,
      { force, skipSafety: options.skipSafety }
    );
    
    if (!safetyCheck) {
      console.log(chalk.red('❌ Operation cancelled due to safety concerns'));
      return false;
    }
    
    // Check if table exists and get info
    const tableInfo = await getTableInfo(dbConnection, tableName);
    
    if (!tableInfo.exists) {
      console.log(chalk.yellow(`Table "${tableName}" does not exist`));
      return true;
    }
    
    // Display table information
    console.log(chalk.blue('\nTable Information:'));
    console.log(chalk.white(`  Name: ${tableName}`));
    console.log(chalk.white(`  Rows: ${tableInfo.rowCount}`));
    console.log(chalk.white(`  Columns: ${tableInfo.columnCount}`));
    console.log(chalk.white(`  Dependencies: ${tableInfo.dependencies.length} table(s)`));
    
    if (tableInfo.dependencies.length > 0) {
      console.log(chalk.yellow('  Dependent tables:'));
      tableInfo.dependencies.forEach(dep => {
        console.log(chalk.yellow(`    - ${dep.table} (${dep.column})`));
      });
    }
    
    // Warn about data loss
    if (tableInfo.rowCount > 0) {
      console.log(chalk.red(`\n⚠️  WARNING: This will permanently delete ${tableInfo.rowCount} rows of data!`));
    }
    
    // Create backup if requested
    if (backup && !dryRun) {
      console.log(chalk.blue('\n📦 Creating backup before deletion...'));
      await createTableBackup(dbConnection, tableName, projectName);
    }
    
    if (dryRun) {
      console.log(chalk.blue('\n🔍 DRY RUN - Would execute the following:'));
      console.log(chalk.gray(`  DROP TABLE IF EXISTS "${tableName}" CASCADE;`));
      console.log(chalk.blue('No actual changes made.'));
      return true;
    }
    
    // Final confirmation unless forced
    if (!force) {
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      const confirmed = await new Promise((resolve) => {
        rl.question(
          chalk.red(`\nType "${tableName}" to confirm deletion: `), 
          (answer) => {
            rl.close();
            resolve(answer === tableName);
          }
        );
      });
      
      if (!confirmed) {
        console.log(chalk.yellow('Table deletion cancelled'));
        return false;
      }
    }
    
    // Execute deletion using the validated command
    console.log(chalk.blue('\n🗑️  Deleting table...'));
    const result = await deleteTableCommand(dbConnection.connection, tableName, { force: true });
    
    if (result) {
      console.log(chalk.green(`✅ Table "${tableName}" successfully deleted`));
      
      // Show cleanup suggestions
      if (backup) {
        console.log(chalk.blue('\n💡 Backup Information:'));
        console.log(chalk.white('  Your table backup is available for restoration if needed'));
        console.log(chalk.white('  Use the restore command to recover the table if necessary'));
      }
    }
    
    return result;
    
  } catch (error) {
    console.error(chalk.red('Error deleting table:'), error.message);
    return false;
  } finally {
    await db.closeConnection(dbConnection);
  }
}

/**
 * Gets comprehensive information about a table
 * @param {Object} dbConnection - Database connection
 * @param {string} tableName - Name of the table
 * @returns {Object} Table information
 */
async function getTableInfo(dbConnection, tableName) {
  try {
    // Check if table exists
    const existsResult = await db.executeQuery(dbConnection, `
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = $1
      )
    `, [tableName]);
    
    if (!existsResult.rows[0].exists) {
      return { exists: false };
    }
    
    // Get row count
    const countResult = await db.executeQuery(dbConnection, 
      `SELECT COUNT(*) as count FROM "${tableName}"`
    );
    
    // Get column count
    const columnsResult = await db.executeQuery(dbConnection, `
      SELECT COUNT(*) as count 
      FROM information_schema.columns 
      WHERE table_name = $1 AND table_schema = 'public'
    `, [tableName]);
    
    // Get foreign key dependencies
    const dependenciesResult = await db.executeQuery(dbConnection, `
      SELECT 
        tc.table_name,
        kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu 
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' 
        AND ccu.table_name = $1
    `, [tableName]);
    
    return {
      exists: true,
      rowCount: parseInt(countResult.rows[0].count),
      columnCount: parseInt(columnsResult.rows[0].count),
      dependencies: dependenciesResult.rows.map(row => ({
        table: row.table_name,
        column: row.column_name
      }))
    };
    
  } catch (error) {
    console.error('Error getting table info:', error.message);
    return { exists: false };
  }
}

/**
 * Creates a backup of the table before deletion
 * @param {Object} dbConnection - Database connection
 * @param {string} tableName - Name of the table
 * @param {string} projectName - Project name
 */
async function createTableBackup(dbConnection, tableName, projectName) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupTableName = `backup_${tableName}_${timestamp}`;
    
    // Create backup table with data
    await db.executeQuery(dbConnection, 
      `CREATE TABLE "${backupTableName}" AS SELECT * FROM "${tableName}"`
    );
    
    console.log(chalk.green(`✅ Backup created: ${backupTableName}`));
    
  } catch (error) {
    console.warn(chalk.yellow('Warning: Could not create backup:'), error.message);
  }
}

// Export the safe version wrapped with additional safety checks
module.exports = safeDeleteTable;