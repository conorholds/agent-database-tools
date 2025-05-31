/**
 * @fileoverview PostgreSQL add column command implementation
 * @module commands/postgres/add-column
 * @author DB Tools Team
 * @version 1.0.0
 * 
 * This module provides functionality to add new columns to existing PostgreSQL tables
 * with comprehensive validation, constraint support, and interactive prompting.
 * It includes support for default values, null constraints, and various PostgreSQL
 * data types with proper error handling and user feedback.
 */

const db = require('../../utils/db');
const { promptForTable, confirmAction } = require('../../utils/prompt');
const { validateDatabaseIdentifier, validateNonEmptyString, throwIfInvalid } = require('../../utils/validation');
const inquirer = require('inquirer');
const chalk = require('chalk');

/**
 * Adds a new column to an existing PostgreSQL table
 * 
 * This function performs comprehensive validation of inputs, checks for existing
 * columns, validates data types, and constructs appropriate ALTER TABLE statements
 * with support for constraints and default values.
 * 
 * @param {Object} connection - PostgreSQL connection object
 * @param {string} table - Name of the table to add column to
 * @param {string} column - Name of the column to add
 * @param {string} datatype - PostgreSQL data type for the new column
 * @param {Object} [options={}] - Command options
 * @param {string} [options.default] - Default value for the column
 * @param {boolean} [options.notNull=false] - Whether the column should be NOT NULL
 * @param {boolean} [options.force=false] - Skip confirmation prompts
 * @param {boolean} [options.dryRun=false] - Show what would be executed without running
 * 
 * @returns {Promise<boolean>} True if column was added successfully, false otherwise
 * 
 * @throws {Error} Throws validation errors for invalid inputs
 * 
 * @example
 * await addPostgresColumn(connection, 'users', 'email', 'VARCHAR(255)', {
 *   notNull: true,
 *   default: null
 * });
 * 
 * @example
 * await addPostgresColumn(connection, 'products', 'price', 'DECIMAL(10,2)', {
 *   default: '0.00',
 *   force: true
 * });
 */
async function addPostgresColumn(connection, table, column, datatype, options = {}) {
  try {
    // Validate inputs
    if (table) {
      const tableValidation = validateDatabaseIdentifier(table, 'table');
      throwIfInvalid(tableValidation, 'Invalid table name');
    }
    
    if (column) {
      const columnValidation = validateDatabaseIdentifier(column, 'column');
      throwIfInvalid(columnValidation, 'Invalid column name');
    }
    
    if (datatype) {
      const datatypeValidation = validateNonEmptyString(datatype, 'data type');
      throwIfInvalid(datatypeValidation, 'Invalid data type');
    }

    // If table not provided, prompt for it
    if (!table) {
      table = await promptForTable(connection, 'postgres');
      if (!table) {
        console.log(chalk.yellow('Operation cancelled: no table selected'));
        return false;
      }
    } else {
      // Verify that table exists
      const exists = await db.postgres.tableExists(connection, table);
      if (!exists) {
        console.error(chalk.red(`✗ Table "${table}" does not exist`));
        console.log(chalk.cyan('💡 Use "db-tools list-tables" to see available tables'));
        return false;
      }
    }

    // If column or datatype not provided, prompt for them
    if (!column || !datatype) {
      const columnData = await promptForColumnData();
      column = columnData.name;
      datatype = columnData.type;
      options.default = columnData.defaultValue;
      options.notNull = columnData.notNull;
    }

    // Check if column already exists
    const exists = await db.postgres.columnExists(connection, table, column);
    if (exists) {
      console.error(
        chalk.red(`Column "${column}" already exists in table "${table}"`)
      );
      return false;
    }

    // Build the ALTER TABLE query
    let query = `ALTER TABLE "${table}" ADD COLUMN "${column}" ${datatype}`;

    if (options.notNull) {
      query += ` NOT NULL`;

      // If NOT NULL constraint but no default, we need to check if table has existing data
      if (!options.default) {
        const rowCount = await db.postgres.executeQuery(
          connection,
          `SELECT COUNT(*) FROM "${table}"`
        );

        if (parseInt(rowCount.rows[0].count) > 0) {
          console.warn(
            chalk.yellow(
              `WARNING: Adding NOT NULL column without default value to table with existing data`
            )
          );
          console.warn(
            `This might fail if the table contains rows, as they would have NULL values in the new column`
          );

          if (!options.force) {
            const proceed = await confirmAction(
              `The table "${table}" has ${rowCount.rows[0].count} rows. Are you sure you want to add a NOT NULL column without a default value?`
            );

            if (!proceed) {
              console.log("Operation canceled");
              return false;
            }
          }
        }
      }
    }

    if (options.default !== undefined) {
      query += ` DEFAULT ${options.default}`;
    }

    query += `;`;

    // Confirm the operation
    console.log(chalk.cyan("About to execute:"));
    console.log(query);

    if (!options.force) {
      const confirm = await confirmAction(
        `Are you sure you want to add column "${column}" to table "${table}"?`
      );

      if (!confirm) {
        console.log("Operation canceled");
        return false;
      }
    }

    // Execute the query
    try {
      await db.postgres.executeQuery(connection, query);
      console.log(
        chalk.green(
          `✓ Column "${column}" successfully added to table "${table}"`
        )
      );
      return true;
    } catch (error) {
      console.error(chalk.red(`Error adding column:`), error.message);
      return false;
    }
  } catch (error) {
    console.error(chalk.red('Error adding PostgreSQL column:'), error.message);
    return false;
  }
}

/**
 * Prompts the user for column details when adding a new column
 * @returns {Promise<Object>} Column details including name, type, notNull, and defaultValue
 */
async function promptForColumnData() {
  const questions = [
    {
      type: "input",
      name: "name",
      message: "Column name:",
      validate: (input) =>
        input.trim() !== "" ? true : "Column name cannot be empty",
    },
    {
      type: "list",
      name: "type",
      message: "Data type:",
      choices: [
        "BIGINT",
        "BOOLEAN",
        "DATE",
        "DECIMAL",
        "INTEGER",
        "JSONB",
        "NUMERIC",
        "SERIAL",
        "BIGSERIAL",
        "TEXT",
        "TEXT[]",
        "TIMESTAMP",
        "TIMESTAMP WITH TIME ZONE",
        "UUID",
        "VARCHAR(255)",
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
      message: "Not nullable?",
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
      message: "Default value:",
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

module.exports = addPostgresColumn;