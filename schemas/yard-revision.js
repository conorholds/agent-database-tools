// schemas/yard-revision.js
// This file contains the database schema for the Yard ReVision project
// Defines tables, columns, relationships, and extensions

module.exports = {
  name: 'Yard ReVision Schema',
  description: 'Schema for Yard ReVision project',
  tables: [
    {
      name: 'users',
      columns: [
        { name: 'id', type: 'SERIAL', primaryKey: true },
        { name: 'email', type: 'VARCHAR(255)', nullable: false, unique: true },
        { name: 'password', type: 'VARCHAR(255)', nullable: false },
        { name: 'name', type: 'VARCHAR(255)', nullable: false },
        { name: 'referral_code', type: 'VARCHAR(20)', nullable: false, unique: true },
        { name: 'credits', type: 'INTEGER', nullable: false, default: 0 },
        { name: 'is_admin', type: 'BOOLEAN', nullable: false, default: false },
        { name: 'created_at', type: 'TIMESTAMP', nullable: false, default: 'NOW()' },
        { name: 'updated_at', type: 'TIMESTAMP', nullable: false, default: 'NOW()' }
      ],
      indexes: [
        { columns: ['email'] },
        { columns: ['referral_code'] }
      ],
      seedData: []
    },
    {
      name: 'template_categories',
      columns: [
        { name: 'id', type: 'VARCHAR(50)', primaryKey: true },
        { name: 'name', type: 'VARCHAR(100)', nullable: false },
        { name: 'subcategory', type: 'TEXT', nullable: true, default: "''" }
      ],
      seedData: [
        { id: 'modern', name: 'Modern Designs' },
        { id: 'asian', name: 'Asian Inspired' },
        { id: 'traditional', name: 'Traditional' },
        { id: 'tropical', name: 'Tropical' }
      ]
    },
    {
      name: 'template_subcategories',
      columns: [
        { name: 'id', type: 'VARCHAR(50)', primaryKey: true },
        { name: 'name', type: 'VARCHAR(100)', nullable: false },
        { name: 'category_id', type: 'VARCHAR(50)', nullable: false },
        { name: 'description', type: 'TEXT', nullable: true, default: "''" },
        { name: 'active', type: 'BOOLEAN', nullable: true, default: true },
        { name: 'created_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: true, default: 'NOW()' },
        { name: 'updated_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: true, default: 'NOW()' },
        { name: 'deleted_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: true }
      ],
      foreignKeys: [
        { column: 'category_id', reference: { table: 'template_categories', column: 'id' } }
      ],
      indexes: [
        { columns: ['category_id'] },
        { columns: ['deleted_at'] }
      ],
      seedData: [
        { id: 'minimalist', name: 'Minimalist', category_id: 'modern' },
        { id: 'industrial', name: 'Industrial', category_id: 'modern' },
        { id: 'contemporary', name: 'Contemporary', category_id: 'modern' },
        { id: 'japanese', name: 'Japanese', category_id: 'asian' },
        { id: 'chinese', name: 'Chinese', category_id: 'asian' },
        { id: 'english', name: 'English', category_id: 'traditional' },
        { id: 'french', name: 'French', category_id: 'traditional' },
        { id: 'mediterranean', name: 'Mediterranean', category_id: 'traditional' },
        { id: 'beach', name: 'Beach', category_id: 'tropical' },
        { id: 'jungle', name: 'Jungle', category_id: 'tropical' }
      ]
    },
    {
      name: 'templates',
      columns: [
        { name: 'id', type: 'VARCHAR(100)', primaryKey: true },
        { name: 'name', type: 'VARCHAR(100)', nullable: false },
        { name: 'description', type: 'TEXT', nullable: true },
        { name: 'image_url', type: 'VARCHAR(255)', nullable: true },
        { name: 'category', type: 'VARCHAR(50)', nullable: false },
        { name: 'subcategory_id', type: 'VARCHAR(50)', nullable: true },
        { name: 'active', type: 'BOOLEAN', nullable: true, default: true },
        { name: 'icon', type: 'TEXT', nullable: true, default: "''" },
        { name: 'gradient_style', type: 'TEXT', nullable: true, default: "''" },
        { name: 'border_color', type: 'TEXT', nullable: true, default: "''" },
        { name: 'button_color', type: 'TEXT', nullable: true, default: "''" },
        { name: 'default_options', type: 'TEXT', nullable: true, default: "''" }
      ],
      foreignKeys: [
        { column: 'category', reference: { table: 'template_categories', column: 'id' } },
        { column: 'subcategory_id', reference: { table: 'template_subcategories', column: 'id' } }
      ],
      indexes: [
        { columns: ['subcategory_id'] },
        { columns: ['category'] }
      ],
      seedData: [
        {
          id: 'modern-minimalist',
          name: 'Modern Minimalist',
          description: 'Clean lines, minimal elements, and a focus on structural simplicity',
          image_url: 'https://api.yardrevision.com/templates/modern-minimalist.jpg',
          category: 'modern'
        },
        {
          id: 'japanese-zen',
          name: 'Japanese Zen Garden',
          description: 'Tranquil spaces with carefully arranged rocks, water features, and minimalist plantings',
          image_url: 'https://api.yardrevision.com/templates/japanese-zen.jpg',
          category: 'asian'
        },
        {
          id: 'english-cottage',
          name: 'English Cottage Garden',
          description: 'Lush, informal planting with abundant flowers and meandering pathways',
          image_url: 'https://api.yardrevision.com/templates/english-cottage.jpg',
          category: 'traditional'
        },
        {
          id: 'tropical-paradise',
          name: 'Tropical Paradise',
          description: 'Lush palm trees, vibrant flowers, and exotic foliage for a resort-like feel',
          image_url: 'https://api.yardrevision.com/templates/tropical-paradise.jpg',
          category: 'tropical'
        }
      ]
    },
    {
      name: 'image_histories',
      columns: [
        { name: 'id', type: 'SERIAL', primaryKey: true },
        { name: 'user_id', type: 'INTEGER', nullable: false },
        { name: 'original_image_url', type: 'TEXT', nullable: true },
        { name: 'generated_image_url', type: 'TEXT', nullable: false },
        { name: 'thumbnail_url', type: 'TEXT', nullable: false },
        { name: 'prompt_text', type: 'TEXT', nullable: false },
        { name: 'generation_type', type: 'VARCHAR(20)', nullable: false },
        { name: 'generation_params', type: 'JSONB', nullable: false, default: "'{}'" },
        { name: 'template_id', type: 'VARCHAR(255)', nullable: true },
        { name: 'template_name', type: 'VARCHAR(255)', nullable: true },
        { name: 'rating', type: 'INTEGER', nullable: true },
        { name: 'credits_cost', type: 'INTEGER', nullable: false, default: 0 },
        { name: 'generated_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: false },
        { name: 'created_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: false, default: 'NOW()' },
        { name: 'updated_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: false, default: 'NOW()' },
        { name: 'deleted_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: true }
      ],
      foreignKeys: [
        { column: 'user_id', reference: { table: 'users', column: 'id' } }
      ],
      indexes: [
        { columns: ['user_id'] },
        { columns: ['generation_type'] },
        { columns: ['original_image_url'], condition: 'original_image_url IS NOT NULL' },
        { columns: ['deleted_at'] }
      ],
      checks: [
        { constraint: 'check_generation_type', condition: "generation_type IN ('text_to_image', 'image_to_image', 'saved_image')" }
      ]
    },
    {
      name: 'credit_packages',
      columns: [
        { name: 'id', type: 'VARCHAR(50)', primaryKey: true },
        { name: 'name', type: 'VARCHAR(100)', nullable: false },
        { name: 'credits', type: 'INTEGER', nullable: false },
        { name: 'price', type: 'NUMERIC(10, 2)', nullable: false },
        { name: 'currency', type: 'VARCHAR(10)', nullable: false, default: '\'USD\'' },
        { name: 'popular', type: 'BOOLEAN', nullable: false, default: false },
        { name: 'cost_per_credit', type: 'NUMERIC(10, 2)', nullable: false },
        { name: 'description', type: 'TEXT', nullable: true },
        { name: 'active', type: 'BOOLEAN', nullable: false, default: true }
      ],
      seedData: [
        {
          id: 'starter',
          name: 'Starter',
          credits: 10,
          price: 5.00,
          currency: 'USD',
          popular: false,
          cost_per_credit: 0.50,
          description: 'Perfect for trying out the service',
          active: true
        },
        {
          id: 'popular',
          name: 'Popular',
          credits: 50,
          price: 20.00,
          currency: 'USD',
          popular: true,
          cost_per_credit: 0.40,
          description: 'Best for exploring multiple styles',
          active: true
        },
        {
          id: 'professional',
          name: 'Professional',
          credits: 400,
          price: 100.00,
          currency: 'USD',
          popular: false,
          cost_per_credit: 0.25,
          description: 'Ideal for landscape professionals',
          active: true
        }
      ]
    },
    {
      name: 'user_saved_images',
      columns: [
        { name: 'id', type: 'SERIAL', primaryKey: true },
        { name: 'user_id', type: 'INTEGER', nullable: false },
        { name: 'image_url', type: 'TEXT', nullable: false },
        { name: 'name', type: 'TEXT', nullable: true },
        { name: 'description', type: 'TEXT', nullable: true },
        { name: 'tags', type: 'JSONB', nullable: true, default: "'[]'::jsonb" },
        { name: 'width', type: 'INTEGER', nullable: true, default: 0 },
        { name: 'height', type: 'INTEGER', nullable: true, default: 0 },
        { name: 'file_size', type: 'INTEGER', nullable: true, default: 0 },
        { name: 'uploaded_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: false },
        { name: 'created_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: false, default: 'NOW()' },
        { name: 'updated_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: false, default: 'NOW()' },
        { name: 'deleted_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: true }
      ],
      foreignKeys: [
        { column: 'user_id', reference: { table: 'users', column: 'id' } }
      ],
      indexes: [
        { columns: ['user_id'] },
        { columns: ['deleted_at'] }
      ],
      comment: 'Stores user-uploaded images for landscaping designs'
    }
  ]
};