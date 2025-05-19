// src/commands/check.js
// This file is used to check database structure against expected schema

const { createPool, executeQuery, getTableColumns, getTableConstraints, getTableIndexes, getInstalledExtensions } = require('../utils/db');
const { promptForProject } = require('../utils/prompt');
const { generateFullSchema } = require('../utils/schema');
const chalk = require('chalk');

/**
 * Command to check a database's structure against the expected schema
 * @param {string} projectName - Name of the project to check
 * @param {Object} [cmdOptions={}] - Command-specific options
 * @param {Object} [cmd] - Commander command object
 * @param {string} [cmd.parent.opts().connect] - Custom path to connection file
 * @param {string} [cmdOptions.database] - Database name to override default
 */
async function checkCommand(projectName, cmdOptions = {}, cmd) {
  // Merge command options with global options
  const options = { ...cmd?.parent?.opts(), ...cmdOptions };
  // If project name not provided, prompt for it
  if (!projectName) {
    projectName = await promptForProject();
  }
  
  // Create DB connection pool
  const pool = createPool(projectName, options);
  
  try {
    console.log(chalk.cyan(`Checking database for project: ${projectName}`));
    
    // Check required extensions
    await checkExtensions(pool, projectName);
    
    // Check tables structure
    await checkTables(pool, projectName);
    
    // Check foreign key constraints
    await checkForeignKeys(pool);
    
    // Check indexes
    await checkIndexes(pool);
    
    // Check seed data
    await checkSeedData(pool, projectName);
    
    console.log(chalk.green('\n✓ Database check completed'));
    
  } finally {
    // Close connection pool
    await pool.end();
  }
}

/**
 * Check if all required extensions are installed
 * @param {Pool} pool - PostgreSQL connection pool
 * @param {string} projectName - Name of the project
 */
async function checkExtensions(pool, projectName) {
  console.log(chalk.cyan('\nChecking required PostgreSQL extensions...'));
  
  const schema = generateFullSchema(projectName);
  const requiredExtensions = schema.extensions || [];
  
  const installedExtensions = await getInstalledExtensions(pool);
  const installedExtensionNames = installedExtensions.map(ext => ext.name);
  
  let allPresent = true;
  
  for (const extension of requiredExtensions) {
    if (installedExtensionNames.includes(extension)) {
      console.log(chalk.green(`✓ Extension ${extension} is installed`));
    } else {
      console.log(chalk.red(`✗ Extension ${extension} is not installed`));
      allPresent = false;
    }
  }
  
  if (allPresent) {
    console.log(chalk.green('✓ All required extensions are installed'));
  } else {
    console.log(chalk.yellow('⚠ Some required extensions are missing'));
    console.log('  Run the init command to install missing extensions');
  }
}

/**
 * Check if all required tables exist with correct structure
 * @param {Pool} pool - PostgreSQL connection pool
 * @param {string} projectName - Name of the project
 */
async function checkTables(pool, projectName) {
  console.log(chalk.cyan('\nChecking tables structure...'));
  
  const schema = generateFullSchema(projectName);
  
  // Get all tables from database
  const tablesResult = await executeQuery(
    pool,
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
  );
  
  const existingTables = tablesResult.rows.map(row => row.table_name);
  
  const requiredTables = schema.tables.map(table => table.name);
  
  // Check for required tables
  let allTablesPresent = true;
  
  for (const tableName of requiredTables) {
    if (existingTables.includes(tableName)) {
      console.log(chalk.green(`✓ Table ${tableName} exists`));
      
      // Check table columns
      await checkTableColumns(pool, tableName, schema);
    } else {
      console.log(chalk.red(`✗ Table ${tableName} does not exist`));
      allTablesPresent = false;
    }
  }
  
  if (allTablesPresent) {
    console.log(chalk.green('✓ All required tables exist'));
  } else {
    console.log(chalk.yellow('⚠ Some required tables are missing'));
    console.log('  Run the init command to create missing tables');
  }
}

/**
 * Check if table columns match the expected schema
 * @param {Pool} pool - PostgreSQL connection pool
 * @param {string} tableName - Name of the table to check
 * @param {Object} schema - Schema definition object
 */
async function checkTableColumns(pool, tableName, schema) {
  const tableSchemaEntry = schema.tables.find(t => t.name === tableName);
  
  if (!tableSchemaEntry) {
    console.log(chalk.yellow(`  ⚠ No schema definition found for table ${tableName}`));
    return;
  }
  
  const expectedColumns = tableSchemaEntry.columns;
  const actualColumns = await getTableColumns(pool, tableName);
  
  const expectedColumnNames = Object.keys(expectedColumns);
  const actualColumnNames = actualColumns.map(col => col.column_name);
  
  // Check for missing columns
  const missingColumns = expectedColumnNames.filter(col => !actualColumnNames.includes(col));
  
  if (missingColumns.length > 0) {
    console.log(chalk.yellow(`  ⚠ Table ${tableName} is missing columns: ${missingColumns.join(', ')}`));
  }
  
  // Check for extra columns (not in schema)
  const extraColumns = actualColumnNames.filter(col => !expectedColumnNames.includes(col));
  
  if (extraColumns.length > 0) {
    console.log(chalk.blue(`  ℹ Table ${tableName} has additional columns: ${extraColumns.join(', ')}`));
  }
  
  // Check column data types and nullability
  for (const column of actualColumns) {
    if (expectedColumnNames.includes(column.column_name)) {
      const expectedColumnDef = expectedColumns[column.column_name];
      
      // Basic check - we can't fully validate as the expected schema format is simplified
      if (!expectedColumnDef.includes(column.data_type.toUpperCase())) {
        console.log(chalk.yellow(`  ⚠ Column ${tableName}.${column.column_name} has type ${column.data_type}, expected ${expectedColumnDef}`));
      }
      
      // Check nullability
      if (expectedColumnDef.includes('NOT NULL') && column.is_nullable === 'YES') {
        console.log(chalk.yellow(`  ⚠ Column ${tableName}.${column.column_name} allows nulls but schema requires NOT NULL`));
      }
    }
  }
}

/**
 * Check foreign key constraints
 * @param {Pool} pool - PostgreSQL connection pool
 */
async function checkForeignKeys(pool) {
  console.log(chalk.cyan('\nChecking foreign key constraints...'));
  
  // Get all foreign key constraints from the database
  const allConstraints = await executeQuery(
    pool,
    `SELECT
      tc.table_name, 
      kcu.column_name, 
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name
    FROM 
      information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
    WHERE 
      tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'`
  );
  
  if (allConstraints.rows.length === 0) {
    console.log(chalk.yellow('⚠ No foreign key constraints found in the database'));
    return;
  }
  
  console.log(chalk.green(`✓ Found ${allConstraints.rows.length} foreign key constraints`));
  
  // List the foreign key constraints
  allConstraints.rows.forEach(constraint => {
    console.log(chalk.green(`  ✓ ${constraint.table_name}.${constraint.column_name} -> ${constraint.foreign_table_name}.${constraint.foreign_column_name}`));
  });
}

/**
 * Check indexes
 * @param {Pool} pool - PostgreSQL connection pool
 */
async function checkIndexes(pool) {
  console.log(chalk.cyan('\nChecking indexes...'));
  
  // Get all indexes from the database
  const allIndexes = await executeQuery(
    pool,
    `SELECT
      tablename,
      indexname,
      indexdef
    FROM
      pg_indexes
    WHERE
      schemaname = 'public'
    ORDER BY
      tablename, indexname`
  );
  
  if (allIndexes.rows.length === 0) {
    console.log(chalk.yellow('⚠ No indexes found in the database'));
    return;
  }
  
  console.log(chalk.green(`✓ Found ${allIndexes.rows.length} indexes`));
  
  // Group indexes by table
  const indexesByTable = {};
  
  allIndexes.rows.forEach(idx => {
    if (!indexesByTable[idx.tablename]) {
      indexesByTable[idx.tablename] = [];
    }
    indexesByTable[idx.tablename].push(idx);
  });
  
  // List indexes by table
  Object.entries(indexesByTable).forEach(([table, indexes]) => {
    console.log(chalk.cyan(`  Indexes for table ${table}:`));
    indexes.forEach(idx => {
      // Skip primary key indexes
      if (idx.indexname.endsWith('_pkey')) {
        console.log(chalk.green(`    ✓ ${idx.indexname} (PRIMARY KEY)`));
      } else {
        console.log(chalk.green(`    ✓ ${idx.indexname}`));
        console.log(chalk.gray(`      ${idx.indexdef}`));
      }
    });
  });
}

/**
 * Check seed data in key tables
 * @param {Pool} pool - PostgreSQL connection pool
 * @param {string} projectName - Name of the project
 */
async function checkSeedData(pool, projectName) {
  console.log(chalk.cyan('\nChecking key tables for seed data...'));
  
  // Get the schema to know which tables to check
  const schema = generateFullSchema(projectName);
  
  // Tables to check for seed data based on schema
  // Default to these if no custom schema is defined
  let seedTables = [
    { name: 'users', condition: null }
  ];
  
  // If the schema has seedData, use those tables instead
  if (schema.seedData) {
    seedTables = Object.keys(schema.seedData).map(tableName => ({ 
      name: tableName, 
      condition: null 
    }));
  }
  
  for (const table of seedTables) {
    try {
      const countQuery = table.condition
        ? `SELECT COUNT(*) FROM "${table.name}" WHERE ${table.condition}`
        : `SELECT COUNT(*) FROM "${table.name}"`;
      
      const result = await executeQuery(pool, countQuery);
      const count = parseInt(result.rows[0].count);
      
      if (count > 0) {
        console.log(chalk.green(`✓ Table ${table.name} has ${count} rows ${table.condition ? `matching ${table.condition}` : ''}`));
      } else {
        console.log(chalk.yellow(`⚠ Table ${table.name} has no rows ${table.condition ? `matching ${table.condition}` : ''}`));
      }
    } catch (error) {
      // Table might not exist
      console.log(chalk.red(`✗ Could not check table ${table.name}: ${error.message}`));
    }
  }
}

module.exports = checkCommand;