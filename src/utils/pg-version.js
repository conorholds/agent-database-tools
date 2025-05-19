// src/utils/pg-version.js
// This file contains utilities for checking PostgreSQL version compatibility
// Includes functions to verify PostgreSQL client tools and ensure compatible versions

/**
 * PostgreSQL version compatibility utilities
 */
const { spawnSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const chalk = require('chalk');

/**
 * Check if PostgreSQL client tool is available
 * @param {string} tool Tool name to check
 * @returns {boolean} Whether the tool is available
 */
function isPgToolAvailable(tool) {
  try {
    const result = spawnSync(tool, ['--version']);
    return result.status === 0;
  } catch (error) {
    return false;
  }
}

/**
 * Extract major version number from version string
 * @param {string} versionStr Version string to parse
 * @returns {number} Major version number or 0 if unable to parse
 */
function extractPgVersion(versionStr) {
  if (!versionStr) return 0;
  
  const matches = versionStr.match(/(\d+)(?:\.\d+)?/);
  if (matches && matches[1]) {
    return parseInt(matches[1], 10);
  }
  
  return 0;
}

/**
 * Get PostgreSQL server version from connection URI
 * @param {string} connectionUri PostgreSQL connection URI
 * @returns {Promise<number>} Server version number or 0 if unable to determine
 */
async function getPgServerVersion(connectionUri) {
  try {
    // Parse URI components
    const matches = connectionUri.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
    
    if (!matches) {
      return 0;
    }
    
    const [, username, password, host, port, database] = matches;
    
    // Check if psql is available
    if (!isPgToolAvailable('psql')) {
      return 0;
    }
    
    // Set environment variable for authentication
    process.env.PGPASSWORD = password;
    
    try {
      // Get server version using psql
      const result = spawnSync('psql', [
        '-h', host,
        '-p', port,
        '-U', username,
        '-d', database,
        '-t', // Tuple only output
        '-c', 'SELECT version()'
      ]);
      
      if (result.status !== 0) {
        return 0;
      }
      
      const output = result.stdout.toString().trim();
      const versionMatch = output.match(/PostgreSQL (\d+)(?:\.\d+)?/);
      
      if (versionMatch && versionMatch[1]) {
        return parseInt(versionMatch[1], 10);
      }
    } catch (error) {
      // Ignore errors, just return 0
    } finally {
      // Clear password from environment
      delete process.env.PGPASSWORD;
    }
  } catch (error) {
    // Ignore parsing errors
  }
  
  return 0;
}

/**
 * Get PostgreSQL client version
 * @param {string} tool Tool to check (pg_dump or psql)
 * @returns {number} Client version number or 0 if unable to determine
 */
function getPgClientVersion(tool = 'pg_dump') {
  try {
    if (!isPgToolAvailable(tool)) {
      return 0;
    }
    
    const result = spawnSync(tool, ['--version']);
    return extractPgVersion(result.stdout.toString());
  } catch (error) {
    return 0;
  }
}

/**
 * Check if specific PostgreSQL version is available on the system
 * @param {number} version Version to check
 * @returns {string|null} Path to the PostgreSQL binaries or null if not found
 */
function findPgVersionPath(version) {
  try {
    // First, check for project-specific PostgreSQL wrappers
    const projectRoot = path.resolve(__dirname, '..', '..');
    const pgVersionWrapper = path.join(projectRoot, 'bin', `pg${version}`);
    const pgVersionDir = path.join(projectRoot, 'bin', `pg${version}`);
    
    if (fs.existsSync(pgVersionWrapper) && fs.statSync(pgVersionWrapper).isFile()) {
      return pgVersionWrapper;
    }
    
    if (fs.existsSync(pgVersionDir) && fs.statSync(pgVersionDir).isDirectory()) {
      return pgVersionDir;
    }
    
    // Next, check platform-specific paths
    if (process.platform === 'darwin') {
      // On macOS, check Homebrew paths
      try {
        const brewPathResult = spawnSync('brew', ['--prefix', `postgresql@${version}`]);
        if (brewPathResult.status === 0) {
          const pgPath = path.join(brewPathResult.stdout.toString().trim(), 'bin');
          
          if (fs.existsSync(pgPath)) {
            return pgPath;
          }
        }
      } catch (error) {
        // Ignore errors, continue checking other paths
      }
    } else if (process.platform === 'linux') {
      // On Linux, check common installation paths
      const linuxPaths = [
        `/usr/lib/postgresql/${version}/bin`,
        `/usr/pgsql-${version}/bin`
      ];
      
      for (const pgPath of linuxPaths) {
        if (fs.existsSync(pgPath)) {
          return pgPath;
        }
      }
    }
  } catch (error) {
    // Ignore errors
  }
  
  return null;
}

/**
 * Use specific PostgreSQL version for the current operation
 * @param {number} version Version to use
 * @returns {boolean} Whether the version was successfully activated
 */
function useSpecificPgVersion(version) {
  const pgPath = findPgVersionPath(version);
  
  if (pgPath) {
    console.log(chalk.green(`Found PostgreSQL ${version} tools at ${pgPath}`));
    
    // Check if this is a wrapper script or a directory
    if (fs.existsSync(pgPath) && fs.statSync(pgPath).isFile()) {
      // It's our wrapper script - replace the commands with wrapper calls
      const wrapperScript = pgPath;
      
      // Monkey-patch the spawn and exec functions to use our wrapper
      const originalSpawnSync = spawnSync;
      spawnSync = function(command, args, options) {
        if (command === 'pg_dump' || command === 'pg_restore' || command === 'psql') {
          return originalSpawnSync(wrapperScript, [command, ...args], options);
        }
        return originalSpawnSync(command, args, options);
      };
      
      const originalExecSync = execSync;
      execSync = function(command, options) {
        if (command.startsWith('pg_dump') || command.startsWith('pg_restore') || command.startsWith('psql')) {
          return originalExecSync(`${wrapperScript} ${command}`, options);
        }
        return originalExecSync(command, options);
      };
    } else {
      // It's a regular directory - add to PATH
      process.env.PATH = `${pgPath}:${process.env.PATH}`;
    }
    
    return true;
  }
  
  return false;
}

/**
 * Check and handle PostgreSQL version compatibility
 * @param {string} connectionUri PostgreSQL connection URI
 * @returns {Promise<boolean>} Whether version compatibility was ensured
 */
async function ensurePgVersionCompatibility(connectionUri) {
  // Get client and server versions
  const clientVersion = getPgClientVersion();
  const serverVersion = await getPgServerVersion(connectionUri);
  
  if (clientVersion === 0 || serverVersion === 0) {
    // Cannot determine versions, cannot ensure compatibility
    return false;
  }
  
  if (clientVersion < serverVersion) {
    console.log(chalk.yellow(`⚠ Version mismatch: Client tools (v${clientVersion}) older than server (v${serverVersion})`));
    
    // Try to use the correct version
    if (useSpecificPgVersion(serverVersion)) {
      console.log(chalk.green(`✓ Now using PostgreSQL ${serverVersion} tools`));
      return true;
    } else {
      console.log(chalk.yellow(`PostgreSQL ${serverVersion} tools not found on this system`));
      console.log(chalk.yellow(`You may encounter version mismatch errors. Consider running ./install.sh to install the correct version.`));
      return false;
    }
  }
  
  // Client version is compatible with server
  return true;
}

module.exports = {
  isPgToolAvailable,
  getPgServerVersion,
  getPgClientVersion,
  useSpecificPgVersion,
  ensurePgVersionCompatibility
};