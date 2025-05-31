// src/commands/mongodb/list-databases.js
// This file is used to list available MongoDB databases on the server

const chalk = require('chalk');

/**
 * Lists databases in a MongoDB server
 * @param {Object} connection - MongoDB connection object with client and db properties
 * @param {Object} options - Command options
 * @returns {Promise<boolean>} True if listing was successful, false otherwise
 */
async function listMongoDatabases({ client, db: mongoDb }, options) {
  try {
    const adminDb = client.db('admin');
    
    // Get list of databases
    const result = await adminDb.admin().listDatabases();
    
    if (!result.databases || result.databases.length === 0) {
      console.log(chalk.yellow('No databases found on the server'));
      return true;
    }
    
    // Print results in a table format
    console.log(chalk.green('\nDatabase List:'));
    console.log('------------------------------------------------------------------------');
    console.log(`${chalk.bold('Database Name'.padEnd(30))} | ${chalk.bold('Size (MB)'.padEnd(15))} | ${chalk.bold('Empty')}`);
    console.log('------------------------------------------------------------------------');
    
    result.databases.forEach(database => {
      // Convert size to MB and format with 2 decimal places
      const sizeMB = (database.sizeOnDisk / (1024 * 1024)).toFixed(2);
      console.log(`${database.name.padEnd(30)} | ${sizeMB.padEnd(15)} | ${database.empty ? 'Yes' : 'No'}`);
    });
    
    console.log('------------------------------------------------------------------------');
    console.log(`Total databases: ${result.databases.length}`);
    
    // Display current database
    console.log(chalk.cyan(`\nCurrently connected to: ${mongoDb.databaseName}`));
    
    return true;
  } catch (error) {
    console.error(chalk.red('Error listing MongoDB databases:'), error.message);
    return false;
  }
}

module.exports = listMongoDatabases;