// src/commands/mongodb/list-fields.js
// This file is used to list fields in a MongoDB collection

const db = require('../../utils/db');
const inquirer = require('inquirer');
const chalk = require('chalk');

/**
 * Lists fields in a MongoDB collection
 * @param {Object} connection - MongoDB connection object with client and db properties
 * @param {string} collection - Name of the collection
 * @param {Object} options - Command options
 * @returns {Promise<boolean>} True if listing was successful, false otherwise
 */
async function listMongoFields({ client, db }, collection, options) {
  try {
    // If collection not provided, prompt for it
    if (!collection) {
      const collections = await db.mongodb.listCollections(db);
      
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
      const exists = await db.mongodb.collectionExists(db, collection);
      if (!exists) {
        console.error(chalk.red(`Collection "${collection}" does not exist`));
        return false;
      }
    }
    
    console.log(chalk.cyan(`Analyzing fields for collection "${collection}"`));
    
    // We need to analyze documents to determine field types
    const sampleSize = 100; // Analyze up to 100 documents for field structure
    const documents = await db.collection(collection).find().limit(sampleSize).toArray();
    
    if (documents.length === 0) {
      console.log(chalk.yellow(`No documents found in collection "${collection}"`));
      return false;
    }
    
    // Analyze field structure
    const fieldStats = {};
    
    documents.forEach(doc => {
      analyzeDocument(doc, fieldStats);
    });
    
    // Sort fields by frequency (most common first)
    const sortedFields = Object.keys(fieldStats).sort((a, b) => {
      // Always put _id first
      if (a === '_id') return -1;
      if (b === '_id') return 1;
      
      // Then sort by frequency (documents containing the field)
      return fieldStats[b].count - fieldStats[a].count;
    });
    
    // Print results in a table format
    console.log(chalk.green('\nField Analysis:'));
    console.log('----------------------------------------------------------------------------------------');
    console.log(`${chalk.bold('Field Name'.padEnd(30))} | ${chalk.bold('Types'.padEnd(30))} | ${chalk.bold('Present In'.padEnd(10))} | ${chalk.bold('Has Index')}`);
    console.log('----------------------------------------------------------------------------------------');
    
    // Get all indexes for this collection
    const indexes = await db.collection(collection).indexes();
    const indexedFields = new Set();
    
    // Extract indexed fields from all indexes
    indexes.forEach(index => {
      Object.keys(index.key).forEach(field => {
        indexedFields.add(field);
      });
    });
    
    sortedFields.forEach(fieldName => {
      const stats = fieldStats[fieldName];
      const types = Array.from(stats.types).join(', ');
      const percentage = Math.round((stats.count / documents.length) * 100) + '%';
      const hasIndex = indexedFields.has(fieldName) ? 'YES' : 'NO';
      
      // Colorize field name if it's indexed
      const colorizedName = indexedFields.has(fieldName) ? chalk.green(fieldName) : fieldName;
      
      console.log(
        `${colorizedName.padEnd(30)} | ` +
        `${types.padEnd(30)} | ` +
        `${percentage.padEnd(10)} | ` +
        `${hasIndex}`
      );
    });
    
    console.log('----------------------------------------------------------------------------------------');
    console.log(`Total unique fields: ${sortedFields.length}`);
    console.log(`Analysis based on ${documents.length} document${documents.length !== 1 ? 's' : ''}`);
    
    // Show index information if any
    if (indexes.length > 0) {
      console.log(chalk.cyan('\nIndexes:'));
      
      indexes.forEach(index => {
        // Skip the _id index which is created by default
        if (index.name === '_id_' && Object.keys(index.key).length === 1 && index.key._id === 1) {
          console.log(`  _id_ (default): { _id: 1 }`);
          return;
        }
        
        const indexFields = Object.entries(index.key)
          .map(([field, direction]) => `${field}: ${direction}`)
          .join(', ');
        
        const uniqueLabel = index.unique ? ' (UNIQUE)' : '';
        console.log(`  ${index.name}${uniqueLabel}: { ${indexFields} }`);
      });
    }
    
    return true;
  } catch (error) {
    console.error(chalk.red('Error analyzing MongoDB fields:'), error.message);
    return false;
  }
}

/**
 * Recursively analyzes document fields and updates field statistics
 * @param {Object} doc - Document to analyze
 * @param {Object} fieldStats - Field statistics object to update
 * @param {string} prefix - Field name prefix for nested fields
 */
function analyzeDocument(doc, fieldStats, prefix = '') {
  for (const [key, value] of Object.entries(doc)) {
    const fieldName = prefix ? `${prefix}.${key}` : key;
    
    // Initialize field stats if not already present
    if (!fieldStats[fieldName]) {
      fieldStats[fieldName] = {
        count: 0,
        types: new Set()
      };
    }
    
    // Increment document count for this field
    fieldStats[fieldName].count++;
    
    // Determine value type
    let type;
    if (value === null) {
      type = 'null';
    } else if (Array.isArray(value)) {
      type = 'array';
      
      // Optionally analyze array contents
      if (value.length > 0) {
        // Get type of first array element
        const elementType = typeof value[0];
        if (elementType === 'object' && value[0] !== null) {
          type = `array(object)`;
          
          // Analyze first few elements
          const sampleSize = Math.min(value.length, 3);
          for (let i = 0; i < sampleSize; i++) {
            if (typeof value[i] === 'object' && value[i] !== null) {
              // Use a dot notation for array elements
              analyzeDocument(value[i], fieldStats, `${fieldName}[*]`);
            }
          }
        } else {
          type = `array(${elementType})`;
        }
      }
    } else if (typeof value === 'object') {
      type = 'object';
      // Recursively analyze nested objects
      analyzeDocument(value, fieldStats, fieldName);
    } else {
      type = typeof value;
    }
    
    // Add this type to the set of observed types
    fieldStats[fieldName].types.add(type);
  }
}

module.exports = listMongoFields;