// src/commands/mongodb/remove-column.js
// This file is used to remove a field from a MongoDB collection

const db = require('../../utils/db');
const { promptForTable, confirmAction } = require('../../utils/prompt');
const inquirer = require('inquirer');
const chalk = require('chalk');

/**
 * Removes a field from a MongoDB collection
 * @param {Object} connection - MongoDB connection object with client and db properties
 * @param {string} collection - Name of the collection to remove field from
 * @param {string} field - Name of the field to remove
 * @param {Object} options - Command options
 * @returns {Promise<boolean>} True if field was removed successfully, false otherwise
 */
async function removeMongoField({ client, db: mongoDb }, collection, field, options) {
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
    
    // If field not provided, prompt for it
    if (!field) {
      // Get sample document to suggest fields
      const sampleDocs = await mongoDb.collection(collection).find().limit(1).toArray();
      
      if (sampleDocs.length === 0) {
        console.error(chalk.yellow(`No documents found in collection "${collection}". Cannot suggest fields.`));
        
        const { manualField } = await inquirer.prompt([
          {
            type: 'input',
            name: 'manualField',
            message: 'Enter field name to remove:',
            validate: input => input.trim() !== '' ? true : 'Field name cannot be empty'
          }
        ]);
        
        field = manualField.trim();
      } else {
        // Get fields from sample document
        const sampleFields = Object.keys(sampleDocs[0]).filter(key => key !== '_id');
        
        if (sampleFields.length === 0) {
          console.error(chalk.yellow('No fields found in sample document except _id'));
          return false;
        }
        
        const { selectedField } = await inquirer.prompt([
          {
            type: 'list',
            name: 'selectedField',
            message: 'Select field to remove:',
            choices: sampleFields
          }
        ]);
        
        field = selectedField;
      }
    } else {
      // Verify field exists
      const exists = await db.mongodb.fieldExists(mongoDb, collection, field);
      if (!exists) {
        console.error(chalk.red(`Field "${field}" does not exist in collection "${collection}"`));
        return false;
      }
    }
    
    // Check if field is _id
    if (field === '_id') {
      console.error(chalk.red(`Field "_id" cannot be removed as it is required by MongoDB`));
      return false;
    }
    
    // Count documents that have this field
    const countQuery = {};
    countQuery[field] = { $exists: true };
    const affectedCount = await mongoDb.collection(collection).countDocuments(countQuery);
    
    // Count total documents
    const totalCount = await mongoDb.collection(collection).countDocuments();
    
    console.log(chalk.cyan(`Field "${field}" exists in ${affectedCount} out of ${totalCount} documents in collection "${collection}"`));
    
    // Confirm the operation
    if (!options.force) {
      const confirm = await confirmAction(chalk.red(`Are you sure you want to remove field "${field}" from all documents in collection "${collection}"?`));
      
      if (!confirm) {
        console.log('Field removal canceled');
        return false;
      }
      
      // Double confirm for important collections with many affected documents
      if (affectedCount > 100) {
        const doubleConfirm = await confirmAction(chalk.red(`Final confirmation: Are you ABSOLUTELY SURE you want to remove field "${field}" from ${affectedCount} documents?`));
        
        if (!doubleConfirm) {
          console.log('Field removal canceled');
          return false;
        }
      }
    } else if (affectedCount > 100) {
      console.log(chalk.yellow(`Removing field "${field}" from ${affectedCount} documents (--force enabled, skipping confirmation)`));
    }
    
    // Execute the update
    try {
      console.log(chalk.cyan(`Removing field "${field}" from collection "${collection}"...`));
      
      // Prepare the update operation to unset the field
      const updateOp = {
        $unset: {}
      };
      updateOp.$unset[field] = "";
      
      // Update all documents that have this field
      const result = await mongoDb.collection(collection).updateMany(
        countQuery,
        updateOp
      );
      
      console.log(chalk.green(`✓ Field "${field}" successfully removed from ${result.modifiedCount} documents in collection "${collection}"`));
      return true;
    } catch (error) {
      console.error(chalk.red(`Error removing field:`), error.message);
      return false;
    }
  } catch (error) {
    console.error(chalk.red('Error removing MongoDB field:'), error.message);
    return false;
  }
}

module.exports = removeMongoField;