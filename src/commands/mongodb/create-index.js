// src/commands/mongodb/create-index.js
// This file is used to create an index on a MongoDB collection field for improved query performance

const db = require('../../utils/db');
const { confirmAction } = require('../../utils/prompt');
const inquirer = require('inquirer');
const chalk = require('chalk');

/**
 * Creates an index on a MongoDB collection field
 * @param {Object} connection - MongoDB connection object with client and db properties
 * @param {string} collection - Name of the collection
 * @param {string} field - Name of the field to create index on
 * @param {Object} options - Command options
 * @returns {Promise<boolean>} True if index was created successfully, false otherwise
 */
async function createMongoIndex({ client, db: mongoDb }, collection, field, options) {
  try {
    // If collection not provided, prompt for it
    if (!collection) {
      const collections = await db.mongodb.listCollections(mongoDb);
      
      if (collections.length === 0) {
        console.error(chalk.red('No collections found in the database'));
        return false;
      }
      
      const { selectedCollection } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedCollection',
          message: 'Select collection:',
          choices: collections
        }
      ]);
      
      collection = selectedCollection;
    } else {
      // Verify collection exists
      const exists = await db.mongodb.collectionExists(mongoDb, collection);
      if (!exists) {
        console.error(chalk.red(`Collection "${collection}" does not exist`));
        return false;
      }
    }
    
    // If field not provided, prompt for it
    let fields = [];
    
    if (!field) {
      // Get sample document to suggest fields
      const sampleDocs = await mongoDb.collection(collection).find().limit(1).toArray();
      
      if (sampleDocs.length === 0) {
        console.error(chalk.yellow(`No documents found in collection "${collection}". You'll need to specify field names manually.`));
        
        const { manualField } = await inquirer.prompt([
          {
            type: 'input',
            name: 'manualField',
            message: 'Enter field name for index:',
            validate: input => input.trim() !== '' ? true : 'Field name cannot be empty'
          }
        ]);
        
        fields = [manualField.trim()];
      } else {
        // Get fields from sample document
        const sampleFields = Object.keys(sampleDocs[0]).filter(key => key !== '_id');
        
        if (sampleFields.length === 0) {
          console.error(chalk.yellow('No fields found in sample document except _id'));
          return false;
        }
        
        const { selectedFields } = await inquirer.prompt([
          {
            type: 'checkbox',
            name: 'selectedFields',
            message: 'Select fields to include in the index:',
            choices: sampleFields,
            validate: input => input.length > 0 ? true : 'You must select at least one field'
          }
        ]);
        
        fields = selectedFields;
      }
    } else {
      // Use provided field
      // Note: MongoDB doesn't require the field to exist in all documents
      fields = [field];
    }
    
    // Ask for index direction if not using --force
    let indexDirections = {};
    
    if (!options.force) {
      for (const field of fields) {
        const { direction } = await inquirer.prompt([
          {
            type: 'list',
            name: 'direction',
            message: `Select index direction for field "${field}":`,
            choices: [
              { name: 'Ascending (1)', value: 1 },
              { name: 'Descending (-1)', value: -1 },
              { name: 'Text', value: 'text' }
            ],
            default: 1
          }
        ]);
        
        indexDirections[field] = direction;
      }
    } else {
      // Default to ascending for all fields when --force is used
      fields.forEach(field => {
        indexDirections[field] = 1;
      });
      console.log(`Using default ascending index direction for all fields (--force enabled, skipping prompt)`);
    }
    
    // Check if this exact index already exists
    const existingIndexes = await mongoDb.collection(collection).indexes();
    const indexAlreadyExists = existingIndexes.some(idx => {
      const idxKeys = idx.key;
      const allFieldsMatch = fields.every(field => 
        idxKeys.hasOwnProperty(field) && idxKeys[field] === indexDirections[field]
      );
      return allFieldsMatch && Object.keys(idxKeys).length === fields.length + (idxKeys._id ? 1 : 0);
    });
    
    if (indexAlreadyExists) {
      console.error(chalk.red(`An index with these exact fields and directions already exists on collection "${collection}"`));
      return false;
    }
    
    // Generate index name
    const indexName = `idx_${collection}_${fields.join('_')}`;
    
    // Prepare index creation options
    const indexOptions = {
      name: indexName
    };
    
    if (options.unique) {
      indexOptions.unique = true;
    }
    
    if (options.expireAfterSeconds) {
      indexOptions.expireAfterSeconds = parseInt(options.expireAfterSeconds);
    }
    
    // Confirm the operation
    console.log(chalk.cyan('About to create index:'));
    console.log(JSON.stringify({
      collection: collection,
      fields: indexDirections,
      options: indexOptions
    }, null, 2));
    
    if (!options.force) {
      const confirm = await confirmAction(`Are you sure you want to create a${options.unique ? ' unique' : 'n'} index on ${fields.length > 1 ? 'fields' : 'field'} "${fields.join(', ')}" for collection "${collection}"?`);
      
      if (!confirm) {
        console.log('Operation canceled');
        return false;
      }
    }
    
    // Create the index
    try {
      await mongoDb.collection(collection).createIndex(indexDirections, indexOptions);
      console.log(chalk.green(`✓ Index "${indexName}" successfully created on collection "${collection}"`));
      return true;
    } catch (error) {
      console.error(chalk.red(`Error creating index:`), error.message);
      return false;
    }
  } catch (error) {
    console.error(chalk.red('Error creating MongoDB index:'), error.message);
    return false;
  }
}

module.exports = createMongoIndex;