// src/commands/add-column.js
// This file is used to add a new column to an existing database table

const {
  createPool,
  executeQuery,
  columnExists,
  tableExists,
} = require("../utils/db");
const {
  promptForProject,
  promptForTable,
  confirmAction,
} = require("../utils/prompt");
const inquirer = require("inquirer");
const chalk = require("chalk");

/**
 * Command to add a new column to an existing database table
 * @param {string} projectName - Name of the project
 * @param {string} table - Name of the table to add column to
 * @param {string} column - Name of the column to add
 * @param {string} datatype - Data type of the new column
 * @param {Object} [cmdOptions={}] - Command-specific options
 * @param {Object} [cmd] - Commander command object
 * @param {boolean} [cmd.parent.opts().force] - Whether to force operations without confirmation
 * @param {string} [cmd.parent.opts().connect] - Custom path to connection file
 * @param {string} [cmdOptions.database] - Database name to override default
 * @param {boolean} [cmdOptions.notNull] - Whether the column should be NOT NULL
 * @param {string} [cmdOptions.default] - Default value for the column
 * @returns {Promise<boolean>} True if column was added successfully, false otherwise
 */
async function addColumnCommand(
  projectName,
  table,
  column,
  datatype,
  cmdOptions = {},
  cmd
) {
  // Merge command options with global options
  const options = { ...cmd?.parent?.opts(), ...cmdOptions };
  // If project name not provided, prompt for it
  if (!projectName) {
    projectName = await promptForProject();
  }

  // Create DB connection pool
  const pool = createPool(projectName, options);

  try {
    // If table not provided, prompt for it
    if (!table) {
      table = await promptForTable(pool);
      if (!table) {
        return;
      }
    } else {
      // Verify that table exists
      const exists = await tableExists(pool, table);
      if (!exists) {
        console.error(chalk.red(`Table "${table}" does not exist`));
        return;
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
    const exists = await columnExists(pool, table, column);
    if (exists) {
      console.error(
        chalk.red(`Column "${column}" already exists in table "${table}"`)
      );
      return;
    }

    // Determine nullability
    const nullability = options.notNull ? "NOT NULL" : "NULL";

    // Build the ALTER TABLE query
    let query = `ALTER TABLE "${table}" ADD COLUMN "${column}" ${datatype}`;

    if (options.notNull) {
      query += ` NOT NULL`;

      // If NOT NULL constraint but no default, we need to check if table has existing data
      if (!options.default) {
        const rowCount = await executeQuery(
          pool,
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
              return;
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
        return;
      }
    }

    // Execute the query
    try {
      await executeQuery(pool, query);
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
  } finally {
    // Close connection pool
    await pool.end();
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

module.exports = addColumnCommand;
