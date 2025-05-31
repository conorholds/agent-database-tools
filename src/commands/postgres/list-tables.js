// src/commands/postgres/list-tables.js
// This file is used to list tables in a PostgreSQL database with optional details

const db = require('../../utils/db');
const chalk = require('chalk');

/**
 * Lists tables in a PostgreSQL database
 * @param {Object} connection - PostgreSQL connection
 * @param {Object} options - Command options
 * @returns {Promise<boolean>} True if listing was successful, false otherwise
 */
async function listPostgresTables(connection, options) {
  try {
    // Query to list all tables with additional information
    const query = `
      SELECT 
        t.table_name,
        pg_size_pretty(pg_total_relation_size(quote_ident(t.table_name))) AS size,
        (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) AS column_count,
        obj_description(pgc.oid, 'pg_class') AS description
      FROM 
        information_schema.tables t
      JOIN 
        pg_catalog.pg_class pgc ON t.table_name = pgc.relname
      WHERE 
        t.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
      ORDER BY 
        table_name;
    `;
    
    const result = await db.postgres.executeQuery(connection, query);
    
    if (result.rows.length === 0) {
      console.log(chalk.yellow('No tables found in the database'));
      return true;
    }
    
    // Print results in a table format
    console.log(chalk.green('\nTable List:'));
    console.log('---------------------------------------------------');
    console.log(`${chalk.bold('Table Name'.padEnd(30))} | ${chalk.bold('Size'.padEnd(15))} | ${chalk.bold('Columns')}`);
    console.log('---------------------------------------------------');
    
    result.rows.forEach(row => {
      console.log(`${row.table_name.padEnd(30)} | ${row.size.padEnd(15)} | ${row.column_count}`);
    });
    
    console.log('---------------------------------------------------');
    console.log(`Total tables: ${result.rows.length}`);
    
    // If detailed option is provided, show row counts and more details
    if (options && options.detailed) {
      console.log(chalk.cyan('\nDetailled Table Information:'));
      
      for (const table of result.rows) {
        // Get row count
        const countResult = await db.postgres.executeQuery(
          connection, 
          `SELECT COUNT(*) FROM "${table.table_name}"`
        );
        const rowCount = parseInt(countResult.rows[0].count);
        
        // Get index information
        const indexQuery = `
          SELECT 
            indexname,
            indexdef
          FROM 
            pg_indexes
          WHERE 
            tablename = $1
          ORDER BY 
            indexname;
        `;
        
        const indexResult = await db.postgres.executeQuery(
          connection, 
          indexQuery, 
          [table.table_name]
        );
        
        console.log(chalk.green(`\nTable: ${table.table_name}`));
        console.log(`Size: ${table.size}`);
        console.log(`Column count: ${table.column_count}`);
        console.log(`Row count: ${rowCount}`);
        
        if (indexResult.rows.length > 0) {
          console.log(chalk.yellow(`Indexes (${indexResult.rows.length}):`));
          indexResult.rows.forEach(idx => {
            console.log(`  - ${idx.indexname}`);
          });
        }
        
        // Add a separator between tables
        console.log('---------------------------------------------------');
      }
    }
    
    return true;
  } catch (error) {
    console.error(chalk.red('Error listing PostgreSQL tables:'), error.message);
    return false;
  }
}

module.exports = listPostgresTables;