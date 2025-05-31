// src/utils/schema.js
// This file contains utilities for database schema management
// Includes functions for generating SQL schema, tables, and seed data

const fs = require('fs');
const path = require('path');

/**
 * Creates standard timestamp fields for PostgreSQL tables
 * @returns {Object} Object containing created_at, updated_at, and deleted_at field definitions
 */
const createTimestampFields = () => ({
  created_at: 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP',
  updated_at: 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP',
  deleted_at: 'TIMESTAMP WITH TIME ZONE'
});

/**
 * Loads database schema from a project-specific schema file
 * @param {string} projectName - Name of the project to load schema for
 * @returns {Object|null} Schema object if found, null otherwise
 */
const loadSchemaFromFile = (projectName) => {
  try {
    // Convert project name to kebab-case filename
    const fileName = projectName ? projectName.toLowerCase().replace(/[\s_]+/g, '-') : 'default';
    const schemaPath = path.join(process.cwd(), 'schemas', `${fileName}.js`);
    
    if (fs.existsSync(schemaPath)) {
      return require(schemaPath);
    }
  } catch (error) {
    console.warn(`Could not load schema for "${projectName}": ${error.message}`);
  }
  
  return null;
};

/**
 * Generates complete database schema for a project
 * @param {string} projectName - Name of the project
 * @returns {Object} Complete schema object with tables, extensions, functions, and seed data
 */
const generateFullSchema = (projectName) => {
  // Try to load from external file first
  const schemaFromFile = loadSchemaFromFile(projectName);
  if (schemaFromFile) {
    return schemaFromFile;
  }
  
  // Default schema
  return {
    tables: [
      {
        name: 'users',
        columns: {
          id: 'BIGSERIAL PRIMARY KEY',
          ...createTimestampFields(),
          email: 'VARCHAR(255) NOT NULL UNIQUE',
          password: 'VARCHAR(255)',
          name: 'VARCHAR(255)',
          profile_picture: 'VARCHAR(255)',
          credits: 'INTEGER DEFAULT 0',
          referral_code: 'VARCHAR(255) UNIQUE',
          referred_by: 'VARCHAR(255)',
          last_login_at: 'TIMESTAMP WITH TIME ZONE',
          google_id: 'VARCHAR(255) UNIQUE',
          apple_id: 'VARCHAR(255) UNIQUE',
          is_admin: 'BOOLEAN DEFAULT FALSE',
          next_tweet_eligible: 'TIMESTAMP WITH TIME ZONE',
          active: 'BOOLEAN DEFAULT TRUE'
        },
        indexes: [
          { columns: ['email'] },
          { columns: ['referral_code'] },
          { columns: ['google_id'] },
          { columns: ['apple_id'] }
        ]
      },
      {
        name: 'designs',
        columns: {
          id: 'BIGSERIAL PRIMARY KEY',
          ...createTimestampFields(),
          user_id: 'BIGINT REFERENCES users(id) ON DELETE SET NULL',
          title: 'VARCHAR(255)',
          description: 'TEXT',
          image_url: 'VARCHAR(255)',
          thumbnail_url: 'VARCHAR(255)',
          preview_url: 'VARCHAR(255)',
          original_photo_url: 'VARCHAR(255)',
          template_name: 'VARCHAR(255)',
          template_id: 'VARCHAR(255)',
          is_shared: 'BOOLEAN DEFAULT FALSE',
          visibility: 'VARCHAR(20) DEFAULT \'private\'',
          shared_with: 'JSONB',
          likes: 'INTEGER DEFAULT 0',
          created_from_photo: 'BOOLEAN',
          is_variation: 'BOOLEAN DEFAULT FALSE',
          original_design_id: 'BIGINT REFERENCES designs(id) ON DELETE SET NULL',
          status: 'VARCHAR(20) DEFAULT \'published\'',
          metadata: 'JSONB',
          tags: 'JSONB',
          anonymous: 'BOOLEAN DEFAULT FALSE'
        },
        indexes: [
          { columns: ['user_id'] },
          { columns: ['visibility'] },
          { columns: ['template_id'] },
          { columns: ['original_design_id'] }
        ]
      },
      {
        name: 'comments',
        columns: {
          id: 'BIGSERIAL PRIMARY KEY',
          ...createTimestampFields(),
          design_id: 'BIGINT REFERENCES designs(id) ON DELETE CASCADE',
          user_id: 'BIGINT REFERENCES users(id) ON DELETE SET NULL',
          parent_id: 'BIGINT REFERENCES comments(id) ON DELETE SET NULL',
          text: 'TEXT'
        },
        indexes: [
          { columns: ['design_id'] },
          { columns: ['user_id'] },
          { columns: ['parent_id'] }
        ]
      },
      {
        name: 'design_versions',
        columns: {
          id: 'BIGSERIAL PRIMARY KEY',
          ...createTimestampFields(),
          design_id: 'BIGINT REFERENCES designs(id) ON DELETE CASCADE',
          version: 'INTEGER',
          image_url: 'VARCHAR(255)',
          thumbnail_url: 'VARCHAR(255)',
          changed_by_id: 'BIGINT REFERENCES users(id) ON DELETE SET NULL',
          change_notes: 'TEXT'
        },
        indexes: [
          { columns: ['design_id'] },
          { columns: ['changed_by_id'] }
        ]
      },
      {
        name: 'shared_links',
        columns: {
          id: 'BIGSERIAL PRIMARY KEY',
          ...createTimestampFields(),
          design_id: 'BIGINT REFERENCES designs(id) ON DELETE CASCADE',
          user_id: 'BIGINT REFERENCES users(id) ON DELETE SET NULL',
          token: 'VARCHAR(255) UNIQUE',
          expires_at: 'TIMESTAMP WITH TIME ZONE',
          allowed_views: 'INTEGER',
          view_count: 'INTEGER DEFAULT 0',
          allow_download: 'BOOLEAN DEFAULT FALSE'
        },
        indexes: [
          { columns: ['token'] },
          { columns: ['design_id'] },
          { columns: ['user_id'] }
        ]
      },
      {
        name: 'collections',
        columns: {
          id: 'BIGSERIAL PRIMARY KEY',
          ...createTimestampFields(),
          user_id: 'BIGINT REFERENCES users(id) ON DELETE CASCADE',
          name: 'VARCHAR(255)',
          description: 'TEXT',
          type: 'VARCHAR(20)',
          count: 'INTEGER',
          is_public: 'BOOLEAN DEFAULT FALSE',
          visibility: 'VARCHAR(20) DEFAULT \'private\'',
          shared_with: 'JSONB',
          sort_by: 'VARCHAR(20) DEFAULT \'dateAdded\'',
          sort_order: 'VARCHAR(4) DEFAULT \'desc\'',
          cover_image: 'VARCHAR(255)',
          tags: 'JSONB'
        },
        indexes: [
          { columns: ['user_id'] },
          { columns: ['visibility'] }
        ]
      },
      {
        name: 'collection_designs',
        columns: {
          id: 'BIGSERIAL PRIMARY KEY',
          ...createTimestampFields(),
          collection_id: 'BIGINT REFERENCES collections(id) ON DELETE CASCADE',
          design_id: 'BIGINT REFERENCES designs(id) ON DELETE CASCADE',
          order: 'INTEGER'
        },
        indexes: [
          { columns: ['collection_id'] },
          { columns: ['design_id'] }
        ]
      },
      {
        name: 'favorites',
        columns: {
          id: 'BIGSERIAL PRIMARY KEY',
          ...createTimestampFields(),
          user_id: 'BIGINT REFERENCES users(id) ON DELETE CASCADE',
          design_id: 'BIGINT REFERENCES designs(id) ON DELETE CASCADE',
          date_added: 'TIMESTAMP WITH TIME ZONE'
        },
        indexes: [
          { columns: ['user_id'] },
          { columns: ['design_id'] }
        ]
      },
      {
        name: 'template_categories',
        columns: {
          id: 'VARCHAR(255) PRIMARY KEY',
          ...createTimestampFields(),
          name: 'VARCHAR(255)'
        }
      },
      {
        name: 'templates',
        columns: {
          id: 'VARCHAR(255) PRIMARY KEY',
          ...createTimestampFields(),
          name: 'VARCHAR(255)',
          description: 'TEXT',
          image_url: 'VARCHAR(255)',
          category: 'VARCHAR(50) REFERENCES template_categories(id) ON DELETE SET NULL',
          active: 'BOOLEAN DEFAULT TRUE'
        },
        indexes: [
          { columns: ['category'] }
        ]
      },
      {
        name: 'credit_packages',
        columns: {
          id: 'VARCHAR(255) PRIMARY KEY',
          ...createTimestampFields(),
          name: 'VARCHAR(255)',
          credits: 'INTEGER CHECK (credits > 0)',
          price: 'DECIMAL(10,2) CHECK (price >= 0)',
          currency: 'VARCHAR(3)',
          popular: 'BOOLEAN',
          cost_per_credit: 'DECIMAL(10,4)',
          description: 'TEXT',
          active: 'BOOLEAN DEFAULT TRUE',
          stripe_price_id: 'VARCHAR(255)',
          is_promotional: 'BOOLEAN DEFAULT FALSE',
          sort_order: 'INTEGER DEFAULT 0'
        }
      },
      {
        name: 'referrals',
        columns: {
          id: 'BIGSERIAL PRIMARY KEY',
          ...createTimestampFields(),
          referrer_id: 'BIGINT REFERENCES users(id) ON DELETE SET NULL',
          referred_id: 'BIGINT REFERENCES users(id) ON DELETE SET NULL',
          status: 'VARCHAR(20)',
          date_referred: 'TIMESTAMP WITH TIME ZONE',
          date_activated: 'TIMESTAMP WITH TIME ZONE',
          bonus_awarded: 'BOOLEAN',
          credits_earned: 'INTEGER',
          first_purchase_id: 'BIGINT'
        },
        indexes: [
          { columns: ['referrer_id'] },
          { columns: ['referred_id'] },
          { columns: ['status'] }
        ]
      },
      {
        name: 'transactions',
        columns: {
          id: 'BIGSERIAL PRIMARY KEY',
          ...createTimestampFields(),
          user_id: 'BIGINT REFERENCES users(id) ON DELETE SET NULL',
          type: 'VARCHAR(20)',
          amount: 'DECIMAL(10,2)',
          currency: 'VARCHAR(3)',
          credits: 'INTEGER',
          description: 'TEXT',
          status: 'VARCHAR(20)',
          transaction_at: 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP',
          external_id: 'VARCHAR(255)',
          referral_id: 'BIGINT REFERENCES referrals(id) ON DELETE SET NULL',
          admin_id: 'BIGINT REFERENCES users(id) ON DELETE SET NULL',
          admin_note: 'TEXT DEFAULT \'\''
        },
        indexes: [
          { columns: ['user_id'] },
          { columns: ['type'] },
          { columns: ['status'] },
          { columns: ['transaction_at'] },
          { columns: ['referral_id'] },
          { columns: ['admin_id'] }
        ]
      },
      {
        name: 'contact_messages',
        columns: {
          id: 'BIGSERIAL PRIMARY KEY',
          ...createTimestampFields(),
          name: 'VARCHAR(255) NOT NULL',
          email: 'VARCHAR(255) NOT NULL',
          phone: 'VARCHAR(20)',
          subject: 'VARCHAR(255) NOT NULL',
          message: 'TEXT NOT NULL',
          reference: 'VARCHAR(255) UNIQUE NOT NULL',
          ip_address: 'VARCHAR(45)',
          subscribe: 'BOOLEAN DEFAULT FALSE',
          responded: 'BOOLEAN DEFAULT FALSE',
          notes: 'TEXT',
          tags: 'TEXT[]'
        },
        indexes: [
          { columns: ['email'] },
          { columns: ['reference'] }
        ]
      },
      {
        name: 'notifications',
        columns: {
          id: 'BIGSERIAL PRIMARY KEY',
          ...createTimestampFields(),
          type: 'VARCHAR(50) NOT NULL',
          title: 'VARCHAR(255) NOT NULL',
          content: 'TEXT NOT NULL',
          read: 'BOOLEAN DEFAULT FALSE',
          reference_id: 'BIGINT'
        }
      },
      {
        name: 'feature_requests',
        columns: {
          id: 'BIGSERIAL PRIMARY KEY',
          ...createTimestampFields(),
          title: 'VARCHAR(255) NOT NULL',
          description: 'TEXT NOT NULL',
          user_id: 'BIGINT',
          email: 'VARCHAR(255)',
          status: 'VARCHAR(20) DEFAULT \'new\' NOT NULL',
          admin_notes: 'TEXT',
          submitted_at: 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL',
          category: 'VARCHAR(20) NOT NULL',
          votes: 'INTEGER DEFAULT 0 CHECK (votes >= 0)',
          tags: 'TEXT[]'
        },
        indexes: [
          { columns: ['user_id'] },
          { columns: ['status'] },
          { columns: ['category'] }
        ]
      },
      {
        name: 'password_reset_tokens',
        columns: {
          id: 'BIGSERIAL PRIMARY KEY',
          ...createTimestampFields(),
          user_id: 'BIGINT NOT NULL',
          token: 'VARCHAR(255) NOT NULL',
          expires_at: 'TIMESTAMP WITH TIME ZONE NOT NULL',
          used: 'BOOLEAN DEFAULT FALSE'
        },
        indexes: [
          { columns: ['user_id'] },
          { columns: ['token'] },
          { columns: ['expires_at'] }
        ]
      },
      {
        name: 'admin_logs',
        columns: {
          id: 'BIGSERIAL PRIMARY KEY',
          ...createTimestampFields(),
          admin_id: 'BIGINT REFERENCES users(id) ON DELETE SET NULL',
          target_type: 'VARCHAR(50)',
          target_id: 'BIGINT',
          action: 'VARCHAR(50)',
          note: 'TEXT',
          performed_at: 'TIMESTAMP WITH TIME ZONE'
        },
        indexes: [
          { columns: ['admin_id'] },
          { columns: ['target_type'] },
          { columns: ['target_id'] }
        ]
      }
    ],
    extensions: [
      'uuid-ossp',
      'btree_gin',
      'pg_stat_statements',
      'pgcrypto'
    ],
    functions: [
      {
        name: 'update_user_credits',
        body: `
          CREATE OR REPLACE FUNCTION update_user_credits() RETURNS TRIGGER AS $$
          BEGIN
            IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status <> 'completed') THEN
              UPDATE users 
              SET credits = credits + NEW.credits 
              WHERE id = NEW.user_id;
            END IF;
            RETURN NEW;
          END;
          $$ LANGUAGE plpgsql;
        `,
        trigger: `
          CREATE TRIGGER update_user_credits_trigger
          AFTER INSERT OR UPDATE ON transactions
          FOR EACH ROW
          EXECUTE FUNCTION update_user_credits();
        `
      },
      {
        name: 'process_referral_bonus',
        body: `
          CREATE OR REPLACE FUNCTION process_referral_bonus() RETURNS TRIGGER AS $$
          BEGIN
            IF NEW.status = 'completed' AND NEW.type = 'purchase' AND NEW.credits > 0 THEN
              UPDATE referrals
              SET bonus_awarded = TRUE,
                  date_activated = CURRENT_TIMESTAMP,
                  status = 'completed',
                  first_purchase_id = NEW.id
              WHERE referred_id = NEW.user_id AND status = 'pending' AND bonus_awarded = FALSE;
            END IF;
            RETURN NEW;
          END;
          $$ LANGUAGE plpgsql;
        `,
        trigger: `
          CREATE TRIGGER process_referral_bonus_trigger
          AFTER INSERT OR UPDATE ON transactions
          FOR EACH ROW
          EXECUTE FUNCTION process_referral_bonus();
        `
      },
      {
        name: 'increment_shared_link_views',
        body: `
          CREATE OR REPLACE FUNCTION increment_shared_link_views() RETURNS TRIGGER AS $$
          BEGIN
            NEW.view_count := OLD.view_count + 1;
            RETURN NEW;
          END;
          $$ LANGUAGE plpgsql;
        `,
        trigger: `
          CREATE TRIGGER increment_shared_link_views_trigger
          BEFORE UPDATE ON shared_links
          FOR EACH ROW
          WHEN (NEW.view_count IS NULL OR NEW.view_count = OLD.view_count)
          EXECUTE FUNCTION increment_shared_link_views();
        `
      },
      {
        name: 'set_updated_at',
        body: `
          CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
          BEGIN
            NEW.updated_at = CURRENT_TIMESTAMP;
            RETURN NEW;
          END;
          $$ LANGUAGE plpgsql;
        `
      }
    ],
    seedData: {
      template_categories: [
        { id: 'modern', name: 'Modern' },
        { id: 'traditional', name: 'Traditional' },
        { id: 'cottage', name: 'Cottage' },
        { id: 'desert', name: 'Desert' },
        { id: 'minimalist', name: 'Minimalist' },
        { id: 'tropical', name: 'Tropical' }
      ],
      templates: [
        {
          id: 'modern-minimalist',
          name: 'Modern Minimalist',
          description: 'Clean lines and minimal elements with a focus on structural simplicity',
          image_url: 'https://api.yardrevision.com/templates/modern-minimalist.jpg',
          category: 'modern'
        },
        {
          id: 'traditional-english',
          name: 'Traditional English Garden',
          description: 'Classic English garden style with formal elements and lush plantings',
          image_url: 'https://api.yardrevision.com/templates/traditional-english.jpg',
          category: 'traditional'
        },
        {
          id: 'cottage-garden',
          name: 'Cottage Garden',
          description: 'Informal and romantic design with abundant flowers and soft textures',
          image_url: 'https://api.yardrevision.com/templates/cottage-garden.jpg',
          category: 'cottage'
        },
        {
          id: 'desert-oasis',
          name: 'Desert Oasis',
          description: 'Water-efficient design featuring succulents and desert-adapted plants',
          image_url: 'https://api.yardrevision.com/templates/desert-oasis.jpg',
          category: 'desert'
        },
        {
          id: 'zen-minimalist',
          name: 'Zen Garden',
          description: 'Peaceful design inspired by Japanese aesthetics with minimal elements',
          image_url: 'https://api.yardrevision.com/templates/zen-minimalist.jpg',
          category: 'minimalist'
        },
        {
          id: 'tropical-paradise',
          name: 'Tropical Paradise',
          description: 'Lush tropical design with bold foliage and vibrant colors',
          image_url: 'https://api.yardrevision.com/templates/tropical-paradise.jpg',
          category: 'tropical'
        }
      ],
      credit_packages: [
        {
          id: 'basic',
          name: 'Basic',
          credits: 50,
          price: 4.99,
          currency: 'USD',
          popular: false,
          cost_per_credit: 0.0998,
          description: 'Perfect for trying out the service',
          active: true,
          is_promotional: false,
          sort_order: 1
        },
        {
          id: 'standard',
          name: 'Standard',
          credits: 100,
          price: 8.99,
          currency: 'USD',
          popular: true,
          cost_per_credit: 0.0899,
          description: 'Our most popular option',
          active: true,
          is_promotional: false,
          sort_order: 2
        },
        {
          id: 'premium',
          name: 'Premium',
          credits: 250,
          price: 19.99,
          currency: 'USD',
          popular: false,
          cost_per_credit: 0.0800,
          description: 'Best value for regular users',
          active: true,
          is_promotional: false,
          sort_order: 3
        },
        {
          id: 'professional',
          name: 'Professional',
          credits: 1000,
          price: 69.99,
          currency: 'USD',
          popular: false,
          cost_per_credit: 0.0700,
          description: 'Ideal for landscape professionals',
          active: true,
          is_promotional: false,
          sort_order: 4
        }
      ],
      users: [
        {
          email: 'admin@yardrevision.com',
          // Note: Password should be properly hashed in production
          password: '$2b$10$KmGTeDDd7z1BSPDIYga.9OQORSKKVFblHLZL4sxsRUnRSxIH1kptW', // bcrypt(sha256("ydrv2025"))
          name: 'Admin User',
          credits: 1000,
          referral_code: 'YARDADMIN',
          is_admin: true,
          active: true
        }
      ]
    }
  };
};

/**
 * Generates SQL for creating a table with its columns and indexes
 * @param {Object} table - Table definition object
 * @param {string} table.name - Table name
 * @param {Object} table.columns - Column definitions
 * @param {Array} [table.indexes=[]] - Table indexes
 * @returns {string} SQL statements for creating the table and its indexes
 */
const generateCreateTableSQL = (table) => {
  const { name, columns, indexes = [] } = table;
  
  // Build column definitions
  const columnDefs = Object.entries(columns).map(([colName, colDef]) => {
    return `  "${colName}" ${colDef}`;
  });
  
  // Create table SQL
  let sql = `CREATE TABLE IF NOT EXISTS "${name}" (\n${columnDefs.join(',\n')}\n);\n\n`;
  
  // Add indexes
  indexes.forEach(index => {
    const indexName = `idx_${name}_${index.columns.join('_')}`;
    const indexType = index.type || 'btree';
    const uniqueClause = index.unique ? 'UNIQUE ' : '';
    const whereClause = index.where ? ` WHERE ${index.where}` : '';
    sql += `CREATE ${uniqueClause}INDEX IF NOT EXISTS "${indexName}" ON "${name}" USING ${indexType} (${index.columns.map(c => `"${c}"`).join(', ')})${whereClause};\n`;
  });
  
  return sql;
};

/**
 * Generates SQL for creating a table without foreign key constraints
 * @param {Object} table - Table definition object
 * @returns {string} SQL statement for creating the table without foreign keys
 */
const generateCreateTableSQLWithoutForeignKeys = (table) => {
  const { name, columns } = table;
  
  // Build column definitions without foreign key constraints
  const columnDefs = Object.entries(columns).map(([colName, colDef]) => {
    // Remove REFERENCES clauses from column definitions
    const cleanColDef = colDef.replace(/REFERENCES\s+\w+\s*\([^)]*\)(\s+ON\s+DELETE\s+[A-Z\s]+)?(\s+ON\s+UPDATE\s+[A-Z\s]+)?/gi, '');
    return `  "${colName}" ${cleanColDef}`;
  });
  
  // Create table SQL
  return `CREATE TABLE IF NOT EXISTS "${name}" (\n${columnDefs.join(',\n')}\n);\n\n`;
};

/**
 * Generates SQL for adding foreign key constraints to a table
 * @param {Object} table - Table definition object
 * @returns {string} SQL statements for adding foreign key constraints
 */
const generateForeignKeyConstraints = (table) => {
  const { name, columns } = table;
  let sql = '';
  
  Object.entries(columns).forEach(([colName, colDef]) => {
    const referencesMatch = colDef.match(/REFERENCES\s+(\w+)\s*\(([^)]*)\)(\s+ON\s+DELETE\s+[A-Z\s]+)?(\s+ON\s+UPDATE\s+[A-Z\s]+)?/i);
    if (referencesMatch) {
      const referencedTable = referencesMatch[1];
      const referencedColumn = referencesMatch[2];
      const onDelete = referencesMatch[3] || '';
      const onUpdate = referencesMatch[4] || '';
      
      const constraintName = `fk_${name}_${colName}`;
      sql += `ALTER TABLE "${name}" ADD CONSTRAINT "${constraintName}" FOREIGN KEY ("${colName}") REFERENCES "${referencedTable}" (${referencedColumn})${onDelete}${onUpdate};\n`;
    }
  });
  
  return sql;
};

/**
 * Generates SQL for creating indexes for a table
 * @param {Object} table - Table definition object
 * @returns {string} SQL statements for creating indexes
 */
const generateIndexes = (table) => {
  const { name, indexes = [] } = table;
  let sql = '';
  
  indexes.forEach(index => {
    const indexName = `idx_${name}_${index.columns.join('_')}`;
    const indexType = index.type || 'btree';
    const uniqueClause = index.unique ? 'UNIQUE ' : '';
    const whereClause = index.where ? ` WHERE ${index.where}` : '';
    sql += `CREATE ${uniqueClause}INDEX IF NOT EXISTS "${indexName}" ON "${name}" USING ${indexType} (${index.columns.map(c => `"${c}"`).join(', ')})${whereClause};\n`;
  });
  
  return sql;
};

/**
 * Generates SQL for inserting seed data into a table
 * @param {string} tableName - Name of the table
 * @param {Array<Object>} data - Array of data objects to insert
 * @returns {string} SQL statements for inserting seed data
 */
const generateSeedDataSQL = (tableName, data) => {
  if (!data || data.length === 0) return '';
  
  let sql = '';
  
  data.forEach(row => {
    const columns = Object.keys(row);
    const values = Object.values(row).map(val => {
      if (val === null) return 'NULL';
      if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
      if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
      return val;
    });
    
    sql += `INSERT INTO "${tableName}" ("${columns.join('", "')}") 
      VALUES (${values.join(', ')})
      ON CONFLICT DO NOTHING;\n`;
  });
  
  return sql;
};

/**
 * Generates SQL for creating updated_at triggers for all tables
 * @param {Array<Object>} tables - Array of table definition objects
 * @returns {string} SQL statements for creating update triggers
 */
const generateUpdateTriggers = (tables) => {
  let sql = '';
  
  tables.forEach(table => {
    sql += `
      CREATE TRIGGER set_${table.name}_updated_at
      BEFORE UPDATE ON "${table.name}"
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
    `;
  });
  
  return sql;
};

/**
 * Analyzes table dependencies based on foreign key references
 * @param {Array<Object>} tables - Array of table definition objects
 * @returns {Array<Object>} Tables sorted by dependency order (dependencies first)
 */
const sortTablesByDependency = (tables) => {
  const tableDependencies = new Map();
  
  // Build dependency map
  tables.forEach(table => {
    const dependencies = [];
    Object.entries(table.columns).forEach(([colName, colDef]) => {
      // Look for REFERENCES keyword to identify foreign keys
      const referencesMatch = colDef.match(/REFERENCES\s+(\w+)\s*\(/i);
      if (referencesMatch) {
        const referencedTable = referencesMatch[1];
        if (referencedTable !== table.name) { // Avoid self-references
          dependencies.push(referencedTable);
        }
      }
    });
    tableDependencies.set(table.name, dependencies);
  });
  
  // Topological sort
  const sorted = [];
  const visited = new Set();
  const visiting = new Set();
  
  const visit = (tableName) => {
    if (visiting.has(tableName)) {
      // Circular dependency detected - skip for now
      return;
    }
    if (visited.has(tableName)) {
      return;
    }
    
    visiting.add(tableName);
    const dependencies = tableDependencies.get(tableName) || [];
    
    dependencies.forEach(dep => {
      if (tableDependencies.has(dep)) {
        visit(dep);
      }
    });
    
    visiting.delete(tableName);
    visited.add(tableName);
    
    const table = tables.find(t => t.name === tableName);
    if (table) {
      sorted.push(table);
    }
  };
  
  // Visit all tables
  tables.forEach(table => visit(table.name));
  
  // Add any tables that weren't visited (no dependencies)
  tables.forEach(table => {
    if (!sorted.find(t => t.name === table.name)) {
      sorted.unshift(table); // Add at beginning since they have no dependencies
    }
  });
  
  return sorted;
};

/**
 * Generates complete SQL for initializing a database
 * @param {string} projectName - Name of the project
 * @returns {string} Complete SQL initialization script including extensions, tables, functions, triggers, and seed data
 */
const generateInitializationSQL = (projectName) => {
  const schema = generateFullSchema(projectName);
  let sql = '';
  
  // Add extensions if defined
  if (schema.extensions && Array.isArray(schema.extensions)) {
    schema.extensions.forEach(ext => {
      sql += `CREATE EXTENSION IF NOT EXISTS "${ext}";\n`;
    });
    sql += '\n';
  }
  
  // Create functions first (needed for triggers)
  if (schema.functions && Array.isArray(schema.functions)) {
    schema.functions.forEach(func => {
      sql += `${func.body}\n`;
    });
    sql += '\n';
  }
  
  // Sort tables by dependency order and create them
  if (schema.tables && Array.isArray(schema.tables)) {
    const sortedTables = sortTablesByDependency(schema.tables);
    
    // Create tables without foreign key constraints first
    sortedTables.forEach(table => {
      sql += generateCreateTableSQLWithoutForeignKeys(table);
    });
    
    // Add foreign key constraints after all tables are created
    sortedTables.forEach(table => {
      sql += generateForeignKeyConstraints(table);
    });
    
    // Create indexes
    sortedTables.forEach(table => {
      sql += generateIndexes(table);
    });
  }
  
  // Add triggers after tables are created
  if (schema.functions && Array.isArray(schema.functions)) {
    schema.functions.forEach(func => {
      if (func.trigger) {
        sql += `${func.trigger}\n`;
      }
    });
  }
  
  // Add update_at triggers for all tables
  if (schema.tables && Array.isArray(schema.tables)) {
    sql += generateUpdateTriggers(schema.tables);
  }
  
  // Execute post-creation SQL if defined
  if (schema.postSql && Array.isArray(schema.postSql)) {
    sql += '\n-- Post-creation SQL\n';
    schema.postSql.forEach(statement => {
      sql += `${statement};\n`;
    });
  }
  
  // Insert seed data if defined
  if (schema.seedData && typeof schema.seedData === 'object') {
    Object.entries(schema.seedData).forEach(([tableName, data]) => {
      sql += `\n-- Seed data for ${tableName}\n`;
      sql += generateSeedDataSQL(tableName, data);
    });
  }
  
  return sql;
};

// Export the schema and functions
module.exports = {
  generateFullSchema,
  generateInitializationSQL,
  generateCreateTableSQL,
  generateSeedDataSQL
};