// src/commands/mongodb/add-collection.js
// This file is used to create a new collection in a MongoDB database

const db = require('../../utils/db');
const { confirmAction } = require('../../utils/prompt');
const inquirer = require('inquirer');
const chalk = require('chalk');

/**
 * Creates a new collection in a MongoDB database
 * @param {Object} connection - MongoDB connection object with client and db properties
 * @param {string} collectionName - Name of the collection to create
 * @param {Object} options - Command options
 * @returns {Promise<boolean>} True if collection was created successfully, false otherwise
 */
async function addMongoCollection({ client, db: mongoDb }, collectionName, options) {
  try {
    // If collection name not provided, prompt for it
    if (!collectionName) {
      const { name } = await inquirer.prompt([
        {
          type: 'input',
          name: 'name',
          message: 'Enter collection name:',
          validate: (input) => {
            if (input.trim() === '') {
              return 'Collection name cannot be empty';
            }
            return true;
          }
        }
      ]);
      collectionName = name;
    }
    
    // Check if collection already exists
    const collectionExists = await db.mongodb.collectionExists(mongoDb, collectionName);
    if (collectionExists) {
      console.error(chalk.red(`Collection "${collectionName}" already exists`));
      return false;
    }
    
    // Confirm creation
    if (!options.force) {
      const confirm = await confirmAction(`Are you sure you want to create collection "${collectionName}"?`);
      if (!confirm) {
        console.log(chalk.yellow('Collection creation cancelled'));
        return false;
      }
    }
    
    // Create the collection
    await mongoDb.createCollection(collectionName);
    
    console.log(chalk.green(`Collection "${collectionName}" created successfully`));
    return true;
  } catch (error) {
    console.error(chalk.red(`Error creating collection: ${error.message}`));
    return false;
  }
}

module.exports = addMongoCollection;