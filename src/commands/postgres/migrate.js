// src/commands/migrate.js
// This file is used to apply database migrations from SQL files

const { createConnection, closeConnection, executeQuery, trackMigration, getAppliedMigrations } = require('../../utils/db');
const { promptForProject, confirmAction } = require('../../utils/prompt');
const inquirer = require('inquirer');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

/**
 * Command to apply SQL migrations to a PostgreSQL database
 * @param {string} projectName - Name of the project to apply migrations to
 * @param {string} migrationFile - Path to the migration file (optional, will prompt if not provided)
 * @param {Object} [cmdOptions={}] - Command-specific options
 * @param {Object} [cmd] - Commander command object
 * @param {boolean} [cmd.parent.opts().force] - Whether to force operations without confirmation
 * @param {string} [cmd.parent.opts().connect] - Custom path to connection file
 * @param {string} [cmdOptions.database] - Database name to override default
 * @returns {Promise<boolean>} True if migration was successful, false otherwise
 */
async function migrateCommand(projectName, migrationFile, cmdOptions = {}, cmd) {
  // Merge command options with global options
  const options = { ...cmd?.parent?.opts(), ...cmdOptions };
  // If project name not provided, prompt for it
  if (!projectName) {
    projectName = await promptForProject();
  }
  
  // Create DB connection
  const dbConnection = await createConnection(projectName, options);
  
  try {
    // If migration file not provided, look for migrations directory and list available migrations
    if (!migrationFile) {
      const migrationDir = path.join(process.cwd(), 'migrations');
      
      if (!fs.existsSync(migrationDir)) {
        console.error(chalk.red(`Migrations directory not found at ${migrationDir}`));
        console.log('Please create a migrations directory or specify a migration file');
        return;
      }
      
      const migrationFiles = fs.readdirSync(migrationDir)
        .filter(file => file.endsWith('.sql'))
        .sort(); // Sort in alphabetical order, typically by timestamp
      
      if (migrationFiles.length === 0) {
        console.error(chalk.red('No migration files found in migrations directory'));
        console.log('Please create migration files or specify a migration file');
        return;
      }
      
      // Get already applied migrations
      const appliedMigrations = await getAppliedMigrations(dbConnection);
      const appliedMigrationNames = appliedMigrations.map(m => m.name);
      
      // Mark applied migrations in the list
      const choices = migrationFiles.map(file => ({
        name: `${file} ${appliedMigrationNames.includes(file) ? chalk.green('(already applied)') : ''}`,
        value: file,
        disabled: appliedMigrationNames.includes(file)
      }));
      
      const { selectedMigration } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedMigration',
          message: 'Select migration to apply:',
          choices: choices
        }
      ]);
      
      migrationFile = path.join(migrationDir, selectedMigration);
    } else if (!fs.existsSync(migrationFile)) {
      // If file doesn't exist, check if it's in the migrations directory
      const migrationDir = path.join(process.cwd(), 'migrations');
      const altPath = path.join(migrationDir, migrationFile);
      
      if (fs.existsSync(altPath)) {
        migrationFile = altPath;
      } else {
        console.error(chalk.red(`Migration file not found: ${migrationFile}`));
        return;
      }
    }
    
    // Read the migration file
    const sql = fs.readFileSync(migrationFile, 'utf8');
    
    // Get the migration name (file name without path)
    const migrationName = path.basename(migrationFile);
    
    // Check if migration has already been applied
    const appliedMigrations = await getAppliedMigrations(dbConnection);
    const migrationApplied = appliedMigrations.some(m => m.name === migrationName);
    
    if (migrationApplied) {
      console.log(chalk.yellow(`Migration ${migrationName} has already been applied. Skipping.`));
      return;
    }
    
    // Split the SQL into individual statements
    const statements = sql.split(';').filter(stmt => stmt.trim().length > 0);
    
    console.log(`Migration file contains ${statements.length} SQL statements`);
    
    // Show preview of the migration
    console.log(chalk.cyan('Migration preview:'));
    console.log(sql.slice(0, 500) + (sql.length > 500 ? '...' : ''));
    
    // Confirm the operation if --force is not set
    if (!options.force) {
      const confirm = await confirmAction(`Are you sure you want to apply migration "${migrationName}" to project "${projectName}"?`);
      
      if (!confirm) {
        console.log('Migration canceled');
        return;
      }
    }
    
    console.log(chalk.cyan(`Applying migration ${migrationName}...`));
    
    // Check if this is a PostgreSQL connection
    if (dbConnection.type !== 'postgres') {
      console.error(chalk.red('Migration command currently only supports PostgreSQL databases'));
      return false;
    }
    
    const pool = dbConnection.connection;
    
    // Execute all statements in a transaction
    try {
      await executeQuery(dbConnection, 'BEGIN');
      
      for (let i = 0; i < statements.length; i++) {
        const statement = statements[i].trim() + ';';
        
        if (statement.trim() === ';') continue;
        
        console.log(`Executing statement ${i+1}/${statements.length}...`);
        
        try {
          await executeQuery(dbConnection, statement);
        } catch (error) {
          console.error(chalk.red(`Error executing statement ${i+1}:`), error.message);
          throw error; // Rethrow to trigger rollback
        }
      }
      
      // Track the migration
      await trackMigration(dbConnection, migrationName, sql);
      
      await executeQuery(dbConnection, 'COMMIT');
      console.log(chalk.green(`✓ Migration ${migrationName} applied successfully`));
      return true;
    } catch (error) {
      await executeQuery(dbConnection, 'ROLLBACK');
      console.error(chalk.red(`Migration failed and was rolled back`));
      return false;
    }
  } finally {
    // Close connection
    await closeConnection(dbConnection);
  }
}

module.exports = migrateCommand;