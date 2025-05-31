// src/commands/mongodb/count-records.js
// This file is used to count documents in MongoDB collections with optional statistics

const db = require('../../utils/db');
const { promptForCollection } = require('../../utils/prompt');
const chalk = require('chalk');

/**
 * Counts documents in MongoDB collections with optional statistics
 * @param {Object} connection - MongoDB connection object with client and db properties
 * @param {string} collection - Name of the specific collection to count documents in
 * @param {Object} options - Command options
 * @returns {Promise<boolean>} True if counting was successful, false otherwise
 */
async function countMongoDocuments({ client, db: mongoDb }, collection, options) {
  try {
    // If we want to count all collections
    if (options.all) {
      console.log(chalk.cyan(`Counting documents in all MongoDB collections`));
      
      // Get all collections
      const collections = await db.mongodb.listCollections(mongoDb);
      
      if (collections.length === 0) {
        console.log(chalk.yellow('No collections found in the database'));
        return false;
      }
      
      // Print table header
      console.log(chalk.green('\nCollection Document Counts:'));
      console.log('---------------------------------------------------');
      console.log(`${chalk.bold('Collection Name'.padEnd(40))} | ${chalk.bold('Document Count')}`);
      console.log('---------------------------------------------------');
      
      let totalDocuments = 0;
      
      // Count documents in each collection
      for (const collName of collections) {
        try {
          const documentCount = await mongoDb.collection(collName).countDocuments();
          totalDocuments += documentCount;
          
          console.log(`${collName.padEnd(40)} | ${documentCount.toLocaleString()}`);
        } catch (error) {
          console.log(`${collName.padEnd(40)} | Error: ${error.message}`);
        }
      }
      
      console.log('---------------------------------------------------');
      console.log(`Total: ${collections.length} collections, ${totalDocuments.toLocaleString()} documents`);
      
      return true;
    }
    
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
    
    console.log(chalk.cyan(`Counting documents in MongoDB collection "${collection}"`));
    
    // Build query options
    const query = options.where ? JSON.parse(options.where) : {};
    
    // Count documents
    const documentCount = await mongoDb.collection(collection).countDocuments(query);
    
    console.log(chalk.green(`\nCollection: ${collection}`));
    console.log(`Total documents: ${documentCount.toLocaleString()}`);
    
    // If detailed option is provided, show more statistics
    if (options.detailed) {
      console.log(chalk.cyan('\nField Statistics:'));
      
      // Get sample documents to analyze
      const sampleSize = Math.min(1000, documentCount);
      const sampleDocs = await mongoDb.collection(collection).find({}).limit(sampleSize).toArray();
      
      if (sampleDocs.length === 0) {
        console.log(chalk.yellow('No documents available for analysis'));
        return true;
      }
      
      // Analyze field types and statistics across the sample
      const fieldStats = {};
      
      // First pass - gather all field names and their types
      sampleDocs.forEach(doc => {
        Object.entries(doc).forEach(([field, value]) => {
          if (field === '_id') return; // Skip _id field
          
          if (!fieldStats[field]) {
            fieldStats[field] = {
              field: field,
              types: new Set([getMongoType(value)]),
              values: [value],
              nullCount: value === null ? 1 : 0,
              presentCount: 1
            };
          } else {
            fieldStats[field].types.add(getMongoType(value));
            fieldStats[field].values.push(value);
            if (value === null) fieldStats[field].nullCount++;
            fieldStats[field].presentCount++;
          }
        });
      });
      
      // Second pass - calculate field presence percentage and other stats
      Object.values(fieldStats).forEach(stats => {
        stats.presencePercentage = (stats.presentCount / sampleDocs.length * 100).toFixed(2);
        stats.uniqueValues = new Set(stats.values.map(v => JSON.stringify(v))).size;
        
        // Calculate type-specific statistics
        const commonType = getMostCommonType(stats.types);
        stats.commonType = commonType;
        
        if (commonType === 'string') {
          const lengths = stats.values
            .filter(v => typeof v === 'string')
            .map(v => v.length);
          
          if (lengths.length > 0) {
            stats.minLength = Math.min(...lengths);
            stats.maxLength = Math.max(...lengths);
            stats.avgLength = (lengths.reduce((sum, len) => sum + len, 0) / lengths.length).toFixed(2);
          }
        } else if (commonType === 'number') {
          const numbers = stats.values
            .filter(v => typeof v === 'number');
          
          if (numbers.length > 0) {
            stats.minValue = Math.min(...numbers);
            stats.maxValue = Math.max(...numbers);
            stats.avgValue = (numbers.reduce((sum, num) => sum + num, 0) / numbers.length).toFixed(2);
          }
        } else if (commonType === 'date') {
          const dates = stats.values
            .filter(v => v instanceof Date)
            .map(v => v.getTime());
          
          if (dates.length > 0) {
            stats.minDate = new Date(Math.min(...dates));
            stats.maxDate = new Date(Math.max(...dates));
          }
        } else if (commonType === 'array') {
          const arrays = stats.values
            .filter(v => Array.isArray(v));
          
          if (arrays.length > 0) {
            stats.minItems = Math.min(...arrays.map(a => a.length));
            stats.maxItems = Math.max(...arrays.map(a => a.length));
            stats.avgItems = (arrays.reduce((sum, arr) => sum + arr.length, 0) / arrays.length).toFixed(2);
          }
        }
        
        // Clean up for display
        delete stats.values;
        stats.types = Array.from(stats.types).join(', ');
      });
      
      // Display field statistics
      Object.values(fieldStats).forEach(stats => {
        console.log(`  ${stats.field} (${stats.commonType}):`);
        console.log(`    - Present in: ${stats.presencePercentage}% of documents`);
        console.log(`    - Unique values: ${stats.uniqueValues}`);
        console.log(`    - Null count: ${stats.nullCount}`);
        
        if (stats.commonType === 'string' && stats.minLength !== undefined) {
          console.log(`    - Length range: ${stats.minLength} - ${stats.maxLength} chars`);
          console.log(`    - Average length: ${stats.avgLength} chars`);
        } else if (stats.commonType === 'number' && stats.minValue !== undefined) {
          console.log(`    - Value range: ${stats.minValue} - ${stats.maxValue}`);
          console.log(`    - Average value: ${stats.avgValue}`);
        } else if (stats.commonType === 'date' && stats.minDate) {
          console.log(`    - Date range: ${stats.minDate.toISOString()} - ${stats.maxDate.toISOString()}`);
        } else if (stats.commonType === 'array' && stats.minItems !== undefined) {
          console.log(`    - Array size range: ${stats.minItems} - ${stats.maxItems} items`);
          console.log(`    - Average array size: ${stats.avgItems} items`);
        }
        
        if (stats.types.includes(',')) {
          console.log(`    - Multiple types: ${stats.types}`);
        }
      });
      
      if (sampleSize < documentCount) {
        console.log(chalk.yellow(`\nNote: Statistics based on a sample of ${sampleSize} documents out of ${documentCount}`));
      }
    }
    
    return true;
  } catch (error) {
    console.error(chalk.red('Error counting MongoDB documents:'), error.message);
    return false;
  }
}

/**
 * Gets the type of a MongoDB value
 * @param {any} value - The value to check
 * @returns {string} The type of the value
 */
function getMongoType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (value instanceof Date) return 'date';
  if (value instanceof Buffer) return 'binary';
  if (typeof value === 'object' && value._bsontype === 'ObjectID') return 'objectId';
  return typeof value;
}

/**
 * Gets the most common type from a set of types
 * @param {Set<string>} types - Set of data types
 * @returns {string} The most common type
 */
function getMostCommonType(types) {
  if (types.size === 1) {
    return Array.from(types)[0];
  }
  
  // Prefer certain types in this order if multiple exist
  const typePreference = ['objectId', 'string', 'number', 'boolean', 'date', 'array', 'object', 'null'];
  
  for (const type of typePreference) {
    if (types.has(type)) {
      return type;
    }
  }
  
  return 'mixed';
}

module.exports = countMongoDocuments;