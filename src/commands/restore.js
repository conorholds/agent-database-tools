// src/commands/restore.js
// This file is used to restore databases from backup files

const { getConnectionForProject, restoreDatabase } = require('../utils/db');
const { promptForProject, confirmAction } = require('../utils/prompt');
const { isPgToolAvailable, ensurePgVersionCompatibility } = require('../utils/pg-version');
const inquirer = require('inquirer');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

async function restoreCommand(projectName, options) {
  // If project name not provided, prompt for it
  if (!projectName) {
    projectName = await promptForProject();
  }
  
  // Get connection info for project
  const connection = getConnectionForProject(projectName);
  
  // If a specific database is requested, modify the connection URI
  if (options.database) {
    // Parse the existing URI to extract components
    const matches = connection.postgres_uri.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)(.*)$/);
    
    if (matches) {
      const [, username, password, host, port, , queryParams] = matches;
      // Rebuild the URI with the new database name
      connection.postgres_uri = `postgresql://${username}:${password}@${host}:${port}/${options.database}${queryParams || ''}`;
      console.log(`Connecting to database: ${options.database} (target for restoration)`);
    } else {
      console.warn(`Could not parse connection URI to change database. Using default.`);
    }
  }
  
  // Determine input file
  let inputFile = options.input;
  if (!inputFile) {
    // List available backups
    const backupDir = path.join(process.cwd(), 'backups');
    if (!fs.existsSync(backupDir)) {
      console.error(chalk.red('No backups directory found. Please specify an input file.'));
      process.exit(1);
    }
    
    const safeProjectName = projectName.toLowerCase().replace(/\s+/g, '-');
    let backupFiles = fs.readdirSync(backupDir)
      .filter(file => file.endsWith('.backup'))
      .sort()
      .reverse(); // Most recent first
    
    // Filter for project-specific backups if any exist
    const projectBackups = backupFiles.filter(file => file.startsWith(safeProjectName));
    
    if (projectBackups.length > 0) {
      backupFiles = projectBackups;
    }
    
    if (backupFiles.length === 0) {
      console.error(chalk.red(`No backup files found in ${backupDir}`));
      process.exit(1);
    }
    
    const { chosenFile } = await inquirer.prompt([
      {
        type: 'list',
        name: 'chosenFile',
        message: 'Select a backup file to restore:',
        choices: backupFiles.map(file => {
          // Add file stats for better selection
          const stats = fs.statSync(path.join(backupDir, file));
          const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
          const mtime = new Date(stats.mtime);
          
          return {
            name: `${file} (${fileSizeMB} MB, ${mtime.toLocaleString()})`,
            value: file
          };
        })
      }
    ]);
    
    inputFile = path.join(backupDir, chosenFile);
  } else if (!fs.existsSync(inputFile)) {
    // Check if the file exists in the backups directory
    const backupDir = path.join(process.cwd(), 'backups');
    const altPath = path.join(backupDir, inputFile);
    
    if (fs.existsSync(altPath)) {
      inputFile = altPath;
    } else {
      console.error(chalk.red(`Backup file not found: ${inputFile}`));
      return;
    }
  }
  
  // Check if pg_restore/psql is available (for better error messages)
  if (!isPgToolAvailable('pg_restore') || !isPgToolAvailable('psql')) {
    console.log(chalk.red('Error: pg_restore or psql command not found'));
    console.log(chalk.yellow('Please run ./install.sh to install PostgreSQL client tools'));
    return false;
  }
  
  // Check for PostgreSQL version compatibility
  await ensurePgVersionCompatibility(connection.postgres_uri);
  
  // Check if the key file exists for encrypted backups
  const keyFile = inputFile + '.key';
  const isEncrypted = fs.existsSync(keyFile);
  
  if (isEncrypted) {
    console.log(chalk.yellow('Detected encrypted backup. Encryption key file found.'));
  }
  
  // If dry run is specified
  if (options.dryRun) {
    console.log(chalk.cyan(`Performing dry run verification of backup: ${inputFile}`));
    
    // Confirm before proceeding
    const confirm = await confirmAction(`Are you sure you want to verify the backup file: ${inputFile}?`);
    
    if (!confirm) {
      console.log('Verification canceled');
      return;
    }
    
    const success = await restoreDatabase(connection, inputFile, true);
    
    if (success) {
      console.log(chalk.green(`✓ Backup verification completed successfully: ${inputFile}`));
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
  
  // Confirm before proceeding
  const confirm = await confirmAction(
    chalk.red(`Are you ABSOLUTELY SURE you want to restore the database for ${projectName} from ${inputFile}? This is irreversible!`)
  );
  
  if (!confirm) {
    console.log('Restore operation canceled');
    return;
  }
  
  // Double-check confirmation for safety
  const doubleConfirm = await confirmAction(
    chalk.red(`Final confirmation: Type "restore" to proceed with database restoration:`)
  );
  
  if (!doubleConfirm) {
    console.log('Restore operation canceled');
    return;
  }
  
  console.log(chalk.cyan(`Starting restoration of ${projectName} database from ${inputFile}...`));
  
  // Restore database
  const success = await restoreDatabase(connection, inputFile, false);
  
  if (success) {
    console.log(chalk.green(`✓ Database restore completed successfully from: ${inputFile}`));
    return true;
  } else {
    console.error(chalk.red('❌ Database restore failed'));
    return false;
  }
}

module.exports = restoreCommand;