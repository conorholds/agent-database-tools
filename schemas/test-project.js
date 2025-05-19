/**
 * Schema definition for the test project
 * Used specifically for test-tools.sh
 */

const schema = {
  // Required PostgreSQL extensions
  extensions: [
    // No extensions required for testing
  ],
  
  // Database tables
  tables: [
    {
      name: 'users',
      description: 'User accounts for test project',
      columns: {
        id: 'SERIAL PRIMARY KEY',
        name: 'VARCHAR(255) NOT NULL',
        email: 'VARCHAR(255) NOT NULL UNIQUE',
        created_at: 'TIMESTAMP DEFAULT NOW()'
      }
    },
    {
      name: 'transactions',
      description: 'Transaction records for test project',
      columns: {
        id: 'SERIAL PRIMARY KEY',
        user_id: 'INTEGER REFERENCES users(id)',
        amount: 'NUMERIC(10,2) NOT NULL',
        description: 'TEXT',
        created_at: 'TIMESTAMP DEFAULT NOW()'
      }
    }
  ],
  
  // Seed data for testing
  seedData: {
    users: [
      {
        name: 'Test User 1',
        email: 'test1@example.com'
      },
      {
        name: 'Test User 2',
        email: 'test2@example.com'
      }
    ],
    transactions: [
      {
        user_id: 1,
        amount: 100.00,
        description: 'Test transaction 1'
      },
      {
        user_id: 1,
        amount: 200.00,
        description: 'Test transaction 2'
      },
      {
        user_id: 2,
        amount: 300.00,
        description: 'Test transaction 3'
      }
    ]
  }
};

module.exports = schema;