// Resolve DATABASE_URL (Vercel Neon uses prefixed env vars)
const DATABASE_URL = process.env.DATABASE_URL
  || process.env.albumonline_DATABASE_URL
  || process.env.POSTGRES_URL
  || process.env.albumonline_POSTGRES_URL;

let db;
let initPromise;

if (DATABASE_URL) {
  // Make it available for pg.js
  process.env.DATABASE_URL = DATABASE_URL;
  const { pgDb, initPg } = require('./pg');
  db = pgDb;
  initPromise = initPg();
} else {
  // Local dev only - better-sqlite3 is NOT installed on Vercel
  try {
    db = require('better-sqlite3') && require('./sqlite');
    initPromise = Promise.resolve();
  } catch (e) {
    console.error('No DATABASE_URL and SQLite not available:', e.message);
    process.exit(1);
  }
}

module.exports = db;
module.exports.ready = initPromise;
