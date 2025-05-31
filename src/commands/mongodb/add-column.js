// src/commands/mongodb/add-column.js
// This file is used to add a new field to a MongoDB collection

const db = require('../../utils/db');
const { promptForCollection, confirmAction } = require('../../utils/prompt');
const inquirer = require('inquirer');
const chalk = require('chalk');

/**
 * Adds a new field to a MongoDB collection
 * @param {Object} connection - MongoDB connection object with client and db properties
 * @param {string} collection - Name of the collection to add field to
 * @param {string} field - Name of the field to add
 * @param {string} datatype - Data type of the new field
 * @param {Object} options - Command options
 * @returns {Promise<boolean>} True if field was added successfully, false otherwise
 */
async function addMongoField({ client, db: mongoDb }, collection, field, datatype, options) {
  try {
    // If collection not provided, prompt for it
    if (!collection) {
      collection = await promptForCollection({ db: mongoDb });
      if (!collection) {
        return false;
      }
    } else {
      // Verify that collection exists
      const exists = await db.mongodb.collectionExists(mongoDb, collection);
      if (!exists) {
        console.error(chalk.red(`Collection "${collection}" does not exist`));
        return false;
      }
    }

    // If field or datatype not provided, prompt for them
    if (!field || !datatype) {
      const fieldData = await promptForFieldData();
      field = fieldData.name;
      datatype = fieldData.type;
      options.default = fieldData.defaultValue;
      options.notNull = fieldData.notNull;
    }

    // Check if field already exists
    const exists = await db.mongodb.fieldExists(mongoDb, collection, field);
    if (exists) {
      console.error(
        chalk.red(`Field "${field}" already exists in collection "${collection}"`)
      );
      return false;
    }

    // MongoDB treats schema differently than PostgreSQL
    // We need to update all documents to add the new field
    const updateQuery = {};
    
    // Set the update operation
    if (options.default !== undefined) {
      // Add the field with the default value
      updateQuery[field] = parseMongoValue(options.default, datatype);
    } else if (options.notNull) {
      // If notNull is specified without a default, we'll set an appropriate empty value
      updateQuery[field] = getEmptyValueForType(datatype);
    } else {
      // Set to null if no default and not notNull
      updateQuery[field] = null;
    }

    // Get document count to check if collection has documents
    const count = await mongoDb.collection(collection).countDocuments();
    
    if (count > 0) {
      // Confirm the operation
      console.log(chalk.cyan(`About to add field "${field}" to all ${count} documents in collection "${collection}"`));
      
      if (options.default !== undefined) {
        console.log(`Field will be set to: ${JSON.stringify(updateQuery[field])}`);
      } else if (options.notNull) {
        console.log(`Field will be set to a default ${datatype} value: ${JSON.stringify(updateQuery[field])}`);
      } else {
        console.log(`Field will be set to null`);
      }

      if (!options.force) {
        const confirm = await confirmAction(
          `Are you sure you want to add field "${field}" to collection "${collection}"?`
        );

        if (!confirm) {
          console.log("Operation canceled");
          return false;
        }
      }

      // Execute the update
      try {
        const result = await mongoDb.collection(collection).updateMany(
          {}, // Match all documents
          { $set: updateQuery }
        );
        
        console.log(
          chalk.green(
            `✓ Field "${field}" successfully added to ${result.modifiedCount} documents in collection "${collection}"`
          )
        );
        return true;
      } catch (error) {
        console.error(chalk.red(`Error adding field:`), error.message);
        return false;
      }
    } else {
      // No documents in collection, just confirm the operation
      console.log(chalk.cyan(`Collection "${collection}" is empty. Field "${field}" will be added to new documents.`));
      console.log(chalk.yellow(`Note: MongoDB is schema-less, so the field will only appear when documents are inserted.`));
      
      // We should return true since the operation is technically successful
      return true;
    }
  } catch (error) {
    console.error(chalk.red('Error adding MongoDB field:'), error.message);
    return false;
  }
}

/**
 * Converts a string value to the appropriate type based on the data type
 * @param {string} value - The string value to convert
 * @param {string} type - The target data type
 * @returns {any} The converted value
 */
function parseMongoValue(value, type) {
  switch (type.toLowerCase()) {
    case 'number':
    case 'int':
    case 'integer':
    case 'float':
    case 'double':
      return Number(value);
    case 'boolean':
      return value.toLowerCase() === 'true';
    case 'date':
      return new Date(value);
    case 'array':
      try {
        return JSON.parse(value);
      } catch (e) {
        return [];
      }
    case 'object':
      try {
        return JSON.parse(value);
      } catch (e) {
        return {};
      }
    default:
      return value;
  }
}

/**
 * Returns an empty/default value for a given type
 * @param {string} type - The data type
 * @returns {any} An appropriate empty value for the type
 */
function getEmptyValueForType(type) {
  switch (type.toLowerCase()) {
    case 'number':
    case 'int':
    case 'integer':
    case 'float':
    case 'double':
      return 0;
    case 'boolean':
      return false;
    case 'date':
      return new Date();
    case 'array':
      return [];
    case 'object':
      return {};
    default:
      return '';
  }
}

/**
 * Prompts the user for field details when adding a new field
 * @returns {Promise<Object>} Field details including name, type, notNull, and defaultValue
 */
async function promptForFieldData() {
  const questions = [
    {
      type: "input",
      name: "name",
      message: "Field name:",
      validate: (input) =>
        input.trim() !== "" ? true : "Field name cannot be empty",
    },
    {
      type: "list",
      name: "type",
      message: "Data type:",
      choices: [
        "String",
        "Number",
        "Integer",
        "Boolean",
        "Date",
        "Array",
        "Object",
        "Other (specify)",
      ],
    },
    {
      type: "input",
      name: "customType",
      message: "Specify custom data type:",
      when: (answers) => answers.type === "Other (specify)",
      validate: (input) =>
        input.trim() !== "" ? true : "Type cannot be empty",
    },
    {
      type: "confirm",
      name: "notNull",
      message: "Not nullable? (Will use type-appropriate default value)",
      default: false,
    },
    {
      type: "confirm",
      name: "hasDefault",
      message: "Set default value?",
      default: false,
    },
    {
      type: "input",
      name: "defaultValue",
      message: "Default value (enter valid JSON for complex types):",
      when: (answers) => answers.hasDefault,
      validate: (input) =>
        input.trim() !== "" ? true : "Default value cannot be empty",
    },
  ];

  const answers = await inquirer.prompt(questions);

  return {
    name: answers.name,
    type:
      answers.type === "Other (specify)" ? answers.customType : answers.type,
    notNull: answers.notNull,
    defaultValue: answers.hasDefault ? answers.defaultValue : undefined,
  };
}

module.exports = addMongoField;