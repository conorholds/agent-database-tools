// src/commands/mongodb/backup.js
// This file is used to create MongoDB database backups with optional encryption

const dbUtils = require('../../utils/db');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { confirmAction } = require('../../utils/prompt');

/**
 * Creates a backup of a MongoDB database
 * @param {Object} connection - MongoDB connection object with client and db properties
 * @param {Object} options - Command options
 * @param {Object} connectionInfo - Raw connection information
 * @returns {Promise<boolean>} True if backup was successful, false otherwise
 */
async function backupMongoDatabase({ client, db }, options, connectionInfo) {
  // Check if mongodump is available
  const mongoToolsAvailable = dbUtils.mongodb.isMongoToolAvailable('mongodump');
  if (!mongoToolsAvailable) {
    console.log(chalk.red('Error: mongodump command not found'));
    console.log(chalk.yellow('Please install MongoDB Database Tools'));
    return false;
  }
  
  // Determine output directory
  let outputDir = options.output;
  if (!outputDir) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeDbName = options.database || db.databaseName;
    outputDir = path.join(process.cwd(), 'backups', `${safeDbName}_${timestamp}`);
  }
  
  // Create backup directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Check if directory already exists and has content
  const dirFiles = fs.readdirSync(outputDir);
  if (dirFiles.length > 0) {
    if (options.force) {
      console.log(`Backup directory ${outputDir} already contains files. Proceeding due to --force option.`);
    } else {
      const overwrite = await confirmAction(`Backup directory ${outputDir} already contains files. Proceed anyway?`);
      
      if (!overwrite) {
        // Generate a new directory name with an additional timestamp
        const additionalTimestamp = Date.now();
        outputDir = `${outputDir}_${additionalTimestamp}`;
        fs.mkdirSync(outputDir, { recursive: true });
        console.log(`Using alternative directory: ${outputDir}`);
      }
    }
  }
  
  // Skip confirmation if --force is set
  if (!options.force) {
    const confirm = await confirmAction(`Are you sure you want to backup the MongoDB database to ${outputDir}?`);
    
    if (!confirm) {
      console.log('Backup operation canceled');
      return false;
    }
  }
  
  console.log(chalk.cyan(`Starting backup of MongoDB database...`));
  
  if (options.encrypt) {
    console.log(chalk.yellow('Backup will be encrypted. Make sure to keep the key file (.key) secure!'));
  }
  
  // Execute backup
  try {
    const result = await dbUtils.mongodb.createDatabaseBackup(connectionInfo, outputDir, {
      encrypt: options.encrypt
    });
    
    if (result.success) {
      console.log(chalk.green(`✓ MongoDB database backup completed successfully: ${result.backupFile}`));
      
      // Calculate file size if the result includes a backup file
      if (fs.existsSync(result.backupFile)) {
        const stats = fs.statSync(result.backupFile);
        const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        console.log(`Backup file size: ${fileSizeMB} MB`);
      }
      
      if (options.encrypt) {
        console.log(chalk.yellow('IMPORTANT: Encryption key stored in:'));
        console.log(chalk.yellow(`${result.backupFile}.key`));
        console.log(chalk.red('Keep this key file secure and separate from your backup!'));
        console.log('You will need both the backup file and the key file to restore the database.');
      }
      
      return true;
    } else {
      console.error(chalk.red('❌ MongoDB database backup failed:'), result.error || 'Unknown error');
      return false;
    }
  } catch (error) {
    console.error(chalk.red('❌ Error backing up MongoDB database:'), error.message);
    return false;
  }
}

module.exports = backupMongoDatabase;