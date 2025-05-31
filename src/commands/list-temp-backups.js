/**
 * List Temporary Backups Command
 * Shows all available temporary backups with their expiration times
 */

const { listTempBackups, cleanupOldBackups, RETENTION_HOURS } = require('../utils/temp-backup');
const chalk = require('chalk');

/**
 * Lists all temporary backups
 * @param {Object} options - Command options
 * @returns {boolean} Success status
 */
async function listTempBackupsCommand(options = {}) {
  try {
    console.log(chalk.cyan(`\n🔒 Temporary Backups (auto-delete after ${RETENTION_HOURS} hours)\n`));
    
    // Clean up old backups first
    await cleanupOldBackups();
    
    const backups = listTempBackups();
    
    if (backups.length === 0) {
      console.log(chalk.gray('No temporary backups found.'));
      console.log(chalk.gray('\nTemporary backups are automatically created before dangerous operations.'));
      return true;
    }
    
    // Display backups in a table format
    console.log(chalk.white('Name'.padEnd(60) + 'Size'.padEnd(10) + 'Created'.padEnd(20) + 'Expires In'));
    console.log(chalk.gray('-'.repeat(100)));
    
    backups.forEach(backup => {
      const name = backup.name.length > 57 ? backup.name.substring(0, 54) + '...' : backup.name;
      const created = backup.created.toLocaleString();
      const status = backup.restorable ? '' : chalk.red(' [NO KEY]');
      
      console.log(
        chalk.white(name.padEnd(60)) +
        chalk.gray(backup.size.padEnd(10)) +
        chalk.gray(created.padEnd(20)) +
        chalk.yellow(backup.expiresIn) +
        status
      );
    });
    
    console.log(chalk.gray('\n' + '-'.repeat(100)));
    console.log(chalk.gray(`Total: ${backups.length} backup(s)`));
    
    // Show restore command hint
    console.log(chalk.blue('\nTo restore from a backup:'));
    console.log(chalk.white('  db-tools restore-temp [project] [backup-name]'));
    
    console.log(chalk.yellow('\n⚠️  Note: Temporary backups are encrypted and require their key file to restore.'));
    
    return true;
    
  } catch (error) {
    console.error(chalk.red('Error listing temporary backups:'), error.message);
    return false;
  }
}

module.exports = listTempBackupsCommand;