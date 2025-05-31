// src/commands/mongodb/delete-collection.js
// This file is used to delete a collection from a MongoDB database

const db = require('../../utils/db');
const { promptForCollection, confirmAction } = require('../../utils/prompt');
const chalk = require('chalk');

/**
 * Deletes a collection from a MongoDB database
 * @param {Object} connection - MongoDB connection object with client and db properties
 * @param {string} collection - Name of the collection to delete
 * @param {Object} options - Command options
 * @returns {Promise<boolean>} True if collection was deleted successfully, false otherwise
 */
async function deleteMongoCollection({ client, db: mongoDb }, collection, options) {
  try {
    // If collection not provided, prompt for it
    if (!collection) {
      collection = await promptForCollection({ db: mongoDb });
      if (!collection) {
        return false;
      }
    } else {
      // Verify collection exists
      const exists = await db.mongodb.collectionExists(mongoDb, collection);
      if (!exists) {
        console.error(chalk.red(`Collection "${collection}" does not exist`));
        return false;
      }
    }
    
    // Check if this is a system collection that should not be deleted
    const systemCollections = ['migrations', 'system.indexes', 'system.users', 'system.version'];
    if (systemCollections.includes(collection) || collection.startsWith('system.')) {
      console.error(chalk.red(`Collection "${collection}" is a system collection and should not be deleted`));
      
      if (!options.force) {
        const overrideCheck = await confirmAction(chalk.red(`Are you ABSOLUTELY SURE you want to delete system collection "${collection}"? This may break database functionality.`));
        
        if (!overrideCheck) {
          console.log('Delete operation canceled');
          return false;
        }
      } else {
        console.log(chalk.yellow('Deleting system collection due to --force option.'));
      }
    }
    
    // Get document count
    const documentCount = await mongoDb.collection(collection).countDocuments();
    
    // Confirm the operation
    console.log(chalk.yellow(`Collection "${collection}" contains ${documentCount} documents that will be permanently deleted.`));
    
    if (!options.force) {
      const confirm = await confirmAction(chalk.red(`Are you sure you want to delete collection "${collection}" and all its data? This is irreversible!`));
      
      if (!confirm) {
        console.log('Delete operation canceled');
        return false;
      }
      
      // Double confirmation for collections with data
      if (documentCount > 0) {
        const doubleConfirm = await confirmAction(chalk.red(`Final confirmation: Are you ABSOLUTELY SURE you want to delete collection "${collection}" with ${documentCount} documents?`));
        
        if (!doubleConfirm) {
          console.log('Delete operation canceled');
          return false;
        }
      }
    } else {
      console.log(chalk.yellow('Proceeding with deletion due to --force option.'));
    }
    
    // Execute the query
    try {
      console.log(chalk.cyan(`Deleting collection "${collection}"...`));
      
      // Drop the collection
      await mongoDb.collection(collection).drop();
      
      console.log(chalk.green(`✓ Collection "${collection}" successfully deleted`));
      return true;
    } catch (error) {
      console.error(chalk.red(`Error deleting collection:`), error.message);
      return false;
    }
  } catch (error) {
    console.error(chalk.red('Error deleting MongoDB collection:'), error.message);
    return false;
  }
}

module.exports = deleteMongoCollection;