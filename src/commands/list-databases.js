// src/commands/list-databases.js
// This file is used to list available databases on the PostgreSQL server

const { createPool, executeQuery } = require('../utils/db');
const { promptForProject } = require('../utils/prompt');
const chalk = require('chalk');

async function listDatabasesCommand(projectName, cmdOptions = {}, cmd) {
  // Merge command options with global options
  const options = { ...cmd?.parent?.opts(), ...cmdOptions };
  // If project name not provided, prompt for it
  if (!projectName) {
    projectName = await promptForProject();
  }
  
  // Create DB connection pool with optional database
  const pool = createPool(projectName, options);
  
  try {
    console.log(chalk.cyan(`Listing databases accessible from project: ${projectName}`));
    
    // Query to list all databases
    const query = `
      SELECT 
        datname AS database_name, 
        pg_size_pretty(pg_database_size(datname)) AS size,
        datcollate AS collate,
        datctype AS encoding,
        pg_catalog.shobj_description(d.oid, 'pg_database') AS description
      FROM 
        pg_database d
      WHERE 
        datistemplate = false
      ORDER BY 
        database_name;
    `;
    
    const result = await executeQuery(pool, query);
    
    if (result.rows.length === 0) {
      console.log(chalk.yellow('No accessible databases found'));
      return;
    }
    
    // Print results in a table format
    console.log(chalk.green('\nDatabase List:'));
    console.log('---------------------------------------------------');
    console.log(`${chalk.bold('Database Name'.padEnd(20))} | ${chalk.bold('Size'.padEnd(15))} | ${chalk.bold('Encoding')}`);
    console.log('---------------------------------------------------');
    
    result.rows.forEach(row => {
      console.log(`${row.database_name.padEnd(20)} | ${row.size.padEnd(15)} | ${row.encoding}`);
    });
    
    console.log('---------------------------------------------------');
    console.log(`Total databases: ${result.rows.length}`);
    
    // Get the current database name
    const currentDb = await executeQuery(pool, 'SELECT current_database()');
    console.log(chalk.cyan(`\nCurrently connected to: ${currentDb.rows[0].current_database}`));
    
    return true;
  } catch (error) {
    console.error(chalk.red('Error listing databases:'), error.message);
    return false;
  } finally {
    // Close connection pool
    await pool.end();
  }
}

module.exports = listDatabasesCommand;