/**
 * Temporary Backup System
 * Creates encrypted backups before dangerous operations and auto-deletes after 4 hours
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execSync } = require('child_process');
const chalk = require('chalk');

const TEMP_BACKUP_DIR = path.join(process.cwd(), 'temp');
const RETENTION_HOURS = 4;
const RETENTION_MS = RETENTION_HOURS * 60 * 60 * 1000;

/**
 * Ensures the temporary backup directory exists
 */
function ensureTempBackupDir() {
  if (!fs.existsSync(TEMP_BACKUP_DIR)) {
    fs.mkdirSync(TEMP_BACKUP_DIR, { recursive: true });
    
    // Create .gitignore to prevent committing temp backups
    const gitignorePath = path.join(TEMP_BACKUP_DIR, '.gitignore');
    fs.writeFileSync(gitignorePath, '*\n!.gitignore\n');
  }
}

/**
 * Cleans up old temporary backups
 */
async function cleanupOldBackups() {
  try {
    ensureTempBackupDir();
    
    const now = Date.now();
    const files = fs.readdirSync(TEMP_BACKUP_DIR);
    
    let cleaned = 0;
    for (const file of files) {
      if (file === '.gitignore') continue;
      
      const filePath = path.join(TEMP_BACKUP_DIR, file);
      const stats = fs.statSync(filePath);
      const age = now - stats.mtimeMs;
      
      if (age > RETENTION_MS) {
        fs.unlinkSync(filePath);
        cleaned++;
        
        // Also remove associated key file if it exists
        const keyPath = filePath + '.key';
        if (fs.existsSync(keyPath)) {
          fs.unlinkSync(keyPath);
        }
      }
    }
    
    if (cleaned > 0) {
      console.log(chalk.gray(`Cleaned up ${cleaned} old temporary backup(s)`));
    }
  } catch (error) {
    console.warn(chalk.yellow('Warning: Could not clean up old backups:'), error.message);
  }
}

/**
 * Creates a temporary encrypted backup before a dangerous operation
 * @param {Object} connection - Database connection details
 * @param {string} projectName - Project name
 * @param {string} operation - Operation being performed
 * @returns {Object} Backup details including path and encryption key
 */
async function createTempBackup(connection, projectName, operation) {
  try {
    // Clean up old backups first
    await cleanupOldBackups();
    
    ensureTempBackupDir();
    
    // Generate backup filename with timestamp and operation
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeName = projectName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const safeOp = operation.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const backupName = `temp_${safeName}_${safeOp}_${timestamp}`;
    const backupPath = path.join(TEMP_BACKUP_DIR, `${backupName}.sql`);
    
    console.log(chalk.blue('🔒 Creating temporary encrypted backup...'));
    
    // Extract connection details
    let connectionString;
    if (connection.options && connection.options.connectionString) {
      connectionString = connection.options.connectionString;
    } else if (connection._connectionString) {
      connectionString = connection._connectionString;
    } else {
      throw new Error('Could not extract connection string for backup');
    }
    
    // Parse connection string to get database name
    const dbMatch = connectionString.match(/\/([^/?]+)(\?|$)/);
    const database = dbMatch ? dbMatch[1] : 'postgres';
    
    // Create backup using pg_dump
    const pgDumpCommand = `pg_dump "${connectionString}" --no-owner --no-acl --clean --if-exists`;
    
    try {
      const backupData = execSync(pgDumpCommand, {
        encoding: 'utf8',
        maxBuffer: 500 * 1024 * 1024 // 500MB buffer
      });
      
      // Generate encryption key
      const encryptionKey = crypto.randomBytes(32).toString('hex');
      const keyPath = `${backupPath}.key`;
      
      // Encrypt the backup
      const cipher = crypto.createCipher('aes-256-cbc', encryptionKey);
      let encrypted = cipher.update(backupData, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      // Write encrypted backup
      fs.writeFileSync(backupPath, encrypted);
      
      // Write encryption key
      fs.writeFileSync(keyPath, encryptionKey);
      
      // Set restrictive permissions
      fs.chmodSync(backupPath, 0o600);
      fs.chmodSync(keyPath, 0o600);
      
      const backupSize = (fs.statSync(backupPath).size / 1024 / 1024).toFixed(2);
      
      console.log(chalk.green(`✅ Temporary backup created: ${backupName}`));
      console.log(chalk.gray(`   Size: ${backupSize} MB (encrypted)`));
      console.log(chalk.gray(`   Auto-delete: ${RETENTION_HOURS} hours`));
      console.log(chalk.gray(`   Location: ${TEMP_BACKUP_DIR}/`));
      
      return {
        success: true,
        backupPath,
        keyPath,
        backupName,
        database,
        timestamp: new Date(),
        expiresAt: new Date(Date.now() + RETENTION_MS)
      };
      
    } catch (pgDumpError) {
      throw new Error(`pg_dump failed: ${pgDumpError.message}`);
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Failed to create temporary backup:'), error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Restores from a temporary backup
 * @param {string} backupName - Name of the backup (without extension)
 * @param {Object} connection - Database connection details
 * @returns {boolean} Success status
 */
async function restoreTempBackup(backupName, connection) {
  try {
    const backupPath = path.join(TEMP_BACKUP_DIR, `${backupName}.sql`);
    const keyPath = `${backupPath}.key`;
    
    if (!fs.existsSync(backupPath)) {
      console.error(chalk.red(`Backup not found: ${backupName}`));
      return false;
    }
    
    if (!fs.existsSync(keyPath)) {
      console.error(chalk.red(`Encryption key not found for backup: ${backupName}`));
      return false;
    }
    
    console.log(chalk.blue('🔓 Decrypting temporary backup...'));
    
    // Read encryption key
    const encryptionKey = fs.readFileSync(keyPath, 'utf8').trim();
    
    // Read encrypted backup
    const encryptedData = fs.readFileSync(backupPath, 'utf8');
    
    // Decrypt the backup
    const decipher = crypto.createDecipher('aes-256-cbc', encryptionKey);
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    // Extract connection string
    let connectionString;
    if (connection.options && connection.options.connectionString) {
      connectionString = connection.options.connectionString;
    } else if (connection._connectionString) {
      connectionString = connection._connectionString;
    } else {
      throw new Error('Could not extract connection string for restore');
    }
    
    console.log(chalk.yellow('⚠️  WARNING: This will replace ALL data in the database!'));
    console.log(chalk.blue('📥 Restoring from temporary backup...'));
    
    // Restore using psql
    const psqlCommand = `psql "${connectionString}"`;
    
    try {
      execSync(psqlCommand, {
        input: decrypted,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      console.log(chalk.green('✅ Successfully restored from temporary backup'));
      
      // Optionally delete the backup after successful restore
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      const shouldDelete = await new Promise((resolve) => {
        rl.question(chalk.yellow('Delete this temporary backup? (y/N): '), (answer) => {
          rl.close();
          resolve(answer.toLowerCase() === 'y');
        });
      });
      
      if (shouldDelete) {
        fs.unlinkSync(backupPath);
        fs.unlinkSync(keyPath);
        console.log(chalk.gray('Temporary backup deleted'));
      }
      
      return true;
      
    } catch (psqlError) {
      throw new Error(`psql restore failed: ${psqlError.message}`);
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Failed to restore from temporary backup:'), error.message);
    return false;
  }
}

/**
 * Lists all available temporary backups
 * @returns {Array} List of backup details
 */
function listTempBackups() {
  try {
    ensureTempBackupDir();
    
    const files = fs.readdirSync(TEMP_BACKUP_DIR);
    const backups = [];
    
    for (const file of files) {
      if (file.endsWith('.sql') && !file.endsWith('.key')) {
        const filePath = path.join(TEMP_BACKUP_DIR, file);
        const stats = fs.statSync(filePath);
        const keyExists = fs.existsSync(`${filePath}.key`);
        
        const age = Date.now() - stats.mtimeMs;
        const remainingHours = Math.max(0, (RETENTION_MS - age) / (60 * 60 * 1000));
        
        backups.push({
          name: file.replace('.sql', ''),
          path: filePath,
          size: (stats.size / 1024 / 1024).toFixed(2) + ' MB',
          created: stats.mtime,
          expiresIn: remainingHours.toFixed(1) + ' hours',
          encrypted: keyExists,
          restorable: keyExists
        });
      }
    }
    
    return backups.sort((a, b) => b.created - a.created);
    
  } catch (error) {
    console.error(chalk.red('Error listing temporary backups:'), error.message);
    return [];
  }
}

/**
 * Sets up automatic cleanup interval
 */
function setupAutoCleanup() {
  // Run cleanup every hour
  setInterval(() => {
    cleanupOldBackups().catch(err => {
      console.error('Auto-cleanup error:', err.message);
    });
  }, 60 * 60 * 1000);
  
  // Also run cleanup on startup
  cleanupOldBackups().catch(err => {
    console.error('Initial cleanup error:', err.message);
  });
}

module.exports = {
  createTempBackup,
  restoreTempBackup,
  listTempBackups,
  cleanupOldBackups,
  setupAutoCleanup,
  TEMP_BACKUP_DIR,
  RETENTION_HOURS
};