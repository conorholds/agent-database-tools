/**
 * @fileoverview Input validation and type checking utilities
 * @module utils/validation
 * @author DB Tools Team
 * @version 1.0.0
 * 
 * This module provides comprehensive input validation and type checking utilities
 * to ensure data integrity and prevent common errors throughout the application.
 * It includes validators for database identifiers, connection strings, file paths,
 * and other common input types used in database operations.
 */

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

/**
 * Validates that a value is a non-empty string
 * 
 * @param {any} value - Value to validate
 * @param {string} fieldName - Name of the field for error messages
 * @returns {Object} Validation result
 * @returns {boolean} returns.isValid - Whether the value is valid
 * @returns {string} [returns.error] - Error message if invalid
 * 
 * @example
 * const result = validateNonEmptyString(projectName, 'project name');
 * if (!result.isValid) throw new Error(result.error);
 */
function validateNonEmptyString(value, fieldName = 'value') {
  if (typeof value !== 'string') {
    return {
      isValid: false,
      error: `${fieldName} must be a string, got ${typeof value}`
    };
  }
  
  if (value.trim().length === 0) {
    return {
      isValid: false,
      error: `${fieldName} cannot be empty`
    };
  }
  
  return { isValid: true };
}

/**
 * Validates a database identifier (table name, column name, etc.)
 * 
 * Ensures the identifier follows PostgreSQL/MongoDB naming conventions:
 * - Contains only alphanumeric characters, underscores, and hyphens
 * - Starts with a letter or underscore
 * - Is not a reserved word
 * - Is within reasonable length limits
 * 
 * @param {string} identifier - Database identifier to validate
 * @param {string} type - Type of identifier ('table', 'column', 'database', etc.)
 * @returns {Object} Validation result
 * @returns {boolean} returns.isValid - Whether the identifier is valid
 * @returns {string} [returns.error] - Error message if invalid
 * @returns {Array<string>} [returns.warnings] - Array of warning messages
 * 
 * @example
 * const result = validateDatabaseIdentifier('user_profiles', 'table');
 * if (!result.isValid) throw new Error(result.error);
 */
function validateDatabaseIdentifier(identifier, type = 'identifier') {
  const result = { isValid: true, warnings: [] };
  
  // Check basic string validation first
  const stringCheck = validateNonEmptyString(identifier, type);
  if (!stringCheck.isValid) {
    return stringCheck;
  }
  
  // Check length limits
  const { DATABASE } = require('./constants');
  if (identifier.length > DATABASE.MAX_IDENTIFIER_LENGTH) {
    return {
      isValid: false,
      error: `${type} name cannot exceed ${DATABASE.MAX_IDENTIFIER_LENGTH} characters (PostgreSQL limit)`
    };
  }
  
  // Check character restrictions
  const validPattern = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;
  if (!validPattern.test(identifier)) {
    return {
      isValid: false,
      error: `${type} name must start with a letter or underscore and contain only letters, numbers, underscores, and hyphens`
    };
  }
  
  // Check for reserved words
  if (DATABASE.RESERVED_WORDS.includes(identifier.toLowerCase())) {
    return {
      isValid: false,
      error: `${type} name "${identifier}" is a reserved word and cannot be used`
    };
  }
  
  // Add warnings for potentially problematic patterns
  if (identifier.includes('-')) {
    result.warnings.push(`${type} name contains hyphens which may require quoting in some contexts`);
  }
  
  if (identifier.toLowerCase() !== identifier) {
    result.warnings.push(`${type} name contains uppercase letters which may cause case sensitivity issues`);
  }
  
  return result;
}

/**
 * Validates a file path exists and is accessible
 * 
 * @param {string} filePath - Path to validate
 * @param {Object} [options] - Validation options
 * @param {boolean} [options.mustExist=true] - Whether the file must exist
 * @param {boolean} [options.mustBeReadable=true] - Whether the file must be readable
 * @param {boolean} [options.mustBeWritable=false] - Whether the file must be writable
 * @param {Array<string>} [options.allowedExtensions] - Array of allowed file extensions
 * @returns {Object} Validation result
 * 
 * @example
 * const result = validateFilePath('./config.json', { allowedExtensions: ['.json'] });
 * if (!result.isValid) throw new Error(result.error);
 */
function validateFilePath(filePath, options = {}) {
  const {
    mustExist = true,
    mustBeReadable = true,
    mustBeWritable = false,
    allowedExtensions = null
  } = options;
  
  // Basic string validation
  const stringCheck = validateNonEmptyString(filePath, 'file path');
  if (!stringCheck.isValid) {
    return stringCheck;
  }
  
  // Convert to absolute path for validation
  const absolutePath = path.resolve(filePath);
  
  // Check if file exists
  const exists = fs.existsSync(absolutePath);
  if (mustExist && !exists) {
    return {
      isValid: false,
      error: `File does not exist: ${filePath}`
    };
  }
  
  if (exists) {
    try {
      const stats = fs.statSync(absolutePath);
      
      // Check if it's a file (not a directory)
      if (!stats.isFile()) {
        return {
          isValid: false,
          error: `Path is not a file: ${filePath}`
        };
      }
      
      // Check readability
      if (mustBeReadable) {
        try {
          fs.accessSync(absolutePath, fs.constants.R_OK);
        } catch (error) {
          return {
            isValid: false,
            error: `File is not readable: ${filePath}`
          };
        }
      }
      
      // Check writability
      if (mustBeWritable) {
        try {
          fs.accessSync(absolutePath, fs.constants.W_OK);
        } catch (error) {
          return {
            isValid: false,
            error: `File is not writable: ${filePath}`
          };
        }
      }
    } catch (error) {
      return {
        isValid: false,
        error: `Error accessing file: ${error.message}`
      };
    }
  }
  
  // Check file extension
  if (allowedExtensions && allowedExtensions.length > 0) {
    const ext = path.extname(filePath).toLowerCase();
    if (!allowedExtensions.includes(ext)) {
      return {
        isValid: false,
        error: `File must have one of these extensions: ${allowedExtensions.join(', ')}`
      };
    }
  }
  
  return { isValid: true };
}

/**
 * Validates a database connection URI format
 * 
 * @param {string} uri - Connection URI to validate
 * @param {string} expectedType - Expected database type ('postgres' or 'mongodb')
 * @returns {Object} Validation result
 * 
 * @example
 * const result = validateConnectionURI(uri, 'postgres');
 * if (!result.isValid) throw new Error(result.error);
 */
function validateConnectionURI(uri, expectedType) {
  const stringCheck = validateNonEmptyString(uri, 'connection URI');
  if (!stringCheck.isValid) {
    return stringCheck;
  }
  
  if (expectedType === 'postgres') {
    const pgPattern = /^postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)(\?.*)?$/;
    if (!pgPattern.test(uri)) {
      return {
        isValid: false,
        error: 'Invalid PostgreSQL URI format. Expected: postgresql://username:password@hostname:port/database'
      };
    }
  } else if (expectedType === 'mongodb') {
    const mongoPattern = /^mongodb:\/\//;
    if (!mongoPattern.test(uri)) {
      return {
        isValid: false,
        error: 'Invalid MongoDB URI format. Expected: mongodb://[username:password@]hostname:port/database'
      };
    }
  } else {
    return {
      isValid: false,
      error: `Unsupported database type: ${expectedType}`
    };
  }
  
  return { isValid: true };
}

/**
 * Validates command options object
 * 
 * @param {Object} options - Options object to validate
 * @param {Object} schema - Validation schema
 * @returns {Object} Validation result
 */
function validateOptions(options, schema) {
  if (!options || typeof options !== 'object') {
    return {
      isValid: false,
      error: 'Options must be an object'
    };
  }
  
  const errors = [];
  const warnings = [];
  
  // Check required fields
  for (const [key, config] of Object.entries(schema)) {
    if (config.required && !(key in options)) {
      errors.push(`Missing required option: ${key}`);
      continue;
    }
    
    if (key in options) {
      const value = options[key];
      
      // Type checking
      if (config.type && typeof value !== config.type) {
        errors.push(`Option ${key} must be of type ${config.type}, got ${typeof value}`);
        continue;
      }
      
      // Custom validation
      if (config.validate && typeof config.validate === 'function') {
        const result = config.validate(value);
        if (!result.isValid) {
          errors.push(`Option ${key}: ${result.error}`);
        }
        if (result.warnings) {
          warnings.push(...result.warnings.map(w => `Option ${key}: ${w}`));
        }
      }
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Throws a formatted error with suggestions if validation fails
 * 
 * @param {Object} validationResult - Result from validation function
 * @param {string} [context] - Additional context for the error
 * @throws {Error} Formatted error with suggestions
 */
function throwIfInvalid(validationResult, context = '') {
  if (!validationResult.isValid) {
    const message = context ? `${context}: ${validationResult.error}` : validationResult.error;
    const error = new Error(message);
    error.validationError = true;
    throw error;
  }
  
  // Print warnings if any
  if (validationResult.warnings && validationResult.warnings.length > 0) {
    validationResult.warnings.forEach(warning => {
      console.warn(chalk.yellow(`⚠️  ${warning}`));
    });
  }
}

module.exports = {
  validateNonEmptyString,
  validateDatabaseIdentifier,
  validateFilePath,
  validateConnectionURI,
  validateOptions,
  throwIfInvalid
};