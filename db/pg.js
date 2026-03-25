const { Pool } = require('pg');

let pool;

function getPool() {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  }
  return pool;
}

async function initPg() {
  const p = getPool();
  await p.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT,
      display_name TEXT,
      google_id TEXT UNIQUE,
      google_access_token TEXT,
      google_refresh_token TEXT,
      avatar_url TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
    // Migration: add role column if not exists
    await p.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'`).catch(() => {});
  // Migrations for existing tables
  await p.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE`).catch(() => {});
  await p.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_access_token TEXT`).catch(() => {});
  await p.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_refresh_token TEXT`).catch(() => {});
  await p.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT`).catch(() => {});
  await p.query(`ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL`).catch(() => {});
  await p.query(`
    CREATE TABLE IF NOT EXISTS albums (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      drive_folder_id TEXT NOT NULL,
      drive_link TEXT NOT NULL,
      password TEXT,
      max_selections INTEGER DEFAULT 0,
      allow_download INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP,
      view_count INTEGER DEFAULT 0
    )
  `);
  // Add user_id column if missing (migration)
  await p.query(`
    ALTER TABLE albums ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE SET NULL
  `).catch(() => {});
  await p.query(`
    CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY,
      album_id TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
      drive_file_id TEXT NOT NULL,
      name TEXT NOT NULL,
      thumbnail_url TEXT,
      full_url TEXT,
      mime_type TEXT,
      width INTEGER,
      height INTEGER,
      sort_order INTEGER DEFAULT 0
    )
  `);
  await p.query(`
    CREATE TABLE IF NOT EXISTS selections (
      id SERIAL PRIMARY KEY,
      album_id TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
      photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
      client_name TEXT,
      client_id TEXT NOT NULL,
      selected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(album_id, photo_id, client_id)
    )
  `);
  await p.query(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);
  await p.query(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      otp TEXT NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      used INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Auto-create guest user "Khách" for unauthenticated albums
  await p.query(`
    INSERT INTO users (id, username, email, password_hash, display_name, role)
    VALUES ('guest_khach', 'khach', 'khach@albumonline.local', NULL, 'Khách', 'user')
    ON CONFLICT (id) DO NOTHING
  `).catch(() => {});

  // Migrate existing orphaned albums (user_id IS NULL) to guest user
  await p.query(`UPDATE albums SET user_id = 'guest_khach' WHERE user_id IS NULL`).catch(() => {});
}

// Wrapper that mimics better-sqlite3 API shape for pg
const pgDb = {
  prepare(sql) {
    return {
      run(...params) {
        return getPool().query(convertPlaceholders(sql), params);
      },
      get(...params) {
        return getPool().query(convertPlaceholders(sql), params).then(r => r.rows[0] || null);
      },
      all(...params) {
        return getPool().query(convertPlaceholders(sql), params).then(r => r.rows);
      },
    };
  },
  exec(sql) {
    return getPool().query(sql);
  },
  transaction(fn) {
    return async (items) => {
      const client = await getPool().connect();
      try {
        await client.query('BEGIN');
        await fn(items, client);
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    };
  },
};

function convertPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

module.exports = { pgDb, initPg };
