// src/commands/manage-permissions.js
// This file is used to manage database user permissions and roles

const { createPool, executeQuery } = require('../utils/db');
const { promptForProject, confirmAction } = require('../utils/prompt');
const inquirer = require('inquirer');
const chalk = require('chalk');

async function managePermissionsCommand(projectName, options) {
  // If project name not provided, prompt for it
  if (!projectName) {
    projectName = await promptForProject();
  }
  
  // Create DB connection pool
  const pool = createPool(projectName, options);
  
  try {
    console.log(chalk.cyan(`Managing database permissions for project: ${projectName}`));
    
    // Prompt for action
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What do you want to do?',
        choices: [
          { name: 'Create app_user role with appropriate permissions', value: 'create_role' },
          { name: 'Update permissions for app_user role', value: 'update_permissions' },
          { name: 'Revoke all permissions from app_user role', value: 'revoke_permissions' },
          { name: 'Drop app_user role', value: 'drop_role' },
          { name: 'Show current permissions', value: 'show_permissions' }
        ]
      }
    ]);
    
    switch (action) {
      case 'create_role':
        return await createAppUserRole(pool);
      case 'update_permissions':
        return await updateAppUserPermissions(pool);
      case 'revoke_permissions':
        return await revokeAppUserPermissions(pool);
      case 'drop_role':
        return await dropAppUserRole(pool);
      case 'show_permissions':
        return await showAppUserPermissions(pool);
      default:
        console.log('No action selected');
        return;
    }
  } finally {
    // Close connection pool
    await pool.end();
  }
}

// Create app_user role with appropriate permissions
async function createAppUserRole(pool) {
  // Check if role already exists
  const roleExists = await checkRoleExists(pool, 'app_user');
  
  if (roleExists) {
    console.log(chalk.yellow('Role app_user already exists'));
    const updateInstead = await confirmAction('Do you want to update permissions instead?');
    
    if (updateInstead) {
      return await updateAppUserPermissions(pool);
    }
    
    return;
  }
  
  // Confirm creation
  const confirm = await confirmAction('Are you sure you want to create the app_user role with appropriate permissions?');
  
  if (!confirm) {
    console.log('Role creation canceled');
    return;
  }
  
  try {
    // Create role
    console.log(chalk.cyan('Creating app_user role...'));
    await executeQuery(pool, 'CREATE ROLE app_user;');
    
    // Grant privileges
    console.log(chalk.cyan('Granting appropriate permissions...'));
    
    // Get all tables
    const tablesResult = await executeQuery(
      pool,
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
    );
    
    const tables = tablesResult.rows.map(row => row.table_name);
    
    // Grant table permissions
    for (const table of tables) {
      await executeQuery(pool, `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "${table}" TO app_user;`);
    }
    
    // Grant sequence permissions
    const sequencesResult = await executeQuery(
      pool,
      `SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public'`
    );
    
    const sequences = sequencesResult.rows.map(row => row.sequence_name);
    
    for (const sequence of sequences) {
      await executeQuery(pool, `GRANT USAGE ON SEQUENCE "${sequence}" TO app_user;`);
    }
    
    console.log(chalk.green('✓ app_user role created with appropriate permissions'));
    
    // Optional: create database user with this role
    const createUser = await confirmAction('Do you want to create a database user with the app_user role?');
    
    if (createUser) {
      const { username, password } = await inquirer.prompt([
        {
          type: 'input',
          name: 'username',
          message: 'Enter username:',
          validate: input => input.trim() !== '' ? true : 'Username cannot be empty'
        },
        {
          type: 'password',
          name: 'password',
          message: 'Enter password:',
          validate: input => input.trim() !== '' ? true : 'Password cannot be empty'
        }
      ]);
      
      await executeQuery(pool, `CREATE USER ${username} WITH PASSWORD '${password}';`);
      await executeQuery(pool, `GRANT app_user TO ${username};`);
      
      console.log(chalk.green(`✓ User ${username} created with app_user role`));
    }
    
    return true;
  } catch (error) {
    console.error(chalk.red('Error creating app_user role:'), error.message);
    return false;
  }
}

// Update permissions for app_user role
async function updateAppUserPermissions(pool) {
  // Check if role exists
  const roleExists = await checkRoleExists(pool, 'app_user');
  
  if (!roleExists) {
    console.log(chalk.red('Role app_user does not exist'));
    const createInstead = await confirmAction('Do you want to create the role instead?');
    
    if (createInstead) {
      return await createAppUserRole(pool);
    }
    
    return;
  }
  
  // Confirm update
  const confirm = await confirmAction('Are you sure you want to update permissions for the app_user role?');
  
  if (!confirm) {
    console.log('Permission update canceled');
    return;
  }
  
  try {
    console.log(chalk.cyan('Updating app_user permissions...'));
    
    // Get all tables
    const tablesResult = await executeQuery(
      pool,
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
    );
    
    const tables = tablesResult.rows.map(row => row.table_name);
    
    // Grant table permissions
    for (const table of tables) {
      await executeQuery(pool, `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "${table}" TO app_user;`);
    }
    
    // Grant sequence permissions
    const sequencesResult = await executeQuery(
      pool,
      `SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public'`
    );
    
    const sequences = sequencesResult.rows.map(row => row.sequence_name);
    
    for (const sequence of sequences) {
      await executeQuery(pool, `GRANT USAGE ON SEQUENCE "${sequence}" TO app_user;`);
    }
    
    console.log(chalk.green('✓ app_user permissions updated successfully'));
    return true;
  } catch (error) {
    console.error(chalk.red('Error updating app_user permissions:'), error.message);
    return false;
  }
}

// Revoke all permissions from app_user role
async function revokeAppUserPermissions(pool) {
  // Check if role exists
  const roleExists = await checkRoleExists(pool, 'app_user');
  
  if (!roleExists) {
    console.log(chalk.red('Role app_user does not exist'));
    return;
  }
  
  // Confirm revocation
  const confirm = await confirmAction(chalk.red('Are you sure you want to REVOKE ALL permissions from the app_user role? This may break application functionality.'));
  
  if (!confirm) {
    console.log('Permission revocation canceled');
    return;
  }
  
  try {
    console.log(chalk.cyan('Revoking app_user permissions...'));
    
    // Get all tables
    const tablesResult = await executeQuery(
      pool,
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
    );
    
    const tables = tablesResult.rows.map(row => row.table_name);
    
    // Revoke table permissions
    for (const table of tables) {
      await executeQuery(pool, `REVOKE ALL PRIVILEGES ON TABLE "${table}" FROM app_user;`);
    }
    
    // Revoke sequence permissions
    const sequencesResult = await executeQuery(
      pool,
      `SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public'`
    );
    
    const sequences = sequencesResult.rows.map(row => row.sequence_name);
    
    for (const sequence of sequences) {
      await executeQuery(pool, `REVOKE ALL PRIVILEGES ON SEQUENCE "${sequence}" FROM app_user;`);
    }
    
    console.log(chalk.green('✓ All permissions revoked from app_user role'));
    return true;
  } catch (error) {
    console.error(chalk.red('Error revoking app_user permissions:'), error.message);
    return false;
  }
}

// Drop app_user role
async function dropAppUserRole(pool) {
  // Check if role exists
  const roleExists = await checkRoleExists(pool, 'app_user');
  
  if (!roleExists) {
    console.log(chalk.red('Role app_user does not exist'));
    return;
  }
  
  // Confirm drop
  const confirm = await confirmAction(chalk.red('Are you ABSOLUTELY SURE you want to DROP the app_user role? This will break application functionality.'));
  
  if (!confirm) {
    console.log('Role drop canceled');
    return;
  }
  
  try {
    console.log(chalk.cyan('Dropping app_user role...'));
    
    // Try to drop, but may fail if role has dependencies
    try {
      await executeQuery(pool, 'DROP ROLE app_user;');
      console.log(chalk.green('✓ app_user role dropped successfully'));
      return true;
    } catch (error) {
      // If error contains "depends on", role has dependencies
      if (error.message.includes('depends on')) {
        console.log(chalk.yellow('Role app_user has dependencies. Attempting to drop with CASCADE...'));
        
        const forceDrop = await confirmAction(chalk.red('Do you want to force drop the role with CASCADE? This will also drop all dependent objects.'));
        
        if (!forceDrop) {
          console.log('Role drop canceled');
          return;
        }
        
        // Revoke all permissions first
        await revokeAppUserPermissions(pool);
        
        // List users with this role
        const usersResult = await executeQuery(
          pool,
          `SELECT rolname FROM pg_roles WHERE pg_has_role('app_user', oid, 'member');`
        );
        
        const users = usersResult.rows.map(row => row.rolname).filter(name => name !== 'app_user');
        
        // Revoke role from users
        for (const user of users) {
          await executeQuery(pool, `REVOKE app_user FROM ${user};`);
        }
        
        // Now try to drop again
        await executeQuery(pool, 'DROP ROLE IF EXISTS app_user;');
        console.log(chalk.green('✓ app_user role dropped successfully'));
        return true;
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error(chalk.red('Error dropping app_user role:'), error.message);
    return false;
  }
}

// Show current permissions for app_user role
async function showAppUserPermissions(pool) {
  // Check if role exists
  const roleExists = await checkRoleExists(pool, 'app_user');
  
  if (!roleExists) {
    console.log(chalk.red('Role app_user does not exist'));
    return;
  }
  
  try {
    console.log(chalk.cyan('Current permissions for app_user role:'));
    
    // Get table permissions
    const tablePermissionsResult = await executeQuery(
      pool,
      `SELECT grantee, table_name, privilege_type
       FROM information_schema.table_privileges
       WHERE grantee = 'app_user'
       ORDER BY table_name, privilege_type;`
    );
    
    if (tablePermissionsResult.rows.length === 0) {
      console.log(chalk.yellow('No table permissions found for app_user'));
    } else {
      console.log(chalk.green('Table permissions:'));
      
      // Group by table
      const tablePermissionsByTable = {};
      
      tablePermissionsResult.rows.forEach(row => {
        if (!tablePermissionsByTable[row.table_name]) {
          tablePermissionsByTable[row.table_name] = [];
        }
        
        tablePermissionsByTable[row.table_name].push(row.privilege_type);
      });
      
      Object.entries(tablePermissionsByTable).forEach(([table, privileges]) => {
        console.log(`  ${table}: ${privileges.join(', ')}`);
      });
    }
    
    // Get sequence permissions
    const sequencePermissionsResult = await executeQuery(
      pool,
      `SELECT grantor, privilege_type
       FROM information_schema.usage_privileges
       WHERE grantee = 'app_user' AND object_type = 'SEQUENCE'
       ORDER BY object_name, privilege_type;`
    );
    
    if (sequencePermissionsResult.rows.length === 0) {
      console.log(chalk.yellow('No sequence permissions found for app_user'));
    } else {
      console.log(chalk.green('Sequence permissions:'));
      console.log(`  Found ${sequencePermissionsResult.rows.length} sequence privileges granted to app_user`);
    }
    
    // Get users with this role
    const usersResult = await executeQuery(
      pool,
      `SELECT rolname FROM pg_roles WHERE pg_has_role('app_user', oid, 'member');`
    );
    
    const users = usersResult.rows.map(row => row.rolname).filter(name => name !== 'app_user');
    
    if (users.length > 0) {
      console.log(chalk.green('Users with app_user role:'));
      users.forEach(user => {
        console.log(`  ${user}`);
      });
    } else {
      console.log(chalk.yellow('No users have been granted the app_user role'));
    }
    
    return true;
  } catch (error) {
    console.error(chalk.red('Error showing app_user permissions:'), error.message);
    return false;
  }
}

// Helper function to check if a role exists
async function checkRoleExists(pool, roleName) {
  try {
    const result = await executeQuery(
      pool,
      'SELECT 1 FROM pg_roles WHERE rolname = $1',
      [roleName]
    );
    
    return result.rows.length > 0;
  } catch (error) {
    console.error(chalk.red(`Error checking if role ${roleName} exists:`), error.message);
    throw error;
  }
}

module.exports = managePermissionsCommand;