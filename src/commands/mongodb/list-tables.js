// src/commands/mongodb/list-tables.js
// This file is used to list collections in a MongoDB database with optional details

const dbUtils = require('../../utils/db');
const chalk = require('chalk');

/**
 * Lists collections in a MongoDB database
 * @param {Object} client - MongoDB client instance
 * @param {Object} database - MongoDB database instance
 * @param {Object} options - Command options
 * @returns {Promise<boolean>} True if listing was successful, false otherwise
 */
async function listMongoCollections({ client, db }, options) {
  try {
    const collections = await dbUtils.mongodb.listCollections(db);
    
    if (collections.length === 0) {
      console.log(chalk.yellow('No collections found in the database'));
      return true;
    }
    
    // Basic collection list
    console.log(chalk.green('\nCollection List:'));
    console.log('---------------------------------------------------');
    console.log(`${chalk.bold('Collection Name')}`);
    console.log('---------------------------------------------------');
    
    collections.forEach(collection => {
      console.log(collection);
    });
    
    console.log('---------------------------------------------------');
    console.log(`Total collections: ${collections.length}`);
    
    // If detailed option is provided, show more details
    if (options && options.detailed) {
      console.log(chalk.cyan('\nDetailed Collection Information:'));
      
      for (const collectionName of collections) {
        try {
          // Get collection stats
          const stats = await db.command({ collStats: collectionName });
          
          // Get sample document to infer schema
          const sampleDocs = await db.collection(collectionName).find().limit(1).toArray();
          const sampleDoc = sampleDocs.length > 0 ? sampleDocs[0] : null;
          
          // Get index information
          const indexes = await db.collection(collectionName).indexes();
          
          console.log(chalk.green(`\nCollection: ${collectionName}`));
          console.log(`Size: ${stats.size} bytes`);
          console.log(`Document count: ${stats.count}`);
          
          if (sampleDoc) {
            console.log(chalk.yellow('Fields:'));
            for (const [key, value] of Object.entries(sampleDoc)) {
              console.log(`  - ${key}: ${Array.isArray(value) ? 'array' : typeof value}`);
            }
          }
          
          if (indexes.length > 0) {
            console.log(chalk.yellow(`Indexes (${indexes.length}):`));
            indexes.forEach(idx => {
              const indexFields = Object.entries(idx.key)
                .map(([field, direction]) => `${field}:${direction === 1 ? 'asc' : 'desc'}`)
                .join(', ');
              console.log(`  - ${idx.name}: ${indexFields}`);
            });
          }
          
          // Add a separator between collections
          console.log('---------------------------------------------------');
        } catch (error) {
          console.log(chalk.red(`Error getting details for collection ${collectionName}:`), error.message);
        }
      }
    }
    
    return true;
  } catch (error) {
    console.error(chalk.red('Error listing MongoDB collections:'), error.message);
    return false;
  }
}

module.exports = listMongoCollections;