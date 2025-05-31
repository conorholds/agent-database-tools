// src/utils/db/mongodb.js
// This file contains MongoDB-specific database utility functions

const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

/**
 * Creates a MongoDB client connection for a specific project
 * @param {Object} connection - Database connection configuration object
 * @param {Object} options - Additional connection options
 * @param {string} [options.database] - Optional database name to override the default in connection URI
 * @returns {Promise<Object>} MongoDB client and database instance
 */
async function createClient(connection, options = {}) {
  try {
    // Get the connection URI
    let connectionUri = connection.mongodb_uri;
    let dbName = options.database;
    
    // If no override database name is provided, use the one from the URI
    if (!dbName) {
      // Extract database name from the MongoDB URI if it exists
      const uriParts = connectionUri.split('/');
      if (uriParts.length > 3) {
        // The URI format is mongodb://hostname/database
        dbName = uriParts[3].split('?')[0]; // Remove query parameters if they exist
      }
    }

    // Create MongoDB client
    const client = new MongoClient(connectionUri);
    await client.connect();
    
    // Use the specified database
    const db = client.db(dbName);
    console.log(`Connected to MongoDB database: ${dbName}`);
    
    return { client, db };
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    throw error;
  }
}

/**
 * Closes a MongoDB client connection
 * @param {Object} client - MongoDB client
 * @returns {Promise<void>}
 */
async function closeClient(client) {
  if (client) {
    await client.close();
  }
}

/**
 * Executes a MongoDB query with parameters
 * @param {Object} db - MongoDB database instance
 * @param {string} collection - Collection name to query
 * @param {Object} query - Query object or pipeline
 * @param {Object} options - Additional query options
 * @returns {Promise<Array>} Query result
 * @throws Will throw error if query fails
 */
async function executeQuery(db, collection, query, options = {}) {
  try {
    const coll = db.collection(collection);
    
    // Determine query type based on options
    if (options.aggregation) {
      // Assume query is a pipeline for aggregation
      const result = await coll.aggregate(query).toArray();
      return result;
    } else if (options.findOne) {
      // Find a single document
      const result = await coll.findOne(query);
      return result;
    } else {
      // Default to find operation
      const result = await coll.find(query).toArray();
      return result;
    }
  } catch (error) {
    console.error('MongoDB query error:', error.message);
    throw error;
  }
}

/**
 * Executes a MongoDB update operation
 * @param {Object} db - MongoDB database instance
 * @param {string} collection - Collection name to update
 * @param {Object} filter - Filter to select documents
 * @param {Object} update - Update operations to perform
 * @param {Object} options - Additional update options
 * @returns {Promise<Object>} Update result
 * @throws Will throw error if update fails
 */
async function executeUpdate(db, collection, filter, update, options = {}) {
  try {
    const coll = db.collection(collection);
    
    if (options.updateOne) {
      const result = await coll.updateOne(filter, update, options);
      return result;
    } else if (options.replaceOne) {
      const result = await coll.replaceOne(filter, update, options);
      return result;
    } else {
      // Default to updateMany
      const result = await coll.updateMany(filter, update, options);
      return result;
    }
  } catch (error) {
    console.error('MongoDB update error:', error.message);
    throw error;
  }
}

/**
 * Executes multiple MongoDB operations in a transaction
 * @param {Object} client - MongoDB client instance
 * @param {Object} db - MongoDB database instance
 * @param {Array<Function>} operations - Array of operations to execute within the transaction
 * @returns {Promise<Array>} Array of operation results
 * @throws Will throw error if transaction fails
 */
async function executeTransaction(client, db, operations) {
  const session = client.startSession();
  
  try {
    const results = [];
    await session.withTransaction(async () => {
      for (const operation of operations) {
        const result = await operation(db, session);
        results.push(result);
      }
    });
    
    return results;
  } catch (error) {
    console.error('MongoDB transaction error:', error.message);
    throw error;
  } finally {
    await session.endSession();
  }
}

/**
 * Lists all collections in the database
 * @param {Object} db - MongoDB database instance
 * @returns {Promise<Array<string>>} Array of collection names
 */
async function listCollections(db) {
  try {
    const collections = await db.listCollections().toArray();
    return collections.map(col => col.name);
  } catch (error) {
    console.error('Error listing collections:', error.message);
    throw error;
  }
}

/**
 * Gets information about a collection
 * @param {Object} db - MongoDB database instance
 * @param {string} collectionName - Name of the collection
 * @returns {Promise<Object>} Collection information
 */
async function getCollectionInfo(db, collectionName) {
  try {
    // Get collection stats
    const stats = await db.command({ collStats: collectionName });
    
    // Get a sample document to infer schema
    const sampleDocs = await db.collection(collectionName).find().limit(1).toArray();
    const sampleDoc = sampleDocs.length > 0 ? sampleDocs[0] : null;
    
    // Infer field types from sample document
    const fields = [];
    if (sampleDoc) {
      for (const [key, value] of Object.entries(sampleDoc)) {
        fields.push({
          field_name: key,
          data_type: Array.isArray(value) ? 'array' : typeof value
        });
      }
    }
    
    return {
      name: collectionName,
      count: stats.count,
      size: stats.size,
      avg_obj_size: stats.avgObjSize,
      fields: fields
    };
  } catch (error) {
    console.error(`Error getting collection info for ${collectionName}:`, error.message);
    throw error;
  }
}

/**
 * Checks if a collection exists in the database
 * @param {Object} db - MongoDB database instance
 * @param {string} collectionName - Name of the collection to check
 * @returns {Promise<boolean>} True if collection exists, false otherwise
 */
async function collectionExists(db, collectionName) {
  try {
    const collections = await db.listCollections({ name: collectionName }).toArray();
    return collections.length > 0;
  } catch (error) {
    console.error('Error checking if collection exists:', error.message);
    throw error;
  }
}

/**
 * Checks if a field exists in a specific collection
 * @param {Object} db - MongoDB database instance
 * @param {string} collectionName - Name of the collection
 * @param {string} fieldName - Name of the field to check
 * @returns {Promise<boolean>} True if field exists in at least one document, false otherwise
 */
async function fieldExists(db, collectionName, fieldName) {
  try {
    if (!(await collectionExists(db, collectionName))) {
      return false;
    }
    
    // Create a query to check if any document has this field
    const query = {};
    query[fieldName] = { $exists: true };
    
    const count = await db.collection(collectionName).countDocuments(query, { limit: 1 });
    return count > 0;
  } catch (error) {
    console.error('Error checking if field exists:', error.message);
    throw error;
  }
}

/**
 * Checks if an index exists for a specific collection and field
 * @param {Object} db - MongoDB database instance
 * @param {string} collectionName - Name of the collection
 * @param {string} fieldName - Name of the field to check for index
 * @returns {Promise<boolean>} True if index exists, false otherwise
 */
async function indexExists(db, collectionName, fieldName) {
  try {
    if (!(await collectionExists(db, collectionName))) {
      return false;
    }
    
    const indexes = await db.collection(collectionName).indexes();
    
    // Check if any index includes this field
    return indexes.some(index => Object.keys(index.key).includes(fieldName));
  } catch (error) {
    console.error('Error checking if index exists:', error.message);
    throw error;
  }
}

/**
 * Gets all indexes for a collection
 * @param {Object} db - MongoDB database instance
 * @param {string} collectionName - Name of the collection
 * @returns {Promise<Array<Object>>} Array of index information objects
 */
async function getCollectionIndexes(db, collectionName) {
  try {
    if (!(await collectionExists(db, collectionName))) {
      return [];
    }
    
    return await db.collection(collectionName).indexes();
  } catch (error) {
    console.error(`Error getting indexes for ${collectionName}:`, error.message);
    throw error;
  }
}

/**
 * Checks if mongodump/mongorestore tools are available
 * @param {string} tool - Name of the MongoDB tool to check (e.g., 'mongodump', 'mongorestore')
 * @returns {boolean} True if tool is available, false otherwise
 */
function isMongoToolAvailable(tool) {
  try {
    execSync(`${tool} --version`, { stdio: 'ignore' });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Creates a backup of a MongoDB database
 * @param {Object} connection - Database connection configuration object
 * @param {string} outputDir - Directory to write the backup files
 * @param {Object} [options={}] - Backup options
 * @param {boolean} [options.encrypt=false] - Whether to encrypt the backup
 * @returns {Promise<boolean>} True if backup was successful, false otherwise
 */
async function createDatabaseBackup(connection, outputDir, options = {}) {
  // Set default options
  const encrypt = options.encrypt || false;
  
  try {
    // Check if mongodump is available
    if (!isMongoToolAvailable('mongodump')) {
      throw new Error('mongodump command not found. Please install MongoDB database tools.');
    }
    
    // Create backup directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Extract database name from URI
    const uriParts = connection.mongodb_uri.split('/');
    let dbName = '';
    
    if (uriParts.length > 3) {
      dbName = uriParts[3].split('?')[0]; // Remove query parameters if they exist
    }
    
    if (!dbName) {
      throw new Error('Could not determine database name from MongoDB URI');
    }
    
    // Create a temporary directory for mongodump
    const tempDir = path.join(outputDir, 'temp_' + Date.now());
    fs.mkdirSync(tempDir, { recursive: true });
    
    // Generate backup filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(outputDir, `${dbName}_${timestamp}.archive`);
    
    // Execute mongodump
    console.log(`Creating backup of MongoDB database ${dbName}...`);
    execSync(`mongodump --uri="${connection.mongodb_uri}" --archive="${backupFile}" --gzip`);
    
    // If encryption is requested, encrypt the backup
    if (encrypt) {
      console.log('Encrypting backup...');
      const key = crypto.randomBytes(32); // Generate a random 32-byte key
      const iv = crypto.randomBytes(16);  // Generate a random 16-byte IV
      
      // Load the backup file
      const backupData = fs.readFileSync(backupFile);
      
      // Create cipher
      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
      
      // Encrypt the data
      const encrypted = Buffer.concat([
        iv,
        cipher.update(backupData),
        cipher.final()
      ]);
      
      // Write encrypted data back to the backup file
      const encryptedBackupFile = backupFile + '.enc';
      fs.writeFileSync(encryptedBackupFile, encrypted);
      
      // Save the key to a separate file
      const keyFile = encryptedBackupFile + '.key';
      fs.writeFileSync(keyFile, key);
      
      // Remove the unencrypted backup
      fs.unlinkSync(backupFile);
      
      console.log(`Encrypted database backup saved to ${encryptedBackupFile}`);
      console.log(`Encryption key saved to ${keyFile}`);
      
      // Clean up temporary directory
      fs.rmSync(tempDir, { recursive: true, force: true });
      
      return { success: true, backupFile: encryptedBackupFile };
    } else {
      console.log(`Database backup saved to ${backupFile}`);
      
      // Clean up temporary directory
      fs.rmSync(tempDir, { recursive: true, force: true });
      
      return { success: true, backupFile };
    }
  } catch (error) {
    console.error('Error backing up MongoDB database:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Restores a MongoDB database from a backup file
 * @param {Object} connection - Database connection configuration object
 * @param {string} backupFile - Path to the backup file
 * @param {Object} [options={}] - Restore options
 * @param {boolean} [options.dropBeforeRestore=false] - Whether to drop the database before restoring
 * @returns {Promise<Object>} Result object with success status and message
 */
async function restoreDatabase(connection, backupFile, options = {}) {
  // Set default options
  const dropBeforeRestore = options.dropBeforeRestore || false;
  
  try {
    // Check if mongorestore is available
    if (!isMongoToolAvailable('mongorestore')) {
      throw new Error('mongorestore command not found. Please install MongoDB database tools.');
    }
    
    // Check if backup file exists
    if (!fs.existsSync(backupFile)) {
      throw new Error(`Backup file ${backupFile} not found`);
    }
    
    // Check if file is encrypted (ends with .enc)
    const isEncrypted = backupFile.endsWith('.enc');
    let fileToRestore = backupFile;
    
    // If encrypted, decrypt first
    if (isEncrypted) {
      console.log('Backup file is encrypted, decrypting...');
      
      // Check for key file
      const keyFile = backupFile + '.key';
      if (!fs.existsSync(keyFile)) {
        throw new Error(`Encryption key file ${keyFile} not found`);
      }
      
      // Read the key and encrypted data
      const key = fs.readFileSync(keyFile);
      const encryptedData = fs.readFileSync(backupFile);
      
      // Extract IV and encrypted content
      const iv = encryptedData.slice(0, 16);
      const encryptedContent = encryptedData.slice(16);
      
      // Create decipher and decrypt
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      const decrypted = Buffer.concat([
        decipher.update(encryptedContent),
        decipher.final()
      ]);
      
      // Write to temporary file
      fileToRestore = backupFile + '.decrypted';
      fs.writeFileSync(fileToRestore, decrypted);
      console.log('Decryption completed');
    }
    
    // Extract database name from URI
    const uriParts = connection.mongodb_uri.split('/');
    let dbName = '';
    
    if (uriParts.length > 3) {
      dbName = uriParts[3].split('?')[0]; // Remove query parameters if they exist
    }
    
    if (!dbName) {
      throw new Error('Could not determine database name from MongoDB URI');
    }
    
    // Execute mongorestore
    console.log(`Restoring MongoDB database ${dbName} from backup...`);
    
    const dropFlag = dropBeforeRestore ? '--drop' : '';
    execSync(`mongorestore --uri="${connection.mongodb_uri}" ${dropFlag} --gzip --archive="${fileToRestore}"`);
    
    // Cleanup temporary decrypted file if we decrypted
    if (isEncrypted && fileToRestore !== backupFile) {
      fs.unlinkSync(fileToRestore);
    }
    
    console.log(`Database restored from ${backupFile}`);
    return { success: true };
  } catch (error) {
    console.error('Error restoring MongoDB database:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Records an applied migration in the migrations collection
 * @param {Object} db - MongoDB database instance
 * @param {string} migrationName - Name of the migration
 * @param {Object} operations - Operations performed in the migration
 * @returns {Promise<Object>} Result object with applied status and message
 */
async function trackMigration(db, migrationName, operations) {
  try {
    // Check if migrations collection exists, create if not
    const collections = await db.listCollections({ name: 'migrations' }).toArray();
    if (collections.length === 0) {
      await db.createCollection('migrations');
    }
    
    // Check if migration has already been applied
    const existingMigration = await db.collection('migrations').findOne({ name: migrationName });
    
    if (existingMigration) {
      return { applied: false, message: `Migration ${migrationName} has already been applied` };
    }
    
    // Track the migration
    await db.collection('migrations').insertOne({
      name: migrationName,
      applied_at: new Date(),
      operations: operations
    });
    
    return { applied: true, message: `Migration ${migrationName} tracked successfully` };
  } catch (error) {
    console.error('Error tracking migration:', error.message);
    throw error;
  }
}

/**
 * Checks if a specific migration has been applied
 * @param {Object} db - MongoDB database instance
 * @param {string} migrationName - Name of the migration to check
 * @returns {Promise<boolean>} True if migration has been applied, false otherwise
 */
async function isMigrationApplied(db, migrationName) {
  try {
    // Check if migrations collection exists
    const collections = await db.listCollections({ name: 'migrations' }).toArray();
    if (collections.length === 0) {
      return false;
    }
    
    // Check if migration exists
    const existingMigration = await db.collection('migrations').findOne({ name: migrationName });
    return !!existingMigration;
  } catch (error) {
    console.error('Error checking migration status:', error.message);
    throw error;
  }
}

/**
 * Gets a list of all applied migrations
 * @param {Object} db - MongoDB database instance
 * @returns {Promise<Array<Object>>} Array of applied migration information
 */
async function getAppliedMigrations(db) {
  try {
    // Check if migrations collection exists
    const collections = await db.listCollections({ name: 'migrations' }).toArray();
    if (collections.length === 0) {
      return [];
    }
    
    // Get migrations
    const migrations = await db.collection('migrations')
      .find({}, { projection: { name: 1, applied_at: 1, _id: 0 } })
      .sort({ applied_at: 1 })
      .toArray();
    
    return migrations;
  } catch (error) {
    console.error('Error getting applied migrations:', error.message);
    throw error;
  }
}

// Export MongoDB-specific functionality
module.exports = {
  createClient,
  closeClient,
  executeQuery,
  executeUpdate,
  executeTransaction,
  listCollections,
  getCollectionInfo,
  collectionExists,
  fieldExists,
  indexExists,
  getCollectionIndexes,
  createDatabaseBackup,
  restoreDatabase,
  trackMigration,
  isMigrationApplied,
  getAppliedMigrations,
  isMongoToolAvailable
};