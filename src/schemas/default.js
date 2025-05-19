// src/schemas/default.js
// This file contains the default database schema used when no custom schema is provided

module.exports = {
  name: 'Default Schema',
  description: 'Default schema with common tables',
  tables: [
    {
      name: 'users',
      columns: [
        { name: 'id', type: 'SERIAL', primaryKey: true },
        { name: 'email', type: 'VARCHAR(255)', nullable: false, unique: true },
        { name: 'password', type: 'VARCHAR(255)', nullable: false },
        { name: 'name', type: 'VARCHAR(255)', nullable: false },
        { name: 'created_at', type: 'TIMESTAMP', nullable: false, default: 'NOW()' },
        { name: 'updated_at', type: 'TIMESTAMP', nullable: false, default: 'NOW()' }
      ],
      indexes: [
        { columns: ['email'] }
      ],
      seedData: []
    }
  ]
};