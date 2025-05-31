// src/commands/mongodb/restore.js
// This file is used to restore MongoDB databases from backup files

const db = require('../../utils/db');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { confirmAction } = require('../../utils/prompt');

/**
 * Restores a MongoDB database from a backup file
 * @param {Object} connection - MongoDB connection object with client and db properties
 * @param {Object} options - Command options
 * @param {Object} connectionInfo - Raw connection information
 * @returns {Promise<boolean>} True if restore was successful, false otherwise
 */
async function restoreMongoDatabase({ client, db: mongoDb }, options, connectionInfo) {
  // Check if mongorestore is available
  const mongoToolsAvailable = db.mongodb.isMongoToolAvailable('mongorestore');
  if (!mongoToolsAvailable) {
    console.log(chalk.red('Error: mongorestore command not found'));
    console.log(chalk.yellow('Please install MongoDB Database Tools'));
    return false;
  }
  
  // Ensure input file exists and is accessible
  if (!fs.existsSync(options.input)) {
    console.error(chalk.red(`Backup file not found: ${options.input}`));
    return false;
  }
  
  // Check if the key file exists for encrypted backups
  const keyFile = options.input + '.key';
  const isEncrypted = fs.existsSync(keyFile);
  
  if (isEncrypted) {
    console.log(chalk.yellow('Detected encrypted backup. Encryption key file found.'));
  }
  
  // Check if the input is a directory (mongodump format) or file (archive format)
  const isDirectory = fs.lstatSync(options.input).isDirectory();
  if (isDirectory) {
    console.log(chalk.yellow(`Input is a directory: ${options.input}`));
    console.log(chalk.yellow('Directory-based restores are not fully supported. Please use archive format.'));
    return false;
  }
  
  // Real restore operation
  console.log(chalk.red('WARNING: This operation will REPLACE ALL DATA in the current database with data from the backup.'));
  
  // Skip confirmation if --force is set
  if (!options.force) {
    const confirm = await confirmAction(
      chalk.red(`Are you ABSOLUTELY SURE you want to restore the MongoDB database from ${options.input}? This is irreversible!`)
    );
    
    if (!confirm) {
      console.log('Restore operation canceled');
      return false;
    }
    
    // Ask if collections should be dropped before restore
    const { shouldDrop } = await confirmAction(
      'Drop collections before restoring? This ensures a clean restore without conflicts.'
    );
    
    options.dropBeforeRestore = shouldDrop;
    
    // Double-check confirmation for safety
    const confirmText = await confirmAction(
      chalk.red(`Final confirmation: Type "restore" to proceed with database restoration:`)
    );
    
    if (!confirmText) {
      console.log('Restore operation canceled');
      return false;
    }
  }
  
  console.log(chalk.cyan(`Starting restoration of MongoDB database from ${options.input}...`));
  
  // Restore database
  try {
    const result = await db.mongodb.restoreDatabase(connectionInfo, options.input, {
      dropBeforeRestore: options.dropBeforeRestore
    });
    
    if (result.success) {
      console.log(chalk.green(`✓ MongoDB database restore completed successfully from: ${options.input}`));
      return true;
    } else {
      console.error(chalk.red(`❌ MongoDB database restore failed: ${result.error || 'Unknown error'}`));
      return false;
    }
  } catch (error) {
    console.error(chalk.red('❌ Error restoring MongoDB database:'), error.message);
    return false;
  }
}

module.exports = restoreMongoDatabase;