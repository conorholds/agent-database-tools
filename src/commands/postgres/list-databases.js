// src/commands/postgres/list-databases.js
// This file is used to list available PostgreSQL databases on the server

const db = require('../../utils/db');
const chalk = require('chalk');

/**
 * Lists databases in a PostgreSQL server
 * @param {Object} connection - PostgreSQL connection
 * @param {Object} options - Command options
 * @returns {Promise<boolean>} True if listing was successful, false otherwise
 */
async function listPostgresDatabases(connection, options) {
  try {
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
    
    const result = await db.postgres.executeQuery(connection, query);
    
    if (result.rows.length === 0) {
      console.log(chalk.yellow('No accessible databases found'));
      return true;
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
    const currentDb = await db.postgres.executeQuery(connection, 'SELECT current_database()');
    console.log(chalk.cyan(`\nCurrently connected to: ${currentDb.rows[0].current_database}`));
    
    return true;
  } catch (error) {
    console.error(chalk.red('Error listing PostgreSQL databases:'), error.message);
    return false;
  }
}

module.exports = listPostgresDatabases;