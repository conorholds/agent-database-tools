// src/commands/mongodb/rename-table.js
// This file is used to rename a MongoDB collection

const db = require('../../utils/db');
const { promptForTable } = require('../../utils/prompt');
const chalk = require('chalk');
const inquirer = require('inquirer');

/**
 * Renames a MongoDB collection
 * @param {Object} connection - MongoDB connection object with client and db properties
 * @param {string} oldCollectionName - Current name of the collection to rename
 * @param {string} newCollectionName - New name for the collection
 * @param {Object} options - Command options
 * @returns {Promise<boolean>} True if collection was renamed successfully, false otherwise
 */
async function renameMongoCollection({ client, db: mongoDb }, oldCollectionName, newCollectionName, options) {
  try {
    // If old collection name not provided, prompt for it
    if (!oldCollectionName) {
      oldCollectionName = await promptForCollection({ db: mongoDb }, 'Select collection to rename:');
      if (!oldCollectionName) {
        console.error(chalk.red('No collection selected for renaming.'));
        return false;
      }
    } else {
      // Verify that old collection exists
      const oldCollectionExists = await db.mongodb.collectionExists(mongoDb, oldCollectionName);
      if (!oldCollectionExists) {
        console.error(chalk.red(`Collection "${oldCollectionName}" does not exist`));
        return false;
      }
    }
    
    // If new collection name not provided, prompt for it
    if (!newCollectionName) {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'newCollectionName',
          message: 'Enter the new collection name:',
          validate: (input) => {
            if (input.trim() === '') {
              return 'Collection name cannot be empty';
            }
            // MongoDB collection naming rules
            if (input.length > 128) {
              return 'Collection name must be less than 128 characters';
            }
            if (input.indexOf('$') !== -1) {
              return 'Collection name cannot contain $ character';
            }
            if (input.indexOf('\0') !== -1) {
              return 'Collection name cannot contain null characters';
            }
            return true;
          }
        }
      ]);
      newCollectionName = answers.newCollectionName;
    }
    
    // Verify that new collection name doesn't already exist
    const newCollectionExists = await db.mongodb.collectionExists(mongoDb, newCollectionName);
    if (newCollectionExists) {
      console.error(chalk.red(`Collection "${newCollectionName}" already exists. Please choose a different name.`));
      return false;
    }
    
    // Check if trying to rename system collections
    if (oldCollectionName.startsWith('system.')) {
      console.error(chalk.red(`Cannot rename system collection "${oldCollectionName}"`));
      return false;
    }
    
    // Get document count to inform user
    const documentCount = await mongoDb.collection(oldCollectionName).countDocuments();
    
    // Confirm rename if not using force option
    if (!options.force) {
      const answers = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Are you sure you want to rename collection "${oldCollectionName}" to "${newCollectionName}"? This collection contains ${documentCount} documents.`,
          default: false
        }
      ]);
      
      if (!answers.confirm) {
        console.log(chalk.yellow('Collection rename cancelled.'));
        return false;
      }
    }
    
    // Execute rename operation
    console.log(chalk.cyan(`Renaming collection "${oldCollectionName}" to "${newCollectionName}"...`));
    
    await mongoDb.collection(oldCollectionName).rename(newCollectionName);
    
    console.log(chalk.green(`✓ Collection "${oldCollectionName}" successfully renamed to "${newCollectionName}"`));
    
    return true;
  } catch (error) {
    console.error(chalk.red('Error renaming MongoDB collection:'), error.message);
    return false;
  }
}

module.exports = renameMongoCollection;