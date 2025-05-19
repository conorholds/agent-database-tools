// src/commands/auto-backup.js
// This file is used to set up automated database backups using cron jobs

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const chalk = require('chalk');

/**
 * Set up or disable automatic backups using a cron job
 */
async function autoBackupCommand(projectName, options = {}, cmd) {
  // Merge command options with global options
  const cmdOptions = { ...cmd?.parent?.opts(), ...options };
  
  if (!projectName) {
    console.error(chalk.red('Error: Project name is required'));
    console.log('Usage: db-tools auto-backup <project-name> [options]');
    return false;
  }
  
  // Path to setup script
  const scriptPath = path.join(process.cwd(), 'scripts', 'setup-automatic-backups.sh');
  
  // Check if script exists
  if (!fs.existsSync(scriptPath)) {
    console.error(chalk.red(`Error: Setup script not found at ${scriptPath}`));
    return false;
  }
  
  // Build command-line arguments for the script
  const args = ['--project', projectName];
  
  // Add options
  if (cmdOptions.backupDir) {
    args.push('--backup-dir', cmdOptions.backupDir);
  }
  
  if (cmdOptions.retentionDays) {
    args.push('--retention-days', cmdOptions.retentionDays.toString());
  }
  
  if (cmdOptions.format) {
    args.push('--format', cmdOptions.format);
  }
  
  if (cmdOptions.encrypt) {
    args.push('--encrypt');
  }
  
  if (cmdOptions.database) {
    args.push('--database', cmdOptions.database);
  }
  
  if (cmdOptions.connect) {
    args.push('--connect', cmdOptions.connect);
  }
  
  if (cmdOptions.schedule) {
    args.push('--schedule', cmdOptions.schedule);
  }
  
  if (cmdOptions.disable) {
    args.push('--disable');
  }
  
  // Execute the setup script
  console.log(chalk.blue('Setting up automatic backups...'));
  console.log(`Script: ${scriptPath}`);
  console.log(`Args: ${args.join(' ')}`);
  
  return new Promise((resolve, reject) => {
    const setupProcess = spawn(scriptPath, args, {
      stdio: 'inherit',
      shell: true
    });
    
    setupProcess.on('close', (code) => {
      if (code === 0) {
        if (cmdOptions.disable) {
          console.log(chalk.green('Automatic backups have been disabled successfully'));
        } else {
          console.log(chalk.green('Automatic backups have been set up successfully'));
        }
        resolve(true);
      } else {
        console.error(chalk.red(`Setup script exited with code ${code}`));
        resolve(false);
      }
    });
    
    setupProcess.on('error', (err) => {
      console.error(chalk.red(`Failed to execute setup script: ${err.message}`));
      reject(err);
    });
  });
}

module.exports = autoBackupCommand;