// src/commands/mongodb/rename-column.js
// This file is used to rename a field in a MongoDB collection

const dbUtils = require('../../utils/db');
const { promptForTable } = require('../../utils/prompt');
const chalk = require('chalk');
const inquirer = require('inquirer');

/**
 * Renames a field in a MongoDB collection
 * @param {Object} connection - MongoDB connection object with client and db properties
 * @param {string} collectionName - Name of the collection
 * @param {string} oldFieldName - Current name of the field to rename
 * @param {string} newFieldName - New name for the field
 * @param {Object} options - Command options
 * @returns {Promise<boolean>} True if field was renamed successfully, false otherwise
 */
async function renameMongoField({ client, db: mongoDb }, collectionName, oldFieldName, newFieldName, options) {
  try {
    // If collection name not provided, prompt for it
    if (!collectionName) {
      collectionName = await promptForCollection({ db: mongoDb });
      if (!collectionName) {
        console.error(chalk.red('No collection selected.'));
        return false;
      }
    } else {
      // Verify that collection exists
      const collectionExistsResult = await dbUtils.mongodb.collectionExists(mongoDb, collectionName);
      if (!collectionExistsResult) {
        console.error(chalk.red(`Collection "${collectionName}" does not exist`));
        return false;
      }
    }
    
    // If old field name not provided, prompt for it
    if (!oldFieldName) {
      // Get sample document to suggest fields
      const sampleDocs = await mongoDb.collection(collectionName).find().limit(1).toArray();
      
      if (sampleDocs.length === 0) {
        console.error(chalk.yellow(`No documents found in collection "${collectionName}". Cannot suggest fields.`));
        
        const { manualField } = await inquirer.prompt([
          {
            type: 'input',
            name: 'manualField',
            message: 'Enter field name to rename:',
            validate: input => input.trim() !== '' ? true : 'Field name cannot be empty'
          }
        ]);
        
        oldFieldName = manualField.trim();
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
            message: 'Select field to rename:',
            choices: sampleFields
          }
        ]);
        
        oldFieldName = selectedField;
      }
    } else {
      // Verify field exists
      const fieldExistsResult = await dbUtils.mongodb.fieldExists(mongoDb, collectionName, oldFieldName);
      if (!fieldExistsResult) {
        console.error(chalk.red(`Field "${oldFieldName}" does not exist in collection "${collectionName}"`));
        return false;
      }
    }
    
    // If new field name not provided, prompt for it
    if (!newFieldName) {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'newFieldName',
          message: 'Enter the new field name:',
          validate: (input) => {
            if (input.trim() === '') {
              return 'Field name cannot be empty';
            }
            return true;
          }
        }
      ]);
      newFieldName = answers.newFieldName;
    }
    
    // Check if new field name already exists in any document
    const existingDocs = await mongoDb.collection(collectionName).countDocuments({
      [newFieldName]: { $exists: true }
    });
    
    if (existingDocs > 0) {
      console.error(chalk.red(`Field "${newFieldName}" already exists in ${existingDocs} documents in collection "${collectionName}". Please choose a different name.`));
      return false;
    }
    
    // Check if trying to rename _id field
    if (oldFieldName === '_id') {
      console.error(chalk.red(`Cannot rename the "_id" field as it is required by MongoDB`));
      return false;
    }
    
    // Count documents with this field
    const affectedDocs = await mongoDb.collection(collectionName).countDocuments({
      [oldFieldName]: { $exists: true }
    });
    
    if (affectedDocs === 0) {
      console.error(chalk.yellow(`No documents found with field "${oldFieldName}" in collection "${collectionName}"`));
      
      // Confirm proceeding even with no documents
      if (!options.force) {
        const { proceed } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'proceed',
            message: 'Continue with renaming even though no documents will be affected?',
            default: false
          }
        ]);
        
        if (!proceed) {
          console.log(chalk.yellow('Field rename cancelled.'));
          return false;
        }
      }
    }
    
    // Confirm rename if not using force option
    if (!options.force) {
      const answers = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Are you sure you want to rename field "${oldFieldName}" to "${newFieldName}" in ${affectedDocs} documents in collection "${collectionName}"?`,
          default: false
        }
      ]);
      
      if (!answers.confirm) {
        console.log(chalk.yellow('Field rename cancelled.'));
        return false;
      }
    }
    
    // Execute the rename operation
    console.log(chalk.cyan(`Renaming field "${oldFieldName}" to "${newFieldName}" in collection "${collectionName}"...`));
    
    const result = await mongoDb.collection(collectionName).updateMany(
      { [oldFieldName]: { $exists: true } },
      { $rename: { [oldFieldName]: newFieldName } }
    );
    
    console.log(chalk.green(`✓ Field "${oldFieldName}" successfully renamed to "${newFieldName}" in ${result.modifiedCount} documents in collection "${collectionName}"`));
    
    return true;
  } catch (error) {
    console.error(chalk.red('Error renaming MongoDB field:'), error.message);
    return false;
  }
}

module.exports = renameMongoField;