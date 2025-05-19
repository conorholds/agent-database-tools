// src/commands/seed.js
// This file is used to seed database tables with initial data

const { createPool, executeQuery, tableExists } = require('../utils/db');
const { promptForProject, promptForTable, confirmAction } = require('../utils/prompt');
const { generateFullSchema, generateSeedDataSQL } = require('../utils/schema');
const inquirer = require('inquirer');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

async function seedCommand(projectName, table, options) {
  // If project name not provided, prompt for it
  if (!projectName) {
    projectName = await promptForProject();
  }
  
  // Create DB connection pool
  const pool = createPool(projectName, options);
  
  try {
    // If table not provided, prompt for it
    if (!table) {
      const availableSeedTables = Object.keys(generateFullSchema().seedData);
      
      const { selectedTable } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedTable',
          message: 'Select table to seed:',
          choices: availableSeedTables
        }
      ]);
      
      table = selectedTable;
    }
    
    // Verify that table exists
    const exists = await tableExists(pool, table);
    if (!exists) {
      console.error(chalk.red(`Table "${table}" does not exist`));
      return;
    }
    
    // Determine source of seed data (file or built-in)
    let seedData;
    
    if (options.file) {
      // Load seed data from file
      try {
        const filePath = path.resolve(options.file);
        
        if (!fs.existsSync(filePath)) {
          console.error(chalk.red(`Seed data file not found: ${filePath}`));
          return;
        }
        
        const fileContent = fs.readFileSync(filePath, 'utf8');
        
        // Parse based on file extension
        if (filePath.endsWith('.json')) {
          seedData = JSON.parse(fileContent);
        } else if (filePath.endsWith('.js')) {
          // For JS files, we need to evaluate the file
          // This is potentially risky, so we'll limit to specific paths
          if (!filePath.includes('node_modules') && (
              filePath.startsWith(process.cwd()) || 
              filePath.includes('/schemas/') || 
              filePath.includes('/seeds/')
          )) {
            seedData = require(filePath);
          } else {
            console.error(chalk.red(`Cannot load seed data from this location: ${filePath}`));
            console.log('For security reasons, JS seed files must be in the current project or /schemas/ or /seeds/ directories');
            return;
          }
        } else {
          console.error(chalk.red(`Unsupported file format: ${filePath}`));
          console.log('Supported formats: .json, .js');
          return;
        }
      } catch (error) {
        console.error(chalk.red(`Error loading seed data file:`), error.message);
        return;
      }
    } else {
      // Use built-in seed data
      const schema = generateFullSchema();
      
      if (!schema.seedData[table]) {
        console.error(chalk.red(`No built-in seed data available for table "${table}"`));
        console.log('Please provide a seed data file with --file option');
        return;
      }
      
      seedData = schema.seedData[table];
    }
    
    if (!Array.isArray(seedData)) {
      console.error(chalk.red(`Invalid seed data format. Expected an array of objects.`));
      return;
    }
    
    if (seedData.length === 0) {
      console.log(chalk.yellow(`Seed data array is empty. Nothing to insert.`));
      return;
    }
    
    // Generate SQL for inserting seed data
    const seedSql = generateSeedDataSQL(table, seedData);
    
    // Show preview
    console.log(chalk.cyan(`About to insert ${seedData.length} rows into table "${table}"`));
    console.log(chalk.gray('Preview of first 3 rows:'));
    seedData.slice(0, 3).forEach((row, i) => {
      console.log(`${i+1}. ${JSON.stringify(row)}`);
    });
    
    if (seedData.length > 3) {
      console.log(chalk.gray(`...and ${seedData.length - 3} more rows`));
    }
    
    // Confirm the operation
    const confirm = await confirmAction(`Are you sure you want to seed table "${table}" with ${seedData.length} rows?`);
    
    if (!confirm) {
      console.log('Seed operation canceled');
      return;
    }
    
    // Execute the seed SQL
    try {
      await executeQuery(pool, 'BEGIN');
      
      // Split the SQL into individual statements
      const statements = seedSql.split(';').filter(stmt => stmt.trim().length > 0);
      
      let successCount = 0;
      
      for (const statement of statements) {
        try {
          await executeQuery(pool, statement + ';');
          successCount++;
        } catch (error) {
          console.error(chalk.red(`Error executing statement:`), error.message);
          // Continue with the next statement
        }
      }
      
      await executeQuery(pool, 'COMMIT');
      
      console.log(chalk.green(`✓ Successfully inserted ${successCount} out of ${statements.length} rows into table "${table}"`));
      
      // Verify the seed operation
      const count = await executeQuery(pool, `SELECT COUNT(*) FROM "${table}"`);
      console.log(`Table "${table}" now has ${count.rows[0].count} total rows`);
      
      return true;
    } catch (error) {
      await executeQuery(pool, 'ROLLBACK');
      console.error(chalk.red(`Seed operation failed and was rolled back`));
      console.error(error.message);
      return false;
    }
  } finally {
    // Close connection pool
    await pool.end();
  }
}

module.exports = seedCommand;