/**
 * @fileoverview Standardized error handling utilities for db-tools
 * @module utils/error-handler
 * @author DB Tools Team
 * @version 1.0.0
 * 
 * This module provides consistent error handling patterns throughout the application,
 * including error classification, user-friendly error messages, logging, and
 * recovery suggestions. It helps maintain consistent error reporting and
 * improves the overall user experience.
 */

const chalk = require('chalk');
const fs = require('fs');
const path = require('path');

/**
 * Error types used throughout the application
 * @readonly
 * @enum {string}
 */
const ErrorTypes = {
  VALIDATION: 'validation',
  CONNECTION: 'connection',
  DATABASE: 'database',
  FILE_SYSTEM: 'file_system',
  PERMISSION: 'permission',
  CONFIGURATION: 'configuration',
  NETWORK: 'network',
  UNKNOWN: 'unknown'
};

/**
 * Severity levels for errors
 * @readonly
 * @enum {string}
 */
const ErrorSeverity = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

/**
 * Creates a standardized error object with additional metadata
 * 
 * @param {string} message - Primary error message
 * @param {Object} [options={}] - Error options
 * @param {string} [options.type=ErrorTypes.UNKNOWN] - Error type
 * @param {string} [options.severity=ErrorSeverity.MEDIUM] - Error severity
 * @param {string} [options.code] - Specific error code
 * @param {Array<string>} [options.suggestions=[]] - Array of recovery suggestions
 * @param {Object} [options.context] - Additional context information
 * @param {Error} [options.originalError] - Original error that caused this
 * 
 * @returns {Error} Enhanced error object
 * 
 * @example
 * const error = createError('Connection failed', {
 *   type: ErrorTypes.CONNECTION,
 *   severity: ErrorSeverity.HIGH,
 *   suggestions: ['Check network connectivity', 'Verify credentials']
 * });
 */
function createError(message, options = {}) {
  const {
    type = ErrorTypes.UNKNOWN,
    severity = ErrorSeverity.MEDIUM,
    code = null,
    suggestions = [],
    context = {},
    originalError = null
  } = options;

  const error = new Error(message);
  
  // Add metadata
  error.type = type;
  error.severity = severity;
  error.code = code;
  error.suggestions = suggestions;
  error.context = context;
  error.originalError = originalError;
  error.timestamp = new Date().toISOString();
  
  // Preserve original stack trace if available
  if (originalError && originalError.stack) {
    error.originalStack = originalError.stack;
  }
  
  return error;
}

/**
 * Handles and formats errors for user display
 * 
 * @param {Error} error - Error to handle
 * @param {Object} [options={}] - Handling options
 * @param {boolean} [options.exit=false] - Whether to exit process after handling
 * @param {boolean} [options.verbose=false] - Whether to show detailed error info
 * @param {boolean} [options.showStack=false] - Whether to show stack trace
 * @param {Function} [options.logger=console.error] - Custom logger function
 * 
 * @returns {void}
 */
function handleError(error, options = {}) {
  const {
    exit = false,
    verbose = false,
    showStack = false,
    logger = console.error
  } = options;

  // Determine error type and format accordingly
  let errorType = error.type || ErrorTypes.UNKNOWN;
  let severity = error.severity || ErrorSeverity.MEDIUM;
  
  // Try to classify unknown errors
  if (errorType === ErrorTypes.UNKNOWN) {
    const classification = classifyError(error);
    errorType = classification.type;
    severity = classification.severity;
  }

  // Format the error message
  const icon = getSeverityIcon(severity);
  const typeLabel = errorType.toUpperCase();
  
  logger(chalk.red(`${icon} ${typeLabel} ERROR: ${error.message}`));
  
  // Show additional context if available
  if (verbose && error.context && Object.keys(error.context).length > 0) {
    logger(chalk.gray('\nContext:'));
    Object.entries(error.context).forEach(([key, value]) => {
      logger(chalk.gray(`  ${key}: ${value}`));
    });
  }
  
  // Show original error if available
  if (verbose && error.originalError) {
    logger(chalk.gray(`\nOriginal error: ${error.originalError.message}`));
  }
  
  // Show suggestions if available
  if (error.suggestions && error.suggestions.length > 0) {
    logger(chalk.cyan('\n💡 Suggestions:'));
    error.suggestions.forEach(suggestion => {
      logger(chalk.cyan(`  • ${suggestion}`));
    });
  }
  
  // Show stack trace if requested
  if (showStack) {
    logger(chalk.gray('\nStack trace:'));
    logger(chalk.gray(error.stack));
    
    if (error.originalStack) {
      logger(chalk.gray('\nOriginal stack trace:'));
      logger(chalk.gray(error.originalStack));
    }
  }
  
  // Log to file if enabled
  logErrorToFile(error, { verbose, showStack });
  
  // Exit if requested
  if (exit) {
    const exitCode = severity === ErrorSeverity.CRITICAL ? 2 : 1;
    process.exit(exitCode);
  }
}

/**
 * Attempts to classify an unknown error based on its properties
 * 
 * @param {Error} error - Error to classify
 * @returns {Object} Classification result
 * @returns {string} returns.type - Classified error type
 * @returns {string} returns.severity - Determined severity
 */
function classifyError(error) {
  const message = error.message.toLowerCase();
  const code = error.code;
  
  // Database-related errors
  if (code === 'ECONNREFUSED' || message.includes('connection') || message.includes('connect')) {
    return { type: ErrorTypes.CONNECTION, severity: ErrorSeverity.HIGH };
  }
  
  if (code === '28P01' || message.includes('authentication') || message.includes('password')) {
    return { type: ErrorTypes.PERMISSION, severity: ErrorSeverity.HIGH };
  }
  
  if (code === '3D000' || message.includes('database') || message.includes('relation')) {
    return { type: ErrorTypes.DATABASE, severity: ErrorSeverity.MEDIUM };
  }
  
  // File system errors
  if (code === 'ENOENT' || message.includes('no such file') || message.includes('not found')) {
    return { type: ErrorTypes.FILE_SYSTEM, severity: ErrorSeverity.MEDIUM };
  }
  
  if (code === 'EACCES' || message.includes('permission denied') || message.includes('access')) {
    return { type: ErrorTypes.PERMISSION, severity: ErrorSeverity.HIGH };
  }
  
  // Network errors
  if (code === 'ENOTFOUND' || code === 'ETIMEDOUT' || message.includes('network')) {
    return { type: ErrorTypes.NETWORK, severity: ErrorSeverity.HIGH };
  }
  
  // Validation errors
  if (error.validationError || message.includes('invalid') || message.includes('validation')) {
    return { type: ErrorTypes.VALIDATION, severity: ErrorSeverity.LOW };
  }
  
  // Configuration errors
  if (message.includes('config') || message.includes('json')) {
    return { type: ErrorTypes.CONFIGURATION, severity: ErrorSeverity.MEDIUM };
  }
  
  return { type: ErrorTypes.UNKNOWN, severity: ErrorSeverity.MEDIUM };
}

/**
 * Gets an appropriate icon for error severity
 * 
 * @param {string} severity - Error severity level
 * @returns {string} Icon character
 */
function getSeverityIcon(severity) {
  switch (severity) {
    case ErrorSeverity.LOW:
      return '⚠️';
    case ErrorSeverity.MEDIUM:
      return '❌';
    case ErrorSeverity.HIGH:
      return '🚨';
    case ErrorSeverity.CRITICAL:
      return '💥';
    default:
      return '❌';
  }
}

/**
 * Logs error details to a file for debugging
 * 
 * @param {Error} error - Error to log
 * @param {Object} [options={}] - Logging options
 * @param {boolean} [options.verbose=false] - Include additional details
 * @param {boolean} [options.showStack=false] - Include stack trace
 */
function logErrorToFile(error, options = {}) {
  try {
    const { verbose = false, showStack = false } = options;
    
    // Create logs directory if it doesn't exist
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    // Create log file path with date
    const date = new Date().toISOString().split('T')[0];
    const logFile = path.join(logsDir, `db-tools-errors-${date}.log`);
    
    // Format log entry
    const logEntry = {
      timestamp: error.timestamp || new Date().toISOString(),
      type: error.type || 'unknown',
      severity: error.severity || 'medium',
      code: error.code || null,
      message: error.message,
      context: verbose ? error.context : undefined,
      originalError: verbose && error.originalError ? error.originalError.message : undefined,
      stack: showStack ? error.stack : undefined,
      originalStack: showStack && error.originalStack ? error.originalStack : undefined
    };
    
    // Append to log file
    const logLine = JSON.stringify(logEntry) + '\n';
    fs.appendFileSync(logFile, logLine);
  } catch (logError) {
    // Don't throw errors from logging - just warn
    console.warn(chalk.yellow('Warning: Could not write to error log file'));
  }
}

/**
 * Wraps a function to provide standardized error handling
 * 
 * @param {Function} fn - Function to wrap
 * @param {Object} [options={}] - Wrapper options
 * @param {string} [options.context] - Context description
 * @param {boolean} [options.exitOnError=false] - Exit process on error
 * @param {boolean} [options.logErrors=true] - Log errors to file
 * 
 * @returns {Function} Wrapped function
 * 
 * @example
 * const safeFunction = withErrorHandling(riskyFunction, {
 *   context: 'Database operation',
 *   exitOnError: true
 * });
 */
function withErrorHandling(fn, options = {}) {
  const {
    context = 'Operation',
    exitOnError = false,
    logErrors = true
  } = options;

  return async function(...args) {
    try {
      return await fn.apply(this, args);
    } catch (error) {
      const enhancedError = createError(`${context} failed: ${error.message}`, {
        originalError: error,
        context: { operation: context }
      });
      
      handleError(enhancedError, {
        exit: exitOnError,
        verbose: process.env.NODE_ENV === 'development'
      });
      
      // Re-throw if not exiting
      if (!exitOnError) {
        throw enhancedError;
      }
    }
  };
}

module.exports = {
  ErrorTypes,
  ErrorSeverity,
  createError,
  handleError,
  classifyError,
  withErrorHandling,
  logErrorToFile
};