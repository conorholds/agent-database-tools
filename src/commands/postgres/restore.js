// src/commands/postgres/restore.js
// This file is used to restore PostgreSQL databases from backup files

const db = require('../../utils/db');
const { isPgToolAvailable, ensurePgVersionCompatibility } = require('../../utils/pg-version');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { confirmAction } = require('../../utils/prompt');

/**
 * Restores a PostgreSQL database from a backup file
 * @param {Object} connection - PostgreSQL connection
 * @param {Object} options - Command options
 * @param {Object} connectionInfo - Raw connection information
 * @returns {Promise<boolean>} True if restore was successful, false otherwise
 */
async function restorePostgresDatabase(connection, options, connectionInfo) {
  // Check if pg_restore and psql are available (for better error messages)
  if (!isPgToolAvailable('pg_restore') || !isPgToolAvailable('psql')) {
    console.log(chalk.red('Error: pg_restore or psql command not found'));
    console.log(chalk.yellow('Please run ./install.sh to install PostgreSQL client tools'));
    return false;
  }
  
  // Check for PostgreSQL version compatibility
  await ensurePgVersionCompatibility(connectionInfo.postgres_uri);
  
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
  
  // If dry run is specified
  if (options.dryRun) {
    console.log(chalk.cyan(`Performing dry run verification of backup: ${options.input}`));
    
    // Skip confirmation if --force is set
    if (!options.force) {
      const confirm = await confirmAction(`Are you sure you want to verify the backup file: ${options.input}?`);
      
      if (!confirm) {
        console.log('Verification canceled');
        return false;
      }
    }
    
    const success = await db.postgres.restoreDatabase(connectionInfo, options.input, true, options);
    
    if (success) {
      console.log(chalk.green(`✓ Backup verification completed successfully: ${options.input}`));
      console.log('The backup file appears to be valid and can be restored.');
      return true;
    } else {
      console.error(chalk.red('❌ Backup verification failed'));
      console.error('The backup file may be corrupted or incompatible.');
      return false;
    }
  }
  
  // Real restore operation
  console.log(chalk.red('WARNING: This operation will REPLACE ALL DATA in the current database with data from the backup.'));
  
  // Skip confirmation if --force is set
  if (!options.force) {
    const confirm = await confirmAction(
      chalk.red(`Are you ABSOLUTELY SURE you want to restore the database from ${options.input}? This is irreversible!`)
    );
    
    if (!confirm) {
      console.log('Restore operation canceled');
      return false;
    }
    
    // Double-check confirmation for safety
    const confirmText = await confirmAction(
      chalk.red(`Final confirmation: Type "restore" to proceed with database restoration:`)
    );
    
    if (!confirmText) {
      console.log('Restore operation canceled');
      return false;
    }
  }
  
  console.log(chalk.cyan(`Starting restoration of PostgreSQL database from ${options.input}...`));
  
  // Restore database - pass options to support database override
  const success = await db.postgres.restoreDatabase(connectionInfo, options.input, false, options);
  
  if (success) {
    console.log(chalk.green(`✓ Database restore completed successfully from: ${options.input}`));
    return true;
  } else {
    console.error(chalk.red('❌ Database restore failed'));
    return false;
  }
}

module.exports = restorePostgresDatabase;