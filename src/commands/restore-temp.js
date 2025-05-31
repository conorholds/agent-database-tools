/**
 * Restore from Temporary Backup Command
 * Restores a database from an encrypted temporary backup
 */

const { restoreTempBackup, listTempBackups } = require('../utils/temp-backup');
const db = require('../utils/db');
const chalk = require('chalk');
const inquirer = require('inquirer');

/**
 * Restores from a temporary backup
 * @param {string} projectName - Project name
 * @param {string} backupName - Backup name (optional)
 * @param {Object} options - Command options
 * @param {Object} cmd - Commander command object
 * @returns {boolean} Success status
 */
async function restoreTempCommand(projectName, backupName, options = {}, cmd) {
  const cmdOptions = { ...cmd?.parent?.opts(), ...options };
  
  try {
    if (!projectName) {
      console.error(chalk.red('Error: Project name is required'));
      return false;
    }
    
    // Create database connection
    const dbConnection = await db.createConnection(projectName, cmdOptions);
    
    try {
      // If backup name not provided, show list and prompt
      if (!backupName) {
        const backups = listTempBackups();
        
        if (backups.length === 0) {
          console.log(chalk.yellow('No temporary backups available.'));
          return false;
        }
        
        // Filter only restorable backups
        const restorableBackups = backups.filter(b => b.restorable);
        
        if (restorableBackups.length === 0) {
          console.log(chalk.red('No restorable backups found (missing encryption keys).'));
          return false;
        }
        
        // Prompt for backup selection
        const { selectedBackup } = await inquirer.prompt([
          {
            type: 'list',
            name: 'selectedBackup',
            message: 'Select a backup to restore:',
            choices: restorableBackups.map(b => ({
              name: `${b.name} (${b.size}, expires in ${b.expiresIn})`,
              value: b.name
            }))
          }
        ]);
        
        backupName = selectedBackup;
      }
      
      // Show warning
      console.log(chalk.red('\n⚠️  WARNING: This will REPLACE ALL DATA in the current database!'));
      console.log(chalk.yellow(`Target database: ${projectName}`));
      console.log(chalk.yellow(`Backup to restore: ${backupName}`));
      
      // Confirm unless forced
      if (!cmdOptions.force) {
        const { confirm } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: 'Are you sure you want to restore this backup?',
            default: false
          }
        ]);
        
        if (!confirm) {
          console.log(chalk.yellow('Restore cancelled.'));
          return false;
        }
        
        // Double confirmation
        const { typed } = await inquirer.prompt([
          {
            type: 'input',
            name: 'typed',
            message: `Type "restore ${projectName}" to confirm:`,
            validate: (input) => {
              return input === `restore ${projectName}` || 'Please type the exact phrase to confirm';
            }
          }
        ]);
        
        if (typed !== `restore ${projectName}`) {
          console.log(chalk.yellow('Restore cancelled.'));
          return false;
        }
      }
      
      // Perform the restore
      const result = await restoreTempBackup(backupName, dbConnection.connection);
      
      if (result) {
        console.log(chalk.green('\n✅ Database successfully restored from temporary backup'));
        console.log(chalk.blue('💡 Tip: Review the restored data to ensure everything is correct'));
      }
      
      return result;
      
    } finally {
      await db.closeConnection(dbConnection);
    }
    
  } catch (error) {
    console.error(chalk.red('Error restoring from temporary backup:'), error.message);
    return false;
  }
}

module.exports = restoreTempCommand;