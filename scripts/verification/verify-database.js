#!/usr/bin/env node

// Database Schema Verification Script
// This script verifies that a database was correctly initialized according to its schema definition

const { Pool } = require("pg");
const path = require("path");
const fs = require("fs");
const chalk = require("chalk");

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length < 2) {
  console.log(
    chalk.yellow(
      "Usage: node verify-database.js <project-name> <database-name>"
    )
  );
  console.log(
    chalk.yellow('Example: node verify-database.js "YDRV" development')
  );
  console.log(chalk.yellow('        node verify-database.js "YDRV" staging'));
  console.log(
    chalk.yellow('        node verify-database.js "YDRV" production')
  );
  process.exit(1);
}

const projectName = args[0];
const databaseName = args[1];

// Load connection configuration
const getConnectionConfig = () => {
  let connectFile = "connect.json";

  // Check for database-specific connection files
  if (databaseName === "staging" && fs.existsSync("connect-staging.json")) {
    connectFile = "connect-staging.json";
  } else if (
    databaseName === "production" &&
    fs.existsSync("connect-production.json")
  ) {
    connectFile = "connect-production.json";
  }

  const connectPath = path.join(process.cwd(), connectFile);
  if (!fs.existsSync(connectPath)) {
    console.error(chalk.red(`Connection file not found: ${connectFile}`));
    process.exit(1);
  }

  const connections = JSON.parse(fs.readFileSync(connectPath, "utf8"));
  const connection = connections.find((c) => c.name === projectName);

  if (!connection) {
    console.error(
      chalk.red(`Project "${projectName}" not found in ${connectFile}`)
    );
    process.exit(1);
  }

  return connection.postgres_uri;
};

// Load schema definition
const loadSchema = () => {
  const schemaFileName = projectName.toLowerCase().replace(/\s+/g, "-") + ".js";
  const schemaPath = path.join(process.cwd(), "schemas", schemaFileName);

  if (!fs.existsSync(schemaPath)) {
    console.error(chalk.red(`Schema file not found: ${schemaPath}`));
    process.exit(1);
  }

  // Clear require cache to get fresh schema
  delete require.cache[require.resolve(schemaPath)];
  return require(schemaPath);
};

// Normalize column types for comparison
const normalizeType = (type) => {
  if (!type) return "";

  // Remove extra whitespace and convert to uppercase
  let normalized = type.toUpperCase().trim();

  // Remove "NOT NULL", "DEFAULT", "CHECK" constraints for comparison
  normalized = normalized.replace(/\s+NOT\s+NULL/gi, "");
  normalized = normalized.replace(/\s+NULL/gi, "");
  normalized = normalized.replace(/\s+DEFAULT\s+.*/gi, "");
  normalized = normalized.replace(/\s+CHECK\s*\([^)]*\)/gi, "");
  normalized = normalized.replace(/\s+UNIQUE/gi, "");
  normalized = normalized.replace(/\s+PRIMARY\s+KEY/gi, "");
  normalized = normalized.replace(/\s+REFERENCES\s+.*/gi, "");

  // Remove any CHECK constraints that might still be there
  normalized = normalized.replace(/CHECK\s*\([^)]*\)/gi, "").trim();

  // Normalize common type variations
  normalized = normalized.replace(/^SERIAL$/i, "INTEGER");
  normalized = normalized.replace(/^BIGSERIAL$/i, "BIGINT");
  normalized = normalized.replace(
    /^VARCHAR\s*\(\s*\d+\s*\)/i,
    "CHARACTER VARYING"
  );
  normalized = normalized.replace(/^TEXT$/i, "TEXT");
  normalized = normalized.replace(/^BOOLEAN$/i, "BOOLEAN");
  normalized = normalized.replace(/^INTEGER$/i, "INTEGER");
  normalized = normalized.replace(/^BIGINT$/i, "BIGINT");
  normalized = normalized.replace(
    /^NUMERIC\s*\(\s*\d+\s*,\s*\d+\s*\)/i,
    "NUMERIC"
  );
  normalized = normalized.replace(
    /^DECIMAL\s*\(\s*\d+\s*,\s*\d+\s*\)/i,
    "NUMERIC"
  );
  normalized = normalized.replace(
    /^TIMESTAMP\s+WITH\s+TIME\s+ZONE$/i,
    "TIMESTAMP WITH TIME ZONE"
  );
  normalized = normalized.replace(/^JSONB$/i, "JSONB");
  normalized = normalized.replace(/^JSON$/i, "JSON");
  normalized = normalized.replace(/^INET$/i, "INET");
  normalized = normalized.replace(/^TEXT\[\]$/i, "ARRAY");

  // Final cleanup - remove any trailing parentheses
  normalized = normalized.replace(/\)$/, "");

  return normalized.trim();
};

// Main verification function
async function verifyDatabase() {
  const connectionString = getConnectionConfig();
  const schema = loadSchema();

  console.log(chalk.cyan(`\n=== Database Schema Verification ===`));
  console.log(chalk.cyan(`Project: ${projectName}`));
  console.log(chalk.cyan(`Database: ${databaseName}`));
  console.log(chalk.cyan(`Schema: ${schema.name || "Unnamed"}\n`));

  const pool = new Pool({ connectionString });

  let totalErrors = 0;
  let totalWarnings = 0;
  const results = {
    tables: { expected: 0, found: 0, missing: [], extra: [] },
    columns: { errors: [], warnings: [] },
    types: { mismatches: [] },
    indexes: { missing: [], extra: [] },
    constraints: { missing: [], extra: [] },
  };

  try {
    // Get all tables in the database
    const tablesQuery = `
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename
    `;
    const tablesResult = await pool.query(tablesQuery);
    const actualTables = tablesResult.rows.map((r) => r.tablename);

    // Get expected tables from schema
    const expectedTables = schema.tables.map((t) => t.name);
    results.tables.expected = expectedTables.length;
    results.tables.found = actualTables.length;

    // Check for missing tables
    for (const table of expectedTables) {
      if (!actualTables.includes(table)) {
        results.tables.missing.push(table);
        totalErrors++;
      }
    }

    // Check for extra tables
    for (const table of actualTables) {
      if (!expectedTables.includes(table)) {
        results.tables.extra.push(table);
        totalWarnings++;
      }
    }

    // Verify each table's structure
    for (const tableSchema of schema.tables) {
      const tableName = tableSchema.name;

      if (!actualTables.includes(tableName)) {
        continue; // Skip missing tables
      }

      console.log(chalk.blue(`Verifying table: ${tableName}`));

      // Get actual columns
      const columnsQuery = `
        SELECT 
          column_name,
          data_type,
          character_maximum_length,
          numeric_precision,
          numeric_scale,
          is_nullable,
          column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' 
          AND table_name = $1
        ORDER BY ordinal_position
      `;
      const columnsResult = await pool.query(columnsQuery, [tableName]);
      const actualColumns = {};

      for (const col of columnsResult.rows) {
        let type = col.data_type.toUpperCase();
        if (col.character_maximum_length) {
          type = `CHARACTER VARYING`;
        }
        if (
          col.data_type === "numeric" &&
          col.numeric_precision &&
          col.numeric_scale
        ) {
          type = `NUMERIC`;
        }
        if (col.data_type === "ARRAY") {
          type = "ARRAY";
        }
        actualColumns[col.column_name] = {
          type: type,
          nullable: col.is_nullable === "YES",
          default: col.column_default,
        };
      }

      // Compare with expected columns
      const expectedColumns = tableSchema.columns || {};

      // Check for missing columns
      for (const [colName, colDef] of Object.entries(expectedColumns)) {
        if (!actualColumns[colName]) {
          results.columns.errors.push({
            table: tableName,
            column: colName,
            issue: "Missing column",
            expected: colDef,
          });
          totalErrors++;
        } else {
          // Check column type
          const expectedType = normalizeType(colDef);
          const actualType = normalizeType(actualColumns[colName].type);

          if (expectedType && actualType && expectedType !== actualType) {
            // Special handling for some equivalent types
            const equivalent =
              (expectedType === "CHARACTER VARYING" &&
                actualType === "CHARACTER VARYING") ||
              (expectedType === "INTEGER" && actualType === "INTEGER") ||
              (expectedType === "BIGINT" && actualType === "BIGINT") ||
              (expectedType === "NUMERIC" && actualType === "NUMERIC") ||
              (expectedType === "TEXT" && actualType === "TEXT") ||
              (expectedType === "BOOLEAN" && actualType === "BOOLEAN") ||
              (expectedType === "JSONB" && actualType === "JSONB") ||
              (expectedType === "TIMESTAMP WITH TIME ZONE" &&
                actualType === "TIMESTAMP WITH TIME ZONE");

            if (!equivalent) {
              results.types.mismatches.push({
                table: tableName,
                column: colName,
                expected: expectedType,
                actual: actualType,
              });
              totalErrors++;
            }
          }
        }
      }

      // Check for extra columns
      for (const colName of Object.keys(actualColumns)) {
        if (!expectedColumns[colName]) {
          results.columns.warnings.push({
            table: tableName,
            column: colName,
            issue: "Extra column not in schema",
          });
          totalWarnings++;
        }
      }

      // Verify indexes
      if (tableSchema.indexes && tableSchema.indexes.length > 0) {
        const indexQuery = `
          SELECT indexname, indexdef
          FROM pg_indexes
          WHERE schemaname = 'public'
            AND tablename = $1
            AND indexname LIKE 'idx_%'
        `;
        const indexResult = await pool.query(indexQuery, [tableName]);
        const actualIndexes = indexResult.rows.map((r) => r.indexname);

        for (const indexDef of tableSchema.indexes) {
          const expectedIndexName = `idx_${tableName}_${indexDef.columns.join(
            "_"
          )}`;
          if (!actualIndexes.includes(expectedIndexName)) {
            results.indexes.missing.push({
              table: tableName,
              index: expectedIndexName,
              columns: indexDef.columns,
            });
            totalWarnings++;
          }
        }
      }
    }

    // Print results
    console.log(chalk.cyan("\n=== Verification Results ===\n"));

    // Tables summary
    console.log(chalk.yellow("Tables:"));
    console.log(`  Expected: ${results.tables.expected}`);
    console.log(`  Found: ${results.tables.found}`);

    if (results.tables.missing.length > 0) {
      console.log(
        chalk.red(`  Missing tables: ${results.tables.missing.join(", ")}`)
      );
    }

    if (results.tables.extra.length > 0) {
      console.log(
        chalk.yellow(`  Extra tables: ${results.tables.extra.join(", ")}`)
      );
    }

    // Columns summary
    if (results.columns.errors.length > 0) {
      console.log(chalk.red("\nColumn Errors:"));
      for (const err of results.columns.errors) {
        console.log(chalk.red(`  - ${err.table}.${err.column}: ${err.issue}`));
      }
    }

    if (results.columns.warnings.length > 0) {
      console.log(chalk.yellow("\nColumn Warnings:"));
      for (const warn of results.columns.warnings) {
        console.log(
          chalk.yellow(`  - ${warn.table}.${warn.column}: ${warn.issue}`)
        );
      }
    }

    // Type mismatches
    if (results.types.mismatches.length > 0) {
      console.log(chalk.red("\nType Mismatches:"));
      for (const mismatch of results.types.mismatches) {
        console.log(
          chalk.red(
            `  - ${mismatch.table}.${mismatch.column}: expected ${mismatch.expected}, got ${mismatch.actual}`
          )
        );
      }
    }

    // Missing indexes
    if (results.indexes.missing.length > 0) {
      console.log(chalk.yellow("\nMissing Indexes:"));
      for (const idx of results.indexes.missing) {
        console.log(
          chalk.yellow(
            `  - ${idx.table}: ${idx.index} on columns (${idx.columns.join(
              ", "
            )})`
          )
        );
      }
    }

    // Final summary
    console.log(chalk.cyan("\n=== Summary ==="));
    if (totalErrors === 0 && totalWarnings === 0) {
      console.log(
        chalk.green("✓ Database structure matches schema perfectly!")
      );
    } else {
      if (totalErrors > 0) {
        console.log(
          chalk.red(`✗ Found ${totalErrors} error(s) that need to be fixed`)
        );
      }
      if (totalWarnings > 0) {
        console.log(
          chalk.yellow(`⚠ Found ${totalWarnings} warning(s) to review`)
        );
      }
    }

    process.exit(totalErrors > 0 ? 1 : 0);
  } catch (error) {
    console.error(chalk.red("Error verifying database:"), error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run verification
verifyDatabase().catch(console.error);
