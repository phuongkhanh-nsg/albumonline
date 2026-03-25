const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'albumonline.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`

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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS albums (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    drive_folder_id TEXT NOT NULL,
    drive_link TEXT NOT NULL,
    password TEXT,
    max_selections INTEGER DEFAULT 0,
    allow_download INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    view_count INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS photos (
    id TEXT PRIMARY KEY,
    album_id TEXT NOT NULL,
    drive_file_id TEXT NOT NULL,
    name TEXT NOT NULL,
    thumbnail_url TEXT,
    full_url TEXT,
    mime_type TEXT,
    width INTEGER,
    height INTEGER,
    sort_order INTEGER DEFAULT 0,
    FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS selections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    album_id TEXT NOT NULL,
    photo_id TEXT NOT NULL,
    client_name TEXT,
    client_id TEXT NOT NULL,
    selected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
    FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE,
    UNIQUE(album_id, photo_id, client_id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS password_resets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    otp TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    used INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// Auto-create guest user "Khách" for unauthenticated albums
db.exec(`
  INSERT OR IGNORE INTO users (id, username, email, password_hash, display_name, role)
  VALUES ('guest_khach', 'khach', 'khach@albumonline.local', NULL, 'Khách', 'user');
`);

// Migrate existing orphaned albums (user_id IS NULL) to guest user
db.exec(`UPDATE albums SET user_id = 'guest_khach' WHERE user_id IS NULL;`);

// Wrap sync methods to return promises for unified API
const sqliteDb = {
  prepare(sql) {
    const stmt = db.prepare(sql);
    return {
      run: (...params) => Promise.resolve(stmt.run(...params)),
      get: (...params) => Promise.resolve(stmt.get(...params)),
      all: (...params) => Promise.resolve(stmt.all(...params)),
    };
  },
  transaction(fn) {
    const txn = db.transaction(fn);
    return (items) => Promise.resolve(txn(items));
  },
};

module.exports = sqliteDb;
