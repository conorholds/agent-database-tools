/**
 * @fileoverview Configuration validation command implementation
 * @module commands/validate-config
 * @author DB Tools Team
 * @version 1.0.0
 * 
 * This command provides comprehensive validation of connect.json configuration files,
 * including structure validation, connection testing, and interactive fixes for
 * common configuration issues. It helps users ensure their database configurations
 * are correct before running other db-tools commands.
 */

const { 
  validateConfigFile, 
  testConnection, 
  printValidationResults, 
  printConnectionTestResults 
} = require('../utils/config-validator');
const db = require('../utils/db');
const { createError, ErrorTypes, ErrorSeverity } = require('../utils/error-handler');
const chalk = require('chalk');
const inquirer = require('inquirer');

/**
 * Command to validate configuration file and optionally test connections
 * @param {Object} [cmdOptions={}] - Command-specific options
 * @param {Object} [cmd] - Commander command object
 * @param {string} [cmd.parent.opts().connect] - Custom path to connection file
 * @param {boolean} [cmdOptions.testConnections] - Whether to test actual database connectivity
 * @param {boolean} [cmdOptions.verbose] - Whether to show detailed output
 * @param {boolean} [cmdOptions.fix] - Whether to offer fixes for common issues
 * @returns {Promise<boolean>} True if validation passed, false otherwise
 */
async function validateConfigCommand(cmdOptions = {}, cmd) {
  // Merge command options with global options
  const options = { ...cmd?.parent?.opts(), ...cmdOptions };

  console.log(chalk.cyan('=== DB Tools Configuration Validator ===\n'));

  try {
    // Validate configuration file structure
    console.log(chalk.cyan('Validating configuration file...'));
    const validationResult = validateConfigFile(options.connect);
    
    // Print validation results
    printValidationResults(validationResult, options.verbose || options.fix);

    // If configuration is invalid, exit early unless user wants to see connection tests anyway
    if (!validationResult.isValid && !options.testConnections) {
      console.log(chalk.red('Configuration validation failed. Fix the errors above before proceeding.'));
      
      if (options.fix) {
        await offerConfigFixes(validationResult, options);
      }
      
      return false;
    }

    // Test database connections if requested
    if (options.testConnections && validationResult.connections.length > 0) {
      console.log(chalk.cyan('Testing database connections...\n'));
      
      let allConnectionsWorking = true;
      
      try {
        const connections = db.loadConnections(options.connect);
        
        for (const connection of connections) {
          if (!connection.name) continue;
          
          console.log(chalk.gray(`Testing connection: ${connection.name}...`));
          
          try {
            const testResult = await testConnection(connection, { timeout: 10000 });
            printConnectionTestResults(connection.name, testResult, options.verbose);
            
            if (!testResult.isConnectable) {
              allConnectionsWorking = false;
            }
          } catch (error) {
            console.log(chalk.red(`✗ ${connection.name}`));
            console.log(chalk.red(`    Error: ${error.message}`));
            allConnectionsWorking = false;
          }
        }
        
        console.log(''); // Empty line for spacing
        
        if (allConnectionsWorking) {
          console.log(chalk.green('✓ All database connections are working!'));
        } else {
          console.log(chalk.yellow('⚠ Some database connections failed. Check the errors above.'));
        }
        
      } catch (error) {
        console.error(chalk.red(`Error loading connections for testing: ${error.message}`));
        return false;
      }
    }

    // Summary
    if (validationResult.isValid) {
      console.log(chalk.green('\n✓ Configuration validation completed successfully!'));
      return true;
    } else {
      console.log(chalk.red('\n✗ Configuration validation found issues that need to be addressed.'));
      return false;
    }

  } catch (error) {
    console.error(chalk.red(`Unexpected error during validation: ${error.message}`));
    return false;
  }
}

/**
 * Offers interactive fixes for common configuration issues
 * @param {Object} validationResult - Result from validateConfigFile
 * @param {Object} options - Command options
 */
async function offerConfigFixes(validationResult, options) {
  console.log(chalk.cyan('\n=== Configuration Fix Suggestions ===\n'));

  const fixableErrors = validationResult.errors.filter(error => 
    ['file_not_found', 'empty_config', 'invalid_json'].includes(error.type)
  );

  if (fixableErrors.length === 0) {
    console.log(chalk.yellow('No automatic fixes available for the current errors.'));
    console.log(chalk.cyan('Please manually review and fix the issues mentioned above.'));
    return;
  }

  for (const error of fixableErrors) {
    console.log(chalk.yellow(`Issue: ${error.message}`));
    console.log(chalk.cyan(`💡 ${error.suggestion}`));

    if (error.type === 'file_not_found') {
      const { createFile } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'createFile',
          message: 'Would you like to create a sample connect.json file?',
          default: true
        }
      ]);

      if (createFile) {
        await createSampleConfigFile(options.connect);
      }
    }

    console.log(''); // Empty line for spacing
  }
}

/**
 * Creates a sample connect.json file
 * @param {string} configPath - Path where to create the config file
 */
async function createSampleConfigFile(configPath) {
  const fs = require('fs');
  const path = require('path');

  const targetPath = configPath || path.join(process.cwd(), 'connect.json');

  const sampleConfig = [
    {
      "name": "Local Development",
      "type": "postgres",
      "postgres_uri": "postgresql://username:password@localhost:5432/database_name"
    },
    {
      "name": "MongoDB Local",
      "type": "mongodb", 
      "mongodb_uri": "mongodb://username:password@localhost:27017/database_name"
    }
  ];

  try {
    fs.writeFileSync(targetPath, JSON.stringify(sampleConfig, null, 2));
    console.log(chalk.green(`✓ Created sample configuration file at: ${targetPath}`));
    console.log(chalk.cyan('Please edit this file with your actual database connection details.'));
  } catch (error) {
    console.log(chalk.red(`✗ Failed to create configuration file: ${error.message}`));
  }
}

module.exports = validateConfigCommand;