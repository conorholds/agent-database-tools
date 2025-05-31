/**
 * @fileoverview Application-wide constants and configuration values
 * @module utils/constants
 * @author DB Tools Team
 * @version 1.0.0
 * 
 * This module contains all constants used throughout the db-tools application,
 * including database limits, file paths, error codes, and other configuration
 * values that should be centralized for easy maintenance and consistency.
 */

/**
 * Default file paths and names
 * @readonly
 * @enum {string}
 */
const FILE_PATHS = {
  CONFIG_FILE: 'connect.json',
  LOGS_DIR: 'logs',
  BACKUPS_DIR: 'backups',
  MIGRATIONS_DIR: 'migrations',
  SCHEMAS_DIR: 'schemas'
};

/**
 * Database-related constants
 * @readonly
 * @enum {string|number}
 */
const DATABASE = {
  // Maximum identifier lengths (PostgreSQL standard)
  MAX_IDENTIFIER_LENGTH: 63,
  
  // Default connection timeouts (milliseconds)
  DEFAULT_CONNECTION_TIMEOUT: 30000, // 30 seconds (increased from 5 seconds)
  EXTENDED_CONNECTION_TIMEOUT: 300000, // 5 minutes (increased from 30 seconds)
  
  // Default query limits
  DEFAULT_QUERY_LIMIT: 1000,
  MAX_QUERY_LIMIT: 10000,
  
  // Database types
  TYPES: {
    POSTGRES: 'postgres',
    MONGODB: 'mongodb'
  },
  
  // System tables that should not be modified
  SYSTEM_TABLES: [
    'migrations',
    'pg_catalog',
    'information_schema',
    'pg_stat_statements'
  ],
  
  // Reserved SQL keywords (subset of most common ones)
  RESERVED_WORDS: [
    'select', 'insert', 'update', 'delete', 'create', 'drop', 'alter', 'table',
    'database', 'index', 'view', 'user', 'group', 'order', 'by', 'where', 'from',
    'join', 'inner', 'outer', 'left', 'right', 'on', 'and', 'or', 'not', 'null',
    'true', 'false', 'primary', 'key', 'foreign', 'references', 'constraint',
    'unique', 'check', 'default', 'auto_increment', 'serial', 'varchar', 'text',
    'integer', 'bigint', 'decimal', 'timestamp', 'boolean'
  ]
};

/**
 * PostgreSQL-specific constants
 * @readonly
 * @enum {string|number}
 */
const POSTGRES = {
  // Default port
  DEFAULT_PORT: 5432,
  
  // Connection URI pattern
  URI_PATTERN: /^postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)(\?.*)?$/,
  
  // Common data types
  DATA_TYPES: [
    'VARCHAR', 'TEXT', 'CHAR',
    'INTEGER', 'BIGINT', 'SMALLINT', 'SERIAL', 'BIGSERIAL',
    'DECIMAL', 'NUMERIC', 'REAL', 'DOUBLE PRECISION',
    'BOOLEAN', 'BOOL',
    'DATE', 'TIME', 'TIMESTAMP', 'TIMESTAMPTZ', 'INTERVAL',
    'JSON', 'JSONB',
    'UUID', 'BYTEA'
  ],
  
  // Error codes
  ERROR_CODES: {
    CONNECTION_REFUSED: 'ECONNREFUSED',
    AUTH_FAILED: '28P01',
    DATABASE_NOT_FOUND: '3D000',
    RELATION_NOT_FOUND: '42P01',
    COLUMN_NOT_FOUND: '42703',
    DUPLICATE_COLUMN: '42701',
    SYNTAX_ERROR: '42601'
  }
};

/**
 * MongoDB-specific constants
 * @readonly
 * @enum {string|number}
 */
const MONGODB = {
  // Default port
  DEFAULT_PORT: 27017,
  
  // Connection URI pattern
  URI_PATTERN: /^mongodb:\/\//,
  
  // Collection naming limits
  MAX_COLLECTION_NAME_LENGTH: 120,
  
  // Common field types
  FIELD_TYPES: [
    'String', 'Number', 'Boolean', 'Date', 'Array', 'Object',
    'ObjectId', 'Binary', 'RegExp', 'Null', 'Undefined'
  ]
};

/**
 * CLI and command-related constants
 * @readonly
 * @enum {string|number}
 */
const CLI = {
  // Exit codes
  EXIT_CODES: {
    SUCCESS: 0,
    GENERAL_ERROR: 1,
    CRITICAL_ERROR: 2
  },
  
  // Default options
  DEFAULT_FORCE: false,
  DEFAULT_VERBOSE: false,
  DEFAULT_DRY_RUN: false,
  
  // Command timeouts (milliseconds)
  DEFAULT_COMMAND_TIMEOUT: 300000, // 5 minutes (increased from 30 seconds)
  BACKUP_COMMAND_TIMEOUT: 300000, // 5 minutes
  RESTORE_COMMAND_TIMEOUT: 600000, // 10 minutes
  
  // Output formatting
  MAX_DISPLAY_ROWS: 100,
  TRUNCATE_COLUMN_WIDTH: 50
};

/**
 * File and I/O related constants
 * @readonly
 * @enum {string|number}
 */
const FILE_IO = {
  // Allowed file extensions
  CONFIG_EXTENSIONS: ['.json'],
  MIGRATION_EXTENSIONS: ['.sql'],
  BACKUP_EXTENSIONS: ['.sql', '.backup', '.dump'],
  
  // File size limits (bytes)
  MAX_CONFIG_FILE_SIZE: 1024 * 1024, // 1MB
  MAX_MIGRATION_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  
  // Encoding
  DEFAULT_ENCODING: 'utf8',
  
  // Backup settings
  BACKUP_RETENTION_DAYS: 30,
  BACKUP_COMPRESSION: true
};

/**
 * Security and validation constants
 * @readonly
 * @enum {string|number}
 */
const SECURITY = {
  // Password requirements
  MIN_PASSWORD_LENGTH: 8,
  MAX_PASSWORD_LENGTH: 128,
  
  // Encryption settings
  ENCRYPTION_ALGORITHM: 'aes-256-cbc',
  KEY_LENGTH: 32, // bytes
  IV_LENGTH: 16,  // bytes
  
  // Rate limiting
  MAX_CONNECTION_ATTEMPTS: 3,
  CONNECTION_RETRY_DELAY: 1000, // milliseconds
  
  // Validation patterns
  SAFE_IDENTIFIER_PATTERN: /^[a-zA-Z_][a-zA-Z0-9_]*$/,
  EMAIL_PATTERN: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
};

/**
 * Logging and debugging constants
 * @readonly
 * @enum {string}
 */
const LOGGING = {
  // Log levels
  LEVELS: {
    ERROR: 'error',
    WARN: 'warn',
    INFO: 'info',
    DEBUG: 'debug',
    TRACE: 'trace'
  },
  
  // Log file patterns
  ERROR_LOG_PATTERN: 'db-tools-errors-{date}.log',
  ACCESS_LOG_PATTERN: 'db-tools-access-{date}.log',
  
  // Rotation settings
  MAX_LOG_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_LOG_FILES: 10
};

/**
 * Performance and optimization constants
 * @readonly
 * @enum {number}
 */
const PERFORMANCE = {
  // Connection pooling
  DEFAULT_POOL_SIZE: 5,
  MAX_POOL_SIZE: 20,
  POOL_IDLE_TIMEOUT: 30000, // 30 seconds
  
  // Query optimization
  BATCH_SIZE: 1000,
  MAX_BATCH_SIZE: 10000,
  
  // Memory limits
  MAX_RESULT_SET_SIZE: 100 * 1024 * 1024, // 100MB
  MAX_MEMORY_USAGE: 512 * 1024 * 1024 // 512MB
};

/**
 * Application metadata
 * @readonly
 * @enum {string}
 */
const APP = {
  NAME: 'db-tools',
  DESCRIPTION: 'CLI tool to manage PostgreSQL and MongoDB databases',
  AUTHOR: 'DB Tools Team',
  VERSION: '1.0.0',
  LICENSE: 'MIT',
  
  // URLs and contact info
  REPOSITORY: 'https://github.com/db-tools/db-tools',
  ISSUES_URL: 'https://github.com/db-tools/db-tools/issues',
  DOCS_URL: 'https://db-tools.github.io/docs'
};

module.exports = {
  FILE_PATHS,
  DATABASE,
  POSTGRES,
  MONGODB,
  CLI,
  FILE_IO,
  SECURITY,
  LOGGING,
  PERFORMANCE,
  APP
};