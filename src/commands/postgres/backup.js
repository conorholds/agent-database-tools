// src/commands/postgres/backup.js
// This file is used to create PostgreSQL database backups with optional encryption

const db = require('../../utils/db');
const { isPgToolAvailable, ensurePgVersionCompatibility } = require('../../utils/pg-version');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { confirmAction } = require('../../utils/prompt');

/**
 * Creates a backup of a PostgreSQL database
 * @param {Object} connection - PostgreSQL connection
 * @param {Object} options - Command options
 * @param {Object} connectionInfo - Raw connection information
 * @returns {Promise<boolean>} True if backup was successful, false otherwise
 */
async function backupPostgresDatabase(connection, options, connectionInfo) {
  // Check if pg_dump is available (for better error messages)
  if (!isPgToolAvailable('pg_dump')) {
    console.log(chalk.red('Error: pg_dump command not found'));
    console.log(chalk.yellow('Please run ./install.sh to install PostgreSQL client tools'));
    return false;
  }
  
  // Make sure we have valid connection info
  if (!connectionInfo || !connectionInfo.postgres_uri) {
    console.error(chalk.red('Error: Missing PostgreSQL connection information'));
    return false;
  }
  
  // Check for PostgreSQL version compatibility
  try {
    await ensurePgVersionCompatibility(connectionInfo.postgres_uri);
  } catch (error) {
    console.warn(chalk.yellow(`Warning: Could not verify PostgreSQL version compatibility: ${error.message}`));
    console.log(chalk.yellow('Continuing anyway...'));
  }
  
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
    const safeProjectName = options.database || 'postgres';
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
    const confirm = await confirmAction(`Are you sure you want to backup the database to ${outputFile}?`);
    
    if (!confirm) {
      console.log('Backup operation canceled');
      return false;
    }
  }
  
  console.log(chalk.cyan(`Starting backup of PostgreSQL database...`));
  
  if (options.encrypt) {
    console.log(chalk.yellow('Backup will be encrypted. Make sure to keep the key file (.key) secure!'));
  }
  
  // Backup database
  const success = await db.postgres.createDatabaseBackup(connectionInfo, outputFile, {
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

module.exports = backupPostgresDatabase;