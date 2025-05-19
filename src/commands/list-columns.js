// src/commands/list-columns.js
// This file is used to list columns in a database table with type information

const { createPool, executeQuery, tableExists } = require('../utils/db');
const { promptForProject, promptForTable } = require('../utils/prompt');
const chalk = require('chalk');

async function listColumnsCommand(projectName, table, cmdOptions = {}, cmd) {
  // Merge command options with global options
  const options = { ...cmd?.parent?.opts(), ...cmdOptions };
  // If project name not provided, prompt for it
  if (!projectName) {
    projectName = await promptForProject();
  }
  
  // Create DB connection pool with optional database
  const pool = createPool(projectName, options);
  
  try {
    // If table not provided, prompt for it
    if (!table) {
      table = await promptForTable(pool);
      if (!table) {
        return;
      }
    } else {
      // Verify that table exists
      const exists = await tableExists(pool, table);
      if (!exists) {
        console.error(chalk.red(`Table "${table}" does not exist`));
        return;
      }
    }
    
    console.log(chalk.cyan(`Listing columns for table "${table}" in project: ${projectName}`));
    
    // Query to get comprehensive column information
    const query = `
      SELECT 
        c.column_name,
        c.data_type,
        c.character_maximum_length,
        c.is_nullable,
        c.column_default,
        c.ordinal_position,
        col_description(pgc.oid, c.ordinal_position) AS description,
        CASE 
          WHEN pk.column_name IS NOT NULL THEN 'YES'
          ELSE 'NO'
        END AS is_primary_key,
        CASE 
          WHEN fk.column_name IS NOT NULL THEN 'YES'
          ELSE 'NO'
        END AS is_foreign_key,
        fk_info.foreign_table_name,
        fk_info.foreign_column_name
      FROM 
        information_schema.columns c
      JOIN 
        pg_catalog.pg_class pgc ON c.table_name = pgc.relname
      LEFT JOIN (
        SELECT
          ku.column_name
        FROM
          information_schema.table_constraints tc
        JOIN
          information_schema.key_column_usage ku ON tc.constraint_name = ku.constraint_name
        WHERE
          tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_name = $1
      ) pk ON c.column_name = pk.column_name
      LEFT JOIN (
        SELECT
          ccu.column_name
        FROM
          information_schema.table_constraints tc
        JOIN
          information_schema.key_column_usage ku ON tc.constraint_name = ku.constraint_name
        JOIN
          information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
        WHERE
          tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_name = $1
      ) fk ON c.column_name = fk.column_name
      LEFT JOIN (
        SELECT
          ku.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name
        FROM
          information_schema.table_constraints tc
        JOIN
          information_schema.key_column_usage ku ON tc.constraint_name = ku.constraint_name
        JOIN
          information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
        WHERE
          tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_name = $1
      ) fk_info ON c.column_name = fk_info.column_name
      WHERE 
        c.table_schema = 'public'
        AND c.table_name = $1
      ORDER BY 
        c.ordinal_position;
    `;
    
    const result = await executeQuery(pool, query, [table]);
    
    if (result.rows.length === 0) {
      console.log(chalk.yellow(`No columns found in table "${table}"`));
      return;
    }
    
    // Print results in a table format
    console.log(chalk.green('\nColumn List:'));
    console.log('----------------------------------------------------------------------------------------');
    console.log(`${chalk.bold('Column Name'.padEnd(25))} | ${chalk.bold('Data Type'.padEnd(20))} | ${chalk.bold('Nullable'.padEnd(10))} | ${chalk.bold('PK'.padEnd(4))} | ${chalk.bold('FK')}`);
    console.log('----------------------------------------------------------------------------------------');
    
    result.rows.forEach(row => {
      // Format the data type to include length for varchar etc.
      let dataType = row.data_type;
      if (row.character_maximum_length) {
        dataType += `(${row.character_maximum_length})`;
      }
      
      const colorizedName = row.is_primary_key === 'YES' 
        ? chalk.green(row.column_name) 
        : row.is_foreign_key === 'YES'
          ? chalk.yellow(row.column_name)
          : row.column_name;
          
      console.log(
        `${colorizedName.padEnd(25)} | ` +
        `${dataType.padEnd(20)} | ` +
        `${row.is_nullable.padEnd(10)} | ` +
        `${row.is_primary_key.padEnd(4)} | ` +
        `${row.is_foreign_key}`
      );
    });
    
    console.log('----------------------------------------------------------------------------------------');
    console.log(`Total columns: ${result.rows.length}`);
    
    // Show foreign key relationships if any
    const fkColumns = result.rows.filter(row => row.is_foreign_key === 'YES');
    if (fkColumns.length > 0) {
      console.log(chalk.cyan('\nForeign Key Relationships:'));
      fkColumns.forEach(row => {
        console.log(`  ${row.column_name} → ${row.foreign_table_name}.${row.foreign_column_name}`);
      });
    }
    
    // Show indexes that include these columns
    const indexQuery = `
      SELECT 
        i.relname AS index_name,
        a.attname AS column_name,
        ix.indisunique AS is_unique,
        am.amname AS index_type
      FROM
        pg_class t,
        pg_class i,
        pg_index ix,
        pg_attribute a,
        pg_am am
      WHERE
        t.oid = ix.indrelid
        AND i.oid = ix.indexrelid
        AND a.attrelid = t.oid
        AND a.attnum = ANY(ix.indkey)
        AND t.relkind = 'r'
        AND t.relname = $1
        AND i.relam = am.oid
      ORDER BY
        i.relname,
        a.attnum;
    `;
    
    const indexResult = await executeQuery(pool, indexQuery, [table]);
    
    if (indexResult.rows.length > 0) {
      console.log(chalk.cyan('\nIndexes:'));
      
      // Group by index name
      const indexes = {};
      indexResult.rows.forEach(row => {
        if (!indexes[row.index_name]) {
          indexes[row.index_name] = {
            name: row.index_name,
            columns: [],
            type: row.index_type,
            isUnique: row.is_unique
          };
        }
        indexes[row.index_name].columns.push(row.column_name);
      });
      
      Object.values(indexes).forEach(index => {
        const uniqueLabel = index.isUnique ? ' (UNIQUE)' : '';
        console.log(`  ${index.name}${uniqueLabel}: ${index.columns.join(', ')} [${index.type}]`);
      });
    }
    
    return true;
  } catch (error) {
    console.error(chalk.red('Error listing columns:'), error.message);
    return false;
  } finally {
    // Close connection pool
    await pool.end();
  }
}

module.exports = listColumnsCommand;