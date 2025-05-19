// src/commands/backup.js
// This file is used to create database backups with optional encryption

const { getConnectionForProject, createDatabaseBackup } = require('../utils/db');
const { promptForProject, confirmAction } = require('../utils/prompt');
const { isPgToolAvailable, ensurePgVersionCompatibility } = require('../utils/pg-version');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

/**
 * Command to create a backup of a PostgreSQL database
 * @param {string} projectName - Name of the project to backup
 * @param {Object} [cmdOptions={}] - Command-specific options
 * @param {Object} [cmd] - Commander command object
 * @param {boolean} [cmd.parent.opts().force] - Whether to force operations without confirmation
 * @param {string} [cmd.parent.opts().connect] - Custom path to connection file
 * @param {string} [cmdOptions.database] - Database name to override default
 * @param {string} [cmdOptions.output] - Output file path
 * @param {boolean} [cmdOptions.encrypt] - Whether to encrypt the backup
 * @param {string} [cmdOptions.format] - Backup format ('plain' or 'custom')
 * @returns {Promise<boolean>} True if backup was successful, false otherwise
 */
async function backupCommand(projectName, cmdOptions = {}, cmd) {
  // Merge command options with global options
  const options = { ...cmd?.parent?.opts(), ...cmdOptions };
  // If project name not provided, prompt for it
  if (!projectName) {
    projectName = await promptForProject();
  }
  
  // Get connection info for project
  const connection = getConnectionForProject(projectName, options);
  
  // If a specific database is requested, modify the connection URI
  if (options.database) {
    // Parse the existing URI to extract components
    const matches = connection.postgres_uri.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)(.*)$/);
    
    if (matches) {
      const [, username, password, host, port, , queryParams] = matches;
      // Rebuild the URI with the new database name
      connection.postgres_uri = `postgresql://${username}:${password}@${host}:${port}/${options.database}${queryParams || ''}`;
      console.log(`Connecting to database: ${options.database}`);
    } else {
      console.warn(`Could not parse connection URI to change database. Using default.`);
    }
  }
  
  // Check if pg_dump is available (for better error messages)
  if (!isPgToolAvailable('pg_dump')) {
    console.log(chalk.red('Error: pg_dump command not found'));
    console.log(chalk.yellow('Please run ./install.sh to install PostgreSQL client tools'));
    return false;
  }
  
  // Check for PostgreSQL version compatibility
  await ensurePgVersionCompatibility(connection.postgres_uri);
  
  // Determine backup format based on format option
  let format = 'plain'; // Default to plain SQL format
  let extension = '.sql';
  
  if (options.format === 'custom') {
    format = 'custom';
    extension = '.backup';
  }
  
  // Determine output file
  let outputFile = options.output;
  if (!outputFile) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeProjectName = projectName.toLowerCase().replace(/\s+/g, '-');
    outputFile = path.join(process.cwd(), 'backups', `${safeProjectName}_${timestamp}${extension}`);
  }
  
  // Create backup directory if it doesn't exist
  const backupDir = path.dirname(outputFile);
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  
  // Check if file already exists
  if (fs.existsSync(outputFile)) {
    if (options.force) {
      console.log(`Backup file ${outputFile} already exists. Overwriting due to --force option.`);
    } else {
      const overwrite = await confirmAction(`Backup file ${outputFile} already exists. Overwrite?`);
      
      if (!overwrite) {
        // Generate a new name with an additional timestamp
        const additionalTimestamp = Date.now();
        const fileExt = path.extname(outputFile);
        outputFile = outputFile.replace(fileExt, `_${additionalTimestamp}${fileExt}`);
        console.log(`Using alternative filename: ${outputFile}`);
      }
    }
  }
  
  // Skip confirmation if --force is set
  if (!options.force) {
    const confirm = await confirmAction(`Are you sure you want to backup the database for ${projectName} to ${outputFile}?`);
    
    if (!confirm) {
      console.log('Backup operation canceled');
      return;
    }
  }
  
  console.log(chalk.cyan(`Starting backup of ${projectName} database...`));
  
  if (options.encrypt) {
    console.log(chalk.yellow('Backup will be encrypted. Make sure to keep the key file (.key) secure!'));
  }
  
  // Backup database
  const success = await createDatabaseBackup(connection, outputFile, {
    encrypt: options.encrypt,
    format: format
  });
  
  if (success) {
    console.log(chalk.green(`✓ Database backup completed successfully: ${outputFile}`));
    
    // Calculate file size
    const stats = fs.statSync(outputFile);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    
    console.log(`Backup file size: ${fileSizeMB} MB`);
    
    if (options.encrypt) {
      console.log(chalk.yellow('IMPORTANT: Encryption key stored in:'));
      console.log(chalk.yellow(`${outputFile}.key`));
      console.log(chalk.red('Keep this key file secure and separate from your backup!'));
      console.log('You will need both the backup file and the key file to restore the database.');
    }
    
    return true;
  } else {
    console.error(chalk.red('❌ Database backup failed'));
    return false;
  }
}

module.exports = backupCommand;