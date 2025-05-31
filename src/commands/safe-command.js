// Safe Command Wrapper
// Wraps dangerous database operations with safety validation

const { performSafetyCheck } = require('../utils/safety-validator');
const { promptForConfirmation } = require('../utils/prompt');
const chalk = require('chalk');

/**
 * Wraps a database command with safety validation
 * @param {Function} commandFunction - The original command function
 * @param {string} operationType - Type of operation for risk assessment
 * @returns {Function} Wrapped command function
 */
function wrapWithSafety(commandFunction, operationType) {
  return async function safeCommandWrapper(...args) {
    // Extract options and command parameters
    const options = args[args.length - 2] || {};
    const cmd = args[args.length - 1] || {};
    const globalOptions = cmd?.parent?.opts() || {};
    
    // Merge all options
    const allOptions = { ...globalOptions, ...options };
    
    // Extract connection and project info
    const projectName = args[0];
    const { force = false, skipSafety = false, dryRun = false } = allOptions;
    
    console.log(chalk.cyan(`\n=== Safe Execution: ${operationType} ===`));
    
    // Skip safety for dry runs
    if (dryRun) {
      console.log(chalk.blue('🔍 Dry run mode - no changes will be made'));
      return await commandFunction(...args);
    }
    
    try {
      // Create mock connection for safety check
      // In real implementation, extract actual connection details
      const mockConnection = {
        host: 'localhost',
        port: 5432,
        database: 'development'
      };
      
      // Perform safety validation
      const shouldProceed = await performSafetyCheck(
        operationType,
        { args, options: allOptions },
        mockConnection,
        projectName,
        { force, skipSafety }
      );
      
      if (!shouldProceed) {
        console.log(chalk.red('\n🛑 Operation cancelled due to safety concerns'));
        console.log(chalk.yellow('Use --force to override safety checks (not recommended)'));
        console.log(chalk.yellow('Use --skip-safety to skip validation entirely'));
        console.log(chalk.yellow('Use --dry-run to see what would happen without making changes'));
        return false;
      }
      
      // Additional confirmation for dangerous operations
      if (!force && !skipSafety) {
        const confirmed = await promptForConfirmation(
          'Do you want to proceed with this operation?'
        );
        
        if (!confirmed) {
          console.log(chalk.yellow('Operation cancelled by user'));
          return false;
        }
      }
      
      console.log(chalk.green('✓ Safety checks passed, executing operation...'));
      
      // Execute the original command
      return await commandFunction(...args);
      
    } catch (error) {
      console.error(chalk.red('Error during safe execution:'), error.message);
      throw error;
    }
  };
}

/**
 * Creates a confirmation prompt for dangerous operations
 * @param {string} message - Confirmation message
 * @returns {Promise<boolean>} User's confirmation
 */
async function promptForConfirmation(message) {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question(chalk.yellow(`${message} (y/N): `), (answer) => {
      rl.close();
      resolve(['y', 'yes', 'Y', 'YES'].includes(answer.trim()));
    });
  });
}

module.exports = {
  wrapWithSafety,
  promptForConfirmation
};