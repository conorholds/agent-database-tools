/**
 * @fileoverview MongoDB create collection command implementation
 * @module commands/mongodb/create-table
 * @author DB Tools Team
 * @version 1.0.0
 * 
 * This module provides functionality to create new collections in MongoDB databases.
 * Note: In MongoDB, "tables" are called "collections".
 */

const { confirmAction } = require('../../utils/prompt');
const { validateDatabaseIdentifier, throwIfInvalid } = require('../../utils/validation');
const chalk = require('chalk');

/**
 * Creates a new collection in a MongoDB database
 * 
 * @param {Object} connection - MongoDB connection object
 * @param {string} table - Name of the collection to create
 * @param {string} definition - Ignored for MongoDB (kept for interface compatibility)
 * @param {Object} [options={}] - Command options
 * @param {boolean} [options.force=false] - Skip confirmation prompts
 * @param {boolean} [options.dryRun=false] - Show what would be executed without running
 * 
 * @returns {Promise<boolean>} True if collection was created successfully, false otherwise
 * 
 * @throws {Error} Throws validation errors for invalid inputs
 */
async function createMongoTable(connection, table, definition, options = {}) {
  try {
    // Validate inputs
    const tableValidation = validateDatabaseIdentifier(table, 'Collection name');
    throwIfInvalid(tableValidation);
    
    const { db } = connection;
    
    // Check if collection already exists
    const collections = await db.listCollections({ name: table }).toArray();
    if (collections.length > 0) {
      console.error(chalk.red(`Collection "${table}" already exists`));
      return false;
    }
    
    // Show what will be executed
    console.log(chalk.cyan(`About to create collection: "${table}"`));
    if (definition) {
      console.log(chalk.yellow('Note: MongoDB collections do not require predefined schemas'));
    }
    
    // If dry run, stop here
    if (options.dryRun) {
      console.log(chalk.yellow('Dry run mode - no changes made'));
      return true;
    }
    
    // Confirm action if not forced
    if (!options.force) {
      const confirmed = await confirmAction(
        `Are you sure you want to create collection "${table}"?`
      );
      
      if (!confirmed) {
        console.log('Operation cancelled');
        return false;
      }
    }
    
    // Create the collection
    await db.createCollection(table);
    
    console.log(chalk.green(`✓ Collection "${table}" successfully created`));
    return true;
  } catch (error) {
    console.error(chalk.red('Error creating MongoDB collection:'), error.message);
    return false;
  }
}

module.exports = createMongoTable;