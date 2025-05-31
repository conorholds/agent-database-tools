// src/commands/mongodb/query.js
// This file is used to execute queries on a MongoDB database

const db = require('../../utils/db');
const { confirmAction } = require('../../utils/prompt');
const inquirer = require('inquirer');
const chalk = require('chalk');

/**
 * Execute a query on a MongoDB database
 * @param {Object} connection - MongoDB connection object with client and db properties
 * @param {string} query - MongoDB query to execute (JSON string)
 * @param {Object} options - Command options
 * @returns {Promise<boolean>} True if query was executed successfully, false otherwise
 */
async function executeMongoQuery({ client, db }, query, options) {
  // Determine query type: collection, find, aggregate, update, or command
  let queryType = 'find';
  let collection = null;
  let parsedQuery = null;
  let parsedOptions = null;
  
  try {
    // Parse the query
    try {
      // Try to parse the full query as JSON
      parsedQuery = JSON.parse(query);
      
      // If successful, determine if it's a command or a collection-specific query
      if (parsedQuery.collection) {
        collection = parsedQuery.collection;
        
        if (parsedQuery.type) {
          queryType = parsedQuery.type.toLowerCase();
        }
        
        if (parsedQuery.query) {
          parsedQuery = parsedQuery.query;
        }
        
        if (parsedQuery.options) {
          parsedOptions = parsedQuery.options;
        }
      } else {
        // If no collection specified, assume it's a database command
        queryType = 'command';
      }
    } catch (parseError) {
      // If JSON parsing fails, this might be a plain query string
      // Prompt for the query components
      console.log(chalk.yellow('Query must be a valid JSON object. Please specify the query components:'));
      
      const promptResult = await inquirer.prompt([
        {
          type: 'list',
          name: 'collectionChoice',
          message: 'Select a collection:',
          choices: async () => {
            const collections = await require('../../utils/db').mongodb.listCollections(db);
            return collections;
          }
        },
        {
          type: 'list',
          name: 'queryType',
          message: 'Select query type:',
          choices: [
            { name: 'Find documents', value: 'find' },
            { name: 'Count documents', value: 'count' },
            { name: 'Aggregate pipeline', value: 'aggregate' },
            { name: 'Update documents', value: 'update' },
            { name: 'Delete documents', value: 'delete' }
          ]
        },
        {
          type: 'editor',
          name: 'queryJSON',
          message: 'Enter your query as JSON:',
          validate: input => {
            try {
              JSON.parse(input);
              return true;
            } catch (e) {
              return 'Must be valid JSON: ' + e.message;
            }
          }
        },
        {
          type: 'editor',
          name: 'optionsJSON',
          message: 'Enter query options as JSON (optional):',
          default: '{}',
          validate: input => {
            try {
              JSON.parse(input);
              return true;
            } catch (e) {
              return 'Must be valid JSON: ' + e.message;
            }
          }
        }
      ]);
      
      collection = promptResult.collectionChoice;
      queryType = promptResult.queryType;
      parsedQuery = JSON.parse(promptResult.queryJSON);
      parsedOptions = JSON.parse(promptResult.optionsJSON);
    }
    
    // Show the query if verbose mode is enabled
    if (options.verbose) {
      console.log(chalk.cyan('Executing MongoDB query:'));
      console.log(JSON.stringify({
        type: queryType,
        collection: collection,
        query: parsedQuery,
        options: parsedOptions
      }, null, 2));
    }
    
    // Ask for confirmation for destructive queries unless force is enabled
    const isDestructive = ['update', 'delete', 'remove', 'insertmany', 'insertone', 'bulkwrite', 'dropcollection', 'dropdatabase'].includes(queryType.toLowerCase());
    
    if (isDestructive && !options.force) {
      console.log(chalk.yellow('Warning: This query may modify data or schema'));
      
      const confirm = await confirmAction('Are you sure you want to execute this query?');
      
      if (!confirm) {
        console.log('Query execution canceled');
        return false;
      }
    }
    
    let result;
    
    // Execute the query based on query type
    if (queryType === 'command') {
      // Database command
      result = await db.command(parsedQuery);
    } else {
      // Collection query
      const mongoCollection = db.collection(collection);
      
      switch (queryType) {
        case 'find':
          result = await mongoCollection.find(parsedQuery, parsedOptions || {}).toArray();
          break;
        case 'count':
          result = await mongoCollection.countDocuments(parsedQuery, parsedOptions || {});
          break;
        case 'aggregate':
          result = await mongoCollection.aggregate(parsedQuery, parsedOptions || {}).toArray();
          break;
        case 'update':
          if (!parsedOptions || !parsedOptions.update) {
            throw new Error('For update operations, specify the update document in options.update');
          }
          if (parsedOptions.updateMany) {
            result = await mongoCollection.updateMany(parsedQuery, parsedOptions.update, parsedOptions);
          } else {
            result = await mongoCollection.updateOne(parsedQuery, parsedOptions.update, parsedOptions);
          }
          break;
        case 'delete':
          if (parsedOptions && parsedOptions.deleteMany) {
            result = await mongoCollection.deleteMany(parsedQuery, parsedOptions);
          } else {
            result = await mongoCollection.deleteOne(parsedQuery, parsedOptions);
          }
          break;
        default:
          throw new Error(`Unsupported query type: ${queryType}`);
      }
    }
    
    // Output the results
    if (options.json) {
      // JSON output
      console.log(JSON.stringify(result, null, 2));
    } else {
      // Display results based on query type
      if (queryType === 'find' || queryType === 'aggregate') {
        if (result.length === 0) {
          console.log(chalk.yellow('No documents found.'));
        } else {
          // Print results
          console.log(chalk.green(`Found ${result.length} document(s):`));
          result.forEach((doc, index) => {
            console.log(`\nDocument ${index + 1}:`);
            console.log(JSON.stringify(doc, null, 2));
          });
        }
      } else if (queryType === 'count') {
        console.log(chalk.green(`Count: ${result}`));
      } else if (queryType === 'update') {
        console.log(chalk.green(`Updated ${result.modifiedCount} document(s).`));
        if (result.upsertedCount) {
          console.log(chalk.green(`Inserted ${result.upsertedCount} document(s).`));
        }
      } else if (queryType === 'delete') {
        console.log(chalk.green(`Deleted ${result.deletedCount} document(s).`));
      } else {
        // For command or other query types
        console.log(chalk.green('Command executed successfully:'));
        console.log(JSON.stringify(result, null, 2));
      }
    }
    
    return true;
  } catch (error) {
    console.error(chalk.red('Error executing MongoDB query:'), error.message);
    return false;
  }
}

module.exports = executeMongoQuery;