import pg from 'pg'
import dotenv from 'dotenv'
dotenv.config()

const { Pool } = pg

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
})

export const query = (text, params) => pool.query(text, params)

export async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id SERIAL PRIMARY KEY,
      shop VARCHAR(255) UNIQUE NOT NULL,
      access_token TEXT NOT NULL,
      scope TEXT,
      plan VARCHAR(50) DEFAULT 'free',
      videos_used INTEGER DEFAULT 0,
      videos_reset_at TIMESTAMP DEFAULT NOW(),
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS videos (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      shop VARCHAR(255) NOT NULL,
      product_id VARCHAR(255),
      product_title VARCHAR(500),
      style VARCHAR(100),
      platform VARCHAR(50),
      headline TEXT,
      cta TEXT,
      music_mood VARCHAR(50),
      file_path TEXT,
      status VARCHAR(50) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT NOW()
    );
  `)
  console.log('Database initialized')
}

export default pool
